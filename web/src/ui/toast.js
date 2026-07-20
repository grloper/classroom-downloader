import { el, icon } from '../util/dom.js';

let wrap = null;
function ensureWrap() {
  if (!wrap) {
    wrap = el('div', { class: 'toast-wrap' });
    document.body.appendChild(wrap);
  }
  return wrap;
}

export function toast(message, kind = 'default', duration = 3200) {
  const iconName = kind === 'success' ? 'check' : kind === 'error' ? 'x' : 'info';
  const node = el('div', { class: `toast ${kind}` }, [icon(iconName, { size: 16 }), message]);
  ensureWrap().appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .2s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  }, duration);
}
