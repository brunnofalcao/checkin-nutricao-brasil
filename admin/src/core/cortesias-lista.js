// =====================================================================
// LISTA DE CORTESIAS — lê a planilha que o patrocinador preencheu
//
// Mora aqui, ao lado do leitor de planilha, porque é o mesmo assunto.
// A página pública do patrocinador importa deste caminho: são arquivos
// estáticos da mesma origem, e duplicar o código seria pior que o
// caminho esquisito.
//
// O que esta camada resolve, e por que cada coisa existe:
//
// 1. O modelo tem três linhas de instrução antes do cabeçalho. Elas são
//    necessárias — o patrocinador precisa ler que X consome cota. Então
//    o cabeçalho é PROCURADO, não presumido na primeira linha.
//
// 2. As colunas são casadas por NOME, não por posição. Patrocinador
//    reordena coluna, acrescenta "observação" no meio, apaga a que não
//    usou. Ler por posição quebraria em silêncio, trocando e-mail por
//    telefone.
//
// 3. Estado e profissão são normalizados contra a lista oficial do RD.
//    Mesmo com lista suspensa no modelo, sempre chega "SP", "sao paulo"
//    e "Distrito federal" — de quem copiou e colou de outra planilha.
//    Mandar valor fora da lista não dá erro no RD: o campo fica vazio.
// =====================================================================

export const ESTADOS = [
  'Acre (AC)', 'Alagoas (AL)', 'Amapá (AP)', 'Amazonas (AM)', 'Bahia (BA)', 'Ceará (CE)',
  'Distrito Federal (DF)', 'Espírito Santo (ES)', 'Goiás (GO)', 'Maranhão (MA)',
  'Mato Grosso (MT)', 'Mato Grosso do Sul (MS)', 'Minas Gerais (MG)', 'Pará (PA)',
  'Paraíba (PB)', 'Paraná (PR)', 'Pernambuco (PE)', 'Piauí (PI)', 'Rio de Janeiro (RJ)',
  'Rio Grande do Norte (RN)', 'Rio Grande do Sul (RS)', 'Rondônia (RO)', 'Roraima (RR)',
  'Santa Catarina (SC)', 'São Paulo (SP)', 'Sergipe (SE)', 'Tocantins (TO)'
];

export const FORMACOES = ['Nutrição', 'Medicina', 'Psicologia', 'Educação Física', 'Estudante', 'Outros'];

export const MODULOS = ['Plenária Principal', 'Nutrição Esportiva', 'NB Universitário'];

// "São Paulo (SP)" → "sao paulo sp". Serve para comparar o que a pessoa
// escreveu com o que o RD aceita, sem exigir acento nem parêntese.
function chave(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const POR_UF = new Map(ESTADOS.map((e) => [chave(/\(([A-Z]{2})\)/.exec(e)[1]), e]));
const POR_NOME = new Map(ESTADOS.map((e) => [chave(e.replace(/\s*\([A-Z]{2}\)$/, '')), e]));
const POR_INTEIRO = new Map(ESTADOS.map((e) => [chave(e), e]));

export function normalizaEstado(bruto) {
  const k = chave(bruto);
  if (!k) return null;
  return POR_INTEIRO.get(k) || POR_NOME.get(k) || POR_UF.get(k) || null;
}

const FORMACAO_MAP = new Map(FORMACOES.map((f) => [chave(f), f]));
// Sinônimos que aparecem sozinhos, sem ninguém pedir.
[
  ['nutricionista', 'Nutrição'], ['nutri', 'Nutrição'],
  ['medico', 'Medicina'], ['medica', 'Medicina'], ['med', 'Medicina'],
  ['psicologo', 'Psicologia'], ['psicologa', 'Psicologia'], ['psico', 'Psicologia'],
  ['educador fisico', 'Educação Física'], ['ed fisica', 'Educação Física'],
  ['personal', 'Educação Física'], ['profissional de educacao fisica', 'Educação Física'],
  ['estudante de nutricao', 'Estudante'], ['academico', 'Estudante'], ['aluno', 'Estudante'],
  ['outro', 'Outros'], ['outra', 'Outros']
].forEach(([k, v]) => FORMACAO_MAP.set(chave(k), v));

export function normalizaFormacao(bruto) {
  const k = chave(bruto);
  if (!k) return null;
  return FORMACAO_MAP.get(k) || null;
}

// Mesma regra do webhook da Hotmart: tudo vira 55DDDNÚMERO.
export function normalizaFone(bruto) {
  const d = String(bruto ?? '').replace(/\D+/g, '');
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return '55' + d;
  return d;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

// ── cabeçalho ────────────────────────────────────────────────────────
const SINONIMOS = {
  primeiro_nome: ['primeiro nome', 'nome', 'primeironome', 'first name'],
  ultimo_nome: ['ultimo nome', 'sobrenome', 'last name', 'ultimonome'],
  email: ['e mail', 'email', 'e-mail', 'mail'],
  celular: ['celular', 'whatsapp', 'telefone', 'fone', 'tel', 'whats'],
  estado: ['estado', 'estado e uf', 'uf', 'estado uf'],
  formacao: ['profissao', 'formacao', 'qual sua formacao', 'area', 'qual a sua formacao']
};

function qualColuna(titulo) {
  const k = chave(titulo);
  if (!k) return null;
  for (const [campo, nomes] of Object.entries(SINONIMOS)) {
    if (nomes.some((n) => chave(n) === k)) return campo;
  }
  const mod = MODULOS.find((m) => chave(m) === k);
  if (mod) return 'modulo:' + mod;
  return null;
}

// A linha de cabeçalho é a que reconhece pelo menos e-mail e um nome.
// Varre as 15 primeiras porque o modelo tem bloco de instrução em cima.
export function achaCabecalho(linhas) {
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const mapa = {};
    (linhas[i] || []).forEach((cel, col) => {
      const campo = qualColuna(cel);
      if (campo && mapa[campo] === undefined) mapa[campo] = col;
    });
    const temNome = mapa.primeiro_nome !== undefined || mapa.ultimo_nome !== undefined;
    if (mapa.email !== undefined && temNome) return { linha: i, mapa };
  }
  return null;
}

// ── leitura ──────────────────────────────────────────────────────────
// Devolve uma linha por PESSOA, com os módulos marcados e o que estiver
// errado. Quem chama decide o que fazer; esta camada não julga cota.
export function leLista(linhas) {
  const cab = achaCabecalho(linhas);
  if (!cab) {
    return {
      erro: 'Não achei o cabeçalho da planilha. Use o modelo — ele tem as colunas com os nomes certos.',
      pessoas: []
    };
  }

  const { mapa } = cab;
  const colsModulo = MODULOS
    .map((m) => ({ modulo: m, col: mapa['modulo:' + m] }))
    .filter((x) => x.col !== undefined);

  const vistosEmail = new Set();
  const vistosFone = new Set();
  const pessoas = [];

  for (let i = cab.linha + 1; i < linhas.length; i++) {
    const l = linhas[i] || [];
    const cel = (c) => (c === undefined ? '' : String(l[c] ?? '').trim());

    const primeiro = cel(mapa.primeiro_nome);
    const ultimo = cel(mapa.ultimo_nome);
    const email = cel(mapa.email).toLowerCase();
    const foneBruto = cel(mapa.celular);
    const estadoBruto = cel(mapa.estado);
    const formacaoBruta = cel(mapa.formacao);

    // Linha totalmente vazia é o fim natural da planilha, não um erro.
    const temAlgo = [primeiro, ultimo, email, foneBruto, estadoBruto, formacaoBruta].some(Boolean) ||
      colsModulo.some((c) => cel(c.col));
    if (!temAlgo) continue;

    const modulos = colsModulo
      .filter((c) => /^(x|sim|s|1|✓|✔)$/i.test(cel(c.col)))
      .map((c) => c.modulo);

    const fone = normalizaFone(foneBruto);
    const estado = normalizaEstado(estadoBruto);
    const formacao = normalizaFormacao(formacaoBruta);

    const problemas = [];
    const avisos = [];
    if (!primeiro && !ultimo) problemas.push('sem nome');
    if (!email) problemas.push('sem e-mail');
    else if (!EMAIL_RE.test(email)) problemas.push('e-mail inválido');
    if (!fone) problemas.push('sem celular');
    else if (fone.length < 12) problemas.push('celular incompleto');
    if (!modulos.length) problemas.push('nenhum módulo marcado');

    // Estado e profissão não impedem a inscrição — impedem a ficha
    // completa no RD. Vira aviso, não bloqueio: melhor a pessoa entrar no
    // evento sem o campo do que ficar de fora por causa de uma coluna.
    if (estadoBruto && !estado) avisos.push(`estado "${estadoBruto}" não está na lista`);
    else if (!estadoBruto) avisos.push('sem estado');
    if (formacaoBruta && !formacao) avisos.push(`profissão "${formacaoBruta}" não está na lista`);
    else if (!formacaoBruta) avisos.push('sem profissão');

    if (email && vistosEmail.has(email)) problemas.push('e-mail repetido na planilha');
    if (fone && vistosFone.has(fone)) problemas.push('celular repetido na planilha');
    if (email) vistosEmail.add(email);
    if (fone) vistosFone.add(fone);

    pessoas.push({
      linha: i + 1,                         // número que a pessoa vê no Excel
      primeiro_nome: primeiro,
      ultimo_nome: ultimo,
      nome: [primeiro, ultimo].filter(Boolean).join(' '),
      email,
      celular: fone,
      estado,
      estado_bruto: estadoBruto,
      formacao,
      formacao_bruta: formacaoBruta,
      modulos,
      custo: modulos.length,                // cortesias que esta linha consome
      problemas,
      avisos,
      ok: problemas.length === 0
    });
  }

  const validas = pessoas.filter((p) => p.ok);
  return {
    erro: null,
    colunasEncontradas: Object.keys(mapa),
    modulosNaPlanilha: colsModulo.map((c) => c.modulo),
    pessoas,
    total: pessoas.length,
    validas: validas.length,
    comProblema: pessoas.length - validas.length,
    custoTotal: validas.reduce((s, p) => s + p.custo, 0)
  };
}
