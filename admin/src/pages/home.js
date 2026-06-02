import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { listEvents } from '../data/events.js';
import { supabase } from '../data/supabase.js';
import { getProfile } from '../data/auth.js';
import { navigate } from '../core/router.js';
import { firstName, fmtRelative } from '../core/utils.js';

export async function pageHome(view) {
  // Loading state.
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));

  const [profile, events] = await Promise.all([getProfile(), listEvents()]);

  // Próximo evento (status='ativo' ou data futura).
  const now = new Date();
  const upcoming = events
    .filter((e) => e.status !== 'encerrado' && (!e.date_start || new Date(e.date_start) >= now))
    .sort((a, b) => new Date(a.date_start || 0) - new Date(b.date_start || 0));
  const nextEvent = upcoming[0];

  // Templates pendentes no Meta.
  const { data: pendingTpls } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('status', 'PENDING');

  // Eventos sem certificado configurado.
  const eventsWithoutCert = upcoming.filter((e) => !e.certificate_template_url).slice(0, 3);

  setContent(
    view,
    h('div', { class: 'page-head' },
      h('div', {},
        h('h1', { class: 'page-title' }, `Olá, ${firstName(profile?.email?.split('@')[0] || '')}`),
        h('div', { class: 'page-sub' }, buildSubtitle(eventsWithoutCert.length, pendingTpls?.length || 0))
      )
    ),

    h('div', { class: 'todo-grid' },
      // Card: Próximo evento
      nextEvent ? cardNextEvent(nextEvent) : null,
      // Card: Templates aguardando aprovação
      pendingTpls && pendingTpls.length > 0 ? cardPendingTemplates(pendingTpls) : null,
      // Card: Eventos sem certificado
      eventsWithoutCert.length > 0 ? cardCertPending(eventsWithoutCert[0]) : null,
      // Card: tudo em ordem (se vazio)
      !nextEvent && (!pendingTpls || pendingTpls.length === 0) && eventsWithoutCert.length === 0
        ? cardEmpty()
        : null
    ),

    h('h2', { style: { fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: '700', color: 'var(--ink-strong)', marginBottom: '14px', letterSpacing: '-0.015em' } }, 'Ações rápidas'),
    quickActions()
  );
}

function buildSubtitle(certCount, tplCount) {
  const issues = [];
  if (certCount > 0) issues.push(`${certCount} evento${certCount > 1 ? 's' : ''} sem certificado`);
  if (tplCount > 0) issues.push(`${tplCount} template${tplCount > 1 ? 's' : ''} aguardando Meta`);
  if (issues.length === 0) return 'Tudo operacional. Bom dia.';
  return issues.join(' · ') + '.';
}

function cardNextEvent(ev) {
  const days = ev.date_start ? Math.ceil((new Date(ev.date_start) - Date.now()) / 86400000) : null;
  return h('div', { class: 'todo-card ready' },
    h('div', { class: 'todo-head' },
      h('div', { class: 'todo-icon info' }, icons.calendar()),
      h('div', { class: 'todo-status' }, 'Próximo evento')
    ),
    h('div', { class: 'todo-title' }, ev.name || ev.slug),
    h('div', { class: 'todo-body' },
      [
        ev.location || null,
        days !== null && days >= 0 ? `em ${days} dia${days !== 1 ? 's' : ''}` : null,
        `${ev.total_inscritos || 0} inscritos`
      ].filter(Boolean).join(' · ')
    ),
    h('div', { class: 'todo-action' },
      h('button', {
        class: 'btn btn-primary',
        onclick: () => navigate(`/eventos/${ev.id}`)
      }, 'Abrir evento →')
    )
  );
}

function cardPendingTemplates(tpls) {
  return h('div', { class: 'todo-card urgent' },
    h('div', { class: 'todo-head' },
      h('div', { class: 'todo-icon urgent' }, icons.message()),
      h('div', { class: 'todo-status' }, 'Aguardando Meta')
    ),
    h('div', { class: 'todo-title' },
      `${tpls.length} template${tpls.length > 1 ? 's' : ''} em análise`
    ),
    h('div', { class: 'todo-body' },
      'A Meta geralmente aprova em até 48h. Você precisa do template aprovado antes de disparar.'
    ),
    h('div', { class: 'todo-action' },
      h('button', { class: 'btn btn-secondary', onclick: () => navigate('/templates') }, 'Ver status →')
    )
  );
}

function cardCertPending(ev) {
  return h('div', { class: 'todo-card urgent' },
    h('div', { class: 'todo-head' },
      h('div', { class: 'todo-icon urgent' }, icons.alert()),
      h('div', { class: 'todo-status' }, 'Pendente')
    ),
    h('div', { class: 'todo-title' }, `${ev.name} sem template de certificado`),
    h('div', { class: 'todo-body' }, 'Sem isso, os participantes não recebem nada após o check-in.'),
    h('div', { class: 'todo-action' },
      h('button', { class: 'btn btn-secondary', onclick: () => navigate(`/eventos/${ev.id}`) }, 'Configurar →')
    )
  );
}

function cardEmpty() {
  return h('div', { class: 'todo-card ready' },
    h('div', { class: 'todo-head' },
      h('div', { class: 'todo-icon ready' }, icons.check()),
      h('div', { class: 'todo-status' }, 'Em ordem')
    ),
    h('div', { class: 'todo-title' }, 'Tudo configurado'),
    h('div', { class: 'todo-body' }, 'Nenhuma pendência operacional no momento.')
  );
}

function quickActions() {
  const actions = [
    { icon: 'calendar', title: 'Eventos', sub: 'Calendário NB completo', path: '/eventos' },
    { icon: 'people', title: 'Pessoas', sub: 'CRM cruzado · 209 contatos', path: '/pessoas' },
    { icon: 'send', title: 'Disparos', sub: 'WhatsApp em massa', path: '/disparos' },
    { icon: 'message', title: 'Templates', sub: 'Modelos aprovados Meta', path: '/templates' }
  ];

  return h('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }
  },
    ...actions.map((a) =>
      h('button', {
        style: {
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r)',
          padding: '18px',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s'
        },
        onmouseover: (e) => { e.currentTarget.style.borderColor = 'var(--violet)'; e.currentTarget.style.background = 'var(--violet-soft)'; },
        onmouseout: (e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.background = 'var(--surface)'; },
        onclick: () => navigate(a.path)
      },
        h('div', {
          style: {
            width: '32px', height: '32px', borderRadius: 'var(--r-sm)',
            background: 'var(--bg-2)', color: 'var(--violet)',
            display: 'grid', placeItems: 'center', marginBottom: '12px'
          }
        }, icons[a.icon]()),
        h('div', { style: { fontWeight: '700', fontSize: '14px', color: 'var(--ink-strong)', marginBottom: '2px' } }, a.title),
        h('div', { style: { fontSize: '12px', color: 'var(--ink-mute)' } }, a.sub)
      )
    )
  );
}
