import { h, setContent } from '../core/dom.js';
import { icons } from './icons.js';
import { signOut, getProfile } from '../data/auth.js';
import { navigate } from '../core/router.js';
import { controleTema, ouveSistema } from './tema.js';
const NAV = [
  {
    label: 'Operação',
    items: [
      { path: '/', icon: 'home', label: 'Início' },
      { path: '/eventos', icon: 'calendar', label: 'Eventos' },
      { path: '/expositores', icon: 'briefcase', label: 'Exposição' },
      { path: '/pessoas', icon: 'people', label: 'Pessoas' }
    ]
  },
  {
    label: 'Comunicação',
    items: [{ path: '/disparos', icon: 'send', label: 'Marketing' }]
  },
  {
    label: 'Entrega',
    items: [{ path: '/certificados', icon: 'award', label: 'Certificados' }]
  },
  {
    label: 'Gestão',
    items: [{ path: '/configuracoes', icon: 'settings', label: 'Configurações' }]
  }
];
// Subnavegação por workspace. O menu principal é por função; as telas que
// pertencem à mesma jornada viram abas aqui dentro, em vez de item de menu.
const SUBNAV = {
  marketing: {
    raiz: ['/disparos', '/divulgacao', '/templates', '/base-conhecimento'],
    abas: [
      { path: '/disparos', label: 'Disparos' },
      { path: '/divulgacao', label: 'Divulgação' },
      { path: '/templates', label: 'Templates' },
      { path: '/base-conhecimento', label: 'Base de Conhecimento' },
      { href: 'gerador.html', label: 'Gerador de Peças', external: true }
    ]
  },
  certificados: {
    raiz: ['/certificados'],
    abas: [
      { path: '/certificados', label: 'Configuração', exato: true },
      { path: '/certificados/entrega', label: 'Entrega e links' }
    ]
  },
  exposicao: {
    raiz: ['/expositores'],
    abas: [{ path: '/expositores', label: 'Empresas e convites', exato: true }]
  }
};

// Chamado a cada troca de rota. Desenha as abas do workspace atual, ou nada.
export function atualizaSubnav(path) {
  const alvo = document.getElementById('subnav');
  if (!alvo) return;
  const ws = Object.values(SUBNAV).find((w) =>
    w.raiz.some((r) => path === r || path.startsWith(r + '/')));
  alvo.replaceChildren();
  if (!ws || ws.abas.length < 2) { alvo.classList.add('vazio'); return; }
  alvo.classList.remove('vazio');
  const lista = h('div', { class: 'subnav-lista', role: 'tablist' });
  ws.abas.forEach((a) => {
    const ativo = a.path && (a.exato ? path === a.path : path.startsWith(a.path));
    lista.appendChild(a.external
      ? h('a', { class: 'subnav-aba', href: a.href, target: '_blank', rel: 'noopener' },
          a.label, h('span', { class: 'subnav-ext', 'aria-hidden': 'true' }, '↗'))
      : h('button', {
          class: 'subnav-aba' + (ativo ? ' on' : ''),
          role: 'tab', 'aria-selected': ativo ? 'true' : 'false',
          onClick: () => navigate(a.path)
        }, a.label));
  });
  alvo.appendChild(lista);
}

// Em construção (telas que ainda não foram implementadas).
const STUB_PATHS = ['/configuracoes'];
export async function renderShell(rootEl) {
  const profile = await getProfile();
  const app = h(
    'div',
    { class: 'app' },
    renderSidebar(profile),
    h('div', { class: 'sidebar-overlay', onclick: closeSidebar }),
    h(
      'main',
      { class: 'main' },
      renderTopbar(),
      h('div', { class: 'subnav vazio', id: 'subnav' }),
      h('div', { class: 'content', id: 'view' })
    )
  );
  setContent(rootEl, app);
  ouveSistema();
  return document.getElementById('view');
}

function toggleSidebar() {
  document.querySelector('.app')?.classList.toggle('sidebar-open');
}
function closeSidebar() {
  document.querySelector('.app')?.classList.remove('sidebar-open');
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
      controleTema(),
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
      // Link externo (abre em nova aba) — ex: Gerador de Peças
      if (it.external) {
        return h(
          'a',
          {
            class: 'nav-item',
            href: it.href,
            target: '_blank',
            rel: 'noopener',
            onclick: () => closeSidebar()
          },
          icons[it.icon](),
          it.label
        );
      }
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
            closeSidebar();
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
    h(
      'button',
      { class: 'menu-toggle', title: 'Menu', onclick: toggleSidebar },
      icons.menu ? icons.menu() : burgerSvg()
    ),
    h('div', { class: 'topbar-crumb' }, h('strong', {}, 'Painel Nutrição Brasil'))
  );
}

function burgerSvg() {
  const span = document.createElement('span');
  span.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
  return span.firstChild;
}
function initials(email) {
  if (!email) return '?';
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
