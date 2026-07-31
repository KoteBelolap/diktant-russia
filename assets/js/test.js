/* ============================================================
   Механизм прохождения теста.
   Демо-банк вопросов: на боевой версии вопросы подгружаются
   с сервера РАНХиГС после старта диктанта (06.11.2026, 10:00 МСК),
   структура вопроса сохранена: type single|multi, points, tag.
   ============================================================ */
(() => {
  'use strict';
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const BANKS = {
    school: {
      title: 'Школьник 5–11 класс',
      questions: [
        { type: 'single', tag: 'История', q: 'В каком году народное ополчение под предводительством Минина и Пожарского освободило Москву?',
          opts: ['1380 году', '1612 году', '1812 году', '1945 году'], right: [1], points: 3 },
        { type: 'single', tag: 'Культура', q: 'Кто написал роман в стихах «Евгений Онегин»?',
          opts: ['М. Ю. Лермонтов', 'А. С. Пушкин', 'Н. В. Гоголь', 'И. С. Тургенев'], right: [1], points: 3 },
        { type: 'multi', tag: 'Год единства народов России', q: 'Какие из этих народов относятся к коренным народам России? Выберите все верные варианты.',
          opts: ['Татары', 'Буряты', 'Чуваши', 'Якуты'], right: [0, 1, 2, 3], points: 3 },
        { type: 'single', tag: 'Право', q: 'Как называется основной закон Российской Федерации?',
          opts: ['Гражданский кодекс', 'Конституция', 'Русская правда', 'Указ Президента'], right: [1], points: 3 },
        { type: 'single', tag: 'История', q: 'Когда Россия отмечает День народного единства?',
          opts: ['12 июня', '9 мая', '4 ноября', '1 сентября'], right: [2], points: 3 },
        { type: 'multi', tag: 'Гражданская идентичность', q: 'Какие ценности входят в перечень традиционных российских духовно-нравственных ценностей? Выберите все верные варианты.',
          opts: ['Патриотизм', 'Историческая память', 'Взаимопомощь и взаимоуважение', 'Стремление к личной выгоде любой ценой'], right: [0, 1, 2], points: 3 },
        { type: 'single', tag: 'Религии', q: 'Какая религия традиционно исповедуется народами Поволжья наряду с православием?',
          opts: ['Ислам', 'Индуизм', 'Синтоизм', 'Католицизм'], right: [0], points: 3 },
        { type: 'single', tag: 'Культура', q: 'Какой русский композитор написал балет «Лебединое озеро»?',
          opts: ['С. С. Прокофьев', 'П. И. Чайковский', 'Д. Д. Шостакович', 'Н. А. Римский-Корсаков'], right: [1], points: 3 },
        { type: 'multi', tag: 'Право', q: 'Какие цвета имеет Государственный флаг Российской Федерации? Выберите все верные варианты.',
          opts: ['Белый', 'Синий', 'Красный', 'Зелёный'], right: [0, 1, 2], points: 3 },
        { type: 'single', tag: 'История', q: 'Как зовут первого космонавта планеты, гражданина СССР?',
          opts: ['Герман Титов', 'Алексей Леонов', 'Юрий Гагарин', 'Валентина Терешкова'], right: [2], points: 3 }
      ]
    },
    student: {
      title: 'Студент вуза или СПО',
      questions: [
        { type: 'single', tag: 'История', q: 'Смутное время завершилось избранием на царство представителя династии:',
          opts: ['Рюриковичей', 'Романовых', 'Годуновых', 'Шуйских'], right: [1], points: 3 },
        { type: 'multi', tag: 'Год единства народов России', q: 'В каких республиках России буддизм является традиционной религией? Выберите все верные варианты.',
          opts: ['Тыва', 'Калмыкия', 'Бурятия', 'Мордовия'], right: [0, 1, 2], points: 3 },
        { type: 'single', tag: 'Право', q: 'Какая статья Конституции РФ провозглашает человека, его права и свободы высшей ценностью?',
          opts: ['Статья 1', 'Статья 2', 'Статья 7', 'Статья 15'], right: [1], points: 3 },
        { type: 'single', tag: 'Культура', q: 'Икона «Троица» — шедевр, созданный:',
          opts: ['Феофаном Греком', 'Андреем Рублёвым', 'Ильёй Репиным', 'Карлом Брюлловым'], right: [1], points: 3 },
        { type: 'single', tag: 'Гражданская идентичность', q: 'В каком году был утверждён перечень традиционных российских духовно-нравственных ценностей?',
          opts: ['2012 году', '2018 году', '2022 году', '2025 году'], right: [2], points: 3 },
        { type: 'multi', tag: 'История', q: 'Кто из перечисленных полководцев — герои Отечественной войны 1812 года? Выберите все верные варианты.',
          opts: ['М. И. Кутузов', 'П. И. Багратион', 'А. В. Суворов', 'М. Б. Барклай-де-Толли'], right: [0, 1, 3], points: 3 },
        { type: 'single', tag: 'Религии', q: 'Какая конфигурация власти и религии закреплена Конституцией РФ?',
          opts: ['Государственная религия — православие', 'Светское государство, свобода совести', 'Теократическое государство', 'Запрет религиозных объединений'], right: [1], points: 3 },
        { type: 'single', tag: 'Культура', q: 'Эпос «Олонхо», включённый в список шедевров наследия ЮНЕСКО, принадлежит культуре народа:',
          opts: ['Карел', 'Якутов (саха)', 'Удмуртов', 'Ханты'], right: [1], points: 3 },
        { type: 'multi', tag: 'Право', q: 'Что относится к государственным символам Российской Федерации? Выберите все верные варианты.',
          opts: ['Государственный флаг', 'Государственный герб', 'Государственный гимн', 'Государственная печать с портретом президента'], right: [0, 1, 2], points: 3 },
        { type: 'single', tag: 'Гражданская идентичность', q: 'Общероссийская гражданская идентичность в первую очередь формируется на основе:',
          opts: ['единой территории проживания', 'общих ценностей, истории и культуры многонационального народа', 'единого вероисповедания', 'единого этнического происхождения'], right: [1], points: 3 }
      ]
    },
    adult: {
      title: 'Закончил(а) обучение',
      questions: [
        { type: 'single', tag: 'История', q: 'Кузьма Минин, призвавший к созданию народного ополчения, был уроженцем города:',
          opts: ['Москвы', 'Нижнего Новгорода', 'Ярославля', 'Смоленска'], right: [1], points: 3 },
        { type: 'multi', tag: 'Гражданская идентичность', q: 'Какие из ценностей названы в указе Президента РФ традиционными духовно-нравственными? Выберите все верные варианты.',
          opts: ['Служение Отечеству', 'Крепкая семья', 'Приоритет духовного над материальным', 'Безразличие к судьбе страны'], right: [0, 1, 2], points: 3 },
        { type: 'single', tag: 'Право', q: 'Когда была принята действующая Конституция Российской Федерации?',
          opts: ['12 декабря 1993 года', '25 декабря 1991 года', '9 мая 1995 года', '12 июня 1990 года'], right: [0], points: 3 },
        { type: 'single', tag: 'Год единства народов России', q: 'Какой год объявлен в России Годом единства народов России?',
          opts: ['2024 год', '2025 год', '2026 год', '2027 год'], right: [2], points: 3 },
        { type: 'single', tag: 'Культура', q: 'Роман «Война и мир» написал:',
          opts: ['Ф. М. Достоевский', 'Л. Н. Толстой', 'А. П. Чехов', 'И. А. Гончаров'], right: [1], points: 3 },
        { type: 'multi', tag: 'История', q: 'Какие события произошли в 1945 году? Выберите все верные варианты.',
          opts: ['Подписание акта о безоговорочной капитуляции Германии', 'Парад Победы на Красной площади 24 июня', 'Первый полёт человека в космос', 'Прорыв блокады Ленинграда'], right: [0, 1], points: 3 },
        { type: 'single', tag: 'Религии', q: 'К традиционным религиям народов России НЕ относится:',
          opts: ['Православие', 'Ислам', 'Буддизм', 'Синтоизм'], right: [3], points: 3 },
        { type: 'single', tag: 'Право', q: 'Кто, согласно Конституции РФ, является единственным источником власти в России?',
          opts: ['Государственная Дума', 'Президент', 'Многонациональный народ России', 'Правительство'], right: [2], points: 3 },
        { type: 'multi', tag: 'Культура', q: 'Какие художественные промыслы — российские? Выберите все верные варианты.',
          opts: ['Хохлома', 'Гжель', 'Дымковская игрушка', 'Майолика Делфт'], right: [0, 1, 2], points: 3 },
        { type: 'single', tag: 'История', q: 'Город-герой, выдержавший 900-дневную блокаду в годы Великой Отечественной войны:',
          opts: ['Сталинград', 'Севастополь', 'Ленинград', 'Брест'], right: [2], points: 3 }
      ]
    }
  };

  const shell = $('#test-app');
  if (!shell) return;

  const DURATION = 40 * 60; // 40 минут
  const params = new URLSearchParams(location.search);
  const MODE = params.get('mode') === 'training' ? 'training' : 'main';

  const state = { cat: null, q: 0, answers: [], left: DURATION, timer: null, done: false, locked: false };

  /* ---------- защита от копирования (ТЗ 1.4) ---------- */
  document.addEventListener('contextmenu', e => { if ($('#test-app .q-card')) e.preventDefault(); });
  document.addEventListener('copy', e => { if ($('#test-app .q-card')) e.preventDefault(); });
  /* защита от случайного ухода со страницы во время теста */
  addEventListener('beforeunload', e => { if (state.cat && !state.done) { e.preventDefault(); e.returnValue = ''; } });

  /* повторное прохождение (демо cookie-защиты) */
  const passed = localStorage.getItem('diktant_completed_' + MODE);
  if (passed && MODE === 'main') {
    const w = $('#dup-warn');
    if (w) { w.hidden = false; $('b', w).textContent = passed; }
  }

  const esc = s => s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  /* ---------- рендер: выбор категории ---------- */
  $$('.test-cat').forEach(btn => btn.addEventListener('click', () => start(btn.dataset.cat)));

  function start(cat) {
    state.cat = cat;
    state.q = 0;
    state.answers = BANKS[cat].questions.map(() => []);
    $('#test-start').hidden = true;
    $('#test-run').hidden = false;
    state.left = DURATION;
    tickTimer();
    state.timer = setInterval(tickTimer, 1000);
    renderQ();
    scrollTo({ top: $('#test-run').offsetTop - 20, behavior: REDUCED ? 'auto' : 'smooth' });
  }

  function tickTimer() {
    const t = $('#timer');
    const m = String(Math.floor(state.left / 60)).padStart(2, '0');
    const s = String(state.left % 60).padStart(2, '0');
    t.querySelector('b').textContent = m + ':' + s;
    t.classList.toggle('is-low', state.left <= 300);
    if (state.left <= 0) { finish(true); return; }
    state.left--;
  }

  /* ---------- рендер вопроса ---------- */
  function renderQ() {
    const bank = BANKS[state.cat];
    const q = bank.questions[state.q];
    const total = bank.questions.length;
    $('#hud-q').textContent = 'Вопрос ' + (state.q + 1) + ' / ' + total;
    $('#hud-bar').style.width = ((state.q) / total * 100) + '%';

    const card = $('#q-card');
    card.style.animation = 'none'; void card.offsetWidth;
    card.style.animation = REDUCED ? '' : 'dropIn .45s cubic-bezier(.22,1,.36,1)';

    card.innerHTML = `
      <span class="chip q-card__tag">${esc(q.tag)}${q.type === 'multi' ? ' · несколько ответов' : ''}</span>
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

  function updateNav() {
    const total = BANKS[state.cat].questions.length;
    $('#q-prev').disabled = state.q === 0;
    const last = state.q === total - 1;
    $('#q-next').textContent = last ? 'К результату' : 'Далее';
  }

  $('#q-prev').addEventListener('click', () => nav(-1));
  $('#q-next').addEventListener('click', () => nav(1));
  $('#q-finish').addEventListener('click', () => {
    const empty = state.answers.filter(a => !a.length).length;
    const box = $('#finish-modal');
    $('#finish-modal-text').textContent = empty
      ? 'Вы ответили не на все вопросы (' + empty + ' без ответа). Завершить тест и подсчитать баллы?'
      : 'Завершить тест и подсчитать баллы?';
    box.hidden = false;
  });
  $('#finish-cancel').addEventListener('click', () => $('#finish-modal').hidden = true);
  $('#finish-ok').addEventListener('click', () => { $('#finish-modal').hidden = true; finish(false); });

  function nav(d) {
    const total = BANKS[state.cat].questions.length;
    if (d > 0 && state.q === total - 1) { $('#q-finish').click(); return; }
    state.q = Math.max(0, Math.min(total - 1, state.q + d));
    renderQ();
  }

  function cleardone() { clearInterval(state.timer); state.done = true; state.locked = true; }

  /* ---------- результаты ---------- */
  function finish(byTime) {
    if (state.done) return;
    cleardone();
    const bank = BANKS[state.cat];
    let score = 0;
    const review = bank.questions.map((q, i) => {
      const a = [...state.answers[i]].sort().join(',');
      const r = [...q.right].sort().join(',');
      const ok = a === r;
      if (ok) score += q.points;
      return { q: q.q, ok, points: q.points, rightTxt: q.right.map(x => q.opts[x]).join('; ') };
    });
    const max = bank.questions.reduce((s, q) => s + q.points, 0);

    if (MODE === 'main') {
      localStorage.setItem('diktant_completed_main', new Date().toLocaleDateString('ru-RU'));
      localStorage.setItem('diktant_score', score);
    }

    $('#test-run').hidden = true;
    const res = $('#test-result');
    res.hidden = false;

    const C = 2 * Math.PI * 88;
    const ring = $('#ring-fg');
    ring.style.strokeDasharray = C;
    ring.style.strokeDashoffset = C;
    setTimeout(() => { ring.style.strokeDashoffset = C * (1 - score / max); }, 60);

    const scoreEl = $('#result-score');
    const dur = REDUCED ? 0 : 1400, t0 = performance.now();
    (function anim(t) {
      const p = dur ? Math.min(1, (t - t0) / dur) : 1;
      scoreEl.textContent = Math.round(score * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(anim);
    })(t0);
    $('#result-max').textContent = 'из ' + max;

    const tier = $('#result-title');
    const sub = $('#result-sub');
    const ratio = score / max;
    if (ratio === 1) { tier.textContent = 'Абсолютный победитель!'; sub.textContent = MODE === 'main' ? 'Невероятно: максимальный результат! Заполните регистрационную форму — диплом и приглашение на награждение уже почти ваши.' : 'Блестяще! В боевом диктанте такой результат приносит диплом абсолютного победителя.'; }
    else if (ratio >= .8) { tier.textContent = 'Отличный результат!'; sub.textContent = MODE === 'main' ? 'Знания на высоком уровне. Заполните регистрационную форму, чтобы получить сертификат с вашими баллами.' : 'Уверенный уровень! До максимума чуть-чуть — загляните в материалы для подготовки.'; }
    else if (ratio >= .5) { tier.textContent = 'Хорошая работа!'; sub.textContent = MODE === 'main' ? 'Достойный результат. Заполните регистрационную форму, чтобы получить сертификат участника.' : 'Крепкая база, а разбор ошибок ниже поможет добить до максимума.'; }
    else { tier.textContent = 'Есть куда расти'; sub.textContent = MODE === 'main' ? 'Главное — участие! Заполните регистрационную форму: сертификат участника ждёт вас, а до следующего года помогут материалы для подготовки.' : 'Посмотрите разбор ниже и загляните в материалы для подготовки — следующая попытка будет сильнее.'; }

    if (MODE === 'main') {
      $('#result-cta-primary').innerHTML = 'Получить сертификат<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
      $('#result-cta-primary').setAttribute('href', 'register.html?score=' + score);
    } else {
      $('#result-cta-primary').innerHTML = 'Пройти ещё раз<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/></svg>';
      $('#result-cta-primary').setAttribute('href', 'test.html?mode=training');
    }

    $('#result-review').innerHTML = review.map((r, i) => `
      <div class="review-row ${r.ok ? 'ok' : 'bad'}">
        <span class="st">${r.ok
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m4 12.5 5.5 5.5L20 6.5"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 6l12 12M18 6 6 18"/></svg>'}</span>
        <div>${i + 1}. ${esc(r.q)}
          ${r.ok ? '<small>+ ' + r.points + ' балл(а)</small>' : '<small>Верный ответ: ' + esc(r.rightTxt) + '</small>'}
        </div>
      </div>`).join('');

    res.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  }
})();
