// =============================================================
// FILA OFFLINE DO CREDENCIAMENTO
//
// O problema: o app marcava ✓ e mostrava "check-in feito" ANTES de gravar
// no banco. Se a rede caísse — e o Wi-Fi de centro de convenções cai —, o
// operador via sucesso, a pessoa entrava, e o registro nunca chegava. O erro
// aparecia depois, num toast que já tinha rolado da tela.
//
// A regra aqui é a inversa: grava primeiro no aparelho, depois tenta a rede.
// Enquanto não confirmar, a pessoa fica marcada como PENDENTE na tela — não
// como feita. O operador vê a verdade, não uma promessa.
//
// Guardado em IndexedDB e não em localStorage porque localStorage é síncrono
// (trava a tela a cada gravação, com 579 pessoas na lista) e some com mais
// facilidade quando o navegador aperta espaço.
// =============================================================

const DB_NOME = "nb-credenciamento";
const DB_VERSAO = 1;
const LOJA = "fila";
const MAX_TENTATIVAS = 8;

let dbPromise = null;

function abreDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NOME, DB_VERSAO); }
    catch (e) { return reject(e); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOJA)) {
        const loja = db.createObjectStore(LOJA, { keyPath: "id" });
        loja.createIndex("participante", "participantId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(modo, fn) {
  return abreDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(LOJA, modo);
    const loja = t.objectStore(LOJA);
    let resultado;
    try { resultado = fn(loja); } catch (e) { return reject(e); }
    t.oncomplete = () => resolve(resultado?.result ?? resultado);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

// Se o IndexedDB não existir (navegador antigo, aba anônima travada), a fila
// cai para localStorage, e só em último caso para memória.
//
// O comentário do topo explica por que localStorage não serve como
// armazenamento PRINCIPAL: é síncrono e trava a tela gravando a lista inteira.
// Como plano B ele serve bem, porque aqui só entra check-in ainda não
// confirmado, que são poucos itens de cada vez. E ele sobrevive a fechar a
// aba, que é exatamente o que a memória não fazia: o operador via "salvo no
// aparelho" e não estava.
const CHAVE_RESPALDO = "nb-fila-respaldo";
const memoria = new Map();
let usandoMemoria = false;
let usandoLocal = false;

function leLocal() {
  try {
    const cru = localStorage.getItem(CHAVE_RESPALDO);
    const obj = cru ? JSON.parse(cru) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch { return null; }
}

function gravaLocal(obj) {
  try { localStorage.setItem(CHAVE_RESPALDO, JSON.stringify(obj)); return true; }
  catch { return false; }
}

// Chamado quando o IndexedDB falha. Escolhe o plano B e leva junto o que já
// estiver em memória, para a troca não perder leitura nenhuma.
function caiParaRespaldo() {
  if (usandoLocal || usandoMemoria) return;
  const atual = leLocal();
  if (atual !== null) {
    for (const [id, item] of memoria) atual[id] = item;
    if (gravaLocal(atual)) { usandoLocal = true; memoria.clear(); return; }
  }
  usandoMemoria = true;
}

async function guarda(item) {
  if (usandoLocal) {
    const obj = leLocal() || {};
    obj[item.id] = item;
    if (!gravaLocal(obj)) { usandoLocal = false; usandoMemoria = true; memoria.set(item.id, item); }
    return item;
  }
  if (usandoMemoria) { memoria.set(item.id, item); return item; }
  try { await tx("readwrite", (l) => l.put(item)); }
  catch {
    caiParaRespaldo();
    if (usandoLocal) { const o = leLocal() || {}; o[item.id] = item; gravaLocal(o); }
    else memoria.set(item.id, item);
  }
  return item;
}

async function remove(id) {
  if (usandoLocal) {
    const obj = leLocal() || {};
    delete obj[id];
    gravaLocal(obj);
    return;
  }
  if (usandoMemoria) { memoria.delete(id); return; }
  try { await tx("readwrite", (l) => l.delete(id)); }
  catch {
    caiParaRespaldo();
    if (usandoLocal) { const o = leLocal() || {}; delete o[id]; gravaLocal(o); }
    else memoria.delete(id);
  }
}

export async function listaFila() {
  if (usandoLocal) return Object.values(leLocal() || {});
  if (usandoMemoria) return [...memoria.values()];
  try {
    const itens = await tx("readonly", (l) => l.getAll());
    return itens || [];
  } catch {
    caiParaRespaldo();
    return usandoLocal ? Object.values(leLocal() || {}) : [...memoria.values()];
  }
}

// id estável por participante: dois toques na mesma pessoa não viram duas
// linhas na fila — o segundo substitui o primeiro. É o que evita a fila
// inchar quando alguém fica batendo no nome porque "não respondeu".
function idDe(participantId) { return "p:" + participantId; }

// ─────────────────────────────────────────────────────────────
// API usada pelo app
// ─────────────────────────────────────────────────────────────

// Enfileira uma mudança de check-in. Devolve o item para a tela marcar
// como pendente na hora.
export async function enfileira({ participantId, eventId, checked, userId }) {
  const item = {
    id: idDe(participantId),
    participantId,
    eventId,
    checked,
    userId: userId || null,
    checkedAt: checked ? new Date().toISOString() : null,
    criadoEm: Date.now(),
    tentativas: 0,
    erro: null
  };
  await guarda(item);
  return item;
}

export async function pendentes() {
  const f = await listaFila();
  return f.filter((i) => !i.enviado);
}

export async function temPendentes() {
  return (await pendentes()).length > 0;
}

export function estaOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

// Sobe a fila inteira. Devolve o que aconteceu, para a tela avisar.
// `enviar` é injetado pelo app (recebe o item, devolve {error}) para esta
// camada não conhecer o Supabase — e para dar pra testar sem rede.
export async function sincroniza(enviar, aoMudar) {
  // Item que já desistiu está esperando decisão humana. Continuar tentando
  // só queima bateria e infla o contador de tentativas para sempre.
  const fila = (await pendentes()).filter((i) => !i.desistiu);
  if (!fila.length) return { enviados: 0, falhas: 0, restantes: 0 };

  let enviados = 0, falhas = 0;

  for (const item of fila) {
    if (!estaOnline()) break;
    let erro = null;
    try {
      const r = await enviar(item);
      erro = r?.error || null;
    } catch (e) {
      erro = e;
    }

    if (!erro) {
      await remove(item.id);
      enviados++;
      aoMudar?.({ tipo: "enviado", item });
      continue;
    }

    falhas++;
    item.tentativas = (item.tentativas || 0) + 1;
    item.erro = String(erro?.message || erro);

    // Erro de dado (registro sumiu, permissão) não melhora tentando de novo.
    // Erro de rede melhora. Só o segundo continua na fila.
    const permanente = ehErroPermanente(erro) || item.tentativas >= MAX_TENTATIVAS;
    if (permanente) {
      item.enviado = false;
      item.desistiu = true;
      await guarda(item);
      aoMudar?.({ tipo: "desistiu", item });
    } else {
      await guarda(item);
      aoMudar?.({ tipo: "adiado", item });
    }
  }

  const restantes = (await pendentes()).filter((i) => !i.desistiu).length;
  return { enviados, falhas, restantes };
}

function ehErroPermanente(erro) {
  const cod = String(erro?.code || "");
  const msg = String(erro?.message || erro || "").toLowerCase();
  if (/^(22|23|42)/.test(cod)) return true;                 // dado ou permissão
  if (msg.includes("row-level security")) return true;
  if (msg.includes("violates")) return true;
  if (msg.includes("jwt") || msg.includes("not authenticated")) return true;
  return false;
}

// Itens que desistiram precisam de decisão humana; some da contagem de
// "pendentes" mas não some da tela.
export async function travados() {
  return (await pendentes()).filter((i) => i.desistiu);
}

export async function limpaTravado(id) { await remove(id); }

export async function reenfileira(id) {
  const f = await listaFila();
  const item = f.find((i) => i.id === id);
  if (!item) return null;
  item.desistiu = false;
  item.tentativas = 0;
  item.erro = null;
  await guarda(item);
  return item;
}

// Só para teste.
export async function _limpaTudo() {
  const f = await listaFila();
  for (const i of f) await remove(i.id);
  memoria.clear();
  try { localStorage.removeItem(CHAVE_RESPALDO); } catch {}
}
export function _forcaMemoria(v) { usandoMemoria = !!v; if (v) usandoLocal = false; }
export function _forcaLocal(v) { usandoLocal = !!v; if (v) usandoMemoria = false; }
export function _ondeEstou() {
  return usandoLocal ? "localStorage" : usandoMemoria ? "memoria" : "indexeddb";
}
