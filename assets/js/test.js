/* ============================================================
   Механика прохождения диктанта (тестовая часть).
   ------------------------------------------------------------
   – Старт/окончание считаются ОТ ВРЕМЕНИ СЕРВЕРА (см. config.js):
     до 05.11.2026 10:00 мск показываем экран ожидания,
     после 08.11.2026 23:59 мск – экран завершения.
   – 30 вопросов из банка ~50: случайная выборка + перемешивание
     вопросов и вариантов (не повторяется у соседей – антисписывание).
   – Правильных ответов в JS нет: на боевом сервере вопросы
     приходят без них (GET /api/test), а балл считает сервер
     (POST /api/test/submit). Демо-режим: локальный банк
     question-bank-demo.js (ТОЛЬКО для превью).
   – Кнопка «Назад» браузера возвращает к стартовой анкете
     (History API), кнопка «Назад» интерфейса – к предыдущему
     вопросу, а с первого вопроса – к анкете.
   Механика от 05.08.2026 (запросы заказчика):
   – ПЕРЕД тестом – короткая анкета (пол/возраст/регион/организация,
     вариант reg-form.js «pre»); категория вопросов выводится из типа
     организации. ФИО и почта – ПОСЛЕ теста (вариант «post»).
   – «Далее» неактивна, пока на вопрос не дан ответ; «К результату»
     доступна только при ответах на все вопросы.
   – Меню вопросов показывает, отвечено/не отвечено, и ведёт к любому.
   – Кнопки «Завершить досрочно» нет: тест идёт до конца вопросов
     или до конца времени.
   – Повторное прохождение с того же устройства запрещено
     (localStorage-флаг); дубли участников отсекаются регистрацией.
   Механика от 08.08.2026 (запросы заказчика, итерация 3):
   – категорию участия выбирает САМ участник в pre-анкете
     (тип организации лишь подсвечивает правдоподобный вариант,
     пока участник не трогал переключатель сам);
   – после теста показываются баллы и панель решения «Дозаполнить
     данные» / «Отказаться»; 2 минуты без ответа или отказ – ответ
     записывается в базу без ФИО («не заполнено»), см. setupCta();
   Ужесточение 08.08.2026 (итерация 5):
   – двухминутный отсчёт идёт по РЕАЛЬНОМУ времени от момента
     финиша теста (rec.at + certDecisionSec): уход со страницы не
     останавливает и не перезапускает его; при возврате после
     дедлайна запись без ФИО отправляется немедленно (догон);
     серверный двойник правила – в CMS-GUIDE §5.4;
   – после анонимной записи дозаполнение персональных данных
     НЕ предлагается и заблокировано (только итоговый экран);
     связка записей – attemptId (в payload регистрации и анонимной
     записи);
   – тренировочные тесты открываются только вручную (config.js,
     trainingMode: 'on'), авто-открытия по дате больше нет.
   Тренировочный режим (?mode=training) работает по-прежнему:
   плитки категорий и повторные попытки без ограничений.
   ============================================================ */
(() => {
  'use strict';
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const shell = $('#test-app');
  if (!shell) return;

  const D = window.DIKTANT;
  const params = new URLSearchParams(location.search);
  const MODE = params.get('mode') === 'training' ? 'training' : 'main';

  /* Параметры ТЗ берутся из config.js (единый источник), значения
     по умолчанию – на случай, если конфиг не подключён */
  const DURATION = (window.DIKTANT?.CONFIG?.testDurationMin ?? 40) * 60;
  const QUESTIONS_PER_TEST = window.DIKTANT?.CONFIG?.questionsPerTest ?? 30;

  const CAT_META = {
    school:  'Школьник 5–11 класс',
    student: 'Студент вуза или СПО',
    adult:   'Закончил(а) обучение'
  };

  /* Запрет повторного прохождения с устройства (05.08.2026):
     после завершения основного теста пишем результат; при новом
     визите показываем экран «уже пройден». Тренировка не блокируется.
     Записи: { score, max, at, pre, registered }. */
  const DONE_KEY = 'diktant_attempt_done_v1';
  const doneRecRead = () => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || 'null'); } catch { return null; } };
  const doneRecWrite = r => { try { localStorage.setItem(DONE_KEY, JSON.stringify(r)); } catch { /* приватный режим */ } };

  /* Панель решения после теста (заказчик, 08.08.2026, ит. 3): сколько
     секунд ждём выбора «Дозаполнить данные»/«Отказаться», прежде чем
     записать результат в базу без ФИО. Значение – в config.js
     (certDecisionSec, по ТЗ 2 минуты); приёмка может уменьшить. */
  const DECISION_SEC = window.DIKTANT?.CONFIG?.certDecisionSec ?? 120;

  const state = {
    cat: null, qs: [], q: 0, answers: [],
    left: DURATION, timer: null, done: false, locked: false,
    demo: true, attemptId: null, pre: null,   /* pre – анкета перед тестом */
    ctaTimer: null, anon: false   /* анонимная запись уже ушла в базу */
  };

  const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  /* attemptId – сквозной идентификатор попытки (08.08.2026, ит. 5):
     в бою его выдаёт сервер (GET /api/test), в демо генерируем сами.
     Им связаны запись результата без ФИО и регистрация: по нему
     сервер запрещает дозаполнение после анонимной записи (§5.4). */
  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'att-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));

  /* ---------- защита от копирования (ТЗ 1.4) ---------- */
  document.addEventListener('contextmenu', e => { if ($('#test-app .q-card')) e.preventDefault(); });
  document.addEventListener('copy', e => { if ($('#test-app .q-card')) e.preventDefault(); });
  addEventListener('beforeunload', e => { if (state.cat && !state.done) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- экраны ---------- */
  const scr = { gate: $('#test-gate'), start: $('#test-start'), run: $('#test-run'), result: $('#test-result') };
  function show(name) {
    Object.entries(scr).forEach(([k, el]) => { if (el) el.hidden = k !== name; });
    if (name === 'start') prepareStart();
  }

  /* стартовый экран: основной режим – короткая анкета «pre» (монтируется
     reg-form.js один раз); тренировочный – плитки категорий, как прежде */
  function prepareStart() {
    const cats = $('#start-cats'), preHost = $('#pre-reg-mount');
    if (MODE === 'training') {
      if (cats) cats.hidden = false;
      if (preHost) preHost.hidden = true;
      return;
    }
    if (cats) cats.hidden = true;
    if (preHost) {
      preHost.hidden = false;
      if (window.RegForm && !preHost.dataset.mounted) {
        preHost.dataset.mounted = '1';
        window.RegForm.mount(preHost, {
          variant: 'pre',
          onSubmit: d => { state.pre = d; begin(d.categoryKey || 'adult'); }
        });
      }
    }
  }

  /* ---------- гейт дат (от времени сервера) ---------- */
  function gateState() {
    if (MODE === 'training') {
      return D.status.trainingOpen() ? 'open' : 'soon';
    }
    if (!D.status.started()) return 'soon';
    if (!D.status.ongoing()) return 'closed';
    return 'open';
  }

  function renderGate() {
    const g = gateState();
    if (g === 'open') { show('start'); return true; }
    show('gate');
    const box = $('#gate-panel');
    if (g === 'soon') {
      box.innerHTML = MODE === 'training' ? `
        <span class="gate-panel__icon">${icons.clock}</span>
        <h1>Тренировочные тесты появятся позже</h1>
        <p>Мы готовим для Вас учебные вопросы. Следите за новостями проекта.</p>
        <div class="btn-row" style="justify-content:center"><a class="btn btn--blue" href="index.html">На главную</a></div>`
      : `
        <span class="gate-panel__icon">${icons.clock}</span>
        <h1>Тестирование откроется 5 ноября в 10:00 по московскому времени</h1>
        <p>Проверка знаний будет доступна <b>с 5 ноября 10:00 до 8 ноября 23:59 по московскому времени</b>. Возвращайтесь – мы Вас ждём!</p>
        <div class="btn-row" style="justify-content:center"><a class="btn btn--blue" href="index.html">На главную</a></div>`;
    } else { /* closed */
      box.innerHTML = `
        <span class="gate-panel__icon">${icons.flag}</span>
        <h1>Диктант-2026 завершён</h1>
        <p>Тестирование завершилось 8 ноября в 23:59 по московскому времени. Спасибо всем участникам! Итоги сезона и церемония награждения – в новостях проекта.</p>
        <div class="btn-row" style="justify-content:center"><a class="btn btn--blue" href="index.html">На главную</a></div>`;
    }
    return false;
  }

  const icons = {
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 8 2a5.6 5.6 0 0 0 3-.8V14a5.6 5.6 0 0 1-3 .8c-3 0-5-2-8-2a6 6 0 0 0-4 1.3"/></svg>'
  };

  /* если гейт закрыт на «скоро», страница сама «оживёт» в момент старта:
     следим раз в секунду – 05.11.2026 в 10:00:00 тест открывается сам,
     без перезагрузки страницы; на 08.11 23:59 закрывается так же.
     «Оживление» идёт через init() → checkLock() (05.08.2026): для
     устройства с записью о прохождении гейт повторный тест не откроет –
     покажет экран «уже пройден», а при незавершённой регистрации
     вернёт экран результата с сохранённой анкетой. */
  let lastGate = gateState();
  setInterval(() => {
    const g = gateState();
    if (g === lastGate) return;
    lastGate = g;
    if (!state.cat && !state.done && scr.run.hidden && scr.result.hidden) init();
  }, 1000);

  /* ---------- подписи тренировочного режима ---------- */
  if (MODE === 'training') {
    const crumb = $('#crumb-mode'); if (crumb) crumb.textContent = 'Тренировочный тест';
    const t = $('#start-title'); if (t) t.textContent = 'Тренировочный тест: выберите категорию';
    const l = $('#start-lead'); if (l) l.innerHTML = 'Тренировка повторяет формат основного диктанта – то же время и типы вопросов, но <strong>без регистрации</strong> и с неограниченным числом попыток. Вопросы здесь учебные.';
  }

  /* ---------- загрузка вопросов: сервер → демо ---------- */
  async function loadQuestions(cat) {
    /* бой: сервер отдаёт 30 вопросов без правильных ответов */
    try {
      const r = await fetch('/api/test?cat=' + encodeURIComponent(cat), { headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        const data = await r.json();
        if (data && Array.isArray(data.questions) && data.questions.length) {
          state.demo = false;
          state.attemptId = data.attemptId || null;
          return data.questions;
        }
      }
    } catch { /* статичное демо – сеть недоступна */ }
    /* демо: локальный банк (вопросы+ответы), случайная выборка и перемешивание */
    state.demo = true;
    if (!state.attemptId) state.attemptId = uid();   /* см. uid(): сквозной id попытки */
    const bankKey = MODE === 'training' ? 'training' : cat;
    const pool = [...(window.QUESTION_BANK_DEMO[bankKey] || [])];
    shuffle(pool);
    const picked = pool.slice(0, Math.min(QUESTIONS_PER_TEST, pool.length));
    return picked.map(q => {
      const order = q.opts.map((o, i) => i);
      shuffle(order);
      return {
        ...q,
        opts: order.map(i => q.opts[i]),
        right: (q.right || []).map(i => order.indexOf(i))
      };
    });
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------- старт теста ---------- */
  $$('.test-cat').forEach(btn => btn.addEventListener('click', () => begin(btn.dataset.cat)));

  const urlCat = params.get('cat');
  if (MODE === 'training' && urlCat && CAT_META[urlCat]) {
    /* прямая ссылка из карточки тренировочного теста */
    setTimeout(() => begin(urlCat), 0);
  }

  async function begin(cat) {
    if (gateState() !== 'open') { renderGate(); return; }
    if (MODE === 'main' && !state.pre) { show('start'); return; }   /* без анкеты тест не стартует */
    state.cat = cat;
    state.qs = await loadQuestions(cat);
    if (!state.qs.length) return;
    state.q = 0;
    state.answers = state.qs.map(() => []);
    state.done = false; state.locked = false;
    state.left = DURATION;

    buildMenu();
    show('run');
    history.pushState({ diktant: 'run' }, '', location.href);
    tickTimer();
    clearInterval(state.timer);
    state.timer = setInterval(tickTimer, 1000);
    renderQ();
    scrollTo({ top: Math.max(0, scr.run.offsetTop - 24), behavior: REDUCED ? 'auto' : 'smooth' });
  }

  /* браузерная кнопка «Назад» → экран выбора категории */
  addEventListener('popstate', () => {
    if (!state.cat || state.done) return;
    clearInterval(state.timer);
    state.cat = null;
    show('start');
    scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
  });

  function tickTimer() {
    const t = $('#timer');
    const m = String(Math.floor(state.left / 60)).padStart(2, '0');
    const s = String(state.left % 60).padStart(2, '0');
    t.querySelector('b').textContent = m + ':' + s;
    t.classList.toggle('is-low', state.left <= 300);
    if (state.left <= 0) { finish(true); return; }
    state.left--;
  }

  /* ---------- рендер вопроса (в т.ч. фото/видео) ---------- */
  function renderQ() {
    const q = state.qs[state.q];
    const total = state.qs.length;
    $('#hud-q').textContent = 'Вопрос ' + (state.q + 1) + ' / ' + total;
    $('#hud-bar').style.width = (state.q / total * 100) + '%';

    const card = $('#q-card');
    card.style.animation = 'none'; void card.offsetWidth;
    card.style.animation = REDUCED ? '' : 'dropIn .45s cubic-bezier(.22,1,.36,1)';

    card.innerHTML = `
      <span class="chip q-card__tag">${esc(q.tag || '')}${q.type === 'multi' ? ' – несколько ответов' : ''}</span>
      ${q.media ? mediaMarkup(q.media) : ''}
      <h2>${esc(q.q)}</h2>
      <div class="q-opts" role="${q.type === 'multi' ? 'group' : 'radiogroup'}" aria-label="Варианты ответов">
        ${q.opts.map((o, i) => `
          <button type="button" class="q-opt${state.answers[state.q].includes(i) ? ' is-sel' : ''}" data-i="${i}" role="${q.type === 'multi' ? 'checkbox' : 'radio'}" aria-checked="${state.answers[state.q].includes(i)}">
            <span class="q-opt__key">${'АБВГДЕ'[i]}</span>
            <span>${esc(o)}</span>
          </button>`).join('')}
      </div>
    `;

    $$('.q-opt', card).forEach(btn => btn.addEventListener('click', () => {
      if (state.locked) return;
      const i = +btn.dataset.i;
      if (q.type === 'single') {
        state.answers[state.q] = [i];
        $$('.q-opt', card).forEach(b => { b.classList.toggle('is-sel', +b.dataset.i === i); b.setAttribute('aria-checked', +b.dataset.i === i); });
        setTimeout(() => { if (!state.done) nav(1); }, REDUCED ? 0 : 320);
      } else {
        const set = state.answers[state.q];
        const ix = set.indexOf(i);
        ix >= 0 ? set.splice(ix, 1) : set.push(i);
        btn.classList.toggle('is-sel');
        btn.setAttribute('aria-checked', ix < 0);
      }
      updateNav(); updateMenu();
    }));

    updateNav(); updateMenu();
  }

  function mediaMarkup(m) {
    if (m.kind === 'video') {
      return `<div class="q-media q-media--video">
        <video controls preload="metadata" playsinline ${m.poster ? `poster="${esc(m.poster)}"` : ''} aria-label="${esc(m.alt || 'Видео к вопросу')}">
          <source src="${esc(m.src)}" type="video/mp4">
          Ваш браузер не поддерживает видео. Скачайте файл: <a href="${esc(m.src)}">mp4</a>.
        </video>
        ${m.alt ? `<p class="q-media__cap">${esc(m.alt)}</p>` : ''}
      </div>`;
    }
    return `<div class="q-media">
      <img src="${esc(m.src)}" alt="${esc(m.alt || 'Изображение к вопросу')}" loading="lazy">
      ${m.alt ? `<p class="q-media__cap">${esc(m.alt)}</p>` : ''}
    </div>`;
  }

  /* ---------- меню вопросов: отвечено/не отвечено (05.08.2026) ---------- */
  const menuBox = $('#q-menu'), menuGrid = $('#q-menu-grid'),
        menuBtn = $('#q-menu-btn'), menuCountEl = $('#q-menu-count'),
        menuEmptyEl = $('#q-menu-legend-empty');
  function buildMenu() {
    if (!menuGrid) return;
    menuGrid.innerHTML = state.qs.map((_, i) =>
      `<button type="button" class="q-menu__num" data-i="${i}" aria-label="Вопрос ${i + 1}">${i + 1}</button>`).join('');
    $$('.q-menu__num', menuGrid).forEach(b =>
      b.addEventListener('click', () => { state.q = +b.dataset.i; renderQ(); }));
    if (menuBox) menuBox.hidden = true;
    if (menuBtn) { menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.classList.remove('is-open'); }
    if (menuEmptyEl) menuEmptyEl.textContent = '';
    updateMenu();
  }
  function updateMenu() {
    if (!menuGrid || !state.qs.length) return;
    const done = state.answers.filter(a => a.length).length;
    if (menuCountEl) menuCountEl.textContent = done + '/' + state.qs.length;
    $$('.q-menu__num', menuGrid).forEach((b, i) => {
      b.classList.toggle('is-done', state.answers[i].length > 0);
      b.classList.toggle('is-cur', i === state.q);
      b.classList.remove('is-flag');
      if (i === state.q) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }
  if (menuBtn) menuBtn.addEventListener('click', () => {
    const open = menuBox.hidden;
    menuBox.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.classList.toggle('is-open', open);
    if (menuEmptyEl && open) menuEmptyEl.textContent = '';
  });
  function openMenu() { if (menuBox && menuBox.hidden) menuBtn.click(); }

  function updateNav() {
    const total = state.qs.length;
    const prev = $('#q-prev');
    prev.disabled = false;
    prev.innerHTML = state.q === 0
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m6 6-6-6 6-6"/></svg>' + (MODE === 'training' ? 'К выбору категории' : 'К анкете')
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m6 6-6-6 6-6"/></svg>Назад';
    const last = state.q === total - 1;
    const next = $('#q-next');
    next.innerHTML = (last ? 'К результату' : 'Далее') + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
    /* без ответа на текущий вопрос дальше не идём (запрос 05.08.2026):
       пропускать вопросы нельзя – засчитываются только отвеченные */
    next.disabled = !state.answers[state.q].length;
  }

  $('#q-prev').addEventListener('click', () => {
    if (state.q === 0) {                       /* первый вопрос → к выбору категории (через историю) */
      history.back();
      return;
    }
    nav(-1);
  });
  /* «Далее»: последняя = «К результату»; без ответа отключена (updateNav).
     «К результату» срабатывает только при ответах на все вопросы –
     иначе открываем меню и подсвечиваем пропущенные (запрос 05.08.2026). */
  $('#q-next').addEventListener('click', () => {
    const total = state.qs.length;
    if (state.q === total - 1) {
      const empty = state.answers.reduce((acc, a, i) => acc.concat(a.length ? [] : [i]), []);
      if (!empty.length) { finish(false); return; }
      openMenu();
      if (menuEmptyEl) menuEmptyEl.textContent = 'Без ответа: ' + empty.map(i => i + 1).join(', ');
      const first = $$('.q-menu__num', menuGrid)[empty[0]];
      if (first) { first.classList.add('is-flag'); setTimeout(() => first.classList.remove('is-flag'), 1800); }
      return;
    }
    nav(1);
  });

  function nav(d) {
    const total = state.qs.length;
    state.q = Math.max(0, Math.min(total - 1, state.q + d));
    renderQ();
  }

  function cleardone() { clearInterval(state.timer); state.done = true; state.locked = true; }

  /* ---------- результат: балл считает сервер (или демо-вариант) ---------- */
  async function finish(byTime) {
    if (state.done) return;
    cleardone();

    let score, max;
    if (state.demo) {
      /* демо: считаем локально (в бою этого кода нет – балл с сервера) */
      score = 0;
      state.qs.forEach((q, i) => {
        const a = [...state.answers[i]].sort().join(',');
        const r = [...q.right].sort().join(',');
        if (a === r) score++;
      });
      max = state.qs.length;
    } else {
      try {
        const r = await fetch('/api/test/submit', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId: state.attemptId, cat: state.cat, answers: state.answers })
        });
        const data = await r.json();
        score = data.score; max = data.max;
      } catch {
        score = 0; max = state.qs.length;   /* крайний случай */
      }
    }

    history.replaceState({ diktant: 'result' }, '', location.href);
    show('result');
    renderResult(score, max, byTime);

    /* запрет повторного прохождения с устройства (05.08.2026):
       в тренировке флаг не ставим – там попытки свободны */
    if (MODE === 'main') {
      doneRecWrite({ score, max, at: new Date().toISOString(), pre: state.pre, registered: false, attemptId: state.attemptId || null });
    }
  }

  /* ---------- формулировки вердиктов (шкала 30 / 25–29 / 15–24 / 0–14) ---------- */
  function verdict(score, total) {
    const m = (MODE === 'main');
    if (score === total) return {
      title: 'Абсолютный победитель!',
      sub: m
        ? 'Невероятно: максимальный результат! Заполните регистрационную форму – диплом и приглашение на награждение уже почти Ваши.'
        : 'Блестяще! В боевом диктанте такой результат приносит диплом абсолютного победителя.' };
    if (score >= Math.ceil(total * 25 / 30)) return {
      title: 'Отличный результат!',
      sub: m
        ? 'Знания на высоком уровне. Заполните регистрационную форму, чтобы получить сертификат с Вашими баллами.'
        : 'Уверенный уровень! До максимума совсем немного – загляните в материалы для подготовки.' };
    if (score >= Math.ceil(total * 15 / 30)) return {
      title: 'Хорошая работа!',
      sub: m
        ? 'Достойный результат. Заполните регистрационную форму, чтобы получить сертификат участника.'
        : 'Крепкая база. Материалы для подготовки помогут добить до максимума.' };
    return {
      title: 'Есть куда расти',
      sub: m
        ? 'Главное – участие! Заполните регистрационную форму: сертификат участника ждёт Вас, а подготовиться к следующему сезону помогут материалы.'
        : 'Загляните в материалы для подготовки – следующая попытка будет сильнее.' };
  }

  /* ---------- панель решения после результата (заказчик, 08.08.2026) ----------
     Исходная разметка панели запоминается один раз – при повторных показах
     (переигранный тест, возврат на страницу) панель собирается заново. */
  let CTA_HTML = null;
  const mmss = s => String(Math.floor(s / 60)) + ':' + String(s % 60).padStart(2, '0');

  /* Итог после записи без ФИО (ит. 5): дозаполнение больше НЕ
     предлагаем – ни кнопки, ни отсчёта, только честный итог. */
  const ctaDoneHtml = (score, max) => `
        <p class="result-cta__done"><b>Ответ записан.</b> Ваш результат – <b>${score} из ${max}</b> – сохранён в базе без ФИО (вместо них указано «не заполнено»), поэтому сертификат участника по этой записи не высылается.</p>
        <div class="btn-row" style="justify-content:center">
          <a class="btn btn--blue" href="index.html">На главную</a>
        </div>`;

  function setupCta(score, max) {
    const cta = $('#result-cta');
    if (!cta) return;
    if (CTA_HTML === null) CTA_HTML = cta.innerHTML;
    clearInterval(state.ctaTimer);
    cta.hidden = false;

    /* анонимная запись уже ушла (этот или прошлый визит) – сразу
       итоговый экран; «Дозаполнить данные» не возвращаем (заказчик, ит. 5) */
    if (state.anon) { cta.innerHTML = ctaDoneHtml(score, max); return; }

    cta.innerHTML = CTA_HTML;

    /* Отсчёт идёт по РЕАЛЬНОМУ времени от финиша теста (ит. 5):
       дедлайн = rec.at + certDecisionSec. Уход со страницы его не
       останавливает и не перезапускает; вернулся после дедлайна –
       запись без ФИО отправляется сразу (догон). В бою тот же дедлайн
       контролирует и сервер (CMS-GUIDE §5.4). */
    const rec = doneRecRead();
    const finished = rec && rec.at ? new Date(rec.at).getTime() : Date.now();
    const deadline = (isFinite(finished) ? finished : Date.now()) + DECISION_SEC * 1000;

    const leftEl = $('#result-cta-left');
    const remain = () => Math.round((deadline - Date.now()) / 1000);
    let left = remain();
    if (left <= 0) { anonSave(score, max, 'таймаут 2 минут без ответа'); return; }
    if (leftEl) leftEl.textContent = mmss(left);
    state.ctaTimer = setInterval(() => {
      left = remain();
      if (leftEl) leftEl.textContent = mmss(Math.max(0, left));
      if (left <= 0) anonSave(score, max, 'таймаут 2 минут без ответа');
    }, 1000);

    $('#result-cta-fill')?.addEventListener('click', () => revealReg());
    $('#result-cta-decline')?.addEventListener('click', () => anonSave(score, max, 'участник отказался'));
  }

  /* «Дозаполнить данные»: ждать больше нечего – открываем и монтируем
     регистрационную форму участника (вариант post: ФИО + почта, данные
     из pre показаны сводкой с кнопкой «Изменить данные», 05/08.08.2026) */
  function revealReg() {
    /* ит. 5: после записи без ФИО дозаполнение запрещено – на всякий
       случай режем и здесь (кнопку в таком состоянии уже не рисуем) */
    if (state.anon || (doneRecRead() || {}).anon) return;
    clearInterval(state.ctaTimer);
    const cta = $('#result-cta'), regHost = $('#result-reg');
    if (cta) cta.hidden = true;
    if (!regHost) return;
    regHost.hidden = false;
    if (!regHost.dataset.mounted && window.RegForm) {
      regHost.dataset.mounted = '1';
      window.RegForm.mount(regHost, {
        variant: 'post', pre: state.pre, score: state.lastScore, total: state.lastMax,
        attemptId: state.attemptId,   /* связка с анонимной записью (ит. 5, §5.4) */
        onSuccess: () => {   /* сертификат заказан – устройство «чистое» */
          const r = doneRecRead(); if (r) { r.registered = true; doneRecWrite(r); }
        }
      });
    }
    regHost.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  }

  /* «Отказаться» или 2 минуты без ответа: результат пишется в базу
     БЕЗ ФИО – вместо них «не заполнено» (формулировка заказчика).
     Бой: POST /api/register с признаком anonymous. Демо: та же запись
     в локальный журнал регистраций (зеркалит демо-ветку reg-form.js). */
  async function anonSave(score, max, reason) {
    clearInterval(state.ctaTimer);
    if (!state.anon) {
      state.anon = true;
      const rec = doneRecRead();
      if (rec) { rec.anon = true; doneRecWrite(rec); }
      const pre = state.pre || {};
      const payload = {
        variant: 'anonymous', reason,
        attemptId: state.attemptId || null,   /* связка с возможной регистрацией (ит. 5) */
        surname: 'не заполнено', name: 'не заполнено', patronymic: '',
        email: 'не заполнено',
        sex: pre.sex || '', age: pre.age || '', region: pre.region || '',
        orgType: pre.orgType || '', org: pre.org || '',
        category: pre.category || '', categoryKey: state.cat || '',
        score, total: max
      };
      let ok = false;
      try {
        const r = await fetch('/api/register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        ok = r.ok;
      } catch { /* статичное демо */ }
      if (!ok) {   /* демо-журнал устройства (как в reg-form.js) */
        try {
          const REG_KEY = 'diktant_registrations_demo';
          const regs = JSON.parse(localStorage.getItem(REG_KEY) || '[]');
          const regNumber = 'ПА/НОТА-26/' + String(regs.length + 1).padStart(6, '0');
          regs.push({
            key: [payload.surname, payload.name, payload.patronymic, payload.sex, payload.age,
                  payload.region, payload.orgType, payload.org, payload.category]
              .join('|').toLowerCase().replace(/\s+/g, ' ').trim(),
            email: payload.email, regNumber, anonymous: true,
            attemptId: payload.attemptId,
            at: new Date().toISOString()
          });
          localStorage.setItem(REG_KEY, JSON.stringify(regs));
        } catch { /* приватный режим */ }
      }
    }
    const cta = $('#result-cta');
    if (cta) { cta.hidden = false; cta.innerHTML = ctaDoneHtml(score, max); }
  }

  function renderResult(score, max, byTime) {
    state.lastScore = score; state.lastMax = max;   /* для ленивого монтажа post-формы */
    const C = 2 * Math.PI * 88;
    const ring = $('#ring-fg');
    ring.style.strokeDasharray = C;
    ring.style.strokeDashoffset = C;
    setTimeout(() => { ring.style.strokeDashoffset = C * (1 - (max ? score / max : 0)); }, 60);

    const scoreEl = $('#result-score');
    const dur = REDUCED ? 0 : 1400, t0 = performance.now();
    (function anim(t) {
      const p = dur ? Math.min(1, (t - t0) / dur) : 1;
      scoreEl.textContent = Math.round(score * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(anim);
    })(t0);
    $('#result-max').textContent = 'из ' + max;

    const v = verdict(score, max);
    $('#result-title').textContent = v.title;
    $('#result-sub').textContent = v.sub;
    $('#result-note').textContent = byTime
      ? 'Время вышло – показан результат по уже данным ответам.'
      : 'Верных ответов: ' + score + ' из ' + max + '.';

    /* основной режим: сначала ТОЛЬКО баллы и панель решения
       (заказчик, 08.08.2026, ит. 3): «Дозаполнить данные» открывает
       регистрационную форму участника ниже; «Отказаться» или 2 минуты
       молчания – результат пишется в базу без ФИО («не заполнено»).
       Вторая анкета (ФИО + почта + согласия) монтируется по требованию. */
    const regHost = $('#result-reg');
    const cta = $('#result-cta');
    if (MODE === 'main') {
      regHost.hidden = true;
      if (cta) setupCta(score, max);
    } else {
      if (cta) cta.hidden = true;
      regHost.hidden = true;
    }

    scr.result.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  }

  /* «Пройти ещё раз» – только тренировка: в основном режиме повторное
     прохождение с устройства запрещено, кнопки скрыты (05.08.2026) */
  if (MODE === 'training') {
    $$('[data-restart]').forEach(b => b.addEventListener('click', () => {
      state.done = false; state.cat = null;
      show('start');
      scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
    }));
  } else {
    $$('[data-restart]').forEach(b => { b.hidden = true; });
  }

  /* ---------- первичная инициализация ---------- */
  /* уже проходил с этого устройства? Экран «уже пройден» (основной режим).
     Исключение: тест пройден, а регистрация не завершена и диктант ещё идёт –
     возвращаем экран результата с сохранённой анкетой и формой (05.08.2026). */
  function checkLock() {
    if (MODE !== 'main') return false;
    const rec = doneRecRead();
    if (!rec) return false;
    if (!rec.registered && gateState() === 'open' && rec.pre) {
      state.pre = rec.pre;
      state.anon = !!rec.anon;   /* возможно, результат уже записан без ФИО */
      state.attemptId = rec.attemptId || null;   /* связка записей (ит. 5) */
      show('result');
      renderResult(rec.score, rec.max, false);
      return true;
    }
    show('gate');
    const box = $('#gate-panel');
    const when = rec.at ? new Date(rec.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
    box.innerHTML = `
      <span class="gate-panel__icon">${icons.flag}</span>
      <h1>На этом устройстве диктант уже пройден</h1>
      <p>Ваш результат: <b>${rec.score} из ${rec.max}</b>${when ? ' (' + when + ')' : ''}. Повторное прохождение с одного устройства недоступно – так результаты всех участников остаются честными.</p>
      <p>Сертификат участника отправлен на почту, указанную при регистрации. Если письма нет – проверьте папки «Спам» и «Нежелательная почта» или напишите на <a href="mailto:diktant-russia@ranepa.ru">diktant-russia@ranepa.ru</a>.</p>
      <div class="btn-row" style="justify-content:center"><a class="btn btn--blue" href="index.html">На главную</a></div>`;
    return true;
  }
  function init() { if (!checkLock()) renderGate(); }
  init();
})();
