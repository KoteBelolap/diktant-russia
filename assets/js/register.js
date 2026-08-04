/* ============================================================
   Отдельная страница регистрации (register.html).
   Вся форма – в общем модуле reg-form.js; здесь только
   монтирование и показ балла, если он передан (?score=…).
   ============================================================ */
(() => {
  'use strict';
  const host = document.getElementById('reg-mount');
  if (!host || !window.RegForm) return;

  const params = new URLSearchParams(location.search);
  const score = params.get('score');
  const cat = params.get('cat');

  let scoreNum = null;
  if (score !== null && /^\d+$/.test(score)) scoreNum = +score;
  else {
    const saved = localStorage.getItem('diktant_score');
    if (saved !== null && /^\d+$/.test(saved)) scoreNum = +saved;
  }

  const chip = document.getElementById('score-chip');
  if (chip && scoreNum !== null) {
    chip.hidden = false;
    chip.querySelector('b').textContent = scoreNum;
  }
  if (score !== null) localStorage.setItem('diktant_score', score);

  window.RegForm.mount(host, {
    score: scoreNum,
    category: ['school', 'student', 'adult'].includes(cat) ? cat : null
  });
})();
