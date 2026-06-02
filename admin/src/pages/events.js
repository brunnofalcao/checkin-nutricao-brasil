import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { listEvents } from '../data/events.js';
import { navigate } from '../core/router.js';
import { fmtDate } from '../core/utils.js';

export async function pageEvents(view) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));

  const events = await listEvents();

  let filter = 'todos';
  let searchTerm = '';

  function render() {
    const filtered = events.filter((e) => {
      const matchesFilter =
        filter === 'todos' ||
        (filter === 'vendas' && e.status !== 'encerrado') ||
        (filter === 'encerrados' && e.status === 'encerrado');
      const matchesSearch =
        !searchTerm ||
        (e.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.location || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesFilter && matchesSearch;
    });

    const counts = {
      todos: events.length,
      vendas: events.filter((e) => e.status !== 'encerrado').length,
      encerrados: events.filter((e) => e.status === 'encerrado').length
    };

    setContent(
      view,
      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', { class: 'page-title' }, 'Eventos'),
          h('div', { class: 'page-sub' }, 'O calendário Nutrição Brasil. Clique em qualquer evento para abrir.')
        ),
        h('div', { class: 'page-actions' },
          h('button', { class: 'btn btn-primary', onclick: () => alert('Em construção — próxima entrega') },
            icons.plus(), 'Novo evento'
          )
        )
      ),

      h('div', { class: 'table-card' },
        h('div', { class: 'table-toolbar' },
          h('div', { class: 'toolbar-search' },
            icons.search(),
            h('input', {
              type: 'text',
              placeholder: 'Buscar por cidade ou nome...',
              value: searchTerm,
              oninput: (e) => { searchTerm = e.target.value; render(); }
            })
          ),
          h('div', { style: { display: 'flex', gap: '4px', marginLeft: 'auto' } },
            filterTab('todos', `Todos · ${counts.todos}`, filter, () => { filter = 'todos'; render(); }),
            filterTab('vendas', `Em vendas · ${counts.vendas}`, filter, () => { filter = 'vendas'; render(); }),
            filterTab('encerrados', `Encerrados · ${counts.encerrados}`, filter, () => { filter = 'encerrados'; render(); })
          )
        ),

        filtered.length === 0
          ? h('div', { class: 'loading-row' }, 'Nenhum evento encontrado.')
          : h('table', { class: 'table' },
              h('thead', {},
                h('tr', {},
                  h('th', { style: { width: '28%' } }, 'Evento'),
                  h('th', {}, 'Data'),
                  h('th', {}, 'Local'),
                  h('th', {}, 'Inscritos'),
                  h('th', {}, 'Check-in'),
                  h('th', {}, 'Status')
                )
              ),
              h('tbody', {}, ...filtered.map((e) => renderRow(e)))
            )
      )
    );
  }

  function renderRow(ev) {
    const pct = ev.total_inscritos
      ? Math.round(((ev.total_checkins || 0) / ev.total_inscritos) * 100)
      : 0;

    return h('tr', { onclick: () => navigate(`/eventos/${ev.id}`) },
      h('td', {},
        h('div', { class: 'row-name' }, ev.name || ev.slug),
        ev.slug ? h('div', { class: 'row-sub' }, ev.slug) : null
      ),
      h('td', { class: 'mono' }, fmtDate(ev.date_start)),
      h('td', {}, ev.location || h('span', { style: { color: 'var(--ink-mute)' } }, 'A confirmar')),
      h('td', {}, progressMini(ev.total_inscritos || 0, capacity(ev))),
      h('td', { class: 'mono' },
        ev.status === 'encerrado' && ev.total_inscritos
          ? `${ev.total_checkins || 0} · ${pct}%`
          : '—'
      ),
      h('td', {}, renderStatus(ev.status))
    );
  }

  render();
}

function filterTab(key, label, active, onClick) {
  return h(
    'button',
    {
      class: 'btn',
      style: {
        padding: '6px 12px',
        height: 'auto',
        fontSize: '12px',
        background: active === key ? 'var(--bg-2)' : 'transparent',
        color: active === key ? 'var(--ink-strong)' : 'var(--ink-soft)'
      },
      onclick: onClick
    },
    label
  );
}

function progressMini(value, total) {
  if (!total) return h('span', { class: 'mono', style: { color: 'var(--ink-mute)' } }, value);
  const pct = Math.min(100, Math.round((value / total) * 100));
  return h('div', { class: 'progress-mini' },
    h('div', { class: 'progress-bar' }, h('div', { class: 'progress-fill', style: { width: pct + '%' } })),
    h('div', { class: 'progress-text' }, `${value} / ${total}`)
  );
}

// Capacidade estimada (campo "capacity" não existe ainda, então usa total_inscritos).
function capacity(ev) {
  return ev.capacity || ev.total_inscritos || 0;
}

function renderStatus(status) {
  const map = {
    ativo: { cls: 'soon', label: 'Em vendas' },
    embreve: { cls: 'soon', label: 'Em breve' },
    encerrado: { cls: 'done', label: 'Encerrado' }
  };
  const cfg = map[status] || { cls: 'done', label: status || '—' };
  return h('span', { class: `status ${cfg.cls}` }, cfg.label);
}
