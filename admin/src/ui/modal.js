import { h } from '../core/dom.js';
import { icons } from './icons.js';

const root = () => document.getElementById('modal-root');

// openModal({ title, body, actions, onClose })
//   body: Node ou função(closeFn) => Node
//   actions: [{ label, kind, onClick(closeFn) }]
export function openModal({ title, body, actions = [], onClose } = {}) {
  let overlay;

  // Um modal por vez. Em rede lenta, ações que abrem modal depois de um
  // await parecem não ter funcionado; dois ou três cliques empilhavam dois
  // ou três overlays, e cada "Fechar" tirava só um.
  const anterior = root().querySelector('.modal-overlay');
  if (anterior) anterior.remove();

  // De onde o foco veio, para devolver na saída. Sem isso, fechar um modal
  // joga o foco no começo da página e quem usa teclado perde o lugar.
  const focoAnterior = document.activeElement;

  const aoTeclar = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab' || !overlay) return;
    // Prende o Tab dentro do diálogo: atrás do overlay há uma página
    // inteira de botões que não devem receber foco.
    const focaveis = overlay.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focaveis.length) return;
    const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  };

  const close = () => {
    if (!overlay) return;
    document.removeEventListener('keydown', aoTeclar, true);
    overlay.remove();
    overlay = null;
    if (focoAnterior && typeof focoAnterior.focus === 'function') {
      try { focoAnterior.focus(); } catch { /* elemento saiu da tela */ }
    }
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
      { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Janela' },
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
  document.addEventListener('keydown', aoTeclar, true);

  // Foca o primeiro campo (ou o primeiro botão) para quem chegou pelo
  // teclado não precisar caçar onde começou.
  const alvo = overlay.querySelector('input, select, textarea') ||
               overlay.querySelector('.modal-body button, footer button');
  if (alvo) setTimeout(() => { try { alvo.focus(); } catch {} }, 30);

  return { close };
}
