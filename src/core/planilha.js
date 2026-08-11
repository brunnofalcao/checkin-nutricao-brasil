// =====================================================================
// LEITOR DE PLANILHA — CSV, TSV, TXT e XLSX
//
// O comercial trabalha em Excel e Google Sheets. Exigir "salve como CSV"
// antes de subir é onde a maioria das importações morre: a pessoa erra o
// separador, o Excel salva com ponto-e-vírgula na máquina dela e vírgula
// na de outro, e o arquivo chega quebrado.
//
// Então aqui a gente lê o que vier — inclusive .xlsx direto, sem passar
// pelo "salvar como". O XLSX é lido na unha (zip + XML) de propósito:
// nenhuma biblioteca externa, nenhum CDN. No dia do evento, num wi-fi de
// hotel, um import() que não baixa é uma tela travada sem explicação.
//
// Devolve sempre a mesma coisa: array de linhas, cada linha um array de
// células de texto já limpas. Quem chama não precisa saber a origem.
// =====================================================================

const ZIP = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"

// ── porta de entrada ─────────────────────────────────────────────────
export async function leArquivo(file) {
  const buf = await file.arrayBuffer();
  const b = new Uint8Array(buf);
  const ehZip = ZIP.every((v, i) => b[i] === v);

  // .xls antigo (BIFF) começa com D0 CF 11 E0 — não é zip e não é texto.
  // Melhor dizer o que fazer do que despejar caracteres estranhos na tela.
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) {
    throw new Error(
      'Esse arquivo é .xls antigo. Abra no Excel e salve como .xlsx ou .csv.'
    );
  }

  const linhas = ehZip ? await leXlsx(buf) : leTexto(b);
  return limpa(linhas);
}

// Célula pode vir com quebra de linha, tab ou espaço duplo de dentro do
// Excel. Tudo isso vira um espaço só: o resto do sistema junta as células
// com TAB e uma quebra de linha no meio partiria a empresa em duas.
function limpa(linhas) {
  return linhas
    .map((l) => l.map((c) => String(c ?? '').replace(/[\t\r\n]+/g, ' ').trim()))
    .filter((l) => l.some((c) => c !== ''));
}

// ── texto: CSV / TSV / delimitado ────────────────────────────────────
export function leTexto(bytes) {
  let txt = new TextDecoder('utf-8').decode(bytes);
  // BOM do Excel. Sem tirar, a primeira coluna do cabeçalho nunca casa.
  if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
  // Arquivo salvo em Latin-1 vira "" no UTF-8. Nesse caso, relê como
  // windows-1252 — é o que o Excel do Windows entrega por padrão.
  if (txt.includes('�')) {
    try {
      txt = new TextDecoder('windows-1252').decode(bytes);
    } catch { /* fica com o UTF-8 mesmo */ }
  }
  return parseDelimitado(txt, detectaSeparador(txt));
}

// Conta ocorrências fora de aspas na primeira linha útil. TAB primeiro
// (colagem de planilha), depois ponto-e-vírgula (Excel pt-BR), depois
// vírgula. Nome de empresa tem vírgula com frequência — só ganha se for
// claramente o separador.
export function detectaSeparador(txt) {
  const linha = txt.split(/\r?\n/).find((l) => l.trim()) || '';
  const fora = (ch) => {
    let n = 0, aspas = false;
    for (const c of linha) {
      if (c === '"') aspas = !aspas;
      else if (c === ch && !aspas) n++;
    }
    return n;
  };
  const tab = fora('\t');
  if (tab) return '\t';
  const pv = fora(';');
  const vg = fora(',');
  if (pv >= vg && pv) return ';';
  if (vg) return ',';
  return ';';
}

// RFC 4180: aspas protegem o separador, "" é uma aspa literal.
export function parseDelimitado(txt, sep) {
  const linhas = [];
  let linha = [];
  let campo = '';
  let aspas = false;

  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) {
      if (c === '"') {
        if (txt[i + 1] === '"') { campo += '"'; i++; }
        else aspas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { aspas = true; continue; }
    if (c === sep) { linha.push(campo); campo = ''; continue; }
    if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

// ── xlsx ─────────────────────────────────────────────────────────────
async function leXlsx(buf) {
  const zip = abreZip(buf);
  const compartilhadas = parseSharedStrings(await zip.texto('xl/sharedStrings.xml'));

  // Ordem de tentativa: a aba que a pessoa vê ao abrir o arquivo, depois
  // as outras. Planilha com uma aba de instruções na frente é comum — se a
  // primeira não tem nada, seguir adiante é mais útil que dar erro.
  for (const nome of await abasEmOrdem(zip)) {
    const xml = await zip.texto(nome);
    if (!xml) continue;
    const linhas = parseFolha(xml, compartilhadas);
    if (linhas.some((l) => l.some((c) => String(c).trim()))) return linhas;
  }
  throw new Error('Não achei nenhuma aba com dados nesse arquivo.');
}

// A ordem real das abas está no workbook.xml; o caminho de cada uma, no
// arquivo de rels. Se essa trilha quebrar, cai na ordem dos sheetN.xml —
// que é a mesma coisa na esmagadora maioria dos arquivos.
async function abasEmOrdem(zip) {
  const todas = zip.lista().filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
  try {
    const wb = await zip.texto('xl/workbook.xml');
    const rels = await zip.texto('xl/_rels/workbook.xml.rels');
    if (wb && rels) {
      const ordem = [];
      const re = /<sheet\b[^>]*\br:id="([^"]+)"/g;
      let m;
      while ((m = re.exec(wb))) {
        const alvo = new RegExp(
          `<Relationship\\b[^>]*\\bId="${m[1]}"[^>]*\\bTarget="([^"]+)"`
        ).exec(rels)?.[1];
        if (!alvo) continue;
        const cam = 'xl/' + alvo.replace(/^\//, '').replace(/^xl\//, '');
        if (zip.tem(cam)) ordem.push(cam);
      }
      if (ordem.length) return [...ordem, ...todas.filter((n) => !ordem.includes(n))];
    }
  } catch { /* cai na ordem dos arquivos */ }
  return todas;
}

// ── zip: só o que precisamos para ler um xlsx ────────────────────────
function abreZip(buf) {
  const dv = new DataView(buf);
  const b = new Uint8Array(buf);

  // O fim do diretório central fica nos últimos 22 bytes + comentário
  // (máx. 65535). Varre de trás para frente atrás da assinatura.
  let eocd = -1;
  const min = Math.max(0, b.length - 65557);
  for (let i = b.length - 22; i >= min; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Arquivo .xlsx corrompido — o Excel não terminou de salvar?');

  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);

  const entradas = new Map();
  for (let k = 0; k < total; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true);
    const compBytes = dv.getUint32(p + 20, true);
    const bruto = dv.getUint32(p + 24, true);
    const nLen = dv.getUint16(p + 28, true);
    const eLen = dv.getUint16(p + 30, true);
    const cLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nome = new TextDecoder('utf-8').decode(b.subarray(p + 46, p + 46 + nLen));
    entradas.set(nome, { metodo, compBytes, bruto, local });
    p += 46 + nLen + eLen + cLen;
  }

  function dados(nome) {
    const e = entradas.get(nome);
    if (!e) return null;
    // O cabeçalho local repete nome e extra com tamanhos próprios — os do
    // diretório central não servem para calcular onde os bytes começam.
    const nLen = dv.getUint16(e.local + 26, true);
    const eLen = dv.getUint16(e.local + 28, true);
    const ini = e.local + 30 + nLen + eLen;
    return { metodo: e.metodo, bytes: b.subarray(ini, ini + e.compBytes) };
  }

  return {
    tem: (n) => entradas.has(n),
    lista: () => [...entradas.keys()],
    async texto(nome) {
      const d = dados(nome);
      if (!d) return '';
      if (d.metodo === 0) return new TextDecoder('utf-8').decode(d.bytes);
      if (d.metodo !== 8) throw new Error('Compressão do .xlsx não suportada. Salve como .csv.');
      return await inflaRaw(d.bytes);
    }
  };
}

async function inflaRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador não abre .xlsx. Salve a planilha como .csv.');
  }
  // Uint8Array é uma view do buffer inteiro — enfileirar sem copiar mandaria
  // o arquivo todo para o inflate.
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(bytes.slice());
  w.close();
  return await new Response(ds.readable).text();
}

// ── XML da planilha ──────────────────────────────────────────────────
function decodeEnt(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Uma <si> pode vir partida em vários <t> (texto com formatação no meio).
// Concatenar é o certo: "Prana" + " Bebidas" é um nome só.
export function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const si = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = si.exec(xml))) {
    let txt = '';
    const t = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let n;
    while ((n = t.exec(m[1]))) txt += decodeEnt(n[1]);
    out.push(txt);
  }
  return out;
}

function colunaDe(ref) {
  const letras = /^([A-Z]+)/.exec(String(ref).toUpperCase())?.[1];
  if (!letras) return -1;
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

// Célula vazia não vira <c> no arquivo. Sem respeitar o r="C4", uma coluna
// de estande em branco empurraria a cota para o lugar dela.
export function parseFolha(xml, compartilhadas) {
  const linhas = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let r;
  while ((r = rowRe.exec(xml))) {
    const celulas = [];
    const cRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c;
    let auto = 0;
    while ((c = cRe.exec(r[1]))) {
      const attrs = c[1] || '';
      const dentro = c[2] || '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const idx = ref ? colunaDe(ref) : auto;
      auto = idx + 1;
      const tipo = /\bt="([^"]+)"/.exec(attrs)?.[1] || 'n';

      let valor = '';
      if (tipo === 's') {
        const i = parseInt(/<v>([\s\S]*?)<\/v>/.exec(dentro)?.[1] ?? '', 10);
        valor = Number.isFinite(i) ? (compartilhadas[i] ?? '') : '';
      } else if (tipo === 'inlineStr') {
        const t = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let n;
        while ((n = t.exec(dentro))) valor += decodeEnt(n[1]);
      } else {
        valor = decodeEnt(/<v>([\s\S]*?)<\/v>/.exec(dentro)?.[1] ?? '');
      }
      while (celulas.length < idx) celulas.push('');
      celulas[idx] = valor;
    }
    linhas.push(celulas);
  }
  return linhas;
}

// ── utilitário para quem só quer texto colável ───────────────────────
export function paraTexto(linhas) {
  return linhas.map((l) => l.join('\t')).join('\n');
}
