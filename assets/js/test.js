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
   – Кнопка «Назад» браузера возвращает к выбору категории
     (History API), кнопка «Назад» интерфейса – к предыдущему
     вопросу, а с первого вопроса – к выбору категории.
   – Повторное прохождение с одного устройства разрешено;
     дубли участников отсеиваются при регистрации (reg-form.js).
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

  const state = {
    cat: null, qs: [], q: 0, answers: [],
    left: DURATION, timer: null, done: false, locked: false,
    demo: true, attemptId: null
  };

  const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  /* ---------- защита от копирования (ТЗ 1.4) ---------- */
  document.addEventListener('contextmenu', e => { if ($('#test-app .q-card')) e.preventDefault(); });
  document.addEventListener('copy', e => { if ($('#test-app .q-card')) e.preventDefault(); });
  addEventListener('beforeunload', e => { if (state.cat && !state.done) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- экраны ---------- */
  const scr = { gate: $('#test-gate'), start: $('#test-start'), run: $('#test-run'), result: $('#test-result') };
  function show(name) {
    Object.entries(scr).forEach(([k, el]) => { if (el) el.hidden = k !== name; });
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
     без перезагрузки страницы; на 08.11 23:59 закрывается так же */
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
    state.cat = cat;
    state.qs = await loadQuestions(cat);
    if (!state.qs.length) return;
    state.q = 0;
    state.answers = state.qs.map(() => []);
    state.done = false; state.locked = false;
    state.left = DURATION;

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
      ${q.type === 'multi' ? '<div class="test-hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16.5v.01"/></svg>Выберите все верные варианты и нажмите «Далее»</div>' : ''}
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
      updateNav();
    }));

    updateNav();
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

  function updateNav() {
    const total = state.qs.length;
    const prev = $('#q-prev');
    prev.disabled = false;
    prev.innerHTML = state.q === 0
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m6 6-6-6 6-6"/></svg>К выбору категории'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m6 6-6-6 6-6"/></svg>Назад';
    const last = state.q === total - 1;
    $('#q-next').innerHTML = (last ? 'К результату' : 'Далее') + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
  }

  $('#q-prev').addEventListener('click', () => {
    if (state.q === 0) {                       /* первый вопрос → к выбору категории (через историю) */
      history.back();
      return;
    }
    nav(-1);
  });
  $('#q-next').addEventListener('click', () => nav(1));
  $('#q-finish').addEventListener('click', () => {
    const empty = state.answers.filter(a => !a.length).length;
    $('#finish-modal-text').textContent = empty
      ? 'Вы ответили не на все вопросы (' + empty + ' без ответа). Завершить тест и подсчитать баллы?'
      : 'Завершить тест и подсчитать баллы?';
    $('#finish-modal').hidden = false;
  });
  $('#finish-cancel').addEventListener('click', () => $('#finish-modal').hidden = true);
  $('#finish-ok').addEventListener('click', () => { $('#finish-modal').hidden = true; finish(false); });

  function nav(d) {
    const total = state.qs.length;
    if (d > 0 && state.q === total - 1) { $('#q-finish').click(); return; }
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

  function renderResult(score, max, byTime) {
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

    /* основной режим: регистрационная форма – сразу под результатом (ТЗ) */
    const regHost = $('#result-reg');
    if (MODE === 'main') {
      regHost.hidden = false;
      if (!regHost.dataset.mounted && window.RegForm) {
        regHost.dataset.mounted = '1';
        window.RegForm.mount(regHost, { score, total: max, category: state.cat === 'adult' ? 'adult' : state.cat });
      }
    } else {
      regHost.hidden = true;
    }

    scr.result.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  }

  /* «Пройти ещё раз» в тренировке и на экране результата */
  $$('[data-restart]').forEach(b => b.addEventListener('click', () => {
    state.done = false; state.cat = null;
    show('start');
    scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
  }));

  /* ---------- первичная инициализация ---------- */
  function init() { renderGate(); }
  init();
})();
