#!/usr/bin/env python3
"""Автономная проверка: стандартная библиотека Python и установленный Node.js."""
from __future__ import annotations

import ast
import json
import re
import shutil
import subprocess
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
ERRORS: list[str] = []
CHECKS = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global CHECKS
    CHECKS += 1
    if condition:
        print(f"OK  {name}")
    else:
        message = f"FAIL {name}" + (f": {detail}" if detail else "")
        print(message)
        ERRORS.append(message)


def text(path: str | Path) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def tracked_files() -> set[str]:
    """Пути из индекса Git, включая файлы вне частичной рабочей области."""
    result = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True
    )
    if result.returncode:
        return set()
    return {item.decode("utf-8") for item in result.stdout.split(b"\0") if item}


TRACKED_FILES = tracked_files()


def exists_or_tracked(path: Path) -> bool:
    """Файл существует в рабочей области или отслеживается в частичном клоне."""
    if path.is_file():
        return True
    try:
        relative = path.relative_to(ROOT).as_posix()
    except ValueError:
        return False
    return relative in TRACKED_FILES


class HtmlAudit(HTMLParser):
    def __init__(self, source: Path) -> None:
        super().__init__()
        self.source = source
        self.ids: list[str] = []
        self.refs: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        data = dict(attrs)
        if data.get("id"):
            self.ids.append(data["id"])
        for key in ("src", "href", "poster", "data-src"):
            value = data.get(key)
            if value:
                self.refs.append((key, value))


def audit_js() -> None:
    node = shutil.which("node")
    check("Node.js доступен", bool(node))
    if not node:
        return
    files = sorted((ROOT / "assets/js").glob("*.js")) + sorted((ROOT / "qa").glob("*.js"))
    failed = []
    for path in files:
        result = subprocess.run(
            [node, "--check", str(path)], capture_output=True, text=True
        )
        if result.returncode:
            failed.append(f"{path.relative_to(ROOT)}: {result.stderr.strip()}")
    check(f"синтаксис {len(files)} JS-файлов", not failed, " | ".join(failed))
    runtime = subprocess.run(
        [node, str(ROOT / "qa/check_runtime.js")], capture_output=True, text=True
    )
    check("логика demo/production и server-time", runtime.returncode == 0,
          runtime.stderr.strip() or runtime.stdout.strip())


def audit_python() -> None:
    files = sorted((ROOT / "tools").glob("*.py")) + sorted((ROOT / "qa").glob("*.py"))
    failed = []
    for path in files:
        try:
            compile(path.read_text(encoding="utf-8"), str(path), "exec")
        except SyntaxError as exc:
            failed.append(f"{path.relative_to(ROOT)}:{exc.lineno} {exc.msg}")
    check(f"синтаксис {len(files)} Python-файлов", not failed, " | ".join(failed))


def audit_json() -> None:
    files = sorted(ROOT.rglob("*.json"))
    failed = []
    for path in files:
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001 - QA должен собрать все ошибки
            failed.append(f"{path.relative_to(ROOT)}: {exc}")
    check(f"валидность {len(files)} JSON-файлов", not failed, " | ".join(failed))


def audit_html_and_assets() -> None:
    pages = sorted(ROOT.glob("*.html")) + sorted((ROOT / "docs-dev").rglob("*.html"))
    missing: list[str] = []
    duplicate_ids: list[str] = []
    refs = 0
    for page in pages:
        parser = HtmlAudit(page)
        try:
            parser.feed(page.read_text(encoding="utf-8"))
        except Exception as exc:  # HTMLParser редко бросает, но ошибка должна быть видна
            missing.append(f"не разбирается {page.relative_to(ROOT)}: {exc}")
            continue
        duplicates = [value for value, count in Counter(parser.ids).items() if count > 1]
        if duplicates:
            duplicate_ids.append(f"{page.relative_to(ROOT)}: {duplicates}")
        for attr, value in parser.refs:
            if value.startswith(("#", "mailto:", "tel:", "javascript:", "data:", "http://", "https://", "/api/")):
                continue
            if "${" in value or "{{" in value:
                continue
            rel = unquote(urlsplit(value).path)
            if not rel:
                continue
            refs += 1
            target = (page.parent / rel).resolve()
            if not exists_or_tracked(target):
                missing.append(f"{page.relative_to(ROOT)} {attr}={value}")

    # Локальные url() из CSS; data URI пропускаются целиком.
    css_path = ROOT / "assets/css/style.css"
    css = css_path.read_text(encoding="utf-8")
    for match in re.finditer(r"url\((['\"]?)(.*?)\1\)", css, re.S):
        value = match.group(2).strip()
        if value.startswith(("data:", "http://", "https://", "#")):
            continue
        refs += 1
        target = (css_path.parent / unquote(urlsplit(value).path)).resolve()
        if not exists_or_tracked(target):
            missing.append(f"assets/css/style.css url={value}")

    unclosed_comments = []
    for page in pages:
        source = page.read_text(encoding="utf-8")
        if source.count("<!--") != source.count("-->"):
            unclosed_comments.append(str(page.relative_to(ROOT)))

    check("уникальные HTML id", not duplicate_ids, " | ".join(duplicate_ids))
    check("HTML-комментарии закрыты", not unclosed_comments, ", ".join(unclosed_comments))
    check(f"локальные ссылки на {refs} ресурсов", not missing, " | ".join(missing))

    # Комментарии и data URI не влияют на простой контроль парных скобок.
    check("баланс фигурных скобок CSS", css.count("{") == css.count("}"),
          f"{{={css.count('{')} }}={css.count('}')}")


def audit_guest_media() -> None:
    homepage = text("main.html")
    media_js = text("assets/js/guest-media.js")
    try:
        runtime = json.loads(media_js.split("=", 1)[1].strip().removesuffix(";"))
    except Exception as exc:  # QA должен показать понятную ошибку формата
        check("медиаданные гостей читаются", False, str(exc))
        return

    items = [item for gallery in runtime.values() for item in gallery]
    check("13 медиаподборок почётных гостей", len(runtime) == 13, str(len(runtime)))
    check("45 медиаматериалов почётных гостей", len(items) == 45, str(len(items)))

    bad_schema = []
    bad_order = []
    listed_files = set()
    for slug, gallery in runtime.items():
        kinds = []
        for number, item in enumerate(gallery, 1):
            if (not isinstance(item, dict)
                    or set(item) != {"kind", "src"}
                    or item.get("kind") not in {"img", "video"}
                    or not isinstance(item.get("src"), str)):
                bad_schema.append(f"{slug}[{number}]")
                continue
            kinds.append(item["kind"])
            listed_files.add(item["src"])
        first_image = kinds.index("img") if "img" in kinds else len(kinds)
        if any(kind == "video" for kind in kinds[first_image:]):
            bad_order.append(slug)

    check("элементы гостей содержат только kind и src",
          not bad_schema and "caption" not in media_js, ", ".join(bad_schema))
    check("пустая подпись лайтбокса скрывается",
          "lbCap.hidden = !caption" in text("assets/js/main.js"))
    check("в подборках видео идут перед фотографиями", not bad_order,
          ", ".join(bad_order))

    tracked_media = {
        path for path in TRACKED_FILES
        if path.startswith("assets/media/guests/")
        and Path(path).suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov"}
    }
    check("все пути галерей отслеживаются Git", listed_files <= tracked_media,
          " | ".join(sorted(listed_files - tracked_media)))
    check("все медиаматериалы гостей перечислены в данных",
          listed_files == tracked_media,
          "не перечислены: " + ", ".join(sorted(tracked_media - listed_files)))

    materialized = [ROOT / path for path in listed_files if (ROOT / path).is_file()]
    if len(materialized) == len(listed_files):
        oversized = [
            f"{path.relative_to(ROOT)}: {path.stat().st_size}"
            for path in materialized if path.stat().st_size >= 100_000_000
        ]
        check("каждый файл гостевой галереи меньше 100 МБ",
              not oversized, " | ".join(oversized))
    else:
        print("SKIP размеры гостевых медиа: файлы не материализованы в sparse checkout")

    card_keys = set(re.findall(r'data-guest-media="([^"]+)"', homepage))
    check("все карточки гостей связаны с подборками", card_keys == set(runtime),
          f"cards={sorted(card_keys)}, media={sorted(runtime)}")

    track_match = re.search(
        r'<div class="carousel__track">(.*?)</div>\s*</div>\s*<div class="carousel__ui">',
        homepage, re.S)
    slides = re.findall(r'<figure class="slide\b.*?</figure>',
                        track_match.group(1) if track_match else "", re.S)
    target = "assets/video/media-interviews-participants.mp4"
    positions = [number for number, slide in enumerate(slides) if target in slide]
    middle = {max(0, len(slides) // 2 - 1), len(slides) // 2}
    check("видеоинтервью стоит в середине карусели",
          len(positions) == 1 and positions[0] in middle,
          f"slides={len(slides)}, position={positions}")
    check("место RUTUBE-плеера описано в разметке",
          "ПЛЕЕР ПРЯМОЙ ТРАНСЛЯЦИИ RUTUBE" in homepage
          and "CONFIG.broadcastUrl" in homepage
          and 'id="broadcast"' in homepage)

def audit_image_loading() -> None:
    pages = ["main.html", "materials.html", "news.html", "article.html", "test.html"]
    missing = []
    for page in pages:
        source = text(page)
        head = source.split("</head>", 1)[0]
        if (head.count('src="assets/js/image-loader.js"') != 1
                or head.find('href="assets/css/style.css"') > head.find('src="assets/js/image-loader.js"')):
            missing.append(page)
    check("image-loader подключён в head всех публичных страниц",
          not missing, ", ".join(missing))

    loader = text("assets/js/image-loader.js")
    check("image-loader отслеживает новые изображения и смену src",
          "MutationObserver" in loader
          and "mutation.addedNodes.forEach(scan)" in loader
          and "attributeFilter: ['src', 'srcset']" in loader)
    check("image-loader завершает полоску по load/error",
          "addEventListener('load'" in loader
          and "addEventListener('error'" in loader
          and "is-image-loading" in loader
          and "is-image-error" in loader)

    main_js = text("assets/js/main.js")
    prepare_at = main_js.find("imageLoading?.prepare(lbImg)")
    src_at = main_js.find("lbImg.src = item.src", prepare_at)
    start_at = main_js.find("imageLoading?.start(lbImg)", src_at)
    check("лайтбокс скрывает старый кадр до смены src",
          0 <= prepare_at < src_at < start_at)

    css = text("assets/css/style.css")
    check("CSS содержит общую полоску загрузки и reduced-motion",
          ".image-load-bar.is-active" in css
          and "@keyframes image-load-bar" in css
          and "prefers-reduced-motion: reduce" in css)


def audit_organizations() -> None:
    directory = ROOT / "assets/data/orgs"
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    all_items = json.loads((directory / "all.json").read_text(encoding="utf-8"))["items"]
    expected = manifest.get("total")
    check("manifest: 64 618 организаций", expected == 64618, str(expected))
    check("all.json совпадает с manifest", len(all_items) == expected,
          f"all={len(all_items)}, manifest={expected}")
    check("all.json не содержит точных дублей",
          len({tuple(item) for item in all_items}) == len(all_items))
    check("индексы регионов all.json в диапазоне 0…89",
          all(isinstance(item, list) and len(item) == 3 and isinstance(item[2], int)
              and 0 <= item[2] <= 89 for item in all_items))

    file_errors = []
    for filename, count in manifest.get("files", {}).items():
        path = directory / filename
        if not path.exists():
            file_errors.append(f"нет {filename}")
            continue
        actual = len(json.loads(path.read_text(encoding="utf-8"))["items"])
        if actual != count:
            file_errors.append(f"{filename}: {actual} != {count}")
    check("счётчики файлов справочника", not file_errors, " | ".join(file_errors))
    check("90 территорий сопоставлены файлам", len(manifest.get("regions", {})) == 90,
          str(len(manifest.get("regions", {}))))

    reg_js = text("assets/js/reg-form.js")
    match = re.search(r"const REGIONS = (\[.*?\]);", reg_js, re.S)
    js_regions = json.loads(match.group(1)) if match else []
    module = ast.parse(text("tools/xlsx-to-orgs.py"))
    assignment = next(
        (node for node in module.body
         if isinstance(node, ast.Assign)
         and any(isinstance(target, ast.Name) and target.id == "REGIONS"
                 for target in node.targets)),
        None,
    )
    py_regions = ast.literal_eval(assignment.value) if assignment else []
    manifest_regions = list(manifest.get("regions", {}))
    check("списки регионов согласованы в форме, генераторе и manifest",
          len(js_regions) == 90
          and js_regions[-1] == "За пределами Российской Федерации"
          and js_regions[:-1] == py_regions
          and js_regions == manifest_regions)


def audit_production_safety() -> None:
    config = text("assets/js/config.js")
    test_js = text("assets/js/test.js")
    reg_js = text("assets/js/reg-form.js")
    test_html = text("test.html")

    check("production включается мета-тегом",
          'meta[name="diktant-mode"]' in config and "runtimeMode" in config)
    check("production требует server-time",
          "timeReady" in config and "CONFIG.runtimeMode !== 'production' || SYNCED" in config)
    check("demo-банк не подключён статичным script",
          '<script src="assets/js/question-bank-demo.js"></script>' not in test_html)
    check("demo-банк загружается только после production-охранки",
          "if (PRODUCTION) throw err" in test_js and "ensureDemoBank" in test_js)
    check("боевой GET /api/test проверяет 30 вопросов и attemptId",
          "test_wrong_question_count" in test_js and "test_missing_attempt_id" in test_js)
    check("ошибка submit не превращается в нулевой балл",
          "score = 0; max = state.qs.length" not in test_js and "Повторить запрос" in test_js)
    check("боевой справочник использует /api/orgs",
          "static_orgs_disabled_in_production" in reg_js and "'/api/orgs?q='" in reg_js)
    check("production-регистрация не откатывается в localStorage",
          "if (PRODUCTION) throw err" in reg_js
          and "else if (PRODUCTION)" in reg_js
          and "diktant_registrations_demo" in reg_js)
    check("анонимная ошибка имеет pending и повтор",
          "anonPending" in test_js and "data-anon-retry" in test_js)
    check("регистрационный номер содержит ровно шесть цифр",
          r"^\d{6}$" in reg_js
          and "String(regs.length + 1).padStart(6, '0')" in reg_js
          and "String(regs.length + 1).padStart(6, '0')" in test_js
          and "'ПА/НОТА-26/' +" not in reg_js + test_js)
    check("отдельная небезопасная страница регистрации удалена",
          not (ROOT / "register.html").exists()
          and not (ROOT / "assets/js/register.js").exists()
          and "отдельная полная регистрационная форма" not in text("README.md")
          and "отдельная полная регистрационная форма" not in text("CMS-GUIDE.md"))


def audit_certificate() -> None:
    fields = json.loads(text("docs-dev/certificate/fields.json"))
    reg = next(field for field in fields["fields"] if field["id"] == "regnum")
    template = text("docs-dev/certificate/certificate-template.html")
    match = re.search(r'<span class="field field--regnum" data-field="regnum">(.*?)</span>', template)
    value = match.group(1) if match else ""
    check("поле сертификата – шесть цифр", bool(re.fullmatch(r"\d{6}", value)), value)
    check("fields.json фиксирует формат без префикса",
          "без префикса" in reg["label"] and "6" in reg["format"])
    check("маска сертификата не закрывает напечатанный префикс",
          reg["coverPlaceholder"]["xPx"] >= 710 and reg["text"]["xPx"] >= 714
          and ".cover--regnum { left: 36.15mm" in template
          and ".field--regnum" in template and "left: 36.35mm" in template)
    check("шаблон не добавляет префикс динамически",
          "('ПА/НОТА-26/' + v)" not in template)
    check("демо-PDF существует", (ROOT / "docs-dev/certificate/certificate-demo.pdf").stat().st_size > 100_000)


def audit_docs() -> None:
    readme = text("README.md")
    guide = text("CMS-GUIDE.md")
    combined = readme + "\n" + guide
    forbidden = [
        "до 01.10.2026",
        "off/on/auto",
        "проходить можно сколько угодно раз с одного устройства",
        "~240 тыс",
        "примерно 240 тысяч",
        "source-manifest.json",
    ]
    stale = [phrase for phrase in forbidden if phrase in combined]
    check("в документации нет известных устаревших правил", not stale,
          ", ".join(stale))
    check("README описывает рабочий режим",
          "diktant-mode" in readme and "anonPending" in readme)
    check("CMS-GUIDE описывает актуальные 64 618 организаций",
          "64 618" in guide)
    check("документы согласованы по шести цифрам",
          bool(re.search(r"шест[ьи]\s+цифр\s+без\s+префикса", readme.lower()))
          and bool(re.search(r"шест[ьи]\s+цифр\s+без\s+префикса", guide.lower())))
    check("документация описывает раздел Президентской академии",
          "https://www.ranepa.ru/nauka/diktant/" in readme
          and "https://www.ranepa.ru/nauka/diktant/" in guide
          and "Это не отдельный сайт" in readme)

    public_paths = [*ROOT.glob("*.html"), *(ROOT / "assets/js").glob("*.js")]
    public_sources = "\n".join(path.read_text(encoding="utf-8") for path in public_paths)
    check("главная страница раздела называется main.html",
          (ROOT / "main.html").is_file()
          and not (ROOT / "index.html").exists()
          and "index.html" not in public_sources
          and "/main.html" in readme)
    check("внутренняя навигация оформлена как навигация раздела",
          all('aria-label="Навигация раздела"' in text(page)
              and ">О диктанте</a>" in text(page)
              for page in ["main.html", "materials.html", "news.html",
                           "article.html", "test.html"])
          and "Разделы сайта" not in public_sources)
    check("футер содержит атрибуцию Президентской академии",
          all("Проект Президентской академии:" in text(page)
              and not re.search(r"\bdata-year(?:\s|=|>)", text(page))
              for page in ["main.html", "materials.html", "news.html",
                           "article.html", "test.html"]))
    check("собственные favicon раздела удалены",
          not (ROOT / "assets/favicon.svg").exists()
          and not (ROOT / "assets/favicon.png").exists()
          and "assets/favicon" not in public_sources)
    check("исторические документы удалены",
          not (ROOT / "docs-dev/documents").exists())

    consent_errors = []
    for path in (ROOT / "assets/docs").glob("*.docx"):
        try:
            with ZipFile(path) as archive:
                content = archive.read("word/document.xml").decode("utf-8")
                metadata = archive.read("docProps/core.xml").decode("utf-8")
            if ("официальном разделе" not in content
                    or "на сайте Президентской академии" not in content
                    or "официальном сайте Всероссийского" in content
                    or "<dc:creator>Президентская академия</dc:creator>" not in metadata
                    or "<cp:lastModifiedBy>Президентская академия</cp:lastModifiedBy>" not in metadata):
                consent_errors.append(path.name)
        except Exception as exc:  # Проверяем все документы, не прерывая аудит.
            consent_errors.append(f"{path.name}: {exc}")
    check("согласия описывают раздел на сайте Академии",
          len(list((ROOT / "assets/docs").glob("*.docx"))) == 2
          and not consent_errors, " | ".join(consent_errors))

    workbook_error = ""
    try:
        with ZipFile(ROOT / "docs-dev/reference/orgs-source.xlsx") as archive:
            workbook = archive.read("xl/workbook.xml").decode("utf-8")
            metadata = archive.read("docProps/core.xml").decode("utf-8")
        if ("<dc:creator>Президентская академия</dc:creator>" not in metadata
                or "<cp:lastModifiedBy>Президентская академия</cp:lastModifiedBy>" not in metadata
                or re.search(r'absPath url="(?!")', workbook)):
            workbook_error = "внутренние метаданные не очищены"
    except Exception as exc:  # Ошибка пакета XLSX должна быть видна в отчёте.
        workbook_error = str(exc)
    check("исходный Excel не содержит локального пути и личных метаданных",
          not workbook_error, workbook_error)

    maintainable_files = [
        *ROOT.glob("*.md"), *ROOT.glob("*.html"),
        *(ROOT / "assets/js").glob("*.js"),
        *(ROOT / "assets/css").glob("*.css"),
        *(ROOT / "tools").glob("*.py"),
        *(ROOT / "docs-dev/certificate").glob("*.md"),
        *(ROOT / "docs-dev/certificate").glob("*.html"),
    ]
    maintainable = "\n".join(path.read_text(encoding="utf-8")
                               for path in maintainable_files)
    history_phrases = [
        "запрос заказчика", "правки заказчика", "по решению заказчика",
        "ПРАВКА 08.", "правки 03-04.08.2026",
    ]
    found = [phrase for phrase in history_phrases if phrase in maintainable]
    check("в сопровождаемых файлах нет истории запросов и правок",
          not found, ", ".join(found))

def main() -> int:
    print(f"QA root: {ROOT}")
    audit_js()
    audit_python()
    audit_json()
    audit_html_and_assets()
    audit_guest_media()
    audit_image_loading()
    audit_organizations()
    audit_production_safety()
    audit_certificate()
    audit_docs()
    print(f"\nИтог: {CHECKS - len(ERRORS)}/{CHECKS} проверок пройдено")
    if ERRORS:
        print("\nОшибки:")
        for error in ERRORS:
            print("-", error)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
