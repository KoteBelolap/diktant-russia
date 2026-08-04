/* ============================================================
   ТИПОГРАФ: неразрывные предлоги
   ------------------------------------------------------------
   Правило дизайна проекта: предлог не должен «висеть» в конце
   строки – он переносится вместе со следующим словом.
   Скрипт заменяет обычный пробел после предлога на неразрывный
   во всех текстовых узлах, включая контент, добавленный
   динамически (новости из CMS, карточки, уведомления).
   Пропускает script/style/code/textarea/input и редактируемое.
   ============================================================ */
(() => {
  'use strict';
  /* предлоги и короткие частицы (1–3 буквы), после которых ставим NBSP */
  const WORDS = ['в', 'во', 'на', 'с', 'со', 'к', 'ко', 'о', 'об', 'обо', 'у',
    'от', 'до', 'из', 'из-за', 'из-под', 'по', 'за', 'над', 'под', 'при', 'про',
    'для', 'без', 'через', 'и', 'а', 'но', 'не', 'ни', 'же', 'ли', 'бы', 'то',
    'я', 'он', 'она', 'оно', 'мы', 'ты', 'их', 'ей'];
  const REX = new RegExp('(^|[\\s\\u00A0(«"„])(' + WORDS.join('|') + ')[ \\u00A0]+(?=[\\w«"\\d\\(])', 'giu');

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
