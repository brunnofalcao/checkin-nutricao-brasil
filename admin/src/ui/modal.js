import { h } from '../core/dom.js';
import { icons } from './icons.js';

const root = () => document.getElementById('modal-root');

// openModal({ title, body, actions, onClose })
//   body: Node ou função(closeFn) => Node
//   actions: [{ label, kind, onClick(closeFn) }]
export function openModal({ title, body, actions = [], onClose } = {}) {
  let overlay;
  const close = () => {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    if (typeof onClose === 'function') onClose();
  };

  const bodyNode = typeof body === 'function' ? body(close) : body;

  overlay = h(
    'div',
    {
      class: 'modal-overlay',
      onclick: (e) => {
        if (e.target === overlay) close();
      }
    },
    h(
      'div',
      { class: 'modal', role: 'dialog' },
      h(
        'header',
        {},
        h('h2', {}, title || ''),
        h('button', { class: 'icon-btn', 'aria-label': 'Fechar', onclick: close }, icons.close())
      ),
      h('div', { class: 'modal-body' }, bodyNode),
      actions.length
        ? h(
            'footer',
            {},
            ...actions.map((a) =>
              h(
                'button',
                {
                  class: `btn ${a.kind || 'btn-ghost'}`,
                  onclick: () => a.onClick?.(close)
                },
                a.label
              )
            )
          )
        : null
    )
  );

  root().appendChild(overlay);
  return { close };
}
