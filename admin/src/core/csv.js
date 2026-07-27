// =====================================================================
// CSV · leitor de planilha
//
// Não usa biblioteca. Precisa aguentar o que sai de verdade das
// ferramentas: campo entre aspas com vírgula dentro ("Silva, João"),
// aspas escapadas (""), quebra de linha dentro do campo, BOM do Excel
// e separador que muda conforme quem exportou (RD manda ponto-e-vírgula,
// Google Sheets manda vírgula, colagem direta manda TAB).
// =====================================================================

// Olha só a primeira linha com conteúdo — é onde o cabeçalho está.
export function detectaSeparador(texto) {
  const linha = String(texto || '').replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim()) || '';
  const conta = (c) => linha.split(c).length - 1;
  const tab = conta('\t');
  const pv = conta(';');
  const vg = conta(',');
  if (tab > 0 && tab >= pv && tab >= vg) return '\t';
  if (pv > 0 && pv >= vg) return ';';
  if (vg > 0) return ',';
  return ';';
}

export function parseCSV(texto, sep) {
  const t = String(texto || '').replace(/^﻿/, '');
  const s = sep || detectaSeparador(t);
  const linhas = [];
  let campo = '';
  let linha = [];
  let aspas = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; }   // "" vira "
        else aspas = false;
      } else campo += c;
    } else if (c === '"') {
      aspas = true;
    } else if (c === s) {
      linha.push(campo); campo = '';
    } else if (c === '\n') {
      linha.push(campo); campo = '';
      linhas.push(linha); linha = [];
    } else if (c !== '\r') {
      campo += c;
    }
  }
  linha.push(campo);
  linhas.push(linha);

  return linhas
    .map((l) => l.map((c) => c.trim()))
    .filter((l) => l.some((c) => c !== ''));
}

// ── Reconhecimento de coluna ────────────────────────────────────────────────
// A ordem importa: 'nome da empresa' não pode cair em `name`, por isso
// os padrões de nome exigem começo de campo e evitam palavras de empresa.
const PADROES = [
  ['email', /^(e-?mail|email|correio|e_mail)$/i],
  ['phone', /(whats|telefone|celular|^tel$|^fone$|phone|mobile)/i],
  ['code', /^(c[óo]digo|code|inscri[çc][ãa]o|ticket|pedido|matr[íi]cula|id)$/i],
  ['lote', /^(lote|ingresso|categoria|tipo de ingresso|produto|turma|plano)$/i],
  ['notes', /^(obs|observa[çc][ãa]o|observa[çc][õo]es|nota|coment[áa]rio)$/i],
  ['name', /^(nome completo|nome|name|full ?name|participante|aluno|contato)$/i]
];

export function adivinhaColuna(titulo) {
  const t = String(titulo || '').trim();
  if (!t) return '';
  for (const [campo, re] of PADROES) if (re.test(t)) return campo;
  // Segunda passada, mais frouxa, só para nome — pega "Nome do participante".
  if (/nome|name/i.test(t) && !/empresa|company|arquivo|evento|usu[áa]rio/i.test(t)) return 'name';
  return '';
}

// Cabeçalho de verdade tem pelo menos duas colunas reconhecíveis e
// nenhuma delas parece um dado (e-mail com @, telefone só com dígitos).
export function pareceCabecalho(primeira) {
  if (!primeira || primeira.length < 2) return false;
  const reconhecidas = primeira.filter((c) => adivinhaColuna(c)).length;
  const parecemDados = primeira.filter(
    (c) => c.includes('@') || /^\+?[\d\s()-]{8,}$/.test(c)
  ).length;
  return reconhecidas >= 2 && parecemDados === 0;
}
