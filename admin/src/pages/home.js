// =====================================================================
// INÍCIO · centro de comando
//
// A pergunta que essa tela responde em três segundos é uma só:
// "onde está o evento âncora e o que ainda depende de mim?"
//
// Brasília não é um evento, são quatro públicos no mesmo lugar: congresso,
// corrida, exposição e visitante. Por isso o card de cima soma os quatro e
// mostra o contador oficial — crachá retirado é presença.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { listEvents } from '../data/events.js';
import { supabase } from '../data/supabase.js';
import { getProfile } from '../data/auth.js';
import { navigate } from '../core/router.js';
import { firstName } from '../core/utils.js';

const TIPO = {
  congress: { rot: 'Congresso', ordem: 1 },
  race: { rot: 'Corrida', ordem: 2 },
  exhibitor: { rot: 'Exposição', ordem: 3 },
  visitor: { rot: 'Visitantes', ordem: 4 }
};

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export async function pageHome(view) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));

  const [profile, eventos] = await Promise.all([getProfile(), listEvents()]);

  // Consultas de apoio. Nenhuma delas pode derrubar a tela.
  const [expositores, comCert, semContato] = await Promise.all([
    supabase.from('exhibitors').select('id,status,empresa,preenchido_em')
      .then((r) => r.data ?? []).catch(() => []),
    supabase.from('cert_modulos').select('event_id')
      .then((r) => new Set((r.data ?? []).map((x) => x.event_id))).catch(() => new Set()),
    supabase.from('participants').select('id,event_id')
      .is('email', null).is('phone', null)
      .then((r) => r.data ?? []).catch(() => [])
  ]);

  const quando = (e) => e.date_start || e.event_date || null;

  // ── A família do evento mãe ────────────────────────────────────────────────
  // Brasília são cinco públicos no mesmo lugar mais a corrida no domingo.
  // Quatro penduram em parent_event_id. BLACK e imprensa não podem: o cadastro
  // de convidado usa parent_event_id para recusar quem já é congressista, e o
  // convidado não pode ser recusado por isso. Eles se ligam por evento_mae_id,
  // que existe só para leitura: mesmo balcão, mesma soma nesta tela.
  const ehRaiz = (e) => !e.parent_event_id && !e.evento_mae_id;
  const filhosDe = (e) =>
    eventos.filter((f) => f.parent_event_id === e.id || f.evento_mae_id === e.id);

  // Até quando o evento ainda está acontecendo. Não basta a data de início:
  // Brasília começa 27, o congresso fecha 29 e a corrida é 30. Enquanto
  // qualquer público da família não acabou, o evento continua sendo o âncora.
  const fimDe = (e) => {
    const datas = [e, ...filhosDe(e)]
      .map((x) => x.event_end_date || quando(x))
      .filter(Boolean)
      .map((d) => new Date(String(d).length <= 10 ? String(d) + 'T23:59:59' : d));
    return datas.length ? new Date(Math.max(...datas)) : null;
  };

  // ── O evento âncora ────────────────────────────────────────────────────────
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const candidatos = eventos
    .filter((e) => ehRaiz(e) && e.status !== 'encerrado' && quando(e))
    .filter((e) => { const f = fimDe(e); return f ? f >= hoje : false; })
    .sort((a, b) => new Date(quando(a)) - new Date(quando(b)));
  const ancora = candidatos[0] || null;

  const publicos = ancora
    ? [ancora, ...filhosDe(ancora)].sort(
        (a, b) =>
          ((TIPO[a.event_type]?.ordem || 9) - (TIPO[b.event_type]?.ordem || 9)) ||
          ((b.total_inscritos || 0) - (a.total_inscritos || 0))
      )
    : [];
  const inscritosTotal = publicos.reduce((s, e) => s + (e.total_inscritos || 0), 0);
  const presentesTotal = publicos.reduce((s, e) => s + (e.total_checkins || 0), 0);
  // Evento em andamento é "hoje", nunca "em -1 dias".
  const dias = ancora
    ? Math.max(0, Math.ceil((new Date(quando(ancora)) - hoje) / 86400000))
    : null;

  // ── Pendências reais ───────────────────────────────────────────────────────
  const pend = [];

  const expoPendentes = expositores.filter((x) => !x.preenchido_em);
  if (expositores.length && expoPendentes.length) {
    pend.push({
      tom: 'urgent',
      icone: 'briefcase',
      etiqueta: 'Exposição',
      titulo: `${expoPendentes.length} de ${expositores.length} empresas ainda não cadastraram o time`,
      corpo: 'Sem o time cadastrado não dá para imprimir crachá antes do evento — vira fila no balcão.',
      acao: 'Ver empresas',
      caminho: '/expositores'
    });
  }
  if (!expositores.length && ancora) {
    pend.push({
      tom: 'urgent',
      icone: 'briefcase',
      etiqueta: 'Exposição',
      titulo: 'Nenhum convite de expositor gerado',
      corpo: 'O código de cadastro é gerado aqui e enviado para cada empresa. Sem ele o formulário não abre.',
      acao: 'Gerar convites',
      caminho: '/expositores'
    });
  }

  const semCert = candidatos.filter((e) => !comCert.has(e.id));
  if (semCert.length) {
    pend.push({
      tom: 'urgent',
      icone: 'award',
      etiqueta: 'Certificado',
      titulo:
        semCert.length === 1
          ? `${semCert[0].city || semCert[0].name} sem módulos de certificado`
          : `${semCert.length} eventos sem módulos de certificado`,
      corpo: 'Sem módulo configurado, o participante não recebe link nenhum depois do evento.',
      acao: 'Configurar',
      caminho: '/certificados'
    });
  }

  const semContatoAncora = ancora
    ? semContato.filter((p) => publicos.some((e) => e.id === p.event_id)).length
    : 0;
  if (semContatoAncora) {
    pend.push({
      tom: '',
      icone: 'people',
      etiqueta: 'Base',
      titulo: `${semContatoAncora} ${semContatoAncora > 1 ? 'inscritos' : 'inscrito'} sem e-mail e sem WhatsApp`,
      corpo: semContatoAncora > 1
        ? 'Essas pessoas entram no evento, mas não recebem confirmação, lembrete nem certificado.'
        : 'Essa pessoa entra no evento, mas não recebe confirmação, lembrete nem certificado.',
      acao: 'Ver na base',
      caminho: '/pessoas'
    });
  }

  // wa_templates, não whatsapp_templates. A tabela do nome antigo existe e
  // está vazia, então a consulta nunca deu erro — só devolvia zero para
  // sempre, e o card de "templates esperando a Meta" nunca aparecia. Erro que
  // se esconde atrás de um resultado plausível é o mais caro de achar.
  const { data: tplPendentes } = await supabase
    .from('wa_templates')
    .select('id')
    .eq('status', 'PENDING')
    .then((r) => r, () => ({ data: [] }));
  if (tplPendentes?.length) {
    pend.push({
      tom: 'urgent',
      icone: 'message',
      etiqueta: 'Marketing',
      titulo: `${tplPendentes.length} template${tplPendentes.length > 1 ? 's' : ''} aguardando a Meta`,
      corpo: 'A Meta costuma responder em até 48h. Sem aprovação, o disparo não sai.',
      acao: 'Ver status',
      caminho: '/templates'
    });
  }

  // ── Desenho ────────────────────────────────────────────────────────────────
  setContent(
    view,
    h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        {},
        h('h1', { class: 'page-title' }, `Olá, ${nomeDe(profile)}`),
        h('div', { class: 'page-sub' }, resumo(ancora, dias, inscritosTotal, pend.length))
      )
    ),

    ancora ? cardAncora(ancora, publicos, dias, inscritosTotal, presentesTotal) : null,

    h('h2', { class: 'home-secao' }, pend.length ? 'Precisa de você' : 'Nada travado'),
    pend.length
      ? h('div', { class: 'todo-grid' }, ...pend.map(cardPendencia))
      : h(
          'div',
          { class: 'todo-card ready' },
          h(
            'div',
            { class: 'todo-head' },
            h('div', { class: 'todo-icon ready' }, icons.check()),
            h('div', { class: 'todo-status' }, 'Em ordem')
          ),
          h('div', { class: 'todo-title' }, 'Nenhuma pendência operacional'),
          h('div', { class: 'todo-body' }, 'Convites, certificados e base de contatos estão configurados.')
        ),

    h('h2', { class: 'home-secao' }, 'Calendário 2026'),
    calendario(eventos, ehRaiz),

    h('h2', { class: 'home-secao' }, 'Ir direto para'),
    atalhos(eventos, expositores, ehRaiz)
  );
}

// ── Peças ───────────────────────────────────────────────────────────────────

function nomeDe(profile) {
  const bruto = profile?.email?.split('@')[0] || '';
  return firstName(bruto.replace(/[._-]+/g, ' ')).replace(/^./, (c) => c.toUpperCase()) || 'time';
}

function resumo(ancora, dias, inscritos, pendencias) {
  if (!ancora) return 'Nenhum evento em aberto no calendário.';
  const quantos = inscritos.toLocaleString('pt-BR');
  const prazo =
    dias === 0 ? 'é hoje' : dias === 1 ? 'é amanhã' : `em ${dias} dias`;
  const p = pendencias
    ? ` ${pendencias} ponto${pendencias > 1 ? 's' : ''} aguardando decisão.`
    : ' Nada travado.';
  return `${ancora.city || ancora.name} ${prazo}, com ${quantos} pessoas garantidas.` + p;
}

function dataExtensa(e) {
  const ini = e.date_start || e.event_date;
  if (!ini) return 'data a definir';
  const a = new Date(ini);
  const b = e.event_end_date ? new Date(e.event_end_date) : null;
  const mes = MESES[a.getUTCMonth()];
  if (b && b > a) {
    const mesB = MESES[b.getUTCMonth()];
    return mes === mesB
      ? `${a.getUTCDate()} a ${b.getUTCDate()} de ${mes}`
      : `${a.getUTCDate()} de ${mes} a ${b.getUTCDate()} de ${mesB}`;
  }
  return `${a.getUTCDate()} de ${mes}`;
}

// Rótulo do público. O tipo basta quando ele é único no grupo. Quando dois
// dividem o mesmo tipo, e é o caso de visitante, BLACK e imprensa, que no banco
// são todos 'visitor', usa-se o nome curto do evento para não sair "Visitantes"
// três vezes seguidas.
function rotuloPublico(e, grupo) {
  const curto = String(e.name || '').split(/\s+[–-]\s+/)[0].trim();
  const mesmoTipo = grupo.filter((x) => x.event_type === e.event_type).length;
  if (mesmoTipo > 1) return curto || e.name;
  return TIPO[e.event_type]?.rot || curto || e.name;
}

function cardAncora(ev, publicos, dias, inscritos, presentes) {
  return h(
    'div',
    { class: 'ancora' },
    h(
      'div',
      { class: 'ancora-topo' },
      h(
        'div',
        {},
        h('div', { class: 'ancora-tag' }, 'Próximo evento'),
        h('div', { class: 'ancora-nome' }, ev.name),
        h(
          'div',
          { class: 'ancora-onde' },
          [dataExtensa(ev), ev.venue || ev.location].filter(Boolean).join(' · ')
        )
      ),
      h(
        'div',
        { class: 'ancora-conta' },
        h('div', { class: 'ancora-conta-num' }, dias === null ? '—' : Math.max(dias, 0)),
        h('div', { class: 'ancora-conta-rot' }, dias === 1 ? 'dia' : 'dias')
      )
    ),

    h(
      'div',
      { class: 'ancora-publicos' },
      ...publicos.map((p) =>
        h(
          'button',
          {
            class: 'ancora-publico',
            onclick: () =>
              navigate(p.event_type === 'exhibitor' ? '/expositores' : `/eventos/${p.id}`)
          },
          h('div', { class: 'ancora-publico-rot' }, rotuloPublico(p, publicos)),
          h('div', { class: 'ancora-publico-num' }, (p.total_inscritos || 0).toLocaleString('pt-BR')),
          h(
            'div',
            { class: 'ancora-publico-sub' },
            (p.total_inscritos || 0) === 0 ? 'ainda sem inscritos' : `${p.total_checkins || 0} no local`
          )
        )
      )
    ),

    h(
      'div',
      { class: 'ancora-rodape' },
      h(
        'div',
        { class: 'ancora-oficial' },
        h('strong', {}, presentes.toLocaleString('pt-BR')),
        ` de ${inscritos.toLocaleString('pt-BR')} já com crachá retirado — esse é o contador oficial do evento.`
      ),
      h(
        'div',
        { class: 'ancora-acoes' },
        h('button', { class: 'btn btn-primary', onclick: () => navigate(`/eventos/${ev.id}`) },
          'Abrir ' + (ev.city || 'evento')),
        h('button', { class: 'btn btn-secondary', onclick: () => navigate('/expositores') }, 'Exposição'),
        h('button', { class: 'btn btn-ghost', onclick: () => navigate('/pessoas') }, 'Pessoas')
      )
    )
  );
}

function cardPendencia(p) {
  return h(
    'div',
    { class: 'todo-card ' + (p.tom || '') },
    h(
      'div',
      { class: 'todo-head' },
      h('div', { class: 'todo-icon ' + (p.tom === 'urgent' ? 'urgent' : 'info') }, icons[p.icone]()),
      h('div', { class: 'todo-status' }, p.etiqueta)
    ),
    h('div', { class: 'todo-title' }, p.titulo),
    h('div', { class: 'todo-body' }, p.corpo),
    h(
      'div',
      { class: 'todo-action' },
      h('button', { class: 'btn btn-secondary', onclick: () => navigate(p.caminho) }, p.acao + ' →')
    )
  );
}

function calendario(eventos, ehRaiz) {
  const raizes = eventos
    .filter(ehRaiz)
    .sort((a, b) => new Date(a.date_start || a.event_date || 0) - new Date(b.date_start || b.event_date || 0));

  return h(
    'div',
    { class: 'table-card' },
    h(
      'table',
      { class: 'table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { style: { width: '30%' } }, 'Cidade'),
          h('th', {}, 'Data'),
          h('th', {}, 'Local'),
          h('th', { style: { width: '110px' } }, 'Inscritos'),
          h('th', { style: { width: '120px' } }, 'Situação')
        )
      ),
      h(
        'tbody',
        {},
        ...raizes.map((e) =>
          h(
            'tr',
            {
              tabindex: '0',
              role: 'button',
              onclick: () => navigate(`/eventos/${e.id}`),
              onkeydown: (ev) => {
                if (ev.key === 'Enter') navigate(`/eventos/${e.id}`);
              }
            },
            h('td', {}, h('div', { class: 'row-name' }, e.city || e.name)),
            h('td', { class: 'muted' }, dataExtensa(e)),
            h('td', { class: 'muted' }, e.venue || e.location || '—'),
            h(
              'td',
              {},
              (e.total_inscritos || 0) === 0
                ? h('span', { class: 'muted' }, '—')
                : h('strong', {}, (e.total_inscritos || 0).toLocaleString('pt-BR'))
            ),
            h('td', {}, situacao(e))
          )
        )
      )
    )
  );
}

function situacao(e) {
  if (e.status === 'encerrado') return h('span', { class: 'status done' }, 'Encerrado');
  if (e.status === 'ativo') return h('span', { class: 'status live' }, 'Em andamento');
  return h('span', { class: 'status soon' }, 'Em breve');
}

function atalhos(eventos, expositores, ehRaiz) {
  const inscritos = eventos.reduce((s, e) => s + (e.total_inscritos || 0), 0);
  const itens = [
    { icone: 'calendar', titulo: 'Eventos', sub: `${eventos.filter(ehRaiz).length} no calendário`, caminho: '/eventos' },
    { icone: 'people', titulo: 'Pessoas', sub: `${inscritos.toLocaleString('pt-BR')} inscrições na base`, caminho: '/pessoas' },
    { icone: 'briefcase', titulo: 'Exposição', sub: expositores.length ? `${expositores.length} empresas` : 'sem convites ainda', caminho: '/expositores' },
    { icone: 'send', titulo: 'Marketing', sub: 'disparos e divulgação', caminho: '/disparos' },
    { icone: 'award', titulo: 'Certificados', sub: 'módulos e links pessoais', caminho: '/certificados' }
  ];

  return h(
    'div',
    { class: 'atalhos' },
    ...itens.map((a) =>
      h(
        'button',
        { class: 'atalho', onclick: () => navigate(a.caminho) },
        h('div', { class: 'atalho-icone' }, icons[a.icone]()),
        h('div', { class: 'atalho-titulo' }, a.titulo),
        h('div', { class: 'atalho-sub' }, a.sub)
      )
    )
  );
}
