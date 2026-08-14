/* ============================================================
   КОНФИГУРАЦИЯ РАЗДЕЛА И СИНХРОНИЗАЦИЯ ВРЕМЕНИ С СЕРВЕРОМ
   ------------------------------------------------------------
   Единственное место, где меняются даты и режимы раздела.
   На боевом сервере (1С-Битрикс) шаблон страницы ДОЛЖЕН
   отдавать серверное московское время в мета-теге:

     <meta name="server-time" content="2026-11-01T12:34:56+03:00">

   Тогда таймер, состояние кнопки «Принять участие» и
   видимость тренировочных тестов считаются ОТ ВРЕМЕНИ СЕРВЕРА,
   а не от часов устройства пользователя.
   Без мета-тега локальный режим использует часы устройства.
   На сервере Академии мета-тег обязателен.
   ============================================================ */
window.DIKTANT = (() => {
  'use strict';

  /* Режим задаёт ШАБЛОН страницы, а не часы/URL пользователя:
       demo        – локальная проверка интерфейса с тестовыми данными;
       production  – раздел на 1С-Битрикс, только реальные API, без
                     отката к тестовым данным и загрузки банка ответов.
     В бою шаблон обязан вывести:
       <meta name="diktant-mode" content="production">
       <meta name="server-time" content="2026-11-01T12:34:56+03:00"> */
  const modeMeta = document.querySelector('meta[name="diktant-mode"]');
  const RUNTIME_MODE = modeMeta?.getAttribute('content')?.trim().toLowerCase() === 'production'
    ? 'production' : 'demo';

  const CONFIG = {
    /* Среда выполнения. Не переключать по hostname: боевой режим должен
       включаться только явно мета-тегом шаблона Битрикса. */
    runtimeMode: RUNTIME_MODE,
    /* Параметры теста – единый источник для движка test.js:
       30 вопросов в варианте, 40 минут на прохождение */
    questionsPerTest: 30,
    testDurationMin: 40,
    /* Старт диктанта: 5 ноября 2026, 10:00 по московскому времени */
    startDate: '2026-11-05T10:00:00+03:00',
    /* Окончание: 8 ноября 2026, 23:59 по московскому времени */
    endDate: '2026-11-08T23:59:59+03:00',
    /* Тренировочные тесты включаются только вручную: 'on' или 'off'. */
    trainingMode: 'off',
    /* Время на выбор между сертификатом и записью результата без ФИО. */
    certDecisionSec: 120,
    /* Адрес страницы прохождения (на боевом сервере Академии) */
    testUrl: 'test.html',
    /* Адрес, куда ведёт «Тренировочные тесты» после включения */
    trainingUrl: 'test.html?mode=training',
    /* Прямая трансляция открытия (РУТУБ): как только организаторы
       дадут адрес эфира – вписать его сюда ОДИН раз; корневая страница сама
       подставит его в кнопку под таймером ([data-broadcast-link]).
       Когда будет известен id видео, iframe-плеер вставляется
       в блок #broadcast – готовый фрагмент лежит комментарием
       в main.html. Пока используется главная страница RUTUBE. */
    broadcastUrl: 'https://rutube.ru/',
    /* Текст под серой кнопкой до старта */
    gateCaption: 'Диктант начинается 5 ноября в 10:00 по московскому времени',
    /* Текст скрытого блока тренировочных тестов */
    trainingSoon: 'Тренировочные тесты появятся позже'
  };

  /* --- Синхронизация времени --- */
  const meta = document.querySelector('meta[name="server-time"]');
  const serverStamp = meta ? Date.parse(meta.getAttribute('content')) : NaN;
  const OFFSET = Number.isFinite(serverStamp) ? serverStamp - Date.now() : 0;
  const SYNCED = Number.isFinite(serverStamp);

  /* Текущее время «как на сервере» (миллисекунды) */
  const now = () => Date.now() + OFFSET;

  const at = iso => Date.parse(iso);

  const status = {
    /* В production отсутствие времени сервера – ошибка конфигурации:
       клиентские часы не могут открыть или закрыть боевой диктант. */
    production: () => CONFIG.runtimeMode === 'production',
    timeReady: () => CONFIG.runtimeMode !== 'production' || SYNCED,
    /* диктант начался? */
    started: () => status.timeReady() && now() >= at(CONFIG.startDate),
    /* диктант ещё идёт? */
    ongoing: () => status.timeReady() && now() >= at(CONFIG.startDate) && now() <= at(CONFIG.endDate),
    /* тренировочные тесты видны? Только по явному включению
       (trainingMode: 'on') – авто-открытия по дате нет. */
    trainingOpen: () => CONFIG.trainingMode === 'on',
    synced: SYNCED
  };

  return { CONFIG, now, status };
})();
