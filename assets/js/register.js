/* ============================================================
   Форма регистрации участника (ТЗ п. 1.3) +
   интеллектуальный поиск образовательной организации (ТЗ гл. 2):
   токенизация названий, максимальное пересечение,
   нечёткое сравнение для учёта опечаток, топ совпадений.
   ============================================================ */
(() => {
  'use strict';
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* ---------- 89 субъектов РФ ---------- */
  const REGIONS = ["Республика Адыгея","Республика Алтай","Республика Башкортостан","Республика Бурятия","Республика Дагестан","Донецкая Народная Республика","Республика Ингушетия","Кабардино-Балкарская Республика","Республика Калмыкия","Карачаево-Черкесская Республика","Республика Карелия","Республика Коми","Республика Крым","Луганская Народная Республика","Республика Марий Эл","Республика Мордовия","Республика Саха (Якутия)","Республика Северная Осетия — Алания","Республика Татарстан","Республика Тыва","Удмуртская Республика","Республика Хакасия","Чеченская Республика","Чувашская Республика","Алтайский край","Забайкальский край","Камчатский край","Краснодарский край","Красноярский край","Пермский край","Приморский край","Ставропольский край","Хабаровский край","Амурская область","Архангельская область","Астраханская область","Белгородская область","Брянская область","Владимирская область","Волгоградская область","Вологодская область","Воронежская область","Запорожская область","Ивановская область","Иркутская область","Калининградская область","Калужская область","Кемеровская область — Кузбасс","Кировская область","Костромская область","Курганская область","Курская область","Ленинградская область","Липецкая область","Магаданская область","Московская область","Мурманская область","Нижегородская область","Новгородская область","Новосибирская область","Омская область","Оренбургская область","Орловская область","Пензенская область","Псковская область","Ростовская область","Рязанская область","Самарская область","Саратовская область","Сахалинская область","Свердловская область","Смоленская область","Тамбовская область","Тверская область","Томская область","Тульская область","Тюменская область","Ульяновская область","Херсонская область","Челябинская область","Ярославская область","Москва","Санкт-Петербург","Севастополь","Еврейская автономная область","Ненецкий автономный округ","Ханты-Мансийский автономный округ — Югра","Чукотский автономный округ","Ямало-Ненецкий автономный округ"];
  const regionSel = $('#f-region');
  if (regionSel) {
    REGIONS.forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = r; regionSel.appendChild(o); });
  }

  /* ---------- Индекс организаций: токенизация (ТЗ гл. 2) ---------- */
  const STOP = new Set(['и', 'в', 'г', '№', 'им', 'имени', '-', '»', '«']);
  const ORGS = (window.ORGS_DATA || []).map(o => ({ ...o, _t: tokenize(o.n + ' ' + (o.s || '')) }));
  function tokenize(s) {
    return s.toLowerCase().replace(/[«»"()\[\],.:;]/g, ' ').split(/[\s/\\-]+/)
      .map(t => t.trim()).filter(t => t && !STOP.has(t));
  }
  /* расстояние Левенштейна с ранним выходом (для толерантности к опечаткам) */
  function lev(a, b, max = 2) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = max + 1;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        rowMin = Math.min(rowMin, cur[j]);
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  function similarity(query, region) {
    const qToks = tokenize(query);
    if (!qToks.length) return [];
    const scored = [];
    for (const o of ORGS) {
      let exact = 0, fuzzy = 0, partial = 0;
      for (const qt of qToks) {
        let hit = false;
        if (o._t.includes(qt)) { exact++; hit = true; continue; }
        // префиксное/подстроковое совпадение
        for (const t of o._t) {
          if (t.startsWith(qt) || (qt.length >= 4 && t.includes(qt))) { partial++; hit = true; break; }
        }
        if (hit) continue;
        // нечёткое сравнение (опечатки)
        if (qt.length >= 4) {
          for (const t of o._t) { if (Math.abs(t.length - qt.length) <= 2 && lev(qt, t, 2) <= 2) { fuzzy++; break; } }
        }
      }
      const cover = (exact + partial + fuzzy) / qToks.length;
      if (!cover) continue;
      let score = exact * 10 + partial * 6 + fuzzy * 4 + cover * 12;
      if (region) {
        if (o.r === region) score += 14;          // приоритет организаций своего региона
        else if (!o.r) score += 4;                // организации «без региона» — во всех регионах
      }
      if (exact === qToks.length) score += 10;
      scored.push({ o, score, qt: qToks });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 7);
  }

  /* ---------- Подсветка совпадений ---------- */
  function highlight(name, qToks) {
    const esc = s => s.replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
    let html = esc(name);
    const words = name.split(/(\s+)/);
    html = words.map(w => {
      const wl = w.toLowerCase().replace(/[«»"()\[\],.:;]/g, '');
      if (!wl) return esc(w);
      for (const qt of qToks) {
        if (wl === qt || wl.startsWith(qt) || (qt.length >= 4 && wl.includes(qt))) return '<mark>' + esc(w) + '</mark>';
        if (qt.length >= 4 && Math.abs(wl.length - qt.length) <= 2 && lev(qt, wl, 2) <= 2) return '<mark>' + esc(w) + '</mark>';
      }
      return esc(w);
    }).join('');
    return html;
  }

  /* ---------- Комбобокс организации ---------- */
  const orgInput = $('#f-org');
  const orgDrop = $('#org-drop');
  const orgSelected = $('#org-selected');
  const orgMiss = $('#f-org-miss');
  const orgCustom = $('#f-org-custom');
  let chosen = null, activeIdx = -1, items = [];

  function closeDrop() { orgDrop?.classList.remove('is-open'); activeIdx = -1; }
  function choose(item) {
    chosen = item.o;
    orgInput.value = item.o.n;
    closeDrop();
    $('#org-selected-name').textContent = item.o.n;
    orgSelected.classList.add('is-show');
    clearError($('#fw-org'));
  }
  $('#org-selected-clear')?.addEventListener('click', () => {
    chosen = null; orgInput.value = ''; orgSelected.classList.remove('is-show'); orgInput.focus();
  });

  function renderDrop() {
    if (chosen || orgInput.disabled) { closeDrop(); return; }
    const q = orgInput.value.trim();
    if (q.length < 3) { closeDrop(); return; }
    items = similarity(q, regionSel.value);
    const qToks = tokenize(q);
    if (!items.length) {
      orgDrop.innerHTML = '<div class="org-none">Ничего не нашлось. Попробуйте изменить запрос или включите переключатель «Моей организации нет в списке» ниже.</div>';
    } else {
      orgDrop.innerHTML = items.map((it, i) => `
        <button type="button" class="org-opt" data-i="${i}" role="option">
          <span>${highlight(it.o.n, qToks)}</span>
          ${it.o.r ? '<small>' + it.o.r + '</small>' : ''}
        </button>`).join('');
      $$('.org-opt', orgDrop).forEach(b => b.addEventListener('click', () => choose(items[+b.dataset.i])));
    }
    orgDrop.classList.add('is-open');
  }
  let deb;
  orgInput?.addEventListener('input', () => { chosen = null; orgSelected.classList.remove('is-show'); clearTimeout(deb); deb = setTimeout(renderDrop, 140); });
  orgInput?.addEventListener('focus', () => { if (orgInput.value.trim().length >= 3) renderDrop(); });
  orgInput?.addEventListener('keydown', e => {
    if (!orgDrop.classList.contains('is-open')) return;
    const opts = $$('.org-opt', orgDrop);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = e.key === 'ArrowDown' ? Math.min(opts.length - 1, activeIdx + 1) : Math.max(0, activeIdx - 1);
      opts.forEach((o, i) => o.classList.toggle('is-active', i === activeIdx));
      opts[activeIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault(); choose(items[activeIdx]);
    } else if (e.key === 'Escape') closeDrop();
  });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.org-box')) closeDrop(); });

  orgMiss?.addEventListener('change', () => {
    orgCustom.hidden = !orgMiss.checked;
    orgInput.disabled = orgMiss.checked;
    if (orgMiss.checked) { chosen = null; orgSelected.classList.remove('is-show'); closeDrop(); }
  });
  /* смена региона — пересортировать подсказки */
  regionSel?.addEventListener('change', renderDrop);

  /* ---------- Условный блок: тип организации ---------- */
  const typeSel = $('#f-orgtype');
  const eduTypes = new Set(['Школы', 'Колледжи, техникумы', 'Президентская академия и её филиалы', 'Вузы']);
  const fwOrg = $('#fw-org');
  function syncOrgVisibility() {
    const need = eduTypes.has(typeSel.value);
    fwOrg.hidden = !need;
    fwOrg.dataset.required = need ? '1' : '';
  }
  typeSel?.addEventListener('change', () => { syncOrgVisibility(); if (!fwOrg.hidden) orgInput.focus(); });
  syncOrgVisibility();

  /* ---------- Валидация ---------- */
  function setError(wrap, msg) {
    wrap.classList.add('has-error');
    const e = $('.f-error', wrap); if (e) e.textContent = msg;
  }
  function clearError(wrap) { wrap?.classList.remove('has-error'); }
  $$('.f-input, .f-select').forEach(el => el.addEventListener('input', () => clearError(el.closest('.f-field, .f-card'))));

  const form = $('#reg-form');
  form?.addEventListener('submit', e => {
    e.preventDefault();
    let firstBad = null;
    const fail = (wrap, msg) => { setError(wrap, msg); firstBad = firstBad || wrap; };

    const surname = $('#f-surname'), name = $('#f-name'), patr = $('#f-patronymic');
    const letters = v => /^[А-Яа-яЁёA-Za-z\-\s]+$/.test(v.trim());
    if (!surname.value.trim()) fail(surname.closest('.f-field'), 'Укажите фамилию');
    else if (!letters(surname.value)) fail(surname.closest('.f-field'), 'Только буквы');
    if (!name.value.trim()) fail(name.closest('.f-field'), 'Укажите имя');
    else if (!letters(name.value)) fail(name.closest('.f-field'), 'Только буквы');
    if (patr.value.trim() && !letters(patr.value)) fail(patr.closest('.f-field'), 'Только буквы');

    if (!form.elements.sex.value) fail($('#fw-sex'), 'Выберите пол');

    const age = $('#f-age');
    const ageV = age.value.trim();
    if (!/^\d+$/.test(ageV) || +ageV < 0 || +ageV > 120) fail(age.closest('.f-field'), 'Укажите возраст цифрами');

    const mail = $('#f-email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail.value.trim())) fail(mail.closest('.f-field'), 'Укажите корректную электронную почту');

    if (!regionSel.value) fail(regionSel.closest('.f-field'), 'Выберите регион');
    if (!typeSel.value) fail(typeSel.closest('.f-field'), 'Выберите вашу организацию');

    if (!fwOrg.hidden) {
      if (orgMiss.checked) {
        if (!$('#f-org-custom-input').value.trim()) fail($('#fw-org-custom'), 'Введите наименование организации');
      } else if (!chosen) {
        fail(fwOrg, 'Начните вводить название и выберите организацию из списка');
      }
    }

    if (!form.elements.category.value) fail($('#fw-category'), 'Выберите возрастную категорию');
    if (!$('#f-consent').checked) fail($('#fw-consent'), 'Необходимо согласие на обработку персональных данных');

    if (firstBad) {
      firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('.f-input, .f-select, button, input', firstBad)?.focus({ preventScroll: true });
      return;
    }

    /* имитация отправки на сервер (POST /api/register) */
    const btn = $('#reg-submit');
    btn.disabled = true;
    btn.innerHTML = 'Отправляем…';
    setTimeout(() => {
      $('#reg-main').hidden = true;
      const ok = $('#reg-success');
      ok.hidden = false;
      $('#success-name').textContent = [surname.value.trim(), name.value.trim(), patr.value.trim()].filter(Boolean).join(' ');
      $('#success-email').textContent = mail.value.trim();
      ok.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 900);
  });

  /* предзаполнение балла после теста */
  const score = new URLSearchParams(location.search).get('score');
  if (score !== null) {
    const chip = $('#score-chip');
    if (chip) { chip.hidden = false; $('b', chip).textContent = score; }
    localStorage.setItem('diktant_score', score);
  } else {
    const saved = localStorage.getItem('diktant_score');
    if (saved !== null) { const chip = $('#score-chip'); if (chip) { chip.hidden = false; $('b', chip).textContent = saved; } }
  }
})();
