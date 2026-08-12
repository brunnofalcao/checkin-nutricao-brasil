// STUB DE QA — ignorado pelo git, nunca vai para produção.
const EVENTOS = [
  { id: 'ev-bsb', name: 'Nutrição Brasil – Brasília', city: 'Brasília', event_type: 'congress', status: 'embreve', date_start: '2026-08-27T12:00:00Z', event_date: '2026-08-27', event_end_date: '2026-08-29', venue: 'Centro de Convenções Ulysses Guimarães', parent_event_id: null, total_inscritos: 528, total_checkins: 0 },
  { id: 'ev-bh', name: 'Nutrição Brasil – Belo Horizonte', city: 'Belo Horizonte', event_type: 'congress', status: 'encerrado', date_start: '2026-05-16T12:00:00Z', event_date: '2026-05-16', venue: 'Auditório Supernova', parent_event_id: null, total_inscritos: 222, total_checkins: 174 },
  { id: 'ev-bel', name: 'Nutrição Brasil – Belém', city: 'Belém', event_type: 'congress', status: 'embreve', date_start: '2026-09-19T12:00:00Z', event_date: '2026-09-19', venue: 'Hotel Sagres', parent_event_id: null, total_inscritos: 37, total_checkins: 0 },
  { id: 'ev-run', name: 'NB Run 2026', city: 'Brasília', event_type: 'race', status: 'ativo', date_start: null, event_date: '2026-08-30', venue: 'Largada: Praça do Buriti', parent_event_id: 'ev-bsb', total_inscritos: 283, total_checkins: 0 },
  { id: 'ev-expo', name: 'Expositores – Brasília', city: 'Brasília', event_type: 'exhibitor', status: 'ativo', date_start: null, event_date: '2026-08-27', venue: 'Ulysses', parent_event_id: 'ev-bsb', total_inscritos: 0, total_checkins: 0 },
  { id: 'ev-vis', name: 'Visitantes – Brasília', city: 'Brasília', event_type: 'visitor', status: 'embreve', date_start: null, event_date: '2026-08-27', venue: 'Ulysses', parent_event_id: 'ev-bsb', total_inscritos: 0, total_checkins: 0 }
];

// Quem está "logado" na QA. Sem parâmetro, é o admin de sempre.
function quemSou() {
  const papel = new URLSearchParams(location.search).get('papel');
  if (papel === 'expositores') return { id: 'u4', email: 'yasmin@scienceplay.com' };
  if (papel === 'operadora') return { id: 'u2', email: 'contato@scienceplay.com' };
  return { id: 'u1', email: 'jaqueline@scienceplay.com' };
}

function p(id, event_id, name, email, phone, extra = {}) {
  return {
    id, event_id, name, email, phone,
    code: null, lote: null, checked: false, checked_at: null,
    source: 'hotmart', created_at: '2026-07-0' + (1 + (id.length % 8)) + 'T10:00:00Z',
    cert_token: null, notes: null, tags: [], ...extra
  };
}

let INSCRICOES = [
  p('p1', 'ev-bsb', 'Ana Paula Gonçalves', 'ana@exemplo.com', '5561999990001', { lote: 'Lote 2', checked: true, checked_at: '2026-07-20T12:00:00Z', cert_token: 'tok-ana-0000000000', created_at: '2026-07-20T10:00:00Z' }),
  p('p2', 'ev-bh', 'Ana Paula Gonçalves', 'ana@exemplo.com', '5561999990001', { lote: 'Lote 1', checked: true, checked_at: '2026-05-16T12:00:00Z', created_at: '2026-04-02T10:00:00Z' }),
  p('p3', 'ev-run', 'Ana Paula Gonçalves', 'ana@exemplo.com', '5561999990001', { source: 'ticketsports', created_at: '2026-07-01T10:00:00Z' }),
  p('p4', 'ev-bsb', 'João Márcio Sá', 'joao.sa@exemplo.com', '5531988880002', { lote: 'Lote 2', cert_token: 'tok-joao-000000000', created_at: '2026-07-19T10:00:00Z' }),
  p('p5', 'ev-bsb', 'Beatriz Kühn', 'bia@exemplo.com', '5551977770003', { lote: 'Lote 3', created_at: '2026-07-18T10:00:00Z' }),
  p('p6', 'ev-run', 'Carlos Eduardo Lima', null, '5562966660004', { source: 'ticketsports', created_at: '2026-07-17T10:00:00Z' }),
  p('p7', 'ev-expo', 'Yasmin Torres', 'yasmin@marca.com', '5511955550005', { source: 'manual', created_at: '2026-07-16T10:00:00Z' }),
  p('p8', 'ev-bh', 'Sem Contato Nenhum', null, null, { source: 'manual', created_at: '2026-07-15T10:00:00Z' }),
  p('p9', 'ev-bsb', 'Inscrito Sem Contato', null, null, { source: 'manual', created_at: '2026-07-14T10:00:00Z' }),
  p('p10', 'ev-bsb', '<img src=x onerror=alert(1)>Injeção', 'xss@exemplo.com', '5511900000010', { code: 'NB26-XSS', lote: 'Lote 2' }),
  p('p11', 'ev-bsb', 'Madonna', 'madonna@exemplo.com', '5511900000011', { code: 'NB26-MAD' }),
  p('p12', 'ev-bsb', 'Maria Fernanda Albuquerque Vasconcellos dos Santos Neto', 'mf@exemplo.com', '5511900000012', { code: 'NB26-LONGO', lote: 'Lote 1 · Estudante' })
];

let AI_KB = [
  { id: 1, topic: 'evento_brasilia', title: 'Evento principal — Brasília 2026', content: 'Nutrição Brasil 2026, 27 a 29 de agosto, Centro de Convenções Ulysses Guimarães.', active: true, updated_at: '2026-07-23T17:04:48Z' },
  { id: 3, topic: 'modulos_ingressos', title: 'Módulos e ingressos', content: 'Cinco módulos à venda. Plenária R$497. Golden Experience R$1.997.', active: true, updated_at: '2026-07-28T13:32:37Z' },
  { id: 7, topic: 'regionais', title: 'Edições regionais 2026', content: 'Belém 19/09 Hotel Sagres. Goiânia 07/11. Porto Alegre 14/11.', active: true, updated_at: '2026-07-28T13:26:21Z' },
  { id: 16, topic: 'belem', title: 'Belém 2026 — 19/09, Hotel Sagres', content: 'Imersão de 12 horas, 09h às 21h, oito palestrantes confirmados.', active: true, updated_at: '2026-07-28T13:26:21Z' },
  { id: 99, topic: 'topico_desativado', title: 'Assunto encerrado', content: 'Texto antigo que não deve mais ser usado.', active: false, updated_at: '2026-06-01T10:00:00Z' }
];
const KB_SOURCES = [
  { id: 2, url: 'https://www.nutricaobrasil.com.br/ingressos', label: 'Ingressos e lotes', priority: 'critica', active: true, kb_topic: 'modulos_ingressos', sync_auto: true, last_checked: '2026-07-28T13:31:00Z', last_changed: '2026-07-28T13:30:50Z' },
  { id: 9, url: 'https://www.nutricaobrasil.com.br/cidades', label: 'Cidades (regionais)', priority: 'media', active: true, kb_topic: 'regionais', sync_auto: true, last_checked: '2026-07-28T13:31:00Z', last_changed: '2026-07-27T10:00:04Z' },
  { id: 1, url: 'https://www.nutricaobrasil.com.br/', label: 'Home', priority: 'alta', active: true, kb_topic: null, sync_auto: false, last_checked: '2026-07-28T13:30:34Z', last_changed: '2026-07-28T13:30:34Z' }
];
let KB_CHANGELOG = [
  { id: 12, source_id: 2, url: 'https://www.nutricaobrasil.com.br/ingressos', topic: 'modulos_ingressos', change_kind: 'conteudo', applied: true, reviewed: true, reverted_at: null, detected_at: '2026-07-28T13:30:50Z', applied_at: '2026-07-28T13:32:37Z', old_len: 2589, new_len: 2996, old_content: 'Quatro módulos à venda.', new_content: 'Cinco módulos à venda. Golden Experience R$1.997.', resumo: 'Adicionado o módulo Golden Experience (R$1.997).', note: 'Ingressos mudou e o tópico foi atualizado.' },
  { id: 18, source_id: 9, url: 'https://www.nutricaobrasil.com.br/cidades', topic: 'regionais', change_kind: 'conteudo', applied: false, reviewed: false, reverted_at: null, detected_at: '2026-07-28T13:31:20Z', applied_at: null, old_len: 1502, new_len: 1610, old_content: 'Belém 19/09. Goiânia 07/11. Porto Alegre 14/11.', new_content: 'Belém 19/09 Hotel Sagres, ingressos abertos. Goiânia 07/11 Castro\'s Hotel. Porto Alegre 14/11 Deville Prime.', resumo: 'Belém passou de "em breve" para "ingressos abertos".', note: 'Proposta aguardando aprovação.' },
  { id: 10, source_id: 1, url: 'https://www.nutricaobrasil.com.br/', topic: null, change_kind: 'conteudo', applied: false, reviewed: false, reverted_at: null, detected_at: '2026-07-28T13:30:34Z', applied_at: null, old_len: 4028, new_len: 4027, old_content: null, new_content: null, resumo: null, note: 'Alteração em "Home" (alta). Página sem tópico mapeado — revisar à mão.' }
];
const AI_SETTINGS = [{ key: 'kb_sync_modo', value: 'auto' }];

const FILA_ATENDIMENTO = [
  { id: 11, phone: '5521995394892', status: 'human', escal_motivo: 'reclamacao', escalated_at: '2026-07-26T15:44:00Z', last_msg_at: '2026-07-26T15:44:00Z', horas_esperando: 313, ultima_pergunta: 'Meu vôo de volta é dia 30 de manhã. Vocês alteraram a data da corrida. E eu que tive que mudar meus planos.', ultima_em: '2026-07-26T15:44:00Z', nome: 'Wanessa Ribeiro', total_mensagens: 4 },
  { id: 12, phone: '556184856612', status: 'human', escal_motivo: 'pagamento', escalated_at: '2026-07-25T00:25:00Z', last_msg_at: '2026-07-25T00:25:00Z', horas_esperando: 290, ultima_pergunta: 'Ninguém me respondeu sobre isso', ultima_em: '2026-07-25T00:25:00Z', nome: null, total_mensagens: 5 },
  { id: 13, phone: '556181079675', status: 'human', escal_motivo: 'titularidade', escalated_at: '2026-07-27T15:58:00Z', last_msg_at: '2026-07-27T15:58:00Z', horas_esperando: 260, ultima_pergunta: 'Esse NB universitário é palestra online ou presencial?', ultima_em: '2026-07-27T15:58:00Z', nome: 'Fabiola Andrade', total_mensagens: 6 },
  { id: 14, phone: '558792436528', status: 'human', escal_motivo: 'imprensa', escalated_at: '2026-08-05T12:00:00Z', last_msg_at: '2026-08-05T12:00:00Z', horas_esperando: 6, ultima_pergunta: 'É possível submeter um trabalho em banner no evento?', ultima_em: '2026-08-05T12:00:00Z', nome: null, total_mensagens: 2 }
];
const AI_MESSAGES = [
  { conversation_id: 11, role: 'user', content: 'Gente, mas eu tinha comprado a corrida e disseram que cancelaram', created_at: '2026-07-25T00:06:48Z' },
  { conversation_id: 11, role: 'assistant', content: 'Wanessa, que situação chata! Você comprou a inscrição da NB Run e recebeu comunicado de cancelamento?', created_at: '2026-07-25T00:06:53Z' },
  { conversation_id: 11, role: 'user', content: 'Meu vôo de volta é dia 30 de manhã. Vocês alteraram a data da corrida.', created_at: '2026-07-26T15:44:46Z' },
  { conversation_id: 11, role: 'user', content: 'Muito chateada com isso.', created_at: '2026-07-26T15:44:55Z' }
];

const CERT_MODULOS = [
  { id: 'm1', event_id: 'ev-bsb', chave: 'Plenária Principal', nome: 'Plenária Principal', ordem: 1, horas: 20 },
  { id: 'm2', event_id: 'ev-bsb', chave: 'Nutrição Esportiva', nome: 'Nutrição Esportiva', ordem: 2, horas: 8 },
  { id: 'm3', event_id: 'ev-bsb', chave: 'NB Universitário',   nome: 'NB Universitário',   ordem: 3, horas: 8 },
  { id: 'm4', event_id: 'ev-bsb', chave: 'MedBrasil',          nome: 'MedBrasil',          ordem: 4, horas: 8 },
  { id: 'm5', event_id: 'ev-bsb', chave: 'Golden Experience',  nome: 'Golden Experience',  ordem: 5, horas: 20 }
];

// Distribuição real de Brasília em 05/08/2026, para a faixa de módulos ser
// conferida contra número de verdade e não contra fixture inventada.
const LOTES_BSB = [
  ['Pré-Venda — Plenária Principal', 247], ['Plenária Principal', 225],
  ['Pré-Venda — Nutrição Esportiva', 36],  ['NB Universitário', 32],
  ['Nutrição Esportiva', 31],              ['MedBrasil', 2]
];
let seq = 0;
for (const [lote, n] of LOTES_BSB) {
  for (let i = 0; i < n; i++) {
    seq++;
    INSCRICOES.push(p('bsb' + seq, 'ev-bsb', 'Inscrito ' + seq, 'i' + seq + '@exemplo.com',
      '55619' + String(10000000 + seq), { lote }));
  }
}
// Belém com o código de oferta da Hotmart vazando no lugar do nome do lote
for (const [lote, n] of [['Pré-Venda', 19], ['kv5pzf60', 10], ['Premium', 8], ['1º Lote', 3]]) {
  for (let i = 0; i < n; i++) {
    seq++;
    INSCRICOES.push(p('bel' + seq, 'ev-bel', 'Belém ' + seq, 'b' + seq + '@exemplo.com',
      '55919' + String(10000000 + seq), { lote }));
  }
}

const RACE_PROFILES = [
  { participant_id: 'p3', bib_number: '1042', distance: '10K', shirt_size: 'M' },
  { participant_id: 'p6', bib_number: '0777', distance: '5K', shirt_size: 'GG' }
];
const EXHIBITOR_MEMBERS = [
  { participant_id: 'p7', exhibitors: { empresa: 'Nestlé Nutrition & Health', estande: '12' } }
];
// Um membro do jeito que o PostgREST devolve: o participante embutido pela
// FK do dono do crachá, e quem retirou como texto solto.
const mem = (id, nome, cargo, extra = {}) => ({
  id, cargo, pode_retirar: false, retirado_em: null, retirado_por_nome: null,
  participants: {
    id: 'pm-' + id, name: nome, phone: '5561988' + id.slice(-6),
    email: id + '@exemplo.com', code: id.slice(-4).toUpperCase(),
    checked: !!extra.retirado_em
  },
  ...extra
});

let EXHIBITORS = [
  // Preenchida, com equipe e um crachá já retirado por outra pessoa —
  // é o caso que o CAEX precisa mostrar direito.
  { id: 'x1', event_id: 'ev-expo', codigo: 'NBAAA11', token: 't1', empresa: 'Nestlé Nutrition & Health', estande: '12', cota: 'Diamante', limite_credenciais: 8, status: 'preenchido', resp_nome: 'Brunno', resp_whatsapp: '5561999990000', cad_nome: 'Yasmin', preenchido_em: '2026-07-10T10:00:00Z',
    cortesias_total: 20, cortesias_codigo: 'NESTLE20', cortesias_pausado: false, cortesias_prazo: '2026-08-26',
    cortesias_uso: [{ id: 1 }, { id: 2 }, { id: 3 }],
    exhibitor_members: [
      mem('m100001', 'Yasmin Moura', 'Gerente de Marketing', { pode_retirar: true }),
      mem('m100002', 'Caio Bertolini', 'Nutricionista', { retirado_em: '2026-08-27T09:12:00Z', retirado_por_nome: 'Yasmin Moura' }),
      mem('m100003', 'Renata Prado', 'Promotora')
    ] },
  { id: 'x2', event_id: 'ev-expo', codigo: 'NBBBB22', token: 't2', empresa: 'Rousselot', estande: '07', cota: 'Ouro', limite_credenciais: 5, status: 'convidado', resp_nome: null, resp_whatsapp: null, cad_nome: null, preenchido_em: null,
    cortesias_total: 0, cortesias_codigo: null, cortesias_pausado: false, cortesias_prazo: null, cortesias_uso: [],
    exhibitor_members: [] },
  // Acima do limite: 4 pessoas para 3 credenciais. Existe para a tela ter
  // que mostrar o estouro em vez de esconder.
  { id: 'x3', event_id: 'ev-expo', codigo: 'NBCCC33', token: 't3', empresa: 'Prana Bebidas Leves', estande: '22', cota: 'Prata', limite_credenciais: 3, status: 'preenchido', resp_nome: 'Marina', resp_whatsapp: '5561988887777', cad_nome: 'Marina', preenchido_em: '2026-07-22T14:00:00Z',
    cortesias_total: 10, cortesias_codigo: 'PRANA10', cortesias_pausado: true, cortesias_prazo: '2026-08-26',
    cortesias_uso: [{ id: 4 }],
    exhibitor_members: [
      mem('m300001', 'Marina Lopes', 'Fundadora', { pode_retirar: true }),
      mem('m300002', 'Pedro Sales', 'Comercial'),
      mem('m300003', 'Bia Tavares', 'Atendimento'),
      mem('m300004', 'Léo Andrade', 'Apoio')
    ] }
];
const CORTESIAS_USO = [
  { id: 1, exhibitor_id: 'x1', nome: 'Camila Reis', email: 'camila@exemplo.com', modulo: 'Plenária Principal', origem: 'convidado', criado_em: '2026-08-11T14:20:00Z' },
  { id: 2, exhibitor_id: 'x1', nome: 'Camila Reis', email: 'camila@exemplo.com', modulo: 'Nutrição Esportiva', origem: 'convidado', criado_em: '2026-08-11T14:20:00Z' },
  { id: 3, exhibitor_id: 'x1', nome: 'Rafael Dias', email: 'rafael@exemplo.com', modulo: 'NB Universitário', origem: 'patrocinador', criado_em: '2026-08-12T09:05:00Z' },
  { id: 4, exhibitor_id: 'x3', nome: 'Ana Prado', email: 'ana@exemplo.com', modulo: 'Plenária Principal', origem: 'convidado', criado_em: '2026-08-10T18:40:00Z' }
];

let PERFIS = [
  { id: 'u1', email: 'jaqueline@scienceplay.com', display_name: null, role: 'admin', created_at: '2026-05-15T15:46:55Z' },
  { id: 'u2', email: 'contato@scienceplay.com', display_name: null, role: 'operadora', created_at: '2026-05-15T15:47:34Z' },
  { id: 'u3', email: 'atendimento@scienceplay.com', display_name: 'Atendimento 1', role: 'operadora', created_at: '2026-07-01T10:00:00Z' },
  { id: 'u4', email: 'yasmin@scienceplay.com', display_name: 'Yasmin', role: 'expositores', created_at: '2026-08-10T10:00:00Z' }
];
const WA_TEMPLATES = [{ id: 't1', status: 'PENDING' }, { id: 't2', status: 'APPROVED' }];
const NB_PUBLICO = [
  { evento_pai: 'ev-bsb', id: 'ev-bsb', name: 'Nutrição Brasil – Brasília', event_type: 'congress', inscritos: 528, presentes: 0 },
  { evento_pai: 'ev-bsb', id: 'ev-run', name: 'NB Run 2026', event_type: 'race', inscritos: 283, presentes: 0 },
  { evento_pai: 'ev-bsb', id: 'ev-expo', name: 'Expositores – Brasília', event_type: 'exhibitor', inscritos: 0, presentes: 0 },
  { evento_pai: 'ev-bsb', id: 'ev-vis', name: 'Visitantes – Brasília', event_type: 'visitor', inscritos: 0, presentes: 0 }
];

const TABELAS = {
  events: () => EVENTOS,
  participants: () => INSCRICOES,
  cert_modulos: () => CERT_MODULOS,
  exhibitors: () => EXHIBITORS,
  cortesias_uso: () => CORTESIAS_USO,
  nb_publico: () => NB_PUBLICO,
  race_profiles: () => RACE_PROFILES,
  exhibitor_members: () => EXHIBITOR_MEMBERS,
  whatsapp_templates: () => WA_TEMPLATES,
  profiles: () => PERFIS,
  ai_kb: () => AI_KB,
  kb_sources: () => KB_SOURCES,
  kb_changelog: () => KB_CHANGELOG,
  ai_settings: () => AI_SETTINGS,
  fila_atendimento: () => FILA_ATENDIMENTO,
  ai_messages: () => AI_MESSAGES
};

class Q {
  constructor(tabela) {
    this.t = tabela;
    this.linhas = (TABELAS[tabela] || (() => []))().slice();
    this._single = false;
    this._maybe = false;
    this._op = 'select';
    this._payload = null;
    this._ids = null;
  }
  select() { return this; }
  order() { return this; }
  limit(n) { this.linhas = this.linhas.slice(0, n); return this; }
  eq(col, val) {
    if (this.t === 'events' && col === 'slug') {
      this.linhas = window.__QA_SLUG_EXISTE
        ? [{ id: 'ev-x', name: 'Evento Que Já Existe', slug: val }] : [];
      return this;
    }
    this.linhas = this.linhas.filter((r) => r[col] === val); this._ids = [val]; return this;
  }
  neq(col, val) { this.linhas = this.linhas.filter((r) => r[col] !== val); return this; }
  is(col, val) { this.linhas = this.linhas.filter((r) => (r[col] ?? null) === val); return this; }
  in(col, vals) { this.linhas = this.linhas.filter((r) => vals.includes(r[col])); this._ids = vals; return this; }
  single() { this._single = true; return this; }
  maybeSingle() { this._maybe = true; return this; }
  insert(obj) { this._op = 'insert'; this._payload = obj; return this; }
  update(obj) { this._op = 'update'; this._payload = obj; return this; }
  then(res, rej) { return this._exec().then(res, rej); }
  catch(fn) { return this._exec().catch(fn); }
  async _exec() {
    if (this._op === 'insert') {
      // insert em lote manda array; o stub precisa enxergar os dois casos
      if (Array.isArray(this._payload)) {
        const criados = this._payload.map((r) => ({
          id: 'novo-' + Math.random().toString(36).slice(2, 8),
          code: null, checked: false, checked_at: null, cert_token: null,
          tags: [], created_at: new Date().toISOString(), ...r
        }));
        const choque = criados.find((n) => INSCRICOES.some(
          (r) => r.event_id === n.event_id && r.email && n.email &&
                 r.email.toLowerCase() === String(n.email).toLowerCase() &&
                 (r.lote || '') === (n.lote || '')));
        window.__QA_LOTE = (window.__QA_LOTE || []).concat([{ n: criados.length, choque: !!choque }]);
        if (choque) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        INSCRICOES = [...criados, ...INSCRICOES];
        window.__QA_INSERIDOS = (window.__QA_INSERIDOS || []).concat(criados);
        window.__QA_ULTIMO_INSERT = criados[criados.length - 1];
        return { data: criados, error: null };
      }
      const dup = INSCRICOES.some(
        (r) => r.event_id === this._payload.event_id &&
               r.email && this._payload.email &&
               r.email.toLowerCase() === String(this._payload.email).toLowerCase() &&
               (r.lote || '') === (this._payload.lote || '')
      );
      if (dup) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      if (this.t === 'events') {
        const ev = { id: 'ev-novo-' + Math.random().toString(36).slice(2, 6),
                     total_inscritos: 0, total_checkins: 0, ...this._payload };
        EVENTOS.push(ev);
        window.__QA_EVENTO_NOVO = ev;
        return { data: ev, error: null };
      }
      const linha = {
        id: 'novo-' + Math.random().toString(36).slice(2, 8),
        code: null, checked: false, checked_at: null, cert_token: null,
        tags: [], created_at: new Date().toISOString(), ...this._payload
      };
      INSCRICOES = [linha, ...INSCRICOES];
      window.__QA_ULTIMO_INSERT = linha;
      window.__QA_INSERIDOS = (window.__QA_INSERIDOS || []).concat([linha]);
      return { data: linha, error: null };
    }
    if (this._op === 'update') {
      const ids = this._ids || [];
      const tocadas = [];
      const aplica = (arr) => arr.map((r) => {
        if (!ids.includes(r.id)) return r;
        const nova = { ...r, ...this._payload };
        tocadas.push(nova);
        return nova;
      });
      if (this.t === 'exhibitors') EXHIBITORS = aplica(EXHIBITORS);
      else if (this.t === 'events') {
        EVENTOS.forEach((r, i) => { if (ids.includes(r.id)) { EVENTOS[i] = { ...r, ...this._payload }; tocadas.push(EVENTOS[i]); } });
      } else INSCRICOES = aplica(INSCRICOES);
      window.__QA_ULTIMO_UPDATE = { tabela: this.t, ids, patch: this._payload };
      (window.__QA_UPDATES = window.__QA_UPDATES || []).push({ tabela: this.t, ids, patch: this._payload });
      return { data: tocadas, error: null };
    }
    const d = this._single || this._maybe ? this.linhas[0] ?? null : this.linhas;
    return { data: d, error: null };
  }
}

export function createClient() {
  return {
    from: (t) => new Q(t),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    rpc: async (nome, args) => {
      window.__QA_RPC = window.__QA_RPC || [];
      window.__QA_RPC.push({ nome, args });
      // Prévia do disparo: conta quantos da lista não receberiam.
      // Aqui o inscrito de mentira é o telefone terminado em 0002.
      if (nome === 'wa_div_previa') {
        const fones = args.p_phones || [];
        const chaves = [...new Set(fones.map((f) => String(f).replace(/\D/g, '').slice(-8)))];
        const repetidos = fones.length - chaves.length;
        const optout = chaves.filter((k) => k.endsWith('9999')).length;
        const inscritos = args.p_skip ? chaves.filter((k) => k.endsWith('0002')).length : 0;
        return {
          data: {
            total: fones.length, repetidos, optout, inscritos,
            vao_receber: Math.max(fones.length - repetidos - optout - inscritos, 0)
          },
          error: null
        };
      }
      if (nome === 'atendimento_resolve' || nome === 'atendimento_reabre') {
        window.__QA_ATEND = { nome, id: args.p_id, voltaBot: args.p_volta_bot };
        return { data: { ok: true, phone: '55x' }, error: null };
      }
      if (nome === 'kb_modo_sync') {
        if (args.p_modo) window.__QA_KB_MODO = args.p_modo;
        return { data: { ok: true, modo: args.p_modo || 'auto' }, error: null };
      }
      if (nome === 'kb_aplica_mudanca' || nome === 'kb_desfaz_mudanca') {
        const aplicar = nome === 'kb_aplica_mudanca';
        const c = KB_CHANGELOG.find((x) => x.id === args.p_id);
        if (!c) return { data: { erro: 'nao_existe' }, error: null };
        if (aplicar && c.applied) return { data: { erro: 'ja_aplicada' }, error: null };
        if (!aplicar && !c.applied) return { data: { erro: 'nao_aplicada' }, error: null };
        AI_KB = AI_KB.map((k) => (k.topic === c.topic
          ? { ...k, content: aplicar ? c.new_content : c.old_content, updated_at: new Date().toISOString() } : k));
        KB_CHANGELOG = KB_CHANGELOG.map((x) => (x.id === args.p_id
          ? { ...x, applied: aplicar, reviewed: true, applied_at: aplicar ? new Date().toISOString() : x.applied_at } : x));
        window.__QA_KB_SYNC = { rpc: nome, id: args.p_id, topic: c.topic };
        return { data: { ok: true, topic: c.topic }, error: null };
      }
      if (nome === 'kb_marca_lida') {
        KB_CHANGELOG = KB_CHANGELOG.map((x) => (x.id === args.p_id ? { ...x, reviewed: true } : x));
        return { data: { ok: true }, error: null };
      }
      if (nome === 'perfil_muda_papel') {
        const alvo = PERFIS.find((p) => p.id === args.p_id);
        if (!alvo) return { data: { erro: 'nao_existe' }, error: null };
        if (args.p_id === 'u1' && args.p_papel !== 'admin') return { data: { erro: 'proprio' }, error: null };
        const admins = PERFIS.filter((p) => p.role === 'admin').length;
        if (alvo.role === 'admin' && args.p_papel !== 'admin' && admins <= 1) {
          return { data: { erro: 'ultimo_admin' }, error: null };
        }
        PERFIS = PERFIS.map((p) => (p.id === args.p_id ? { ...p, role: args.p_papel } : p));
        window.__QA_PAPEL = { id: args.p_id, papel: args.p_papel };
        return { data: { ok: true, papel: args.p_papel }, error: null };
      }
      if (nome === 'expo_gera_convite') {
        const n = (window.__QA_CONVITES = (window.__QA_CONVITES || 0) + 1);
        const novo = {
          id: 'ex-novo-' + n,
          event_id: args.p_event_id,
          codigo: 'NBQA' + String(n).padStart(2, '0'),
          token: 'tokqa' + n,
          empresa: args.p_empresa,
          estande: null,
          cota: args.p_cota,
          limite_credenciais: args.p_limite,
          status: 'convidado',
          resp_nome: null, resp_whatsapp: null, cad_nome: null,
          preenchido_em: null, exhibitor_members: []
        };
        EXHIBITORS = [...EXHIBITORS, novo];
        return { data: { codigo: novo.codigo, token: novo.token, id: novo.id }, error: null };
      }
      if (nome === 'checkin_participant' || nome === 'uncheckin_participant') {
        const ligar = nome === 'checkin_participant';
        INSCRICOES = INSCRICOES.map((r) =>
          r.id === args.p_id
            ? { ...r, checked: ligar, checked_at: ligar ? new Date().toISOString() : null }
            : r
        );
      }
      return { data: true, error: null };
    },
    functions: {
      // A QA não fala com a nuvem: registra a chamada e devolve um resultado
      // coerente com o que a função real responderia.
      invoke: async (nome, opts) => {
        window.__QA_FN = window.__QA_FN || [];
        window.__QA_FN.push({ nome, body: opts?.body });
        const pessoas = opts?.body?.pessoas || [];
        const criados = pessoas.flatMap((p) =>
          (p.modulos || []).map((m) => ({ modulo: m, email: p.email, nome: p.primeiro_nome })));
        return { data: { ok: true, empresa: 'Nestlé Nutrition & Health',
          criados, recusados: [], avisos: [], usadas: 3 + criados.length,
          total: 20, restantes: 17 - criados.length }, error: null };
      }
    },
    auth: {
      // ?papel=expositores no endereço da QA entra como outra pessoa. Serve
      // para testar o painel restrito sem precisar de conta de verdade.
      getSession: async () => ({ data: { session: { user: quemSou() } } }),
      getUser: async () => ({ data: { user: quemSou() } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null })
    }
  };
}
