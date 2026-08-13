/* Главная страница: графики, таймер, трансляция, карусель,
   медиагалереи гостей, FAQ и плавающая кнопка участия. */
(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /* ---------- Диаграммы статистики: пересчёт из цифр ----------
     Источник истины – ВИДИМЫЕ цифры в разметке (.bars__val у столбцов,
     data-points у линейного графика). Высоты столбцов, геометрия линии
     и подписи для скринридеров вычисляются из них при загрузке, поэтому
     редактор меняет ТОЛЬКО число – диаграмма следует сама. Размеченные
     в HTML значения остаются запасным вариантом на случай без JS. */
  (() => {
    const num = t => parseFloat(String(t).replace(/\s/g, '').replace(',', '.'));
    const fmtRu = v => String(v).replace('.', ',');

    /* столбчатые диаграммы: --h = доля максимума диаграммы в % */
    $$('.bars').forEach(bars => {
      const cols = $$('.bars__col', bars);
      if (!cols.length) return;
      const vals = cols.map(c => num($('.bars__val', c)?.textContent ?? 'NaN'));
      if (vals.some(v => !isFinite(v))) return;
      const max = Math.max(...vals) || 1;
      cols.forEach((c, i) => $('.bars__bar', c)
        ?.style.setProperty('--h', +(vals[i] / max * 100).toFixed(1)));
      const unit = bars.dataset.unit;
      if (unit) bars.setAttribute('aria-label', 'Диаграмма: ' + cols
        .map((c, i) => `${$('.bars__val', c).textContent.trim()} ${unit} к ${$('.bars__year', c).textContent.trim()} году`)
        .join(', '));
    });

    /* линейный график участников: пересобираем path, точки и подписи
       из data-points="v1,v2,…" + data-years + data-unit.
       Геометрия viewBox 400x170: x от 40 шагом 106, низ y=140,
       максимум рисуем на y=12.4 (проектная высота пика). */
    $$('svg.chart[data-points]').forEach(svg => {
      const pts = (svg.dataset.points || '').split(',').map(num);
      const years = (svg.dataset.years || '').split(',');
      const unit = svg.dataset.unit ?? '';
      if (pts.length < 2 || pts.some(v => !isFinite(v)) || years.length !== pts.length) return;
      const NS = 'http://www.w3.org/2000/svg';
      const X0 = 40, DX = 106, YB = 140, YTOP = 12.4;
      const max = Math.max(...pts) || 1;
      const X = i => X0 + DX * i;
      const Y = v => +(YB - v / max * (YB - YTOP)).toFixed(2);
      let d = `M${X(0)} ${Y(pts[0])}`;
      for (let i = 1; i < pts.length; i++)
        d += ` C ${X(i - 1) + 35} ${Y(pts[i - 1])}, ${X(i) - 35} ${Y(pts[i])}, ${X(i)} ${Y(pts[i])}`;
      const line = $('path.line-path', svg), area = $('path.line-area', svg);
      if (line) line.setAttribute('d', d);
      if (area) area.setAttribute('d', `${d} L${X(pts.length - 1)} ${YB} L${X(0)} ${YB} Z`);
      $$('.line-g', svg).forEach(g => g.remove());
      const mk = (name, attrs, text) => {
        const el = document.createElementNS(NS, name);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        if (text != null) el.textContent = text;
        return el;
      };
      pts.forEach((v, i) => {
        const last = i === pts.length - 1;
        const g = mk('g', { class: 'line-g' });
        g.appendChild(mk('circle', { class: 'chart-dot', cx: X(i), cy: Y(v), r: last ? 6 : 5 }));
        /* последняя точка у правого края: подпись смещаем влево-вниз */
        g.appendChild(mk('text', last
          ? { class: 'val-label', x: X(i) - 22, y: Y(v) + 21.6, 'text-anchor': 'end' }
          : { class: 'val-label', x: X(i), y: Y(v) - 14.7, 'text-anchor': 'middle' },
          fmtRu(v) + unit));
        g.appendChild(mk('text', { class: 'axis-label', x: X(i), y: 160, 'text-anchor': 'middle' }, years[i]));
        svg.appendChild(g);
      });
      svg.setAttribute('aria-label', 'График роста участников: ' +
        pts.map((v, i) => `${fmtRu(v)} тысячи в ${years[i]}`).join(', '));
    });
  })();

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
      if (window.DIKTANT?.status?.production?.() && !window.DIKTANT.status.timeReady()) {
        if (cdLabel) cdLabel.textContent = 'Ожидаем синхронизацию с серверным московским временем';
        setCell('d', '–'); setCell('h', '–'); setCell('m', '–'); setCell('s', '–');
        return;
      }
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

  /* ---------- Трансляция открытия (РУТУБ) ---------- */
  /* CONFIG.broadcastUrl заполняет все ссылки на эфир. Iframe-плеер
     размещается в #broadcast на main.html. */
  $$('[data-broadcast-link]').forEach(a => {
    const url = window.DIKTANT && window.DIKTANT.CONFIG.broadcastUrl;
    if (url) a.href = url;
  });

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

  });

  /* ---------- Лайтбокс (фото и видео) ---------- */
  /* Единый на всю страницу:
     – слайды карусели открываются общей галереей со стрелками;
     – карточка почётного гостя открывает только его медиаподборку из
       guest-media.js: сначала все видео, затем все фотографии;
     – остальные [data-lightbox] открываются одиночно, без стрелок.
     data-kind="video" показывает <video controls>; вертикальные ролики
     вписываются в экран стилями. Воспроизведение останавливается при
     закрытии и при смене элемента. */
  const lb = $('.lightbox');
  if (lb) {
    const lbImg = $('img', lb), lbCap = $('figcaption', lb), lbVid = $('.lightbox__video', lb);
    const navBtns = $$('.lightbox__nav', lb);
    const lbSlides = $$('.slide');
    const guestMedia = window.DIKTANT_GUEST_MEDIA || {};
    const imageLoading = window.DIKTANT_IMAGE_LOADING;
    let cur = 0, solo = true, activeItems = [];

    const stopVid = () => {
      if (!lbVid) return;
      lbVid.pause();
      lbVid.removeAttribute('src');
      lbVid.load();
    };
    const closeLb = () => {
      stopVid();
      lb.classList.remove('is-open');
      document.body.style.overflow = '';
      activeItems = [];
    };
    const showItem = item => {
      if (!item || !item.src) return;
      const isVideo = item.kind === 'video';
      stopVid();
      if (isVideo && lbVid) lbVid.src = item.src;
      if (lbImg) {
        lbImg.hidden = isVideo;
        if (isVideo) {
          imageLoading?.reset(lbImg);
        } else {
          /* Скрываем прежний кадр до присваивания нового src, чтобы он не
             оставался в лайтбоксе на время сетевой загрузки. */
          imageLoading?.prepare(lbImg);
          lbImg.alt = item.alt || item.caption || '';
          lbImg.src = item.src;
          imageLoading?.start(lbImg);
        }
      }
      if (lbVid) lbVid.hidden = !isVideo;
      lbCap.textContent = item.caption || item.alt || '';
      lb.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      if (isVideo && lbVid) lbVid.play().catch(() => { /* автоплей мог быть запрещён – стартуем кнопкой плеера */ });
    };
    const openAt = i => {
      if (!activeItems.length) return;
      cur = (i + activeItems.length) % activeItems.length;
      showItem(activeItems[cur]);
    };
    const openItems = (items, start = 0) => {
      activeItems = items.filter(item => item && item.src);
      if (!activeItems.length) return;
      solo = activeItems.length < 2;
      navBtns.forEach(b => { b.hidden = solo; });
      openAt(start);
    };
    const slideItems = lbSlides.map(s => {
      const im = $('img', s);
      return {
        kind: s.dataset.kind === 'video' ? 'video' : 'img',
        src: s.dataset.src || (im && im.src),
        alt: im ? im.alt : '',
        caption: s.dataset.caption || (im ? im.alt : '')
      };
    });
    const openSoloOrGuest = el => {
      const gallery = guestMedia[el.dataset.guestMedia];
      if (Array.isArray(gallery) && gallery.length) {
        openItems(gallery);
        return;
      }
      const media = $('img', el) || $('video', el);
      openItems([{
        kind: el.dataset.kind === 'video' ? 'video' : 'img',
        src: el.dataset.src || (media && (media.currentSrc || media.src)),
        caption: el.dataset.caption || (media ? (media.getAttribute('alt') || '') : '')
      }]);
    };
    lbSlides.forEach((s, i) => s.addEventListener('click', () => openItems(slideItems, i)));
    $$('[data-lightbox]').forEach(el => el.addEventListener('click', e => {
      if (e.target.closest('a')) return;   /* ссылка в подписи работает как обычно */
      e.preventDefault();
      openSoloOrGuest(el);
    }));
    $('.lightbox__close', lb).addEventListener('click', closeLb);
    navBtns.forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      if (!solo) openAt(cur + (b.classList.contains('lightbox__nav--prev') ? -1 : 1));
    }));
    lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
    document.addEventListener('keydown', e => {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeLb();
      if (solo) return;
      if (e.key === 'ArrowLeft') openAt(cur - 1);
      if (e.key === 'ArrowRight') openAt(cur + 1);
    });
  }
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
