/* ============================================================
   «Моя любовь, душа моя – Россия!» – основной скрипт
   ============================================================ */
(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Мобильное меню ---------- */
  const burger = $('.burger');
  const drawer = $('.drawer');
  if (burger && drawer) {
    const openDrawer = () => {
      drawer.classList.add('is-open');
      requestAnimationFrame(() => drawer.classList.add('is-show'));
      burger.classList.add('is-open');
      burger.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    };
    const closeDrawer = () => {
      drawer.classList.remove('is-show');
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      setTimeout(() => drawer.classList.remove('is-open'), 380);
    };
    burger.addEventListener('click', () => drawer.classList.contains('is-open') ? closeDrawer() : openDrawer());
    $('.drawer__scrim', drawer).addEventListener('click', closeDrawer);
    $('.drawer__close', drawer)?.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer(); });
    $$('.drawer .nav__link').forEach(l => l.addEventListener('click', closeDrawer));
  }

  /* ---------- Секция появилась (запуск графиков) ----------
     Класс 'anim' (скрытое исходное состояние графиков) ставится ТОЛЬКО если
     IntersectionObserver поддержан и движение не отключено – иначе графики
     сразу отрисовываются в финальном состоянии и «пустых» панелей не бывает. */
  if ('IntersectionObserver' in window && !REDUCED) {
    const inViewIO = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in-view'); inViewIO.unobserve(en.target); } });
    }, { threshold: .25 });
    $$('[data-inview]').forEach(el => { el.classList.add('anim'); inViewIO.observe(el); });
    /* страховка: если по какой-то причине колбэк IO не дошёл –
       через 6 с принудительно показываем уже видимые панели */
    setTimeout(() => {
      $$('[data-inview].anim:not(.in-view)').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < innerHeight * .9 && r.bottom > 0) el.classList.add('in-view');
      });
    }, 6000);
  }

  /* ---------- Счётчики ---------- */
  const fmt = n => n.toLocaleString('ru-RU');
  const setFinal = el => {
    const target = parseFloat(el.dataset.count);
    const dec = el.dataset.count.includes('.') || el.dataset.count.includes(',') ? 1 : 0;
    el.textContent = dec ? target.toFixed(1).replace('.', ',') : fmt(Math.round(target));
  };
  if ('IntersectionObserver' in window) {
    const counterIO = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        counterIO.unobserve(en.target);
        const el = en.target;
        const target = parseFloat(el.dataset.count);
        const dec = el.dataset.count.includes('.') || el.dataset.count.includes(',') ? 1 : 0;
        const dur = REDUCED ? 0 : 1600;
        const t0 = performance.now();
        const step = t => {
          const p = dur ? Math.min(1, (t - t0) / dur) : 1;
          const e = 1 - Math.pow(1 - p, 3);
          const v = target * e;
          el.textContent = dec ? v.toFixed(1).replace('.', ',') : fmt(Math.round(v));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    /* запускаем, как только цифра поднимается над нижней кромкой экрана –
       на мобильных большой порог 0.6 мог вообще не наступить,
       и число оставалось «0» */
    }, { threshold: .01, rootMargin: '0px 0px -8% 0px' });
    $$('[data-count]').forEach(el => counterIO.observe(el));
    /* страховка: если через 6 с видимое число ещё «0» – ставим финальное */
    setTimeout(() => {
      $$('[data-count]').forEach(el => {
        if (el.textContent.trim() === '0') {
          const r = el.getBoundingClientRect();
          if (r.top < innerHeight && r.bottom > 0) setFinal(el);
        }
      });
    }, 6000);
  } else {
    $$('[data-count]').forEach(setFinal);
  }

  /* ---------- Обратный отсчёт (05.11.2026 10:00 – 08.11.2026 23:59 МСК, время сервера) ----------
     Механика трёх фаз:
       1) до старта – отсчёт до начала («До начала … осталось»);
       2) со старта и до 08.11 23:59 (мск) – отсчёт до конца («До конца … осталось»);
       3) после окончания – вместо таймера фраза-итог. */
  const TARGET = window.DIKTANT ? Date.parse(window.DIKTANT.CONFIG.startDate) : Date.parse('2026-11-05T10:00:00+03:00');
  const ENDAT = window.DIKTANT ? Date.parse(window.DIKTANT.CONFIG.endDate) : Date.parse('2026-11-08T23:59:59+03:00');
  const nowMs = () => window.DIKTANT ? window.DIKTANT.now() : Date.now();
  const cdCells = { d: $('[data-cd="d"]'), h: $('[data-cd="h"]'), m: $('[data-cd="m"]'), s: $('[data-cd="s"]') };
  if (cdCells.d) {
    const plural = (n, f) => f[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2];
    const cdBox = $('.countdown');
    const cdEnded = $('.countdown__ended');
    const cdLabel = $('[data-cd-label]');
    const LABEL_BEFORE = 'До начала Всероссийского гражданско-патриотического диктанта осталось:';
    const LABEL_RUNS = 'До конца Всероссийского гражданско-патриотического диктанта осталось:';
    const setCell = (key, val) => {
      const el = cdCells[key];
      if (el.textContent !== String(val)) { el.textContent = val; el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
    };
    const tickCd = () => {
      const t = nowMs();
      if (cdBox) {
        if (t > ENDAT) { /* диктант завершён – только финальная фраза */
          cdBox.hidden = false;
          cdBox.classList.add('is-ended');
          if (cdEnded) cdEnded.hidden = false;
          return;
        }
        cdBox.hidden = false;
        cdBox.classList.remove('is-ended');
      }
      const toEnd = t >= TARGET; /* диктант идёт – считаем до конца */
      if (cdLabel) cdLabel.textContent = toEnd ? LABEL_RUNS : LABEL_BEFORE;
      const diff = Math.max(0, (toEnd ? ENDAT : TARGET) - t);
      const d = Math.floor(diff / 864e5);
      const h = Math.floor(diff % 864e5 / 36e5);
      const m = Math.floor(diff % 36e5 / 6e4);
      const s = Math.floor(diff % 6e4 / 1e3);
      setCell('d', d); setCell('h', String(h).padStart(2, '0'));
      setCell('m', String(m).padStart(2, '0')); setCell('s', String(s).padStart(2, '0'));
      const ld = $('[data-cdl="d"]'), lh = $('[data-cdl="h"]'), lm = $('[data-cdl="m"]'), ls = $('[data-cdl="s"]');
      if (ld) { ld.textContent = plural(d, ['день', 'дня', 'дней']); lh.textContent = plural(h, ['час', 'часа', 'часов']); lm.textContent = plural(m, ['минута', 'минуты', 'минут']); ls.textContent = plural(s, ['секунда', 'секунды', 'секунд']); }
    };
    tickCd(); setInterval(tickCd, 1000);
  }

  /* ---------- Бегущая строка ---------- */
  $$('.marquee__track').forEach(t => { if (!REDUCED) t.innerHTML += t.innerHTML; });

  /* ---------- Карусель + лайтбокс ---------- */
  $$('.carousel').forEach(car => {
    const vp = $('.carousel__viewport', car);
    const track = $('.carousel__track', car);
    const slides = $$('.slide', track);
    const prev = $('[data-car="prev"]', car);
    const next = $('[data-car="next"]', car);
    const bar = $('.carousel__bar i', car);
    const cnt = $('.carousel__count b', car);
    /* общее число в счётчике ставим из разметки слайдов –
       при добавлении/удалении фото знаменатель не рассинхронизируется */
    const total = $('.car-total', car);
    if (total) total.textContent = String(slides.length).padStart(2, '0');
    let index = 0, pos = 0, maxPos = 0, slideW = 0;

    const measure = () => {
      slideW = slides[0].getBoundingClientRect().width + 16;
      maxPos = Math.max(0, track.scrollWidth - vp.clientWidth);
      go(index, true);
    };
    const go = (i, instant = false) => {
      index = Math.max(0, Math.min(slides.length - 1, i));
      pos = Math.min(index * slideW, maxPos);
      track.style.transition = instant || REDUCED ? 'none' : 'transform .65s cubic-bezier(.22,1,.36,1)';
      track.style.transform = `translateX(${-pos}px)`;
      if (bar) {
        const fill = Math.max(12, (vp.clientWidth / track.scrollWidth) * 100);
        bar.style.width = fill + '%';
        const trackPx = bar.parentElement.clientWidth - bar.parentElement.clientWidth * fill / 100;
        bar.style.transform = `translateX(${maxPos ? (pos / maxPos) * trackPx : 0}px)`;
      }
      if (cnt) cnt.textContent = String(index + 1).padStart(2, '0');
      prev?.toggleAttribute('disabled', index === 0);
      next?.toggleAttribute('disabled', pos >= maxPos - 2);
    };
    prev?.addEventListener('click', () => go(index - 1));
    next?.addEventListener('click', () => go(index + 1));

    /* drag */
    /* ВАЖНО: setPointerCapture только после реального драга (>6px).
       Если захватывать указатель сразу на pointerdown, браузер
       перенацеливает событие click на viewport – и клик по слайду
       (открытие лайтбокса) никогда не срабатывает. */
    $$('img', track).forEach(im => { im.draggable = false; });
    let down = false, startX = 0, startPos = 0, moved = false;
    vp.addEventListener('pointerdown', e => { down = true; moved = false; startX = e.clientX; startPos = pos; track.style.transition = 'none'; });
    vp.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 6) {
        moved = true;
        try { vp.setPointerCapture(e.pointerId); } catch (_) { /* не критично */ }
      }
      if (!moved) return;
      pos = Math.max(-60, Math.min(maxPos + 60, startPos - dx));
      track.style.transform = `translateX(${-pos}px)`;
    });
    const up = e => {
      if (!down) return; down = false;
      pos = Math.max(0, Math.min(maxPos, pos));
      index = Math.round(pos / slideW);
      go(index);
    };
    vp.addEventListener('pointerup', up);
    vp.addEventListener('pointercancel', up);
    vp.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);

    /* колесо мыши по горизонтали */
    vp.addEventListener('wheel', e => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); go(index + Math.sign(e.deltaX)); }
    }, { passive: false });

    addEventListener('resize', measure);
    measure();
    setTimeout(measure, 400);

    /* лайтбокс */
    const lb = $('.lightbox');
    if (lb) {
      const lbImg = $('img', lb), lbCap = $('figcaption', lb);
      let cur = 0;
      const openLb = i => {
        cur = (i + slides.length) % slides.length;
        const im = $('img', slides[cur]);
        lbImg.src = im.src; lbImg.alt = im.alt;
        lbCap.textContent = slides[cur].dataset.caption || im.alt || '';
        lb.classList.add('is-open');
        document.body.style.overflow = 'hidden';
      };
      const closeLb = () => { lb.classList.remove('is-open'); document.body.style.overflow = ''; };
      slides.forEach((s, i) => s.addEventListener('click', () => openLb(i)));
      $('.lightbox__close', lb).addEventListener('click', closeLb);
      $('.lightbox__nav--prev', lb)?.addEventListener('click', e => { e.stopPropagation(); openLb(cur - 1); });
      $('.lightbox__nav--next', lb)?.addEventListener('click', e => { e.stopPropagation(); openLb(cur + 1); });
      lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
      document.addEventListener('keydown', e => {
        if (!lb.classList.contains('is-open')) return;
        if (e.key === 'Escape') closeLb();
        if (e.key === 'ArrowLeft') openLb(cur - 1);
        if (e.key === 'ArrowRight') openLb(cur + 1);
      });
    }
  });

  /* ---------- FAQ-аккордеон ---------- */
  $$('.faq-item').forEach(item => {
    const btn = $('.faq-item__q', item);
    btn?.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');
      $$('.faq-item.is-open').forEach(o => { o.classList.remove('is-open'); $('.faq-item__q', o).setAttribute('aria-expanded', 'false'); });
      if (!isOpen) { item.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
    });
  });

  /* ---------- Плавающая CTA ---------- */
  const fcta = $('.float-cta');
  if (fcta && !document.body.hasAttribute('data-no-fcta')) {
    const onScroll = () => fcta.classList.toggle('is-show', scrollY > innerHeight * .85);
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  /* ---------- Топбар тень при скролле ---------- */
  const tb = $('.topbar');
  if (tb) addEventListener('scroll', () => tb.style.boxShadow = scrollY > 10 ? '0 12px 40px -20px rgba(11,48,65,.45)' : '', { passive: true });

  /* ---------- Год в футере ---------- */
  $$('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
})();

/* ---------- Параллакс коллажа в hero (только точный указатель) ---------- */
(() => {
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const collage = document.querySelector('.collage');
  if (!collage || REDUCED || !matchMedia('(pointer:fine)').matches) return;
  const hero = collage.closest('.hero');
  const items = [...collage.querySelectorAll('.collage__item')];
  const stickers = [...collage.querySelectorAll('.sticker')];
  let raf = 0;
  hero.addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5;
    const y = (e.clientY - r.top) / r.height - .5;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      items.forEach((el, i) => { const d = [8, 16, 24][i] || 10; el.style.translate = `${x * d}px ${y * d}px`; });
      stickers.forEach((el, i) => { const d = i % 2 ? 30 : 20; el.style.translate = `${-x * d}px ${-y * d}px`; });
    });
  });
  hero.addEventListener('pointerleave', () => {
    cancelAnimationFrame(raf);
    items.forEach(el => el.style.translate = '');
    stickers.forEach(el => el.style.translate = '');
  });
})();
