// h(tag, attrs, ...children) — cria elemento DOM.
//
// Atributos especiais:
//   class    -> className
//   style    -> objeto {prop: val} ou string
//   dataset  -> objeto data-*
//   on*      -> event listener (onClick, onInput, etc)
//   ref      -> função(el) chamada com o elemento
//
// Children podem ser nodes, strings, números, ou null/undefined (ignorados).
// Arrays são achatados.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);

  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') {
      el.className = v;
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(el.style, v);
    } else if (k === 'dataset' && typeof v === 'object') {
      Object.assign(el.dataset, v);
    } else if (k === 'ref' && typeof v === 'function') {
      v(el);
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'html') {
      el.innerHTML = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }

  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    if (c instanceof Node) {
      el.appendChild(c);
    } else {
      el.appendChild(document.createTextNode(String(c)));
    }
  }
}

// Atalhos comuns.
export const div = (a, ...c) => h('div', a, ...c);
export const span = (a, ...c) => h('span', a, ...c);
export const text = (s) => document.createTextNode(String(s ?? ''));

// Mostra/esconde um elemento.
export function showHide(el, show) {
  el.style.display = show ? '' : 'none';
}

// Limpa todos os filhos de um nó.
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// Substitui o conteúdo de um nó por novos filhos.
export function setContent(el, ...children) {
  clear(el);
  appendChildren(el, children);
}
