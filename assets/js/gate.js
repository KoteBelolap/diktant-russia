/* ============================================================
   «СЕРАЯ КНОПКА»: состояние элементов до старта диктанта
   ------------------------------------------------------------
   Разметка:
     <a class="btn" data-gate="start" href="test.html">Принять участие</a>
   До 05.11.2026 10:00 (мск, время сервера):
     – кнопка становится серой и не ведёт никуда;
     – по нажатию на неё рядом всплывает подпись из конфига
       («Диктант начинается 5 ноября в 10:00 по московскому времени»);
     – повторное нажатие / клик вне кнопки / 6 секунд – скрывают её.
   После старта: кнопка красная и ведёт на страницу прохождения.
   ============================================================ */
(() => {
  'use strict';
  const HIDE_MS = 6000;

  const closeAll = except =>
    document.querySelectorAll('.gate-caption.is-show')
      .forEach(c => { if (c !== except) c.classList.remove('is-show'); });

  const lock = el => {
    el.classList.add('is-locked');
    el.dataset.href = el.getAttribute('href') || '';
    el.removeAttribute('href');
    el.setAttribute('aria-disabled', 'true');
    el.setAttribute('role', 'button'); /* iOS: ссылка без href + cursor:pointer (CSS) → click срабатывает по тапу */
    el.setAttribute('tabindex', '0');

    const w = document.createElement('span');
    w.className = 'gate-wrap';
    el.replaceWith(w);
    w.appendChild(el);

    const cap = document.createElement('span');
    cap.className = 'gate-caption';
    cap.setAttribute('role', 'status');
    cap.textContent = window.DIKTANT.CONFIG.gateCaption;
    w.appendChild(cap);

    let timer;
    const onTap = e => {
      e.preventDefault(); e.stopPropagation();
      const show = !cap.classList.contains('is-show');
      closeAll(cap);
      cap.classList.toggle('is-show', show);
      clearTimeout(timer);
      if (show) timer = setTimeout(() => cap.classList.remove('is-show'), HIDE_MS);
    };
    el.addEventListener('click', onTap);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') onTap(e);
    });
  };

  document.addEventListener('click', e => {
    if (!e.target.closest('.gate-wrap')) closeAll(null);
  });

  /* разблокировка: наступил старт – кнопка снова красная и кликабельная */
  const unlock = el => {
    el.classList.remove('is-locked');
    const target = el.dataset.href || window.DIKTANT.CONFIG.testUrl;
    el.setAttribute('href', target);
    el.removeAttribute('aria-disabled');
    el.removeAttribute('role');
    const w = el.closest('.gate-wrap');
    const cap = w ? w.querySelector('.gate-caption') : null;
    if (cap) cap.remove();
    if (w) w.replaceWith(el);
  };

  const apply = () => {
    const cfg = window.DIKTANT.CONFIG;
    const started = window.DIKTANT.status.started();

    document.querySelectorAll('[data-gate="start"]').forEach(el => {
      if (!started) lock(el);
      else {
        const target = el.dataset.href || cfg.testUrl;
        el.setAttribute('href', target);
      }
    });

    /* Блок тренировочных тестов: виден только когда trainingOpen() */
    document.querySelectorAll('[data-gate="training"]').forEach(box => {
      if (window.DIKTANT.status.trainingOpen()) {
        box.classList.add('is-open-training');
        box.querySelectorAll('[data-cat]').forEach(card => {
          card.classList.add('is-link');
          card.setAttribute('role', 'link');
          card.setAttribute('tabindex', '0');
          const go = () => { location.href = cfg.trainingUrl + '&cat=' + card.dataset.cat; };
          card.addEventListener('click', go);
          card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        });
      } else {
        box.classList.add('is-soon-training');
        if (!box.querySelector('.soon-note')) {
          const note = document.createElement('p');
          note.className = 'soon-note glass';
          note.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg><span></span>';
          note.querySelector('span').textContent = cfg.trainingSoon;
          box.appendChild(note);
        }
      }
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();

  /* живой переход: 05.11.2026 10:00 (мск, время сервера) – кнопки сами
     активируются без перезагрузки страницы */
  (() => {
    const iv = setInterval(() => {
      if (!window.DIKTANT || !window.DIKTANT.status.started()) return;
      clearInterval(iv);
      document.querySelectorAll('[data-gate="start"].is-locked').forEach(unlock);
      /* тренировочные карточки включатся при следующем заходе на страницу */
    }, 1000);
  })();
})();
