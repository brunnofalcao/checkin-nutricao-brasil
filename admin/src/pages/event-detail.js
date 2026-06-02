import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { getEvent, updateEvent } from '../data/events.js';
import { searchParticipants, countParticipants } from '../data/participants.js';
import { fmtDate, fmtRelative, debounce } from '../core/utils.js';
import { toast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { navigate } from '../core/router.js';

const PAGE_SIZE = 50;

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

  let query = '';
  let onlyPending = false;
  let offset = 0;
  let total = 0;
  let participants = [];

  async function loadParticipants() {
    [participants, total] = await Promise.all([
      searchParticipants(eventId, { query, onlyPending, limit: PAGE_SIZE, offset }),
      countParticipants(eventId, onlyPending)
    ]);
    renderTable();
  }

  function header() {
    const days = event.date_start
      ? Math.ceil((new Date(event.date_start) - Date.now()) / 86400000)
      : null;
    const inscritos = event.total_inscritos || 0;
    const checkins = event.total_checkins || 0;
    const pctCheckin = inscritos > 0 ? Math.round((checkins / inscritos) * 100) : 0;

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
            event.location,
            event.date_start ? fmtDate(event.date_start) : null,
            days !== null && days > 0 ? `em ${days} dia${days !== 1 ? 's' : ''}` : null,
            event.status === 'encerrado' ? 'encerrado' : null
          ].filter(Boolean).join(' · ')
        )
      ),
      h('div', { class: 'evd-stats' },
        h('div', {},
          h('div', { class: 'evd-stat-label' }, 'Inscritos'),
          h('div', { class: 'evd-stat-value mono' }, String(inscritos))
        ),
        h('div', {},
          h('div', { class: 'evd-stat-label' }, 'Check-in'),
          h('div', { class: 'evd-stat-value mono' },
            String(checkins),
            inscritos > 0 ? h('small', {}, ` · ${pctCheckin}%`) : null
          )
        )
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
      h('button', { class: 'btn btn-secondary', onclick: stub('Certificado') },
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

  function tableEl() {
    return h('div', { class: 'table-card', id: 'evd-table' });
  }

  function render() {
    setContent(view, header(), actions(), tableEl());
    renderTable();
    loadParticipants();
  }

  const handleSearch = debounce((v) => {
    query = v.trim();
    offset = 0;
    loadParticipants();
  }, 250);

  function renderTable() {
    const container = document.getElementById('evd-table');
    if (!container) return;

    setContent(container,
      h('div', { class: 'table-toolbar' },
        h('div', { class: 'toolbar-search' },
          icons.search(),
          h('input', {
            type: 'text',
            placeholder: 'Buscar por nome, email, telefone ou código...',
            value: query,
            oninput: (e) => handleSearch(e.target.value)
          })
        ),
        h('div', { style: { display: 'flex', gap: '4px', marginLeft: 'auto' } },
          tabBtn(`Todos · ${event.total_inscritos || 0}`, !onlyPending, () => { onlyPending = false; offset = 0; loadParticipants(); }),
          tabBtn(`Pendentes`, onlyPending, () => { onlyPending = true; offset = 0; loadParticipants(); })
        )
      ),

      participants.length === 0
        ? h('div', { class: 'loading-row' }, query ? 'Nenhum resultado para essa busca.' : 'Sem inscritos ainda.')
        : h('table', { class: 'table' },
            h('thead', {}, h('tr', {},
              h('th', { style: { width: '34%' } }, 'Inscrito'),
              h('th', {}, 'Telefone'),
              h('th', {}, 'Lote'),
              h('th', {}, 'Origem'),
              h('th', {}, 'Check-in')
            )),
            h('tbody', {}, ...participants.map(rowFor))
          ),

      total > PAGE_SIZE ? pagerEl() : null
    );
  }

  function pagerEl() {
    const start = offset + 1;
    const end = Math.min(offset + participants.length, total);
    return h('div', { class: 'table-pager' },
      h('span', {}, `${start}–${end} de ${total}`),
      h('div', { class: 'pager-actions' },
        h('button', {
          class: 'btn btn-ghost',
          disabled: offset === 0,
          onclick: () => { offset = Math.max(0, offset - PAGE_SIZE); loadParticipants(); }
        }, icons.arrowLeft(), 'Anterior'),
        h('button', {
          class: 'btn btn-ghost',
          disabled: offset + PAGE_SIZE >= total,
          onclick: () => { offset += PAGE_SIZE; loadParticipants(); }
        }, 'Próxima', icons.arrowRight())
      )
    );
  }

  function rowFor(p) {
    return h('tr', { onclick: () => openParticipant(p) },
      h('td', {},
        h('div', { class: 'row-name' }, p.name || '—'),
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

function tabBtn(label, active, onClick) {
  return h('button', {
    class: 'btn',
    style: {
      padding: '6px 12px',
      height: 'auto',
      fontSize: '12px',
      background: active ? 'var(--bg-2)' : 'transparent',
      color: active ? 'var(--ink-strong)' : 'var(--ink-soft)'
    },
    onclick: onClick
  }, label);
}

function sourcePill(source) {
  const map = {
    hotmart: { cls: 'hotmart', label: 'Hotmart' },
    import: { cls: 'import', label: 'CSV' },
    manual: { cls: 'manual', label: 'Manual' },
    api: { cls: 'api', label: 'API' }
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

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}
