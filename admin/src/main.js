import { getSession, getProfile, onAuthChange } from './data/auth.js';
import { renderLogin } from './pages/login.js';
import { renderShell } from './ui/chrome.js';
import { route, start } from './core/router.js';
import { podeVer, temPainel, rotaInicial, ROTULO_PAPEL } from './core/permissoes.js';
import { pageHome } from './pages/home.js';
import { pageEvents } from './pages/events.js';
import { pageEventDetail } from './pages/event-detail.js';
import { pageCertificates } from './pages/certificates.js';
import { pageCertEntrega } from './pages/cert-entrega.js';
import { pageExpositores } from './pages/expositores.js';
import { pagePessoas } from './pages/pessoas.js';
import { pageConfiguracoes } from './pages/configuracoes.js';
import { pageDisparos } from './pages/disparos.js';
import { pageTemplates } from './pages/templates.js';
import { pageDivulgacao } from './pages/divulgacao.js';
import { pageKb } from './pages/kb.js';
import { pageAtendimento } from './pages/atendimento.js';
import { h, setContent } from './core/dom.js';
import { toast } from './ui/toast.js';
import { telaDeErro, telaSemPermissao } from './ui/estado.js';
import { iniciaAvisoDeConexao } from './ui/conexao.js';
const root = document.getElementById('root');
async function bootstrap() {
  const session = await getSession();
  if (!session) {
    renderLogin(root, () => location.reload());
    return;
  }
  const profile = await getProfile();
  if (!profile || !temPainel(profile)) {
    renderAccessDenied(profile);
    return;
  }

  const view = await renderShell(root, profile);
  iniciaAvisoDeConexao();

  // Só registra o que o papel alcança. Esconder o menu e deixar a rota
  // registrada não é permissão — bastaria digitar o endereço.
  // Rota que o papel não alcança fica registrada, mas com a tela honesta:
  // quem digita /pessoas por engano lê "você não tem acesso" em vez de
  // "página não encontrada", que faz a pessoa achar que a página sumiu.
  const registra = (path, render) => {
    route(path, podeVer(profile, path) ? render : (view) => telaSemPermissao(view, profile));
  };
  registra('/', pageHome);
  registra('/eventos', pageEvents);
  registra('/eventos/:id', pageEventDetail);
  registra('/certificados', pageCertificates);
  registra('/certificados/entrega', pageCertEntrega);
  registra('/certificados/:id', pageCertificates);
  registra('/expositores', pageExpositores);
  registra('/pessoas', pagePessoas);
  registra('/configuracoes', pageConfiguracoes);
  registra('/disparos', pageDisparos);
  registra('/templates', pageTemplates);
  registra('/divulgacao', pageDivulgacao);
  registra('/base-conhecimento', pageKb);
  registra('/atendimento', pageAtendimento);

  // Quem não tem a home cairia num 404 ao abrir o painel.
  const inicio = rotaInicial(profile);
  if (inicio !== '/' && (!location.hash || location.hash === '#/' || location.hash === '#')) {
    location.hash = inicio;
  }
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
            ? `Sua conta (${profile.email}) está no painel como ` +
              `"${ROTULO_PAPEL[profile.role] || profile.role || 'sem papel'}", que não abre o painel. ` +
              'Peça a um administrador para liberar o acesso em Configurações.'
            : 'Sessão inválida.'
        ),
        // O perfil fica em cache na memória da página. Quem acabou de ser
        // liberado veria a mesma tela até apertar F5 — e ia pedir socorro
        // antes disso. Este botão é o F5 com nome.
        h(
          'button',
          {
            class: 'btn btn-primary btn-block',
            style: { marginTop: '16px' },
            onclick: () => location.reload()
          },
          'Já liberaram meu acesso — tentar de novo'
        ),
        h(
          'button',
          {
            class: 'btn btn-secondary btn-block',
            style: { marginTop: '8px' },
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
onAuthChange(async (event) => {
  // Recarregar direto no SIGNED_OUT é perigoso: com autoRefreshToken ligado,
  // uma renovação que falha em rede instável emite SIGNED_OUT e a página
  // recarregava sozinha no meio de uma operação. Confirma antes de assumir
  // que a pessoa saiu de verdade.
  if (event !== 'SIGNED_OUT') return;
  try {
    const s = await getSession();
    if (s) return;            // era só o token piscando; segue trabalhando
  } catch { /* sem rede: melhor não recarregar do que perder o que está na tela */ }
  location.reload();
});
bootstrap().catch((err) => {
  // Antes: só um aviso de 3,5s. Como bootstrap() faz duas chamadas de rede
  // ANTES de escrever qualquer coisa em #root, uma falha deixava a página
  // permanentemente em branco — e F5 no mesmo wifi repetia. Tela branca não
  // dá para diferenciar de "o sistema morreu".
  telaDeErro(root, err, () => location.reload(), 'Não consegui abrir o painel');
});
