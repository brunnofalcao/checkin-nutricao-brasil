// Router por hash (#/eventos, #/eventos/:id?aba=x).
// Vantagem: zero config no Vercel, refresh sempre funciona.

const routes = [];
let mount = null;
let currentDispose = null;

// Registra uma rota.
//   path: string com :params  ex: '/eventos/:id'
//   render: async (mount, { params, query }) => void | dispose
export function route(path, render) {
  const keys = [];
  const regex = new RegExp(
    '^' +
      path.replace(/\/:([^/]+)/g, (_, k) => {
        keys.push(k);
        return '/([^/]+)';
      }) +
      '$'
  );
  routes.push({ path, regex, keys, render });
}

// Inicia o roteador.
export function start(mountEl) {
  mount = mountEl;
  window.addEventListener('hashchange', dispatch);
  dispatch();
}

// Navega.
export function navigate(path) {
  if (location.hash === '#' + path) {
    dispatch(); // força re-render mesmo se for a mesma rota
  } else {
    location.hash = path;
  }
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { path, query };
}

async function dispatch() {
  if (!mount) return;
  const { path, query } = parseHash();

  // Encontra rota.
  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));

      // Limpa rota anterior.
      if (typeof currentDispose === 'function') {
        try {
          currentDispose();
        } catch (e) {
          console.warn('dispose error', e);
        }
        currentDispose = null;
      }

      while (mount.firstChild) mount.removeChild(mount.firstChild);
      try {
        const result = await r.render(mount, { params, query });
        if (typeof result === 'function') currentDispose = result;
      } catch (e) {
        console.error('Route render error:', e);
        mostraAviso(mount, 'Erro ao carregar a página', String(e && e.message || e), true);
      }

      // Abas do workspace atual.
      import('../ui/chrome.js').then((m) => m.atualizaSubnav(path)).catch(() => {});

      // Marca nav-item ativo.
      document.querySelectorAll('.nav-item[data-path]').forEach((n) => {
        const np = n.dataset.path;
        n.classList.toggle('active', path === np || path.startsWith(np + '/'));
      });

      mount.scrollTop = 0;
      return;
    }
  }

  // 404.
  mostraAviso(mount, 'Página não encontrada', path, false);
}


// Nunca interpolar dado externo em innerHTML. `path` vem do hash da URL e
// `detalhe` vem de mensagem de erro — os dois são controlados por terceiros.
function mostraAviso(mount, titulo, detalhe, erro) {
  mount.replaceChildren();
  const cx = document.createElement('div');
  cx.style.cssText = 'padding:40px;max-width:640px';
  const h = document.createElement('div');
  h.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:8px' +
    (erro ? ';color:var(--red)' : '');
  h.textContent = titulo;
  const p = document.createElement('div');
  p.style.cssText = 'color:var(--ink-mute);font-size:13px;word-break:break-all';
  p.textContent = detalhe;
  cx.append(h, p);
  mount.appendChild(cx);
}
