// =====================================================================
// AVISO DE CONEXÃO
//
// O painel é quase todo leitura, então cada tela trata o próprio erro de
// rede. O problema é que ninguém junta as peças: no wifi do pavilhão a
// operadora abre Pessoas e lê "a internet caiu no meio do caminho", clica
// em Eventos e lê a mesma coisa, e a conclusão dela é "o sistema caiu" —
// não "meu wifi caiu". Aí liga para a Science Play em vez de trocar de rede.
//
// Esta barra diz a verdade uma vez, no alto da tela, e some sozinha quando
// a conexão volta — recarregando a página que estava aberta, para que os
// números na tela não fiquem sendo os de antes da queda.
//
// navigator.onLine sozinho mente: no cativo de hotel ele diz "online" com
// a rede sem sair do lugar. Por isso as páginas também avisam daqui quando
// uma chamada falha por rede (marcaFalhaDeRede), e a barra só se dá por
// satisfeita depois de um teste que realmente responde.
// =====================================================================
import { navigate } from '../core/router.js';

let barra = null;
let offline = false;
let tmSonda = null;

function elemento() {
  if (barra) return barra;
  barra = document.createElement('div');
  barra.className = 'conexao-barra';
  barra.setAttribute('role', 'status');
  barra.setAttribute('aria-live', 'polite');
  document.body.appendChild(barra);
  return barra;
}

function pinta(texto, comBotao) {
  const el = elemento();
  el.replaceChildren();

  const ponto = document.createElement('span');
  ponto.className = 'conexao-pt';
  el.appendChild(ponto);

  const txt = document.createElement('span');
  txt.textContent = texto;
  el.appendChild(txt);

  if (comBotao) {
    const bt = document.createElement('button');
    bt.type = 'button';
    bt.textContent = 'Tentar agora';
    bt.addEventListener('click', () => sonda(true));
    el.appendChild(bt);
  }
  el.classList.add('on');
}

// Bate numa rota barata do Supabase só para saber se a rede sai daqui.
// HEAD na raiz do REST: não lê tabela, não gasta, não depende de permissão.
async function alcancaServidor() {
  const url = (window.__ENV && window.__ENV.SUPABASE_URL) || '';
  if (!url) return navigator.onLine;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    await fetch(url + '/rest/v1/', { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

async function sonda(manual) {
  if (!offline) return;
  const ok = await alcancaServidor();
  if (ok) {
    voltou();
    return;
  }
  if (manual) {
    pinta('Ainda sem conexão. O painel volta sozinho quando a internet voltar.', true);
    setTimeout(() => { if (offline) pinta(TEXTO_OFF, true); }, 2600);
  }
  agenda();
}

const TEXTO_OFF = 'Sem conexão. O que está na tela é de antes da queda.';

function agenda() {
  clearTimeout(tmSonda);
  tmSonda = setTimeout(() => sonda(false), 8000);
}

function voltou() {
  offline = false;
  clearTimeout(tmSonda);
  const el = elemento();
  el.classList.add('voltou');
  pinta('Conexão de volta. Atualizando a tela…', false);
  el.classList.add('on');
  setTimeout(() => {
    el.classList.remove('on', 'voltou');
    // Repete a rota atual para os dados na tela deixarem de ser os de antes.
    try {
      const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
      navigate(path);
    } catch { /* se falhar, a barra já saiu e a pessoa navega no braço */ }
  }, 1400);
}

function caiu() {
  if (offline) return;
  offline = true;
  pinta(TEXTO_OFF, true);
  agenda();
}

// Chamado pelas telas quando uma consulta falha por rede. É o sinal mais
// confiável que existe: alguma coisa tentou sair e não conseguiu.
export function marcaFalhaDeRede(e) {
  const m = String(e?.message || e || '');
  if (/Failed to fetch|NetworkError|ERR_INTERNET|ERR_NETWORK|timeout|timed out/i.test(m)) caiu();
}

export function iniciaAvisoDeConexao() {
  window.addEventListener('offline', caiu);
  window.addEventListener('online', () => sonda(true));
  // Voltar para a aba depois de horas com o notebook fechado é a hora mais
  // provável de a sessão estar velha e a rede, trocada.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && offline) sonda(true);
  });
  if (navigator.onLine === false) caiu();
}
