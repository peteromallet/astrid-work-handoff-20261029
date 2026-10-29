/** Runs unchanged in the browser and in the layout fixture tests. All sizes are CSS pixels. */
export function collectLayoutIssues({ touch = false, mobile = false, cardSelector = '[data-editor-tour-card] section', targets = [], fullPage = false } = {}) {
  const issues = [];
  const width = window.innerWidth, height = window.innerHeight;
  const scanHeight = fullPage ? Math.max(height, document.documentElement.scrollHeight, document.body.scrollHeight) : height;
  const selector = element => {
    if (!element.parentElement || element === document.body) return element.localName;
    if (element.id) return `#${CSS.escape(element.id)}`;
    for (const attribute of ['data-editor-tour', 'data-editor-tour-track', 'data-editor-tour-card', 'data-testid', 'aria-label']) {
      if (element.hasAttribute(attribute)) return `[${attribute}=${JSON.stringify(element.getAttribute(attribute))}]`;
    }
    const parts = [];
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      parts.unshift(`${node.localName}:nth-child(${[...node.parentElement.children].indexOf(node) + 1})`);
    }
    return parts.length ? `body ${parts.join(' > ')}` : element.localName;
  };
  const add = (type, element, detail) => issues.push({ type, selector: selector(element), text: (element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160), detail });
  const visible = element => {
    if (element.closest('[hidden], [inert], defs, clipPath, mask, symbol, pattern')) return false;
    const style = getComputedStyle(element), box = element.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || box.width <= 0 || box.height <= 0) return false;
    let left = Math.max(0, box.left), top = Math.max(0, box.top), right = Math.min(width, box.right), bottom = Math.min(scanHeight, box.bottom);
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent), clip = parent.getBoundingClientRect();
      if (css.visibility === 'hidden' || Number(css.opacity) === 0) return false;
      if (css.overflowX !== 'visible') { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
      if (css.overflowY !== 'visible') { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
    }
    return right > left && bottom > top;
  };
  const outside = box => box.left < -1 || box.top < -1 || box.right > width + 1 || box.bottom > height + 1;
  if (document.documentElement.scrollWidth > width + 1) add('horizontal-overflow', document.documentElement, { scrollWidth: document.documentElement.scrollWidth, viewport: width });
  for (const element of document.querySelectorAll('body *')) {
    if (!(element instanceof HTMLElement || element instanceof SVGElement) || !visible(element)) continue;
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    if (box.width > width + 1) add('horizontal-overflow', element, { width: box.width, viewport: width });
    const hasText = [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const hiddenX = /^(hidden|clip)$/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
    const hiddenY = /^(hidden|clip)$/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
    if ((hiddenX || hiddenY) && element.textContent.trim()) add('clipped-text', element, { horizontal: hiddenX, vertical: hiddenY, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight });
    if (mobile && hasText && parseFloat(style.fontSize) < 12) add('small-text', element, { fontSize: style.fontSize });
    if (touch && element.matches('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="radio"], [role="checkbox"], [tabindex="0"]') && !element.matches(':disabled, [aria-disabled="true"]')) {
      // Radio labels provide a larger hit area than their visual indicator.
      const label = element.id && document.querySelector(`label[for=${JSON.stringify(element.id)}]`);
      const hit = label && visible(label) ? label.getBoundingClientRect() : box;
      if (hit.width < 44 || hit.height < 44) add('small-touch-target', element, { width: hit.width, height: hit.height });
    }
    if (style.position === 'fixed') {
      const area = Math.max(0, Math.min(width, box.right) - Math.max(0, box.left)) * Math.max(0, Math.min(height, box.bottom) - Math.max(0, box.top));
      if (area > width * height * 0.6) add('large-fixed-element', element, { viewportFraction: area / (width * height) });
    }
  }
  const card = cardSelector === 'welcome-card' ? document.querySelector('h1')?.closest('header')?.parentElement?.parentElement : document.querySelector(cardSelector);
  const cardBox = card?.getBoundingClientRect();
  if (cardBox && outside(cardBox)) add('card-outside-viewport', card, { x: cardBox.x, y: cardBox.y, width: cardBox.width, height: cardBox.height });
  for (const targetSelector of targets) {
    const target = document.querySelector(targetSelector);
    if (!target) { issues.push({ type: 'missing-target', selector: targetSelector, text: '', detail: {} }); continue; }
    const box = target.getBoundingClientRect();
    // The runner spotlights the visible portion of wide timeline rows; use the same clipping rule.
    const clipped = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    for (let parent = target.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
      if (style.overflowX !== 'visible') { clipped.left = Math.max(clipped.left, clip.left); clipped.right = Math.min(clipped.right, clip.right); }
      if (style.overflowY !== 'visible') { clipped.top = Math.max(clipped.top, clip.top); clipped.bottom = Math.min(clipped.bottom, clip.bottom); }
    }
    if (outside(clipped) || clipped.right <= clipped.left || clipped.bottom <= clipped.top) add('target-outside-viewport', target, clipped);
    if (cardBox && Math.min(cardBox.right, clipped.right) > Math.max(cardBox.left, clipped.left) && Math.min(cardBox.bottom, clipped.bottom) > Math.max(cardBox.top, clipped.top)) add('card-target-overlap', target, { card: selector(card) });
  }
  return issues;
}
