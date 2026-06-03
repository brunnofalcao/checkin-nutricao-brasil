import { getSession, getProfile, onAuthChange } from './data/auth.js';
import { renderLogin } from './pages/login.js';
import { renderShell } from './ui/chrome.js';
import { route, start } from './core/router.js';
import { pageHome } from './pages/home.js';
import { pageEvents } from './pages/events.js';
import { pageEventDetail } from './pages/event-detail.js';
import { pageCertificates } from './pages/certificates.js';
import { pageDisparos } from './pages/disparos.js';
import { pageTemplates } from './pages/templates.js';
import { h, setContent } from './core/dom.js';
import { toast } from './ui/toast.js';
const root = document.getElementById('root');
async function bootstrap() {
  const session = await getSession();
  if (!session) {
    renderLogin(root, () => location.reload());
    return;
  }
  const profile = await getProfile();
  if (!profile || profile.role !== 'admin') {
    renderAccessDenied(profile);
    return;
  }
  // Tem sessão e é admin → renderiza shell + roteamento.
  const view = await renderShell(root);
  // Registra rotas.
  route('/', pageHome);
  route('/eventos', pageEvents);
  route('/eventos/:id', pageEventDetail);
  route('/certificados', pageCertificates);
  route('/certificados/:id', pageCertificates);
  route('/disparos', pageDisparos);
  route('/templates', pageTemplates);
  start(view);
}
function renderAccessDenied(profile) {
  setContent(
    root,
    h(
      'div',
      { class: 'login-shell' },
      h(
        'div',
        { class: 'login-card' },
        h('div', { class: 'login-brand' }, 'Sem acesso'),
        h(
          'div',
          { class: 'login-sub' },
          profile
            ? `Sua conta (${profile.email}) está no painel como "${profile.role || 'sem role'}". O painel administrativo é restrito a contas admin.`
            : 'Sessão inválida.'
        ),
        h(
          'button',
          {
            class: 'btn btn-secondary btn-block',
            style: { marginTop: '16px' },
            onclick: async () => {
              const { signOut } = await import('./data/auth.js');
              await signOut();
              location.reload();
            }
          },
          'Sair e entrar com outra conta'
        )
      )
    )
  );
}
// Re-renderiza se a sessão mudar (logout em outra aba etc).
onAuthChange((event) => {
  if (event === 'SIGNED_OUT') location.reload();
});
bootstrap().catch((err) => {
  console.error('Bootstrap error:', err);
  toast.danger('Erro ao iniciar: ' + err.message);
});
