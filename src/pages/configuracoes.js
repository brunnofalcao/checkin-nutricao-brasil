// =====================================================================
// CONFIGURAÇÕES
//
// Três coisas que alguém precisa resolver sem chamar dev:
//   1. quem consegue entrar, e com qual acesso;
//   2. de onde os inscritos estão entrando, e se ainda está entrando;
//   3. em quais eventos o certificado exige check-in.
//
// O que não dá para fazer aqui está escrito na tela, com o caminho.
// Tela de configuração que esconde o que não faz é pior que stub.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { supabase } from '../data/supabase.js';
import { getProfile } from '../data/auth.js';
import { listEvents } from '../data/events.js';
import { fmtRelative } from '../core/utils.js';

// A ordem aqui é a ordem do seletor: do acesso maior para o menor, para
// quem promove alguém ver primeiro o que está entregando.
const PAPEIS = {
  admin: {
    rot: 'Administrador',
    pode: 'Abre o painel inteiro: eventos, pessoas, disparos, certificados, configurações.'
  },
  expositores: {
    rot: 'Exposição',
    pode: 'Só a área de Exposição: cria empresas, gera links, administra credenciais, ' +
          'imprime crachás e dá baixa na retirada. Não alcança disparo de mensagem, ' +
          'pessoas nem configurações.'
  },
  operadora: {
    rot: 'Operação',
    pode: 'Usa o app de credenciamento no celular. Não abre este painel.'
  }
};

export async function pageConfiguracoes(view) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));

  const [eu, perfis, eventos, fontes] = await Promise.all([
    getProfile(),
    supabase.from('profiles').select('id, email, display_name, role, created_at')
      .order('created_at').then((r) => r.data ?? []).catch(() => []),
    listEvents(),
    carregaFontes()
  ]);

  function render() {
    setContent(
      view,
      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', { class: 'page-title' }, 'Configurações'),
          h('div', { class: 'page-sub' },
            'Acessos, de onde vêm os inscritos e a regra do certificado por evento.'))),

      h('h2', { class: 'home-secao', style: { marginTop: '0' } }, 'Quem tem acesso'),
      blocoAcessos(),

      h('h2', { class: 'home-secao' }, 'De onde vêm os inscritos'),
      blocoFontes(),

      h('h2', { class: 'home-secao' }, 'Certificado por evento'),
      blocoCertificado()
    );
  }

  // ── 1. Acessos ────────────────────────────────────────────────────────────
  function blocoAcessos() {
    const admins = perfis.filter((p) => p.role === 'admin').length;
    return h('div', {},
      h('div', { class: 'table-card' },
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {},
            h('th', { style: { width: '38%' } }, 'Pessoa'),
            h('th', {}, 'Acesso'),
            h('th', {}, 'Desde'),
            h('th', { style: { width: '150px' } }, ''))),
          h('tbody', {}, ...perfis.map((p) => linhaPerfil(p, admins))))),

      h('div', { class: 'cfg-nota' },
        icons.info(),
        h('div', {},
          h('strong', {}, 'Criar login novo ainda não é feito aqui. '),
          'Conta nova precisa ser criada no Supabase (Authentication → Users). ' +
          'Depois que ela existe, o acesso se ajusta nesta tela. ',
          perfis.length <= 2
            ? h('span', { class: 'cfg-alerta' },
                `Hoje existem ${perfis.length} contas no sistema. ` +
                'Se mais alguém vai trabalhar no credenciamento, cada pessoa precisa da sua — ' +
                'senha compartilhada tira a rastreabilidade de quem fez cada check-in.')
            : null)));
  }

  function linhaPerfil(p, admins) {
    const souEu = p.id === eu?.id;
    const cfg = PAPEIS[p.role] || { rot: p.role || '—', pode: '' };
    const ultimoAdmin = p.role === 'admin' && admins <= 1;
    return h('tr', {},
      h('td', {},
        h('div', { class: 'row-name' },
          p.display_name || p.email?.split('@')[0] || '—',
          souEu ? h('span', { class: 'cfg-voce' }, 'você') : null),
        h('div', { class: 'row-sub' }, p.email || '—')),
      h('td', {},
        h('div', {}, h('span', {
          class: 'status ' + (p.role === 'admin' ? 'soon' : p.role === 'expositores' ? 'live' : 'done')
        }, cfg.rot)),
        h('div', { class: 'cfg-pode' }, cfg.pode)),
      h('td', { class: 'muted' }, fmtRelative(p.created_at)),
      h('td', {},
        souEu || ultimoAdmin
          ? h('span', { class: 'muted cfg-trava' },
              souEu ? 'não dá para mudar o seu' : 'único admin')
          : h('select', {
              class: 'input cfg-sel',
              'aria-label': 'Acesso de ' + (p.email || ''),
              onchange: (e) => mudaPapel(p, e.target.value, e.target)
            },
              ...Object.entries(PAPEIS).map(([v, c]) =>
                h('option', { value: v, selected: v === p.role || null }, c.rot)))));
  }

  async function mudaPapel(p, papel, el) {
    const antes = p.role;
    el.disabled = true;
    const { data, error } = await supabase.rpc('perfil_muda_papel', { p_id: p.id, p_papel: papel });
    el.disabled = false;
    const motivos = {
      papel: 'Esse acesso não existe.',
      nao_existe: 'Esse perfil não existe mais.',
      proprio: 'Você não pode tirar o seu próprio acesso de administrador.',
      ultimo_admin: 'Esse é o único administrador. Promova outra pessoa antes.'
    };
    if (error || data?.erro) {
      el.value = antes;
      toast.danger(motivos[data?.erro] || 'Não deu: ' + (error?.message || 'erro'));
      return;
    }
    p.role = papel;
    toast.success(
      `${p.email?.split('@')[0]} agora é ${(PAPEIS[papel]?.rot || papel).toLowerCase()}.`
    );
    render();
  }

  // ── 2. Fontes de inscrição ────────────────────────────────────────────────
  function blocoFontes() {
    return h('div', { class: 'cfg-grid' }, ...fontes.map((f) =>
      h('div', { class: 'cfg-card' },
        h('div', { class: 'cfg-card-topo' },
          h('div', { class: 'cfg-card-nome' }, f.nome),
          f.ok
            ? h('span', { class: 'status live' }, 'recebendo')
            : h('span', { class: 'status done' }, 'sem movimento')),
        h('div', { class: 'cfg-card-num' }, f.total.toLocaleString('pt-BR')),
        h('div', { class: 'cfg-card-sub' }, f.detalhe))));
  }

  // ── 3. Certificado por evento ─────────────────────────────────────────────
  function blocoCertificado() {
    const lista = eventos.filter((e) => e.event_type === 'congress');
    return h('div', {},
      h('div', { class: 'cfg-nota', style: { marginTop: '0', marginBottom: '12px' } },
        icons.award(),
        h('div', {},
          'Com a trava ligada, só emite certificado quem fez check-in no evento. ' +
          'Certificado com carga horária serve para comprovar educação continuada — ' +
          'emitir para quem não foi é risco que não compensa. ',
          h('strong', {}, 'Evento que já aconteceu nasce destravado'),
          ', para não tirar o certificado de quem já tinha direito.')),
      h('div', { class: 'table-card' },
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {},
            h('th', { style: { width: '42%' } }, 'Evento'),
            h('th', {}, 'Situação'),
            h('th', {}, 'Presenças'),
            h('th', { style: { width: '190px' } }, 'Exige check-in'))),
          h('tbody', {}, ...lista.map((e) =>
            h('tr', {},
              h('td', {}, h('div', { class: 'row-name' }, e.city || e.name)),
              h('td', {}, e.status === 'encerrado'
                ? h('span', { class: 'status done' }, 'Encerrado')
                : h('span', { class: 'status soon' }, 'Em aberto')),
              h('td', { class: 'muted' },
                `${(e.total_checkins || 0).toLocaleString('pt-BR')} de ${(e.total_inscritos || 0).toLocaleString('pt-BR')}`),
              h('td', {},
                h('label', { class: 'cfg-switch' },
                  h('input', {
                    type: 'checkbox',
                    checked: e.cert_exige_checkin !== false || null,
                    onchange: (ev) => trocaTrava(e, ev.target)
                  }),
                  h('span', {}, e.cert_exige_checkin !== false ? 'Exige' : 'Livre')))))))));
  }

  async function trocaTrava(e, el) {
    const valor = el.checked;
    el.disabled = true;
    const { error } = await supabase.from('events')
      .update({ cert_exige_checkin: valor }).eq('id', e.id);
    el.disabled = false;
    if (error) {
      el.checked = !valor;
      toast.danger('Não deu: ' + error.message);
      return;
    }
    e.cert_exige_checkin = valor;
    const fora = (e.total_inscritos || 0) - (e.total_checkins || 0);
    toast.success(valor
      ? `${e.city || e.name}: certificado só com check-in` +
        (fora > 0 ? ` — ${fora} inscritos sem presença ficam de fora.` : '.')
      : `${e.city || e.name}: certificado liberado para todos os inscritos.`);
    render();
  }

  render();
}

// Conta de onde os participantes vieram. Nada aqui é chute: sai da coluna
// source, que cada integração preenche ao gravar.
async function carregaFontes() {
  const nomes = {
    hotmart: 'Hotmart',
    ticketsports: 'TicketSports',
    import: 'Importação de planilha',
    manual: 'Cadastro manual',
    visitante: 'Visitante'
  };
  const { data } = await supabase
    .from('participants')
    .select('source, created_at')
    .order('created_at', { ascending: false })
    .limit(8000);
  const linhas = data ?? [];
  const porFonte = new Map();
  for (const p of linhas) {
    const k = p.source || 'manual';
    const atual = porFonte.get(k) || { total: 0, ultimo: null };
    atual.total++;
    if (!atual.ultimo || p.created_at > atual.ultimo) atual.ultimo = p.created_at;
    porFonte.set(k, atual);
  }
  const agora = Date.now();
  return [...porFonte.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([k, v]) => ({
      nome: nomes[k] || k,
      total: v.total,
      ok: v.ultimo ? agora - new Date(v.ultimo).getTime() < 7 * 86400000 : false,
      detalhe: v.ultimo ? 'última entrada ' + fmtRelative(v.ultimo) : 'nunca'
    }));
}
