import { h } from '../core/dom.js';

const stack = () => document.getElementById('toast-stack');

export function toast(msg, opts = {}) {
  const { kind = 'info', ms = 3500 } = opts;
  const t = h('div', { class: `toast ${kind}` }, msg);
  stack().appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  }, ms);
}

toast.success = (m, o) => toast(m, { ...o, kind: 'success' });
toast.danger = (m, o) => toast(m, { ...o, kind: 'danger' });
toast.info = (m, o) => toast(m, { ...o, kind: 'info' });
