#!/usr/bin/env python3
"""Автономный QA-гейт репозитория. Только Python stdlib + установленный Node.js."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

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
            if not target.exists():
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
        if not target.exists():
            missing.append(f"assets/css/style.css url={value}")

    check("уникальные HTML id", not duplicate_ids, " | ".join(duplicate_ids))
    check(f"локальные ссылки на {refs} ресурсов", not missing, " | ".join(missing))

    # Комментарии и data URI не влияют на простой контроль парных скобок.
    check("баланс фигурных скобок CSS", css.count("{") == css.count("}"),
          f"{{={css.count('{')} }}={css.count('}')}")


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
          "только demo: номер" in reg_js and "if (PRODUCTION) throw err" in reg_js)
    check("анонимная ошибка имеет pending и повтор",
          "anonPending" in test_js and "data-anon-retry" in test_js)
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
    ]
    stale = [phrase for phrase in forbidden if phrase in combined]
    check("в документации нет известных устаревших правил", not stale, ", ".join(stale))
    check("README описывает production", "diktant-mode" in readme and "anonPending" in readme)
    check("CMS-GUIDE описывает актуальные 64 618 организаций", "64 618" in guide)
    check("документы согласованы по шести цифрам",
          "шесть цифр без префикса" in readme.lower()
          and "шесть цифр без префикса" in guide.lower())


def main() -> int:
    print(f"QA root: {ROOT}")
    audit_js()
    audit_python()
    audit_json()
    audit_html_and_assets()
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
