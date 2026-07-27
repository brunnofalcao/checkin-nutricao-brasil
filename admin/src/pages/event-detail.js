import { pageEventCertificates } from './event-certificates.js';
import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { getEvent, updateEvent } from '../data/events.js';
import { listAllParticipants } from '../data/participants.js';
import { listRaceProfiles, distanceLabel, shirtLabel } from '../data/race.js';
import { listRaceStock, saveRaceStock, buildStockRows, SHIRT_SIZES } from '../data/race-stock.js';
import { fmtDate, fmtRelative, debounce } from '../core/utils.js';
import { toast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { navigate } from '../core/router.js';
import { abreAdicionarPessoa } from './pessoa-nova.js';
import { abreCrachas } from './crachas.js';
import { abreImportar } from './importar.js';
import { agrupaPessoas, eventosComCertificado } from '../data/pessoas.js';

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

  const isRace = event.event_type === 'race';

  let allParticipants = [];
  let raceMap = {};          // participant_id -> race_profile (só evento corrida)
  let raceStock = {};        // tamanho -> qtd comprada (só evento corrida)
  let filter = 'todos';
  let query = '';
  let visibleCount = PAGE_SIZE;
  let sortBy = 'original';   // original | recent | old | az
  let loteFilter = '';       // '' = todos os lotes

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

  if (isRace) {
    try {
      raceMap = await listRaceProfiles(eventId);
    } catch (e) {
      // Página segue funcionando sem os chips; só avisa.
      toast.danger('Perfis da corrida não carregaram: ' + (e.message || e));
    }
    try {
      raceStock = await listRaceStock(eventId);
    } catch (e) {
      // Sem estoque cadastrado a tela segue igual — só não calcula ruptura.
      raceStock = {};
    }
  }

  // Lista única de lotes presentes (pro filtro), ignorando vazios
  function lotesDisponiveis() {
    const set = new Set();
    allParticipants.forEach(p => { if (p.lote) set.add(p.lote); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function getFiltered() {
    let list = allParticipants.slice();
    if (filter === 'checkin')      list = list.filter(p => p.checked === true);
    if (filter === 'pendentes')    list = list.filter(p => p.checked === false);
    if (loteFilter)                list = list.filter(p => (p.lote || '') === loteFilter);
    if (query) {
      const q = query.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, '');
      list = list.filter(p => {
        if ((p.name || '').toLowerCase().includes(q)) return true;
        if ((p.email || '').toLowerCase().includes(q)) return true;
        if ((p.code || '').toLowerCase().includes(q)) return true;
        if (qDigits && (p.phone || '').replace(/\D/g, '').includes(qDigits)) return true;
        const rp = isRace ? raceMap[p.id] : null;
        if (rp) {
          if (distanceLabel(rp.distance).toLowerCase().includes(q)) return true;
          if (shirtLabel(rp.shirt_size).toLowerCase().includes(q)) return true;
          if ((rp.bib_number || '').toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }
    // Ordenação (só reordena se o usuário escolher; 'original' mantém a ordem de carga)
    if (sortBy === 'recent') list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else if (sortBy === 'old') list.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    else if (sortBy === 'az') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
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

    return h('div', {},
      h('div', { class: 'evd-head' },
        h('div', {},
          h('button', {
            class: 'btn btn-ghost',
            style: { marginBottom: '8px', padding: '4px 8px', height: 'auto' },
            onclick: () => navigate('/eventos')
          }, icons.arrowLeft(), 'Eventos'),
          h('div', { class: 'row-name-wrap' },
            h('div', { class: 'evd-title' }, event.name || event.slug),
            isRace ? h('span', { class: 'race-badge' }, 'Corrida') : null
          ),
          h('div', { class: 'page-sub' },
            [
              event.location || event.venue || 'A confirmar',
              event.date_start
                ? fmtDate(event.date_start)
                : (event.event_date ? fmtDate(event.event_date + 'T00:00:00') : null),
              isEncerrado ? 'encerrado' : (days !== null && days > 0 ? `em ${days} dia${days !== 1 ? 's' : ''}` : null)
            ].filter(Boolean).join(' · ')
          )
        ),
        h('div', { class: 'evd-stats' },
          h('div', {},
            h('div', { class: 'evd-stat-label' }, isRace ? 'Corredores' : 'Inscritos'),
            h('div', { class: 'evd-stat-value mono' }, String(c.todos))
          ),
          h('div', {},
            h('div', { class: 'evd-stat-label' }, isRace ? 'Kits retirados' : 'Check-in'),
            h('div', { class: 'evd-stat-value mono', style: { color: c.checkin > 0 ? 'var(--green)' : 'var(--ink-strong)' } },
              String(c.checkin),
              c.todos > 0 ? h('small', {}, ` · ${pct}%`) : null
            )
          ),
          h('div', {},
            h('div', { class: 'evd-stat-label' }, isRace ? 'Kits pendentes' : 'Pendentes'),
            h('div', { class: 'evd-stat-value mono', style: { color: c.pendentes > 0 ? 'var(--amber)' : 'var(--ink-strong)' } },
              String(c.pendentes)
            )
          ),
          null
        )
      ),
      isRace ? kitSizesStrip() : null
    );
  }

  // Contadores de camiseta por tamanho (retirados/total) — só evento corrida.
  // Com estoque cadastrado, mostra o saldo na mesa e avisa ruptura antes da fila.
  function kitSizesStrip() {
    const rows = buildStockRows(raceMap, allParticipants, raceStock);
    if (!rows.length) return null;
    const risco = rows.filter((r) => r.cobertura !== null && r.cobertura < 0);
    const totalEstoque = rows.reduce((a, r) => a + (r.estoque || 0), 0);
    const totalDemanda = rows.reduce((a, r) => a + r.demanda, 0);

    return h('div', {},
      h('div', { class: 'evd-kit-sizes' },
        h('div', { class: 'evd-kit-sizes-label' }, 'Kits por camiseta'),
        ...rows.filter((r) => r.demanda > 0 || (r.estoque || 0) > 0).map((r) =>
          h('div', {
            class: `kit-size-card ${r.demanda > 0 && r.entregue >= r.demanda ? 'done' : ''} ${r.cobertura !== null && r.cobertura < 0 ? 'risk' : ''}`,
            title: r.estoque === null
              ? `${r.entregue} de ${r.demanda} entregues`
              : `${r.entregue} de ${r.demanda} entregues · estoque ${r.estoque} · na mesa ${r.saldo}`
          },
            h('span', { class: 'ks-size' }, r.size),
            h('span', { class: 'ks-nums mono' }, `${r.entregue}/${r.demanda}`),
            r.estoque !== null ? h('span', { class: 'ks-stock mono' }, `est. ${r.estoque}`) : null
          )
        ),
        h('button', { class: 'btn btn-secondary kit-stock-btn', onclick: openStockModal },
          icons.tag(), 'Estoque do kit'
        )
      ),
      risco.length
        ? h('div', { class: 'evd-kit-warn' },
            icons.alert(),
            h('span', {}, `Risco de ruptura: ${risco.map((r) => `${r.size} (faltam ${Math.abs(r.cobertura)})`).join(' · ')}`)
          )
        : (Object.keys(raceStock).length
            ? h('div', { class: 'evd-kit-note' },
                `Estoque cadastrado: ${totalEstoque} peças para ${totalDemanda} inscritos · sobra prevista ${totalEstoque - totalDemanda >= 0 ? '+' : ''}${totalEstoque - totalDemanda}`
              )
            : h('div', { class: 'evd-kit-note' },
                'Estoque não cadastrado — clique em "Estoque do kit" para lançar quantas camisetas existem de cada tamanho.'
              ))
    );
  }

  // Cadastro do estoque de camisetas (admin). Demanda e entregues aparecem ao
  // lado para o lançamento ser feito com o número real na frente.
  function openStockModal() {
    const rows = buildStockRows(raceMap, allParticipants, raceStock);
    const sizes = [...new Set([...SHIRT_SIZES, ...rows.map((r) => r.size)])].filter((s) => s && s !== '?');
    let form;

    openModal({
      title: 'Estoque do kit — camisetas',
      body: () => {
        form = h('div', {},
          h('div', { class: 'kb-note' },
            icons.info(),
            h('span', {}, 'Quantas peças a produção tem de cada tamanho. É isso que faz o painel do celular avisar ruptura ',
              h('strong', {}, 'antes'), ' de a fila descobrir.')
          ),
          h('table', { class: 'table stock-table' },
            h('thead', {}, h('tr', {},
              h('th', {}, 'Tamanho'),
              h('th', {}, 'Inscritos'),
              h('th', {}, 'Entregues'),
              h('th', { style: { width: '130px' } }, 'Estoque')
            )),
            h('tbody', {}, ...sizes.map((size) => {
              const r = rows.find((x) => x.size === size) || { demanda: 0, entregue: 0, estoque: null };
              return h('tr', {},
                h('td', {}, h('strong', {}, size)),
                h('td', { class: 'mono' }, String(r.demanda)),
                h('td', { class: 'mono' }, String(r.entregue)),
                h('td', {}, h('input', {
                  class: 'input mono',
                  type: 'number',
                  min: '0',
                  step: '1',
                  name: `size_${size}`,
                  value: r.estoque === null ? '' : String(r.estoque),
                  placeholder: '0'
                }))
              );
            }))
          )
        );
        return form;
      },
      actions: [
        { label: 'Cancelar', kind: 'btn-ghost', onClick: (closeFn) => closeFn() },
        {
          label: 'Salvar estoque',
          kind: 'btn-primary',
          onClick: async (closeFn) => {
            const payload = {};
            sizes.forEach((size) => {
              const el = form.querySelector(`[name="size_${size}"]`);
              const raw = el?.value?.trim();
              if (raw !== '' && raw !== undefined && raw !== null) payload[size] = Number(raw) || 0;
            });
            if (!Object.keys(payload).length) {
              toast.danger('Informe ao menos um tamanho.');
              return;
            }
            const btns = form.closest('.modal')?.querySelectorAll('footer .btn');
            btns?.forEach((b) => (b.disabled = true));
            try {
              raceStock = await saveRaceStock(eventId, payload);
              toast.success('Estoque salvo — o painel do celular já usa esses números');
              closeFn();
              render();
            } catch (e) {
              btns?.forEach((b) => (b.disabled = false));
              toast.danger('Erro ao salvar: ' + (e.message || e));
            }
          }
        }
      ]
    });
  }

  function actions() {
    return h('div', { class: 'evd-actions' },
      h('button', {
        class: 'btn btn-primary',
        onclick: () => abreImportar({
          evento: event,
          participantes: allParticipants,
          aoImportar: async () => {
            allParticipants = await listAllParticipants(eventId);
            render();
          }
        })
      }, icons.upload(), 'Importar lista'),
      h('button', { class: 'btn btn-secondary', onclick: adicionarPessoa },
        icons.plus(), 'Adicionar pessoa'
      ),
      h('button', {
        class: 'btn btn-secondary',
        onclick: () => navigate('/disparos')
      }, icons.send(), 'Disparar mensagem'),
      h('button', { class: 'btn btn-secondary', onclick: () => pageEventCertificates(view, event, () => render()) },
        icons.award(), 'Certificado'
      ),
      h('button', {
        class: 'btn btn-secondary',
        onclick: () => abreCrachas({ evento: event, participantes: allParticipants })
      }, icons.tag(), 'Crachás'),
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

  // Adiciona alguém direto neste evento. A checagem de duplicata usa só a
  // lista deste evento — é a que importa aqui e já está carregada.
  async function adicionarPessoa() {
    let comCert = new Set();
    try {
      comCert = await eventosComCertificado();
    } catch (e) {
      // Sem isso o cadastro segue; só não gera token de certificado.
    }
    abreAdicionarPessoa({
      eventos: [event],
      eventoId: eventId,
      pessoas: agrupaPessoas(allParticipants, new Map([[eventId, event]])),
      comCertificado: comCert,
      aoCriar: (linha) => {
        allParticipants.unshift(linha);
        render();
      }
    });
  }

  function render() {
    setContent(view, header(), actions(), h('div', { class: 'table-card', id: 'evd-table' }));
    renderTable();
  }

  function renderTable() {
    const container = document.getElementById('evd-table');
    if (!container) return;

    const c = counts();
    const lotes = lotesDisponiveis();

    setContent(container,
      h('div', { class: 'table-toolbar' },
        h('div', { class: 'toolbar-search' },
          icons.search(),
          h('input', {
            type: 'text',
            placeholder: isRace
              ? 'Buscar por nome, camiseta (P, M...), distância (5K/10K) ou telefone...'
              : 'Buscar por nome, email, telefone ou código...',
            value: query,
            oninput: (e) => { query = e.target.value; visibleCount = PAGE_SIZE; updateBody(); }
          })
        ),
        h('div', { style: { display: 'flex', gap: '4px', marginLeft: 'auto', flexWrap: 'wrap' } },
          tabBtn(`Todos · ${c.todos}`, filter === 'todos', () => { filter = 'todos'; visibleCount = PAGE_SIZE; updateBody(); }),
          tabBtn(`${isRace ? 'Kit retirado' : 'Check-in'} · ${c.checkin}`, filter === 'checkin', () => { filter = 'checkin'; visibleCount = PAGE_SIZE; updateBody(); }, 'green'),
          tabBtn(`Pendentes · ${c.pendentes}`, filter === 'pendentes', () => { filter = 'pendentes'; visibleCount = PAGE_SIZE; updateBody(); }, 'amber'),
          null
        )
      ),
      // Segunda linha: filtro de lote + ordenação (lote não se aplica à corrida)
      h('div', { class: 'evd-subtoolbar' },
        isRace ? null : h('select', {
          class: 'evd-select',
          onchange: (e) => { loteFilter = e.target.value; visibleCount = PAGE_SIZE; updateBody(); }
        },
          h('option', { value: '' }, `Todos os lotes${lotes.length ? ` (${lotes.length})` : ''}`),
          ...lotes.map(l => h('option', { value: l, selected: l === loteFilter || null }, l))
        ),
        h('select', {
          class: 'evd-select',
          onchange: (e) => { sortBy = e.target.value; visibleCount = PAGE_SIZE; updateBody(); }
        },
          h('option', { value: 'original', selected: sortBy === 'original' || null }, 'Ordem padrão'),
          h('option', { value: 'recent', selected: sortBy === 'recent' || null }, 'Mais recentes'),
          h('option', { value: 'old', selected: sortBy === 'old' || null }, 'Mais antigos'),
          h('option', { value: 'az', selected: sortBy === 'az' || null }, 'Nome A–Z')
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
            : loteFilter
              ? `Nenhum inscrito no lote "${loteFilter}".`
              : filter === 'checkin'
                ? 'Nenhum check-in feito ainda.'
                : filter === 'pendentes'
                  ? 'Nenhum pendente — todos fizeram check-in!'
                  : 'Sem inscritos ainda.'
        )
      );
      return;
    }

    setContent(body,
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {},
          h('th', { style: { width: '32%' } }, isRace ? 'Corredor' : 'Inscrito'),
          h('th', {}, 'Telefone'),
          h('th', {}, isRace ? 'Corrida' : 'Lote'),
          h('th', {}, 'Origem'),
          h('th', {}, isRace ? 'Kit' : 'Check-in')
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
    const rp = isRace ? raceMap[p.id] : null;
    return h('tr', {
        class: isCanceled ? 'row-payment-canceled' : '',
        onclick: () => openParticipant(p)
      },
      h('td', {},
        h('div', { class: 'row-name', style: isCanceled ? { color: 'var(--ink-mute)', textDecoration: 'line-through' } : {} }, p.name || '—'),
        p.email ? h('div', { class: 'row-sub' }, p.email) : null
      ),
      h('td', { class: 'mono' }, p.phone || '—'),
      isRace
        ? h('td', {}, rp ? raceChips(rp, p) : h('span', { class: 'muted' }, 'Sem perfil'))
        : h('td', {}, p.lote || '—'),
      h('td', {}, sourcePill(p.source)),
      h('td', {},
        p.checked
          ? h('span', { class: 'status live' }, fmtRelative(p.checked_at))
          : h('span', { class: 'status done' }, 'Pendente')
      )
    );
  }

  // Chips do corredor: distância · camiseta · Nutri · nº de peito.
  function raceChips(rp, p) {
    return h('div', { class: 'race-chips' },
      rp.distance ? h('span', { class: 'race-chip dist' }, distanceLabel(rp.distance)) : null,
      rp.shirt_size ? h('span', { class: 'race-chip shirt' }, shirtLabel(rp.shirt_size)) : null,
      rp.is_nutritionist ? h('span', { class: 'race-chip nutri' }, 'Nutri') : null,
      isCongressista(p) ? h('span', { class: 'race-chip congresso' }, 'Congresso') : null,
      rp.bib_number ? h('span', { class: 'race-chip bib' }, `#${rp.bib_number}`) : null
    );
  }

  // Corredor que também está inscrito no congresso pai (tag gravada no banco).
  function isCongressista(p) {
    return Array.isArray(p?.tags) && p.tags.includes('congressista');
  }

  function openParticipant(p) {
    const rp = isRace ? raceMap[p.id] : null;
    openModal({
      title: p.name || (isRace ? 'Corredor' : 'Inscrito'),
      body: h('div', {},
        rp ? h('div', { class: 'race-chips', style: { marginBottom: '12px' } },
          rp.distance ? h('span', { class: 'race-chip dist' }, distanceLabel(rp.distance)) : null,
          rp.shirt_size ? h('span', { class: 'race-chip shirt' }, `Camiseta ${shirtLabel(rp.shirt_size)}`) : null,
          rp.is_nutritionist ? h('span', { class: 'race-chip nutri' }, 'Nutricionista') : null
        ) : null,
        infoRow('Email', p.email),
        infoRow('Telefone', p.phone),
        infoRow('Código', p.code),
        isRace ? null : infoRow('Lote', p.lote),
        infoRow('Origem', p.source || 'manual'),
        infoRow(isRace ? 'Kit' : 'Check-in', p.checked ? `${isRace ? 'Retirado' : 'Sim'} · ${fmtRelative(p.checked_at)}` : 'Pendente'),
        rp ? infoRow('Nº de peito', rp.bib_number) : null,
        rp ? infoRow('Nº do chip', rp.chip_number) : null,
        rp ? infoRow('Contato de emergência', rp.emergency_contact) : null,
        rp ? infoRow('Categoria (original)', rp.category) : null,
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
    hotmart:      { cls: 'hotmart', label: 'Hotmart' },
    ticketsports: { cls: 'api',     label: 'TicketSports' },
    import:       { cls: 'import',  label: 'CSV' },
    manual:       { cls: 'manual',  label: 'Manual' },
    api:          { cls: 'api',     label: 'API' }
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
