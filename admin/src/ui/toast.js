import { h } from '../core/dom.js';

const stack = () => document.getElementById('toast-stack');

// opts.acao = { label, onClick } acrescenta um botão dentro do toast.
// Existe para ações que somem da tela quando dão certo — resolver uma
// conversa tira ela da fila, e um clique errado não pode ser sem volta.
// Toast com ação fica mais tempo: 3,5s não dá para ler, decidir e clicar.
export function toast(msg, opts = {}) {
  const { kind = 'info', acao } = opts;
  const ms = opts.ms ?? (acao ? 8000 : 3500);

  const t = h('div', { class: `toast ${kind}` }, h('span', { class: 'toast-msg' }, msg));

  let fechado = false;
  const fecha = () => {
    if (fechado) return;
    fechado = true;
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  };

  if (acao?.label && typeof acao.onClick === 'function') {
    t.appendChild(h('button', {
      class: 'toast-acao',
      type: 'button',
      onclick: () => { fecha(); acao.onClick(); }
    }, acao.label));
  }

  // Clicar no toast fecha: quem já leu não precisa esperar.
  t.style.cursor = 'pointer';
  t.addEventListener('click', (e) => { if (!e.target.closest('.toast-acao')) fecha(); });

  stack().appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(fecha, ms);
}

toast.success = (m, o) => toast(m, { ...o, kind: 'success' });
// Erro herdava os 3,5s do padrão. Mensagem que exige ler, entender e
// decidir sumia antes de ser lida — e em vários fluxos o toast é a ÚNICA
// indicação de que a gravação não aconteceu. Dez segundos, e clicar fecha.
toast.danger = (m, o) => toast(m, { ms: 10000, ...o, kind: 'danger' });
toast.info = (m, o) => toast(m, { ...o, kind: 'info' });
toast.warn = (m, o) => toast(m, { ...o, kind: 'warn', ms: 5000 });
