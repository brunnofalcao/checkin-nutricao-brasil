// =====================================================================
// TEMA · claro, escuro e automático
// A escolha vive em localStorage e é aplicada no <html> antes da primeira
// pintura (o trecho inline no index.html faz isso). Este módulo cuida da
// troca em tempo de uso e do controle na barra lateral.
// =====================================================================
import { h } from '../core/dom.js';

const CHAVE = 'nb-tema';
const OPCOES = [
  { v: 'auto', rot: 'Auto', desc: 'Segue o sistema' },
  { v: 'claro', rot: 'Claro', desc: 'Sempre claro' },
  { v: 'escuro', rot: 'Escuro', desc: 'Sempre escuro' }
];

export function temaAtual() {
  const v = localStorage.getItem(CHAVE);
  return OPCOES.some((o) => o.v === v) ? v : 'auto';
}

export function aplicaTema(valor) {
  const raiz = document.documentElement;
  // Desliga transição durante a troca para não piscar cor por meio segundo.
  raiz.classList.add('trocando-tema');
  if (valor === 'auto') raiz.removeAttribute('data-tema');
  else raiz.setAttribute('data-tema', valor);
  try { localStorage.setItem(CHAVE, valor); } catch (e) { /* modo privado */ }
  atualizaCorDaBarra();
  requestAnimationFrame(() => raiz.classList.remove('trocando-tema'));
}

// Cor da barra do navegador no celular acompanha o fundo real.
function atualizaCorDaBarra() {
  const cor = getComputedStyle(document.body).backgroundColor;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = cor;
}

// Controle segmentado de 3 estados. Acessível por teclado e por leitor de tela.
export function controleTema() {
  const atual = temaAtual();
  const grupo = h('div', {
    class: 'tema-switch',
    role: 'radiogroup',
    'aria-label': 'Tema da interface'
  });
  OPCOES.forEach((o) => {
    const b = h('button', {
      type: 'button',
      class: 'tema-opt' + (o.v === atual ? ' on' : ''),
      role: 'radio',
      'aria-checked': o.v === atual ? 'true' : 'false',
      title: o.desc,
      onClick: () => {
        aplicaTema(o.v);
        [...grupo.children].forEach((x) => {
          const lig = x.dataset.v === o.v;
          x.classList.toggle('on', lig);
          x.setAttribute('aria-checked', lig ? 'true' : 'false');
        });
      }
    }, o.rot);
    b.dataset.v = o.v;
    grupo.appendChild(b);
  });
  return grupo;
}

// Se estiver em automático, seguir o sistema quando ele mudar.
export function ouveSistema() {
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const ao = () => { if (temaAtual() === 'auto') atualizaCorDaBarra(); };
  mq.addEventListener ? mq.addEventListener('change', ao) : mq.addListener(ao);
}
