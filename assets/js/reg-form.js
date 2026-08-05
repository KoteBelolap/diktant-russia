/* ============================================================
   Регистрационная форма участника – ЕДИНЫЙ МОДУЛЬ.
   Используется на двух страницах:
     – test.html: сразу под результатом теста (ТЗ п. 1.3);
     – register.html: отдельная страница (прямая ссылка).
   ------------------------------------------------------------
   БОЕВАЯ ИНТЕГРАЦИЯ (1С-Битрикс, сервер Академии):
     1) Дубль-проверка ДО регистрации (точное совпадение
        ФИО + пол + возраст + регион + организация + категория):
        POST /api/check-duplicate
          → { "duplicate": true|false }
        Если duplicate=true – участнику показывается окно
        «Вы уже участвовали», регистрация всё равно возможна
        по явному подтверждению (решение оргкомитета).
     2) Регистрация:
        POST /api/register  (JSON полей формы + score + category)
          → { "ok": true, "regNumber": "ПА/НОТА-26/000123" }
        Регистрационный номер: «ПА/НОТА-26/» + ID участника,
        дополненный нулями слева до 6 знаков.
     3) Список организаций для поиска:
        GET /api/orgs?q=…&region=…  → [{n, r, s?} ×7]
        Поиск глобальный: сервер ищет по всем субъектам, регион
        участника получает бонус релевантности (иногородние студенты).
        Записи без графы «регион» (филиалы РАНХиГС и т.п.), чьё название
        этот регион упоминает, приравниваются к своим – подробности
        в блоке «маркеры региона» ниже.
        Источник данных и в демо, и в бою – официальный справочник
        в Excel (docs-dev/reference/orgs-source.xlsx, колонки
        FullName / ShortName / RegionName). В демо он заранее
        разложен конвертером tools/xlsx-to-orgs.py в файлы
        assets/data/orgs/ (см. блок «подгрузка справочника» ниже);
        в бою тот же Excel импортируется в 1С-Битрикс и отдаётся
        тем же endpoint'ом.
   Если сервер недоступен (статичное демо), форма работает
   в демонстрационном режиме: данные не покидают браузер,
   регистрационный номер генерируется последовательно.
   ============================================================ */
window.RegForm = (() => {
  'use strict';
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const REGIONS = ["Республика Адыгея","Республика Алтай","Республика Башкортостан","Республика Бурятия","Республика Дагестан","Донецкая Народная Республика","Республика Ингушетия","Кабардино-Балкарская Республика","Республика Калмыкия","Карачаево-Черкесская Республика","Республика Карелия","Республика Коми","Республика Крым","Луганская Народная Республика","Республика Марий Эл","Республика Мордовия","Республика Саха (Якутия)","Республика Северная Осетия – Алания","Республика Татарстан","Республика Тыва","Удмуртская Республика","Республика Хакасия","Чеченская Республика","Чувашская Республика","Алтайский край","Забайкальский край","Камчатский край","Краснодарский край","Красноярский край","Пермский край","Приморский край","Ставропольский край","Хабаровский край","Амурская область","Архангельская область","Астраханская область","Белгородская область","Брянская область","Владимирская область","Волгоградская область","Вологодская область","Воронежская область","Запорожская область","Ивановская область","Иркутская область","Калининградская область","Калужская область","Кемеровская область – Кузбасс","Кировская область","Костромская область","Курганская область","Курская область","Ленинградская область","Липецкая область","Магаданская область","Московская область","Мурманская область","Нижегородская область","Новгородская область","Новосибирская область","Омская область","Оренбургская область","Орловская область","Пензенская область","Псковская область","Ростовская область","Рязанская область","Самарская область","Саратовская область","Сахалинская область","Свердловская область","Смоленская область","Тамбовская область","Тверская область","Томская область","Тульская область","Тюменская область","Ульяновская область","Херсонская область","Челябинская область","Ярославская область","Москва","Санкт-Петербург","Севастополь","Еврейская автономная область","Ненецкий автономный округ","Ханты-Мансийский автономный округ – Югра","Чукотский автономный округ","Ямало-Ненецкий автономный округ"];

  const CATS = [
    { v: 'Школьник 5–11 класс', k: 'school' },
    { v: 'Студент вуза или СПО', k: 'student' },
    { v: 'Закончил(а) обучение', k: 'adult' }
  ];

  /* ---------- уникальный префикс полей (форм на странице может быть две) ---------- */
  let uid = 0;

  /* ---------- HTML формы ---------- */
  function markup(u, preset) {
    const orgTypes = ['Школы', 'Колледжи, техникумы', 'Президентская академия и её филиалы', 'Вузы', 'Иные организации', 'Личное участие'];
    return `
    <form class="reg-form" id="${u}-form" novalidate>
      <section class="f-card glass" aria-labelledby="${u}-h1">
        <header class="f-card__head"><span class="f-card__num">1</span><h2 id="${u}-h1">Кто Вы</h2></header>
        <div class="f-grid--3 f-grid">
          <div class="f-field">
            <label for="${u}-surname">Фамилия</label>
            <input class="f-input" id="${u}-surname" name="surname" type="text" placeholder="Иванова" autocomplete="family-name" required>
            <span class="f-error"></span>
          </div>
          <div class="f-field">
            <label for="${u}-name">Имя</label>
            <input class="f-input" id="${u}-name" name="name" type="text" placeholder="Мария" autocomplete="given-name" required>
            <span class="f-error"></span>
          </div>
          <div class="f-field">
            <label for="${u}-patronymic">Отчество <small>(если есть)</small></label>
            <input class="f-input" id="${u}-patronymic" name="patronymic" type="text" placeholder="Сергеевна" autocomplete="additional-name">
            <span class="f-error"></span>
          </div>
          <div class="f-field" id="${u}-w-sex">
            <label>Пол</label>
            <div class="seg" role="radiogroup" aria-label="Пол">
              <label class="seg__opt"><input type="radio" name="${u}-sex" value="Женский"><span>Женский</span></label>
              <label class="seg__opt"><input type="radio" name="${u}-sex" value="Мужской"><span>Мужской</span></label>
            </div>
            <span class="f-error"></span>
          </div>
          <div class="f-field">
            <label for="${u}-age">Возраст</label>
            <input class="f-input" id="${u}-age" name="age" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="16" required>
            <span class="f-error"></span>
          </div>
          <div class="f-field">
            <label for="${u}-email">Электронная почта</label>
            <input class="f-input" id="${u}-email" name="email" type="email" placeholder="maria@example.ru" autocomplete="email" required>
            <span class="f-error"></span>
          </div>
        </div>
      </section>

      <section class="f-card glass" aria-labelledby="${u}-h2">
        <header class="f-card__head"><span class="f-card__num">2</span><h2 id="${u}-h2">Регион и организация</h2></header>
        <div class="f-grid">
          <div class="f-field f-field--full">
            <label for="${u}-region">Регион проживания</label>
            <span class="f-select-wrap"><select class="f-select" id="${u}-region" required>
              <option value="" selected disabled>Выберите из ${REGIONS.length} субъектов Российской Федерации…</option>
              ${REGIONS.map(r => `<option>${r}</option>`).join('')}
            </select></span>
            <span class="f-error"></span>
          </div>
          <div class="f-field f-field--full">
            <label for="${u}-orgtype">Ваша организация</label>
            <span class="f-select-wrap"><select class="f-select" id="${u}-orgtype" required>
              <option value="" selected disabled>Выберите вариант…</option>
              ${orgTypes.map(o => `<option>${o}</option>`).join('')}
            </select></span>
            <span class="f-error"></span>
          </div>
          <div class="f-field f-field--full org-box" id="${u}-w-org" hidden>
            <label for="${u}-org">Образовательная организация</label>
            <input class="f-input" id="${u}-org" type="text" placeholder="Начните вводить: «школа 74 краснодар»…" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="${u}-org-drop">
            <div class="org-drop" id="${u}-org-drop" role="listbox" aria-label="Варианты организаций"></div>
            <span class="f-error"></span>
            <div class="org-selected" id="${u}-org-selected">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              <span id="${u}-org-selected-name"></span>
              <button type="button" id="${u}-org-selected-clear">Изменить</button>
            </div>
            <label class="org-miss">
              <span class="switch"><input type="checkbox" id="${u}-org-miss"><i></i></span>
              Моей организации нет в списке
            </label>
          </div>
          <div class="f-field f-field--full" id="${u}-w-org-custom" hidden>
            <label for="${u}-org-custom">Введите наименование организации</label>
            <input class="f-input" id="${u}-org-custom" type="text" placeholder="Полное название Вашей организации" autocomplete="organization">
            <span class="f-error"></span>
          </div>
          <div class="f-field f-field--full" id="${u}-w-category">
            <label>Ваша возрастная категория</label>
            <div class="seg" role="radiogroup" aria-label="Возрастная категория">
              ${CATS.map(c => `<label class="seg__opt"><input type="radio" name="${u}-category" value="${c.v}"${preset && preset.category === c.k ? ' checked' : ''}><span>${c.v}</span></label>`).join('')}
            </div>
            <span class="f-error"></span>
          </div>
        </div>
      </section>

      <section class="f-card glass" id="${u}-w-consent">
        <label class="consent">
          <input type="checkbox" id="${u}-consent" required>
          <span class="consent__box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
          <p>Я выражаю своё согласие на <a href="assets/docs/consent-processing.docx" download>обработку</a> и <a href="assets/docs/consent-distribution.docx" download>передачу</a> своих персональных данных в соответствии с Федеральным законом № 152-ФЗ «О персональных данных».</p>
        </label>
        <span class="f-error" style="margin-top:10px"></span>
      </section>

      <div class="form-foot">
        <p class="note">Нажимая кнопку, Вы отправляете данные на сервер Президентской академии. После заполнения регистрационной формы сертификат участника будет отправлен на указанную электронную почту в течение 48 часов.</p>
        <button class="btn btn--primary btn--lg" id="${u}-submit" type="submit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 15l2 2 4-4"/></svg>
          Получить сертификат</button>
      </div>
    </form>`;
  }

  /* ---------- HTML успеха ---------- */
  function successMarkup(u, name, email, regNumber) {
    return `
    <div class="success glass" id="${u}-ok">
      <span class="success__badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
      <h2>Данные успешно зарегистрированы!</h2>
      <p>Сертификат участника с Вашими баллами будет отправлен на почту <b id="${u}-ok-email"></b> в течение 48 часов. Если письма нет во «Входящих», проверьте папки «Спам» и «Нежелательная почта». Пишите на <a href="mailto:diktant-russia@ranepa.ru">diktant-russia@ranepa.ru</a>.</p>
      <p class="success__regnum">Регистрационный номер участника: <b></b></p>
      <div class="btn-row" style="justify-content:center;margin-top:24px">
        <a class="btn btn--blue" href="index.html">На главную</a>
      </div>
    </div>`;
  }

  /* ---------- поиск организаций (локальный, демо) ---------- */
  const STOP = new Set(['и', 'в', 'г', '№', 'им', 'имени', '-', '»', '«']);
  const tokenize = s => s.toLowerCase().replace(/[«»"()\[\],.:;]/g, ' ').split(/[\s/\\-]+/)
    .map(t => t.trim()).filter(t => t && !STOP.has(t));
  function lev(a, b, max = 2) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let rowMin = max + 1;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        rowMin = Math.min(rowMin, cur[j]);
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  /* ---------- подгрузка справочника организаций ----------
     Полная база (~66 тыс. орг.) не влезает в одну сборку JS, да и
     не нужна сразу вся. Конвертер tools/xlsx-to-orgs.py раскладывает
     Excel-справочник в файлы assets/data/orgs/:
       rNN.json  – организации региона NN (NN = номер в списке REGIONS);
       none.json – записи без региона + зарубежные школы (решение
                   заказчика: подмешивать в поиск любого региона);
       all.json  – вся база одним файлом [[name, short, regionIdx]].
     СТРАТЕГИЯ ПОИСКА (запрос заказчика: иногородний студент живёт
     в одном регионе, а учится в другом – его организация тоже должна
     находиться): сначала ищем по файлу выбранного региона (быстрый
     старт с малым трафиком), параллельно в фоне докачиваем all.json,
     строим инвертированный индекс и дальше ищем ПО ВСЕМ СУБЪЕКТАМ –
     выбранный регион получает бонус релевантности (+14 против +4
     «без региона» и 0 у чужих). Дополнение (запрос заказчика
     05.08.2026): записи без графы «регион» (все филиалы РАНХиГС
     и др.), в названии которых встречается регион участника,
     приравниваются к своим (см. «маркеры региона» ниже).
     У вариантов не из своего региона
     показываем подпись, откуда организация.
     В бою этот блок заменяется GET /api/orgs?q=…&region=… –
     контракт ответа тот же: [{n, r, s?}]. */
  const ORG_DIR = 'assets/data/orgs/';
  const orgCache = {};            /* имя файла -> Promise<JSON> */
  const loadFile = f =>
    orgCache[f] = orgCache[f] || fetch(ORG_DIR + f + '.json')
      .then(r => { if (!r.ok) throw new Error(f + ': ' + r.status); return r.json(); });

  const mkOrg = (n, s, r) => ({ n, s, r, _t: tokenize(n + ' ' + (s || '')) });

  /* Быстрый старт (малый трафик): организации выбранного региона
     + записи без региона и зарубежные (none.json) */
  function loadRegionOrgs(region) {
    const slug = 'r' + String(REGIONS.indexOf(region) + 1).padStart(2, '0');
    return Promise.all([loadFile(slug), loadFile('none')])
      .then(([mine, stray]) =>
        mine.items.map(([n, s]) => mkOrg(n, s, region))
          .concat(stray.items.map(([n, s]) => mkOrg(n, s, ''))));
  }
  /* Вся база (догружается в фоне для глобального поиска) */
  function loadAllOrgs() {
    return loadFile('all').then(d =>
      d.items.map(([n, s, i]) => mkOrg(n, s, i ? REGIONS[i - 1] : '')));
  }
  /* Тихий прогрев кэша, как только выбран регион – к моменту ввода
     названия данные обычно уже на месте. */
  function prefetchRegionOrgs(region) {
    if (REGIONS.indexOf(region) < 0) return;
    loadFile('r' + String(REGIONS.indexOf(region) + 1).padStart(2, '0')).catch(() => {});
    loadFile('none').catch(() => {});
  }

  /* ---------- маркеры региона в названии организации ------------
     Запрос заказчика 05.08.2026. Мотивирующий пример: участник из
     Нижегородской области вводит «ранхигс», а все ~70 филиалов
     РАНХиГС лежат в справочнике БЕЗ графы «регион» и потому делили
     нейтральный бонус +4 – в выдаче они выстраивались сплошным
     алфавитным блоком («Адыгейский…», «Алтайский…»), и «Нижегородский
     институт управления» до показа просто не доживал. Правило: запись
     без региона, чьё название упоминает регион участника, считается
     своей (+14 как у организаций выбранного региона).
     Метод сравнения – по основам слов: отсекаем типовые окончания
     («-ская», «-ский», «-ия», «-а» …), сводя разные словоформы к общей
     основе: «Нижегородская» и «нижегородский» → «нижегород»,
     «Адыгея» и «адыгейский» → «адыге». Машинно-буквенное сравнение,
     без семантики, поэтому алгоритм описан здесь же целиком. */
  /* окончания: сначала длинные; отсекается только одно и только если
     остаётся основа от 4 букв (короткое слово ценно целиком: «тыва»,
     «коми», «крым» не трогаем) */
  const STEM_SUFFIXES = ['ская', 'ский', 'ское', 'ской', 'цкий', 'ного',
    'ный', 'ной', 'ная', 'ное', 'ний', 'ого', 'ия', 'ья', 'ье', 'ей',
    'ея', 'ый', 'ий', 'ой', 'а', 'я', 'о', 'е', 'и', 'ы', 'ь'];
  /* служебные слова названий субъектов – маркерами не являются */
  const REGION_GENERIC = new Set(['область', 'край', 'республика',
    'автономный', 'автономная', 'округ', 'город', 'г', 'народная',
    'эл', 'федерального', 'значения']);
  /* основы-направления («Северная» в «Республика Северная Осетия»)
     слишком частотны в названиях организаций – за маркер не считаем */
  const DIRECTION_STEMS = new Set(['север', 'южн', 'восточ', 'запад']);
  /* нестандартные пары словоформ, которые окончаниями не ловятся */
  const REGION_STEM_ALIASES = {
    'тыва': ['тувин'], 'калмык': ['калмыцк'], 'башкортостан': ['башкир'],
    'якути': ['якут'], 'саха': ['якут'], 'югра': ['югор'], 'ямал': ['ямаль']
  };
  const stemOf = w => {
    for (const suf of STEM_SUFFIXES) {
      if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length);
    }
    return w;
  };
  const lcpLen = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
  /* одна основа, обрезанная по-разному: общий корень от 5 букв и почти
     всё короткое слово («хакаси»/«хакасс» – да, «москв»/«москов» – нет:
     город Москва и Московская область намеренно различимы) */
  const sameStem = (a, b) =>
    a === b || (lcpLen(a, b) >= 5 && lcpLen(a, b) >= Math.min(a.length, b.length) - 1);
  /* набор основ-маркеров региона (кэш: 89 регионов считаются по разу) */
  const regionMarkers = (() => {
    const cache = new Map();
    return region => {
      let m = cache.get(region);
      if (!m) {
        m = new Set();
        for (const w of tokenize(region)) {
          if (REGION_GENERIC.has(w)) continue;
          const st = stemOf(w);
          if (st.length < 4 || DIRECTION_STEMS.has(st)) continue;
          m.add(st);
          (REGION_STEM_ALIASES[st] || []).forEach(a => m.add(a));
        }
        cache.set(region, m);
      }
      return m;
    };
  })();
  /* основы названия записи – лениво, один раз на запись */
  const orgStems = o => o._st || (o._st = new Set(o._t.map(stemOf)));
  function orgMentionsRegion(o, region) {
    const markers = regionMarkers(region);
    if (!markers.size) return false;
    for (const st of orgStems(o))
      for (const mk of markers) if (sameStem(st, mk)) return true;
    return false;
  }
  /* --- скоринг одной записи (изначальная формула, не менялась;
         к ней добавлено только правило «маркеров региона» выше) --- */
  function scoreOrg(o, qToks, region) {
    let exact = 0, fuzzy = 0, partial = 0;
    for (const qt of qToks) {
      let hit = false;
      if (o._t.includes(qt)) { exact++; hit = true; continue; }
      for (const t of o._t) {
        if (t.startsWith(qt) || (qt.length >= 4 && t.includes(qt))) { partial++; hit = true; break; }
      }
      if (hit) continue;
      if (qt.length >= 4) {
        for (const t of o._t) { if (Math.abs(t.length - qt.length) <= 2 && lev(qt, t, 2) <= 2) { fuzzy++; break; } }
      }
    }
    const cover = (exact + partial + fuzzy) / qToks.length;
    if (!cover) return 0;
    let score = exact * 10 + partial * 6 + fuzzy * 4 + cover * 12;
    if (region) {
      if (o.r === region) score += 14;   /* свой регион выше всех */
      else if (!o.r && orgMentionsRegion(o, region)) score += 14;
      /* без графы «регион», но регион участника есть в названии
         («Нижегородский институт управления – филиал РАНХиГС») –
         приравнена к своим */
      else if (!o.r) score += 4;         /* без региона/зарубежье – нейтрально выше чужих */
    }
    if (exact === qToks.length) score += 10;
    return score;
  }

  /* --- глобальный поиск по инвертированному индексу ---
     Индекс: Map токен -> id записей + отсортированный словарь (для
     бинарного поиска префикса). Кандидатов (обычно единицы-тысячи)
     даёт индекс за миллисекунды на всей базе; полный скоринг scoreOrg
     считается только по ним – результаты совпадают с прежним полным
     перебором, но без перебора 66 тыс. записей на каждую букву. */
  function buildOrgIndex(pool) {
    const map = new Map();
    pool.forEach((o, id) => {
      for (const t of o._t) {
        let a = map.get(t);
        if (!a) map.set(t, a = []);
        if (a[a.length - 1] !== id) a.push(id);
      }
    });
    const sorted = [...map.keys()].sort();
    return { map, sorted };
  }
  function lowerBound(sorted, key) {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < key) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function searchOrgs(query, region, pool, idx) {
    const qToks = tokenize(query);
    if (!qToks.length) return [];
    /* 1) кандидаты из индекса: точный токен + префикс («шко») */
    const cand = new Set();
    const add = ids => ids && ids.forEach(id => cand.add(id));
    for (const qt of qToks) {
      add(idx.map.get(qt));
      const lo = lowerBound(idx.sorted, qt);
      for (let i = lo; i < idx.sorted.length && idx.sorted[i].startsWith(qt); i++) add(idx.map.get(idx.sorted[i]));
    }
    const long = qToks.filter(q => q.length >= 4);
    if (long.length) {
      /* подстрока внутри токена («аросла» → «красноярская») – один проход словаря */
      idx.sorted.forEach(t => {
        for (const qt of long) {
          if (t.includes(qt) && !t.startsWith(qt)) { add(idx.map.get(t)); break; }
        }
      });
      /* опечатки (fuzzy) имеет смысл искать по словарю только для токена,
         который не сработал вообще нигде («хкола») – иначе все fuzzy-записи
         и так придут через остальные токены запроса */
      for (const qt of long) {
        const lo = lowerBound(idx.sorted, qt);
        const hasHit = idx.map.has(qt) ||
          (lo < idx.sorted.length && idx.sorted[lo].startsWith(qt));
        if (hasHit) continue;
        for (const t of idx.sorted) {
          if (Math.abs(t.length - qt.length) <= 2 && lev(qt, t, 2) <= 2) add(idx.map.get(t));
        }
      }
    }
    /* 2) полный скоринг кандидатов прежней формулой */
    const scored = [];
    cand.forEach(id => {
      const o = pool[id];
      const score = scoreOrg(o, qToks, region);
      if (score > 0) scored.push({ o, score });
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, 7);
  }
  /* Стартовый поиск по маленькому пулу региона (до прихода all.json) */
  function similarity(query, region, pool) {
    const qToks = tokenize(query);
    if (!qToks.length) return [];
    const scored = [];
    for (const o of pool) {
      const score = scoreOrg(o, qToks, region);
      if (score > 0) scored.push({ o, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 7);
  }
  const escH = s => s.replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  function highlight(name, qToks) {
    return name.split(/(\s+)/).map(w => {
      const wl = w.toLowerCase().replace(/[«»"()\[\],.:;]/g, '');
      if (!wl) return escH(w);
      for (const qt of qToks) {
        if (wl === qt || wl.startsWith(qt) || (qt.length >= 4 && wl.includes(qt))) return '<mark>' + escH(w) + '</mark>';
        if (qt.length >= 4 && Math.abs(wl.length - qt.length) <= 2 && lev(qt, wl, 2) <= 2) return '<mark>' + escH(w) + '</mark>';
      }
      return escH(w);
    }).join('');
  }

  /* ---------- демо-журнал регистраций (для дубль-проверки) ---------- */
  const REG_KEY = 'diktant_registrations_demo';
  const readRegs = () => { try { return JSON.parse(localStorage.getItem(REG_KEY) || '[]'); } catch { return []; } };
  const writeRegs = a => localStorage.setItem(REG_KEY, JSON.stringify(a));
  const dupKeyOf = d => [d.surname, d.name, d.patronymic, d.sex, d.age, d.region, d.orgType, d.org, d.category]
    .join('|').toLowerCase().replace(/\s+/g, ' ').trim();

  /* ---------- запрос к серверу с откатом в демо ---------- */
  async function api(path, payload) {
    try {
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  /* ============================================================
     mount(host, preset): превратить контейнер в регистрационный блок
       preset = { score: Number|null, category: 'school'|'student'|null, total: Number }
     ============================================================ */
  function mount(host, preset = {}) {
    const u = 'rf' + (++uid);
    const wrap = document.createElement('div');
    wrap.innerHTML = markup(u, preset);
    const form = $('form', wrap);
    host.appendChild(wrap);

    /* --- комбобокс организации --- */
    const regionSel = $(`#${u}-region`, form);
    const typeSel = $(`#${u}-orgtype`, form);
    const fwOrg = $(`#${u}-w-org`, form);
    const orgInput = $(`#${u}-org`, form);
    const orgDrop = $(`#${u}-org-drop`, form);
    const orgSelected = $(`#${u}-org-selected`, form);
    const orgCustomWrap = $(`#${u}-w-org-custom`, form);
    const orgCustom = $(`#${u}-org-custom`, form);
    const orgMiss = $(`#${u}-org-miss`, form);
    let chosen = null, activeIdx = -1, items = [];
    let orgPool = null;       /* стартовый пул: выбранный регион + none */
    let orgPoolRegion = null; /* для какого региона загружены */
    let allPool = null;       /* глобальный пул: ВСЯ страна (all.json) */
    let allIndex = null;      /* инвертированный индекс глобального пула */
    let allLoading = null;    /* Promise фоновой догрузки all.json */
    let dropReq = 0;          /* счётчик запросов (защита от гонок сети) */

    /* Фоновое включение глобального поиска: докачать all.json и
       построить индекс. Запускаем после первого реального поиска,
       чтобы не тратить трафик тем, кто комбобокс не открывает. */
    function ensureGlobalOrgs() {
      if (allIndex || allLoading) return;
      allLoading = loadAllOrgs().then(pool => {
        /* индекс строим частями по тикам – интерфейс не подмораживаем */
        return new Promise(res => {
          const map = new Map();
          let pos = 0;
          const CHUNK = 8000;
          const step = () => {
            const end = Math.min(pos + CHUNK, pool.length);
            for (; pos < end; pos++) {
              for (const t of pool[pos]._t) {
                let a = map.get(t);
                if (!a) map.set(t, a = []);
                if (a[a.length - 1] !== pos) a.push(pos);
              }
            }
            if (pos < pool.length) setTimeout(step, 0);
            else res({ map, sorted: [...map.keys()].sort() });
          };
          step();
        }).then(idx => {
          allPool = pool; allIndex = idx;
          /* выдача расширилась (теперь вся страна): если окно открыто –
             пересчитаем подсказки по текущему запросу сразу, не дожидаясь
             следующей буквы */
          if (orgDrop.classList.contains('is-open') && orgInput.value.trim().length >= 3 && !chosen) renderDrop();
        });
      }).catch(() => { allLoading = null; });
    }

    /* единая точка поиска: по всей стране, если фон готов; иначе –
       по стартовому пулу региона */
    function findOrgs(q, region) {
      if (allIndex) return searchOrgs(q, region, allPool, allIndex);
      if (orgPool && orgPoolRegion === region) return similarity(q, region, orgPool);
      return null;   /* региональный пул ещё не загружен */
    }

    const eduTypes = new Set(['Школы', 'Колледжи, техникумы', 'Президентская академия и её филиалы', 'Вузы']);
    const isOtherType = () => typeSel.value === 'Иные организации';
    const syncOrgVisibility = () => {
      const isEdu = eduTypes.has(typeSel.value);
      const isOther = isOtherType();
      fwOrg.hidden = !isEdu;
      /* «Иные организации» – сразу поле ручного ввода названия;
         учебные – ручной ввод только по галочке «нет в списке» */
      orgCustomWrap.hidden = !(isOther || (isEdu && orgMiss.checked));
      if (!isEdu) { chosen = null; orgMiss.checked = false; orgSelected.classList.remove('is-show'); orgInput.value = ''; orgInput.disabled = false; }
      if (!isOther && !isEdu) orgCustom.value = '';
    };
    typeSel.addEventListener('change', () => { syncOrgVisibility(); clearError(typeSel.closest('.f-field')); if (!fwOrg.hidden) orgInput.focus(); });
    syncOrgVisibility();

    function closeDrop() { orgDrop.classList.remove('is-open'); activeIdx = -1; }
    function choose(item) {
      chosen = item.o;
      orgInput.value = item.o.n;
      closeDrop();
      $(`#${u}-org-selected-name`, form).textContent = item.o.n;
      orgSelected.classList.add('is-show');
      clearError(fwOrg);
    }
    $(`#${u}-org-selected-clear`, form).addEventListener('click', () => {
      chosen = null; orgInput.value = ''; orgSelected.classList.remove('is-show'); orgInput.focus();
    });
    /* служебные состояния выпадающего окна (не варианты выбора) */
    function dropNote(html) { orgDrop.innerHTML = '<div class="org-none">' + html + '</div>'; orgDrop.classList.add('is-open'); }
    /* подпись под вариантом: короткое имя; у «чужих» регионов – ещё
       пометка региона (запрос: иногородний студент должен находить свою
       организацию и видеть, где она) */
    const orgSubline = o => {
      const tag = o.r && o.r !== regionSel.value ? o.r : '';
      return o.s && tag ? o.s + ' · ' + tag : (tag || o.s || '');
    };
    function showItems(list, qToks) {
      items = list;
      orgDrop.innerHTML = list.length
        ? list.map((it, i) => `
          <button type="button" class="org-opt" data-i="${i}" role="option">
            <span>${highlight(it.o.n, qToks)}</span>${orgSubline(it.o) ? '<small>' + escH(orgSubline(it.o)) + '</small>' : ''}
          </button>`).join('')
        : '<div class="org-none">Ничего не нашлось. Попробуйте изменить запрос или включите переключатель «Моей организации нет в списке» ниже.</div>';
      $$('.org-opt', orgDrop).forEach(b => b.addEventListener('click', () => choose(items[+b.dataset.i])));
      orgDrop.classList.add('is-open');
    }
    function renderDrop() {
      if (chosen || orgInput.disabled) { closeDrop(); return; }
      const q = orgInput.value.trim();
      if (q.length < 3) { closeDrop(); return; }
      const region = regionSel.value;
      if (!region) {   /* без региона не знаем, какой файл поднять */
        dropNote('Сначала выберите регион проживания выше – так найдём Вашу организацию быстрее.');
        return;
      }
      const foundNow = findOrgs(q, region);
      if (foundNow) {                   /* данные уже в памяти – ищем мгновенно */
        showItems(foundNow, tokenize(q));
        if (allIndex === null) ensureGlobalOrgs();
        return;
      }
      /* первый ввод после выбора региона: поднимаем его файл,
         а следом в фоне – всю базу страны */
      const myReq = ++dropReq;
      dropNote('Загружаю справочник организаций региона…');
      loadRegionOrgs(region).then(pool => {
        if (myReq !== dropReq) return;   /* пришёл более свежий ввод */
        orgPool = pool; orgPoolRegion = region;
        showItems(findOrgs(q, region), tokenize(q));
        ensureGlobalOrgs();
      }).catch(() => {
        if (myReq !== dropReq) return;
        dropNote('Не удалось загрузить справочник. Проверьте интернет и обновите страницу – или впишите название вручную: переключатель «Моей организации нет в списке» ниже.');
      });
    }
    let deb;
    orgInput.addEventListener('input', () => { chosen = null; orgSelected.classList.remove('is-show'); clearTimeout(deb); deb = setTimeout(renderDrop, 140); });
    orgInput.addEventListener('focus', () => { if (orgInput.value.trim().length >= 3) renderDrop(); });
    orgInput.addEventListener('keydown', e => {
      if (!orgDrop.classList.contains('is-open')) return;
      const opts = $$('.org-opt', orgDrop);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = e.key === 'ArrowDown' ? Math.min(opts.length - 1, activeIdx + 1) : Math.max(0, activeIdx - 1);
        opts.forEach((o, i) => o.classList.toggle('is-active', i === activeIdx));
        opts[activeIdx] && opts[activeIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault(); choose(items[activeIdx]);
      } else if (e.key === 'Escape') closeDrop();
    });
    document.addEventListener('pointerdown', e => { if (!e.target.closest('.org-box')) closeDrop(); });
    orgMiss.addEventListener('change', () => {
      orgCustomWrap.hidden = !(isOtherType() || orgMiss.checked);
      orgInput.disabled = orgMiss.checked;
      if (orgMiss.checked) { chosen = null; orgSelected.classList.remove('is-show'); closeDrop(); }
      if (!orgMiss.checked && !isOtherType()) orgCustom.value = '';
    });
    /* смена региона: забываем ранее выбранную организацию из другого
       региона, сбрасываем пул и сразу тихо подгружаем новый файл */
    regionSel.addEventListener('change', () => {
      if (orgPoolRegion !== regionSel.value) { orgPool = null; orgPoolRegion = null; }
      if (chosen && chosen.r && chosen.r !== regionSel.value) {
        chosen = null; orgInput.value = ''; orgSelected.classList.remove('is-show');
      }
      prefetchRegionOrgs(regionSel.value);
      renderDrop();
    });

    /* --- валидация --- */
    function setError(w, msg) { w.classList.add('has-error'); const e = $('.f-error', w); if (e) e.textContent = msg; }
    function clearError(w) { w && w.classList.remove('has-error'); }
    $$('.f-input, .f-select', form).forEach(el => el.addEventListener('input', () => clearError(el.closest('.f-field, .f-card'))));
    $$('input[type=radio]', form).forEach(el => el.addEventListener('change', () => clearError(el.closest('.f-field'))));

    const radioValue = name => { const r = $(`input[name="${u}-${name}"]:checked`, form); return r ? r.value : ''; };

    function collect() {
      return {
        surname: $(`#${u}-surname`, form).value.trim(),
        name: $(`#${u}-name`, form).value.trim(),
        patronymic: $(`#${u}-patronymic`, form).value.trim(),
        sex: radioValue('sex'),
        age: $(`#${u}-age`, form).value.trim(),
        email: $(`#${u}-email`, form).value.trim(),
        region: regionSel.value || '',
        orgType: typeSel.value || '',
        org: isOtherType() ? orgCustom.value.trim()
          : (fwOrg.hidden ? '' : (orgMiss.checked ? orgCustom.value.trim() : (chosen ? chosen.n : ''))),
        category: radioValue('category'),
        score: typeof preset.score === 'number' ? preset.score : null,
        total: typeof preset.total === 'number' ? preset.total : null
      };
    }

    function validate(d) {
      let firstBad = null;
      const fail = (w, msg) => { setError(w, msg); firstBad = firstBad || w; };
      const letters = v => /^[А-Яа-яЁёA-Za-z\-\s]+$/.test(v);
      if (!d.surname) fail($(`#${u}-surname`, form).closest('.f-field'), 'Укажите фамилию');
      else if (!letters(d.surname)) fail($(`#${u}-surname`, form).closest('.f-field'), 'Только буквы');
      if (!d.name) fail($(`#${u}-name`, form).closest('.f-field'), 'Укажите имя');
      else if (!letters(d.name)) fail($(`#${u}-name`, form).closest('.f-field'), 'Только буквы');
      if (d.patronymic && !letters(d.patronymic)) fail($(`#${u}-patronymic`, form).closest('.f-field'), 'Только буквы');
      if (!d.sex) fail($(`#${u}-w-sex`, form), 'Выберите пол');
      if (!/^\d+$/.test(d.age) || +d.age < 0 || +d.age > 120) fail($(`#${u}-age`, form).closest('.f-field'), 'Укажите возраст цифрами');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) fail($(`#${u}-email`, form).closest('.f-field'), 'Укажите корректную электронную почту');
      if (!d.region) fail(regionSel.closest('.f-field'), 'Выберите регион');
      if (!d.orgType) fail(typeSel.closest('.f-field'), 'Выберите Вашу организацию');
      if (!fwOrg.hidden) {
        if (orgMiss.checked) { if (!orgCustom.value.trim()) fail(orgCustomWrap, 'Введите наименование организации'); }
        else if (!chosen) fail(fwOrg, 'Начните вводить название и выберите организацию из списка');
      } else if (isOtherType() && !orgCustom.value.trim()) {
        fail(orgCustomWrap, 'Введите наименование организации');
      }
      if (!d.category) fail($(`#${u}-w-category`, form), 'Выберите возрастную категорию');
      if (!$(`#${u}-consent`, form).checked) fail($(`#${u}-w-consent`, form), 'Необходимо согласие на обработку персональных данных');
      return firstBad;
    }

    /* --- дубль-предупреждение (ТЗ: проверка по ФИО+пол+возраст+регион+организация+категория) --- */
    function confirmDuplicate(onYes) {
      const modal = document.createElement('div');
      modal.className = 'modal is-open';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.innerHTML = `
        <div class="modal__scrim"></div>
        <div class="modal__box glass">
          <h3>Вы уже участвовали?</h3>
          <p>По указанным данным (ФИО, пол, возраст, регион, организация, категория) уже зарегистрировано участие в диктанте. Если это Вы – сертификат уже отправлен на Вашу почту. Уверены, что регистрируете другого человека?</p>
          <div class="btn-row" style="justify-content:flex-end">
            <button class="btn btn--glass" type="button" data-dup="no">Проверю данные</button>
            <button class="btn btn--primary" type="button" data-dup="yes">Да, это другой участник</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      $('body');
      modal.addEventListener('click', e => {
        const b = e.target.closest('[data-dup]');
        if (b) { modal.remove(); document.body.style.overflow = ''; if (b.dataset.dup === 'yes') onYes(); }
        else if (e.target === modal || e.target.classList.contains('modal__scrim')) { modal.remove(); document.body.style.overflow = ''; }
      });
      document.body.style.overflow = 'hidden';
    }

    /* --- отправка --- */
    async function submitAll(d) {
      const btn = $(`#${u}-submit`, form);
      btn.disabled = true;
      btn.textContent = 'Отправляем…';

      let regNumber = null;
      const res = await api('/api/register', d);      // бой: сервер вернёт { ok, regNumber }
      if (res && res.ok && res.regNumber) {
        regNumber = res.regNumber;
      } else {
        /* демо: номер – «ПА/НОТА-26/» + ID с добивкой нулями до 6 знаков */
        const regs = readRegs();
        regNumber = 'ПА/НОТА-26/' + String(regs.length + 1).padStart(6, '0');
        regs.push({ key: dupKeyOf(d), email: d.email, regNumber, at: new Date().toISOString() });
        writeRegs(regs);
      }

      form.closest('div');
      const okWrap = document.createElement('div');
      okWrap.innerHTML = successMarkup(u, d.name, d.email, regNumber);
      form.replaceWith(okWrap);
      $(`#${u}-ok-email`, okWrap).textContent = d.email;   // жирный адрес из формы
      $('.success__regnum b', okWrap).textContent = regNumber;
      okWrap.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
      if (typeof preset.onSuccess === 'function') preset.onSuccess(d, regNumber);
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const d = collect();
      const firstBad = validate(d);
      if (firstBad) {
        firstBad.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
        const focusable = $('.f-input, .f-select, input, button', firstBad);
        focusable && focusable.focus({ preventScroll: true });
        return;
      }
      /* дубль-проверка: сервер, при недоступности – демо-журнал устройства */
      let duplicate = null;
      const dup = await api('/api/check-duplicate', d);
      if (dup && typeof dup.duplicate === 'boolean') duplicate = dup.duplicate;
      else duplicate = readRegs().some(r => r.key === dupKeyOf(d));

      if (duplicate) confirmDuplicate(() => submitAll(d));
      else await submitAll(d);
    });

    return { form };
  }

  return { mount };
})();
