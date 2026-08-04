/* ============================================================
   «СЕРАЯ КНОПКА»: состояние элементов до старта диктанта
   ------------------------------------------------------------
   Разметка:
     <a class="btn" data-gate="start" href="test.html">Принять участие</a>
   До 05.11.2026 10:00 (мск, время сервера):
     – кнопка становится серой и неактивной;
     – href снимается, под кнопкой появляется подпись из конфига;
     – вся конструкция оборачивается в span.gate-wrap.
   После старта: кнопка красная и ведёт на страницу прохождения.
   ============================================================ */
(() => {
  'use strict';
  const wrap = (el, captionText) => {
    const w = document.createElement('span');
    w.className = 'gate-wrap';
    el.replaceWith(w);
    w.appendChild(el);
    const cap = document.createElement('span');
    cap.className = 'gate-caption';
    cap.textContent = captionText;
    w.appendChild(cap);
  };

  const lock = el => {
    el.classList.add('is-locked');
    el.dataset.href = el.getAttribute('href') || '';
    el.removeAttribute('href');
    el.setAttribute('aria-disabled', 'true');
    el.setAttribute('tabindex', '-1');
    wrap(el, window.DIKTANT.CONFIG.gateCaption);
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
        /* карточки становятся ссылками на тренировочный тест своей категории */
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
})();
