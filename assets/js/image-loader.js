/* ============================================================
   ЕДИНЫЙ ИНДИКАТОР ЗАГРУЗКИ ИЗОБРАЖЕНИЙ
   ------------------------------------------------------------
   Работает со всеми <img>, включая добавленные через innerHTML.
   При смене src прежний кадр сразу скрывается, а поверх контейнера
   показывается полоска до события load или error.
   ============================================================ */
(() => {
  'use strict';

  const records = new WeakMap();

  const sourceKey = img => [
    img.getAttribute('src') || '',
    img.getAttribute('srcset') || ''
  ].join('\n');

  const hasSource = img => Boolean(
    (img.getAttribute('src') || '').trim()
    || (img.getAttribute('srcset') || '').trim()
  );

  const ensure = img => {
    let record = records.get(img);
    if (record) return record;

    let host = img.parentElement;
    if (host?.tagName === 'PICTURE') host = host.parentElement;
    if (!host) return null;

    host.classList.add('image-loader-host');
    if (getComputedStyle(host).position === 'static') {
      host.classList.add('image-loader-host--positioned');
    }

    const bar = document.createElement('span');
    bar.className = 'image-load-bar';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-label', 'Изображение загружается');
    host.append(bar);

    record = { host, bar, key: '', errorTimer: 0 };
    records.set(img, record);

    img.addEventListener('load', () => finish(img, false));
    img.addEventListener('error', () => finish(img, true));
    return record;
  };

  const prepare = img => {
    if (!(img instanceof HTMLImageElement)) return;
    const record = ensure(img);
    if (!record) return;

    clearTimeout(record.errorTimer);
    img.classList.remove('is-image-error');
    img.classList.add('is-image-loading');
    record.bar.classList.remove('is-error');
    record.bar.classList.add('is-active');
    record.bar.setAttribute('aria-label', 'Изображение загружается');
    record.host.setAttribute('aria-busy', 'true');
  };

  const start = img => {
    if (!(img instanceof HTMLImageElement)) return;
    if (!hasSource(img)) {
      reset(img);
      return;
    }

    prepare(img);
    const record = records.get(img);
    if (!record) return;
    record.key = sourceKey(img);
    const expected = record.key;

    requestAnimationFrame(() => {
      if (record.key !== expected || sourceKey(img) !== expected || !img.complete) return;
      finish(img, img.naturalWidth === 0);
    });
  };

  const finish = (img, failed) => {
    const record = records.get(img);
    if (!record) return;

    img.classList.remove('is-image-loading');
    record.host.removeAttribute('aria-busy');
    record.bar.classList.remove('is-active');

    if (!failed) {
      img.classList.remove('is-image-error');
      record.bar.classList.remove('is-error');
      return;
    }

    /* Не возвращаем старый кадр при ошибке нового URL. */
    img.classList.add('is-image-error');
    record.bar.classList.add('is-active', 'is-error');
    record.bar.setAttribute('aria-label', 'Изображение не загрузилось');
    record.errorTimer = setTimeout(() => record.bar.classList.remove('is-active'), 4000);
  };

  const reset = img => {
    const record = records.get(img);
    if (!record) return;
    clearTimeout(record.errorTimer);
    record.key = '';
    img.classList.remove('is-image-loading', 'is-image-error');
    record.bar.classList.remove('is-active', 'is-error');
    record.host.removeAttribute('aria-busy');
  };

  const watch = img => {
    if (!(img instanceof HTMLImageElement)) return;
    ensure(img);
    start(img);
  };

  const scan = node => {
    if (!(node instanceof Element)) return;
    if (node.matches('img')) watch(node);
    node.querySelectorAll('img').forEach(watch);
  };

  document.documentElement.classList.add('image-loader-enabled');

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'attributes') {
        start(mutation.target);
        return;
      }
      mutation.addedNodes.forEach(scan);
    });
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src', 'srcset']
  });

  const scanDocument = () => document.querySelectorAll('img').forEach(watch);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanDocument, { once: true });
  } else {
    scanDocument();
  }

  window.DIKTANT_IMAGE_LOADING = Object.freeze({ prepare, start, reset });
})();
