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
  // Abaixo de 860px toda tabela vira cartao e a celula fica sem o nome da
  // coluna: "18,4 mil seguidores" sozinho nao diz que coluna e. O CSS
  // escreve o rotulo a partir de data-rot; aqui so copiamos o cabecalho.
  // Feito aqui, e nao em cada pagina, porque as 21 tabelas do painel
  // montam thead e tbody na mesma chamada de h('table', ...).
  if (el.tagName === 'TABLE') rotulaColunas(el);
  return el;
}

// Copia o texto de cada <th> para o data-rot do <td> de mesmo indice.
// Nao sobrescreve data-rot escrito a mao (a Exposicao ja tinha o dela) e
// nunca derruba a tela: rotulo e enfeite.
export function rotulaColunas(tabela) {
  try {
    const cabeca = tabela.tHead && tabela.tHead.rows[0];
    if (!cabeca) return;
    const rotulos = Array.from(cabeca.cells, (th) => (th.textContent || '').trim());
    for (const corpo of tabela.tBodies) {
      for (const linha of corpo.rows) {
        // Linha de grupo e um td com colspan: nao pertence a coluna nenhuma.
        if (linha.cells.length < 2) continue;
        for (let i = 1; i < linha.cells.length; i++) {
          const celula = linha.cells[i];
          if (rotulos[i] && !celula.hasAttribute('data-rot')) {
            celula.setAttribute('data-rot', rotulos[i]);
          }
        }
      }
    }
  } catch (e) {
    console.warn('rotulaColunas', e);
  }
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
