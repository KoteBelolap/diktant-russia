/* ============================================================
   ТИПОГРАФ: «висячие» короткие слова и числа
   ------------------------------------------------------------
   Правило дизайна проекта: если слово или число короче 4 знаков
   (1–3 буквы или цифры), оно не должно оставаться в конце строки
   одно – оно переносится на следующую строку вместе со следующим
   словом. Для этого обычный пробел ПОСЛЕ короткого слова заменяется
   на неразрывный во всех текстовых узлах, включая контент,
   добавленный динамически (новости из CMS, карточки, уведомления).
   Работает для любых коротких слов, а не только для предлогов:
   «4 сезонов», «и а», «8 ноября», «мы к» и т.п.
   Пропускает script/style/code/textarea/input и редактируемое.
   ============================================================ */
(() => {
  'use strict';
  /* токен из 1–3 букв/цифр + пробел + начало следующего слова → NBSP
     ВАЖНО: \w в JS не включает кириллицу – поэтому Unicode-классы \p{L}/\p{N}.
     Флаг i НЕ ставим: в связке i+u движок пропускает матч в начале строки,
     а регистр нам безразличен – класс \p{L} покрывает любые буквы. */
  const REX = /(^|[\s\u00A0(«"„])([\p{L}\p{N}]{1,3})[ \u00A0]+(?=[\p{L}\p{N}«"(])/gu;

  const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'NOSCRIPT']);

  const fixText = s => s.replace(REX, (m, p1, p2) => p1 + p2 + '\u00A0');

  const walk = root => {
    if (!root) return;
    const it = document.createTreeWalker(root.nodeType === 9 ? root.body : root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        let el = node.parentElement;
        while (el) {
          if (SKIP.has(el.tagName) || el.isContentEditable) return NodeFilter.FILTER_REJECT;
          el = el.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let n;
    while ((n = it.nextNode())) nodes.push(n);
    nodes.forEach(t => {
      const fixed = fixText(t.nodeValue);
      if (fixed !== t.nodeValue) t.nodeValue = fixed;
    });
  };

  const run = () => walk(document);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();

  /* динамически добавленные узлы (лента новостей, карточки и пр.) */
  let queued = false;
  new MutationObserver(muts => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      muts.forEach(m => m.addedNodes.forEach(node => {
        if (node.nodeType === 1 && !SKIP.has(node.tagName)) walk(node);
      }));
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
