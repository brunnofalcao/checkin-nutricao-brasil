import { h, setContent } from '../core/dom.js';
import { icons } from './icons.js';
import { signOut, getProfile } from '../data/auth.js';
import { navigate } from '../core/router.js';

const NAV = [
  {
    label: 'Operação',
    items: [
      { path: '/', icon: 'home', label: 'Início' },
      { path: '/eventos', icon: 'calendar', label: 'Eventos' },
      { path: '/pessoas', icon: 'people', label: 'Pessoas' }
    ]
  },
  {
    label: 'Comunicação',
    items: [
      { path: '/disparos', icon: 'send', label: 'Disparos' },
      { path: '/templates', icon: 'message', label: 'Templates WhatsApp' }
    ]
  },
  {
    label: 'Saída',
    items: [
      { path: '/certificados', icon: 'award', label: 'Certificados' },
      { path: '/etiquetas', icon: 'tag', label: 'Etiquetas' }
    ]
  },
  {
    label: 'Sistema',
    items: [{ path: '/configuracoes', icon: 'settings', label: 'Configurações' }]
  }
];

// Em construção (telas que ainda não foram implementadas).
// /certificados foi REMOVIDO - agora tem implementação real.
const STUB_PATHS = ['/pessoas', '/disparos', '/templates', '/etiquetas', '/configuracoes'];

export async function renderShell(rootEl) {
  const profile = await getProfile();

  const app = h(
    'div',
    { class: 'app' },
    renderSidebar(profile),
    h(
      'main',
      { class: 'main' },
      renderTopbar(),
      h('div', { class: 'content', id: 'view' })
    )
  );

  setContent(rootEl, app);
  return document.getElementById('view');
}

function renderSidebar(profile) {
  const sidebar = h(
    'aside',
    { class: 'sidebar' },
    h(
      'div',
      { class: 'brand' },
      'nutrição',
      h('span', {}, 'brasil')
    ),
    ...NAV.map(renderNavGroup),
    h(
      'div',
      { class: 'sidebar-foot' },
      h(
        'div',
        { class: 'user-mini' },
        h('div', { class: 'user-avatar' }, initials(profile?.email)),
        h(
          'div',
          { style: { flex: '1', minWidth: '0' } },
          h('div', { class: 'user-name' }, profile?.email?.split('@')[0] || 'Usuário'),
          h('div', { class: 'user-role' }, profile?.role || '—')
        ),
        h(
          'button',
          {
            class: 'signout-btn',
            title: 'Sair',
            onclick: async () => {
              await signOut();
              location.reload();
            }
          },
          icons.logout()
        )
      )
    )
  );
  return sidebar;
}

function renderNavGroup(group) {
  return h(
    'div',
    { class: 'nav-group' },
    h('div', { class: 'nav-group-label' }, group.label),
    ...group.items.map((it) => {
      const node = h(
        'a',
        {
          class: 'nav-item',
          'data-path': it.path,
          onclick: (e) => {
            e.preventDefault();
            if (STUB_PATHS.includes(it.path)) {
              import('./toast.js').then((m) => m.toast.info('Em construção — próxima entrega'));
              return;
            }
            navigate(it.path);
          }
        },
        icons[it.icon](),
        it.label
      );
      return node;
    })
  );
}

function renderTopbar() {
  return h(
    'header',
    { class: 'topbar' },
    h('div', { class: 'topbar-crumb' }, h('strong', {}, 'Painel Nutrição Brasil'))
  );
}

function initials(email) {
  if (!email) return '?';
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
