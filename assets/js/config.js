/* ============================================================
   КОНФИГУРАЦИЯ ПРОЕКТА + СИНХРОНИЗАЦИЯ ВРЕМЕНИ С СЕРВЕРОМ
   ------------------------------------------------------------
   Единственное место, где меняются даты и режимы проекта.
   На боевом сервере (1С-Битрикс) шаблон страницы ДОЛЖЕН
   отдавать серверное московское время в мета-теге:

     <meta name="server-time" content="2026-11-01T12:34:56+03:00">

   Тогда таймер, состояние кнопки «Принять участие» и
   видимость тренировочных тестов считаются ОТ ВРЕМЕНИ СЕРВЕРА,
   а не от часов устройства пользователя.
   Если мета-тега нет (статичное демо), используется часы
   устройства – только для превью.
   ============================================================ */
window.DIKTANT = (() => {
  'use strict';

  const CONFIG = {
    /* Старт диктанта: 5 ноября 2026, 10:00 по московскому времени */
    startDate: '2026-11-05T10:00:00+03:00',
    /* Окончание: 8 ноября 2026, 23:59 по московскому времени */
    endDate: '2026-11-08T23:59:59+03:00',
    /* Тренировочные тесты: auto – откроются автоматически в эту дату,
       on – всегда видны, off – всегда скрыты */
    trainingMode: 'auto',
    trainingDate: '2026-10-01T10:00:00+03:00',
    /* Адрес страницы прохождения (на боевом сервере Академии) */
    testUrl: 'test.html',
    /* Адрес, куда ведёт «Тренировочные тесты» после включения */
    trainingUrl: 'test.html?mode=training',
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
    /* диктант начался? */
    started: () => now() >= at(CONFIG.startDate),
    /* диктант ещё идёт? */
    ongoing: () => now() >= at(CONFIG.startDate) && now() <= at(CONFIG.endDate),
    /* тренировочные тесты видны? */
    trainingOpen: () => {
      if (CONFIG.trainingMode === 'on') return true;
      if (CONFIG.trainingMode === 'off') return false;
      return now() >= at(CONFIG.trainingDate);
    },
    synced: SYNCED
  };

  return { CONFIG, now, status };
})();
