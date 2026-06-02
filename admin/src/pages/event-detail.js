import { pageEventCertificates } from './event-certificates.js';
import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { getEvent, updateEvent } from '../data/events.js';
import { listAllParticipants } from '../data/participants.js';
import { fmtDate, fmtRelative, debounce } from '../core/utils.js';
import { toast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { navigate } from '../core/router.js';

const PAGE_SIZE = 100;

export async function pageEventDetail(view, { params }) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));

  const eventId = params.id;
  const event = await getEvent(eventId);
  if (!event) {
    setContent(view, h('div', { class: 'empty' },
      h('div', { class: 'empty-icon' }, icons.alert()),
      h('div', { class: 'empty-title' }, 'Evento não encontrado'),
      h('div', { class: 'empty-body' }, 'Esse evento foi removido ou você não tem acesso.'),
      h('button', { class: 'btn btn-secondary', onclick: () => navigate('/eventos') }, 'Voltar para Eventos')
    ));
    return;
  }

  let allParticipants = [];
  let filter = 'todos';
  let query = '';
  let visibleCount = PAGE_SIZE;

  try {
    allParticipants = await listAllParticipants(eventId);
  } catch (e) {
    setContent(view, h('div', { class: 'empty' },
      h('div', { class: 'empty-icon' }, icons.alert()),
      h('div', { class: 'empty-title' }, 'Erro ao carregar inscritos'),
      h('div', { class: 'empty-body' }, e.message || 'Tente recarregar a página.'),
      h('button', { class: 'btn btn-secondary', onclick: () => location.reload() }, 'Recarregar')
    ));
    return;
  }

  function getFiltered() {
    let list = allParticipants;
    if (filter === 'checkin')      list = list.filter(p => p.checked === true);
    if (filter === 'pendentes')    list = list.filter(p => p.checked === false);
    if (query) {
      const q = query.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, '');
      list = list.filter(p => {
        if ((p.name || '').toLowerCase().includes(q)) return true;
        if ((p.email || '').toLowerCase().includes(q)) return true;
        if ((p.code || '').toLowerCase().includes(q)) return true;
        if (qDigits && (p.phone || '').replace(/\D/g, '').includes(qDigits)) return true;
        return false;
      });
    }
    return list;
  }

  function counts() {
    return {
      todos:          allParticipants.length,
      checkin:        allParticipants.filter(p => p.checked === true).length,
      pendentes:      allParticipants.filter(p => p.checked === false).length,
    };
  }

  function header() {
    const c = counts();
    const pct = c.todos > 0 ? Math.round((c.checkin / c.todos) * 100) : 0;
    const isEncerrado = event.status === 'encerrado';
    const days = event.date_start
      ? Math.ceil((new Date(event.date_start) - Date.now()) / 86400000)
      : null;

    return h('div', { class: 'evd-head' },
      h('div', {},
        h('button', {
          class: 'btn btn-ghost',
          style: { marginBottom: '8px', padding: '4px 8px', height: 'auto' },
          onclick: () => navigate('/eventos')
        }, icons.arrowLeft(), 'Eventos'),
        h('div', { class: 'evd-title' }, event.name || event.slug),
        h('div', { class: 'page-sub' },
          [
            event.location || 'A confirmar',
            event.date_start ? fmtDate(event.date_start) : null,
            isEncerrado ? 'encerrado' : (days !== null && days > 0 ? `em ${days} dia${days !== 1 ? 's' : ''}` : null)
          ].filter(Boolean).join(' · ')
        )
      ),
      h('div', { class: 'evd-stats' },
        h('div', {},
          h('div', { class: 'evd-stat-label' }, 'Inscritos'),
          h('div', { class: 'evd-stat-value mono' }, String(c.todos))
        ),
        h('div', {},
          h('div', { class: 'evd-stat-label' }, 'Check-in'),
          h('div', { class: 'evd-stat-value mono', style: { color: c.checkin > 0 ? 'var(--green)' : 'var(--ink-strong)' } },
            String(c.checkin),
            c.todos > 0 ? h('small', {}, ` · ${pct}%`) : null
          )
        ),
        h('div', {},
          h('div', { class: 'evd-stat-label' }, 'Pendentes'),
          h('div', { class: 'evd-stat-value mono', style: { color: c.pendentes > 0 ? 'var(--amber)' : 'var(--ink-strong)' } },
            String(c.pendentes)
          )
        ),
        null
      )
    );
  }

  function actions() {
    return h('div', { class: 'evd-actions' },
      h('button', { class: 'btn btn-primary', onclick: stub('Importar lista') },
        icons.upload(), 'Importar lista'
      ),
      h('button', { class: 'btn btn-secondary', onclick: stub('Adicionar pessoa') },
        icons.plus(), 'Adicionar pessoa'
      ),
      h('button', { class: 'btn btn-secondary', onclick: stub('Disparar mensagem') },
        icons.send(), 'Disparar mensagem'
      ),
      h('button', { class: 'btn btn-secondary', onclick: () => pageEventCertificates(view, event, () => render()) },
        icons.award(), 'Certificado'
      ),
      h('button', { class: 'btn btn-secondary', onclick: stub('Etiquetas') },
        icons.tag(), 'Etiquetas'
      ),
      h('div', { class: 'spacer' }),
      h('button', {
        class: 'btn btn-ghost',
        onclick: () => openEditModal(event, async (patch) => {
          await updateEvent(eventId, patch);
          toast.success('Evento atualizado');
          Object.assign(event, patch);
          render();
        })
      }, icons.edit(), 'Editar evento')
    );
  }

  function render() {
    setContent(view, header(), actions(), h('div', { class: 'table-card', id: 'evd-table' }));
    renderTable();
  }

  function renderTable() {
    const container = document.getElementById('evd-table');
    if (!container) return;

    const c = counts();

    setContent(container,
      h('div', { class: 'table-toolbar' },
        h('div', { class: 'toolbar-search' },
          icons.search(),
          h('input', {
            type: 'text',
            placeholder: 'Buscar por nome, email, telefone ou código...',
            value: query,
            oninput: (e) => { query = e.target.value; visibleCount = PAGE_SIZE; updateBody(); }
          })
        ),
        h('div', { style: { display: 'flex', gap: '4px', marginLeft: 'auto', flexWrap: 'wrap' } },
          tabBtn(`Todos · ${c.todos}`, filter === 'todos', () => { filter = 'todos'; visibleCount = PAGE_SIZE; updateBody(); }),
          tabBtn(`Check-in · ${c.checkin}`, filter === 'checkin', () => { filter = 'checkin'; visibleCount = PAGE_SIZE; updateBody(); }, 'green'),
          tabBtn(`Pendentes · ${c.pendentes}`, filter === 'pendentes', () => { filter = 'pendentes'; visibleCount = PAGE_SIZE; updateBody(); }, 'amber'),
          null
        )
      ),
      h('div', { id: 'evd-table-body' })
    );

    updateBody();
  }

  function updateBody() {
    const body = document.getElementById('evd-table-body');
    if (!body) return;

    const filtered = getFiltered();
    const visible = filtered.slice(0, visibleCount);

    if (filtered.length === 0) {
      setContent(body,
        h('div', { class: 'loading-row' },
          query
            ? `Nenhum resultado para "${query}".`
            : filter === 'checkin'
              ? 'Nenhum check-in feito ainda.'
              : filter === 'pendentes'
                ? 'Nenhum pendente — todos fizeram check-in!'
                : filter === 'inadimplentes'
                  ? 'Nenhuma inadimplência registrada.'
                  : 'Sem inscritos ainda.'
        )
      );
      return;
    }

    setContent(body,
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {},
          h('th', { style: { width: '32%' } }, 'Inscrito'),
          h('th', {}, 'Telefone'),
          h('th', {}, 'Lote'),
          h('th', {}, 'Origem'),
          h('th', {}, 'Check-in')
        )),
        h('tbody', {}, ...visible.map(rowFor))
      ),
      filtered.length > visibleCount
        ? h('div', { class: 'table-pager' },
            h('span', {}, `Mostrando ${visible.length} de ${filtered.length}`),
            h('button', {
              class: 'btn btn-ghost',
              onclick: () => { visibleCount += PAGE_SIZE; updateBody(); }
            }, 'Carregar mais')
          )
        : h('div', { class: 'table-pager' },
            h('span', {}, `${filtered.length} ${filtered.length === 1 ? 'inscrito' : 'inscritos'}`)
          )
    );
  }

  function rowFor(p) {
    const isCanceled = p.payment_status === 'canceled' || p.payment_status === 'refunded';
    return h('tr', {
        class: isCanceled ? 'row-payment-canceled' : '',
        onclick: () => openParticipant(p)
      },
      h('td', {},
        h('div', { class: 'row-name', style: isCanceled ? { color: 'var(--ink-mute)', textDecoration: 'line-through' } : {} }, p.name || '—'),
        p.email ? h('div', { class: 'row-sub' }, p.email) : null
      ),
      h('td', { class: 'mono' }, p.phone || '—'),
      h('td', {}, p.lote || '—'),
      h('td', {}, sourcePill(p.source)),
      h('td', {},
        p.checked
          ? h('span', { class: 'status live' }, fmtRelative(p.checked_at))
          : h('span', { class: 'status done' }, 'Pendente')
      )
    );
  }

  function openParticipant(p) {
    openModal({
      title: p.name || 'Inscrito',
      body: h('div', {},
        infoRow('Email', p.email),
        infoRow('Telefone', p.phone),
        infoRow('Código', p.code),
        infoRow('Lote', p.lote),
        infoRow('Origem', p.source || 'manual'),
        infoRow('Check-in', p.checked ? `Sim · ${fmtRelative(p.checked_at)}` : 'Pendente'),
        infoRow('Hotmart transaction', p.hotmart_transaction_id),
        p.whatsapp_sent_at ? infoRow('WhatsApp enviado', fmtRelative(p.whatsapp_sent_at)) : null,
        p.whatsapp_error ? infoRow('Erro WhatsApp', p.whatsapp_error) : null
      ),
      actions: [{ label: 'Fechar', kind: 'btn-secondary', onClick: (close) => close() }]
    });
  }

  render();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function paymentPill(p) {
  const status = p.payment_status || 'paid';
  const total  = p.installments_total || 1;
  const pagas  = p.installments_paid  || 1;

  let label, cls;
  if (status === 'paid') {
    // Pago — mostrar se foi parcelado e quitou ou se foi à vista
    label = total > 1 ? `Pago ${total}/${total}` : 'Pago';
    cls   = 'payment-paid';
  } else if (status === 'partial') {
    label = `Parcelando ${pagas}/${total}`;
    cls   = 'payment-partial';
  } else if (status === 'canceled') {
    label = 'Cancelado';
    cls   = 'payment-canceled';
  } else if (status === 'refunded') {
    label = 'Reembolsado';
    cls   = 'payment-canceled';
  } else {
    label = 'Pago';
    cls   = 'payment-paid';
  }

  return h('span', { class: `payment-pill ${cls}` }, label);
}

function paymentLabel(status) {
  return { paid: 'Pago', partial: 'Parcelando', canceled: 'Cancelado', refunded: 'Reembolsado' }[status] || 'Pago';
}

function tabBtn(label, active, onClick, accent) {
  const colorActive = accent === 'green'
    ? 'var(--green)'
    : accent === 'amber'
      ? 'var(--amber)'
      : accent === 'red'
        ? 'var(--red, #ef4444)'
        : 'var(--ink-strong)';
  const bgActive = accent === 'green'
    ? 'var(--green-soft)'
    : accent === 'amber'
      ? 'var(--amber-soft)'
      : accent === 'red'
        ? 'rgba(239,68,68,0.1)'
        : 'var(--bg-2)';
  return h('button', {
    class: 'btn',
    style: {
      padding: '6px 12px',
      height: 'auto',
      fontSize: '12px',
      background: active ? bgActive : 'transparent',
      color: active ? colorActive : 'var(--ink-soft)'
    },
    onclick: onClick
  }, label);
}

function sourcePill(source) {
  const map = {
    hotmart: { cls: 'hotmart', label: 'Hotmart' },
    import:  { cls: 'import',  label: 'CSV' },
    manual:  { cls: 'manual',  label: 'Manual' },
    api:     { cls: 'api',     label: 'API' }
  };
  const cfg = map[source] || map.manual;
  return h('span', { class: `source-pill ${cfg.cls}` }, cfg.label);
}

function infoRow(label, value) {
  if (value === null || value === undefined || value === '') return null;
  return h('div', { style: { display: 'flex', padding: '8px 0', borderBottom: '1px solid var(--line)', gap: '12px' } },
    h('div', { style: { fontSize: '12px', color: 'var(--ink-mute)', minWidth: '140px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' } }, label),
    h('div', { class: 'mono', style: { fontSize: '13px', color: 'var(--ink)' } }, String(value))
  );
}

function stub(label) {
  return () => toast.info(`${label} — em construção (próxima entrega)`);
}

function openEditModal(event, onSave) {
  let form;
  openModal({
    title: 'Editar evento',
    body: (close) => {
      form = h('div', {},
        h('div', { class: 'field' },
          h('label', {}, 'Nome'),
          h('input', { class: 'input', name: 'name', value: event.name || '' })
        ),
        h('div', { class: 'field' },
          h('label', {}, 'Local'),
          h('input', { class: 'input', name: 'location', value: event.location || '' })
        ),
        h('div', { class: 'field' },
          h('label', {}, 'Data de início'),
          h('input', { class: 'input', name: 'date_start', type: 'datetime-local', value: toLocalInput(event.date_start) })
        ),
        h('div', { class: 'field' },
          h('label', {}, 'Data de término'),
          h('input', { class: 'input', name: 'date_end', type: 'datetime-local', value: toLocalInput(event.date_end) })
        ),
        h('div', { class: 'field' },
          h('label', {}, 'Status'),
          h('select', { class: 'input', name: 'status' },
            ['embreve', 'ativo', 'encerrado'].map(s =>
              h('option', { value: s, selected: event.status === s ? 'selected' : null }, statusLabel(s))
            )
          )
        ),
        h('div', { class: 'field' },
          h('label', {}, 'ID do produto Hotmart'),
          h('input', { class: 'input', name: 'hotmart_product_id', value: event.hotmart_product_id || '', placeholder: 'Ex: 2384751' })
        ),
        h('div', { class: 'field' },
          h('label', {}, 'Horas certificadas'),
          h('input', { class: 'input', name: 'certificate_hours', type: 'number', step: '0.5', value: event.certificate_hours || '' })
        )
      );
      return form;
    },
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (close) => close() },
      {
        label: 'Salvar',
        kind: 'btn-primary',
        onClick: async (close) => {
          const get = (n) => form.querySelector(`[name=${n}]`).value || null;
          const patch = {
            name: get('name'),
            location: get('location'),
            date_start: get('date_start') ? new Date(get('date_start')).toISOString() : null,
            date_end: get('date_end') ? new Date(get('date_end')).toISOString() : null,
            status: get('status'),
            hotmart_product_id: get('hotmart_product_id'),
            certificate_hours: get('certificate_hours') ? Number(get('certificate_hours')) : null
          };
          try {
            await onSave(patch);
            close();
          } catch (e) {
            toast.danger('Erro ao salvar: ' + e.message);
          }
        }
      }
    ]
  });
}

function statusLabel(s) {
  return { embreve: 'Em breve', ativo: 'Em vendas', encerrado: 'Encerrado' }[s] || s;
}

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}
