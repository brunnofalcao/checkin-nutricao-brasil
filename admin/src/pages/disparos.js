import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { listEvents } from '../data/events.js';
import { listAllParticipants } from '../data/participants.js';
import { regiaoFromPhone, REGIOES } from '../core/ddd-regioes.js';
import { fmtRelative } from '../core/utils.js';

const { SUPABASE_URL } = window.__ENV;

export async function pageDisparos(view) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));

  async function callFn(path, body) {
    const { supabase: sb } = await import('../data/supabase.js');
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(body)
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || JSON.stringify(j));
    return j;
  }

  // Carrega eventos + templates aprovados
  let events = [], templates = [];
  try {
    events = await listEvents();
    const { supabase: sb } = await import('../data/supabase.js');
    const { data } = await sb.from('wa_templates').select('*').eq('status', 'APPROVED').order('created_at', { ascending: false });
    templates = data || [];
  } catch (e) {
    toast.danger('Erro ao carregar: ' + e.message);
    return;
  }

  // Estado dos filtros
  let state = {
    eventId: events[0]?.id || '',
    checkin: '',       // '' | 'checked' | 'not_checked'
    lote: '',
    regioes: [],       // ['Centro-Oeste', ...]
    templateId: ''
  };

  let allOfEvent = [];   // participantes do evento (cache)
  let matched = [];      // após aplicar filtros

  async function loadEventPeople() {
    allOfEvent = await listAllParticipants(state.eventId);
  }

  function lotesDoEvento() {
    return [...new Set(allOfEvent.map(p => p.lote).filter(Boolean))];
  }

  function recompute() {
    matched = allOfEvent.filter(p => {
      if (state.checkin === 'checked' && p.checked !== true) return false;
      if (state.checkin === 'not_checked' && p.checked === true) return false;
      if (state.lote && p.lote !== state.lote) return false;
      if (state.regioes.length) {
        const r = regiaoFromPhone(p.phone);
        if (!state.regioes.includes(r)) return false;
      }
      return true;
    });
    updateCount();
    updateSendState();
  }

  function updateCount() {
    const el = document.getElementById('b-count');
    if (!el) return;
    const semTel = matched.filter(p => !p.phone).length;
    el.textContent = `${matched.length} destinatário(s)` + (semTel ? ` · ${semTel} sem telefone` : '');
  }

  function updateSendState() {
    const btn = document.getElementById('b-send');
    if (btn) btn.disabled = !state.templateId || matched.length === 0;
  }

  function tplById(id) { return templates.find(t => t.id === id); }
  function evById(id) { return events.find(e => e.id === id); }

  function render() {
    setContent(view,
      h('div', { class: 'evd-head', style: { marginBottom: '24px' } },
        h('div', {},
          h('div', { class: 'evd-title' }, 'Disparos de WhatsApp'),
          h('div', { class: 'page-sub' }, 'Combine filtros pra montar o público e dispare um template aprovado. A contagem atualiza conforme você filtra.')
        )
      ),
      h('div', { class: 'disp-grid' },
        // Coluna 1 — público + mensagem
        h('div', { class: 'card-block' },
          h('h3', {}, '1. Público'),
          field('Evento', selectEl('f-event',
            events.map(e => ({ v: e.id, t: e.name || e.slug || e.id })),
            state.eventId, async (val) => {
              state.eventId = val; state.lote = '';
              await loadEventPeople();
              renderLoteSelect();
              recompute();
            })),
          field('Check-in', selectEl('f-checkin', [
            { v: '', t: 'Todos' },
            { v: 'not_checked', t: 'Não fez check-in' },
            { v: 'checked', t: 'Já fez check-in' }
          ], state.checkin, (val) => { state.checkin = val; recompute(); })),
          h('label', { class: 'field' },
            h('span', {}, 'Lote / produto'),
            h('div', { id: 'f-lote-wrap' })
          ),
          h('div', { class: 'field' },
            h('span', {}, 'Região (pelo DDD)'),
            h('div', { class: 'chip-group', id: 'f-regioes' },
              ...REGIOES.map(r =>
                h('label', { class: 'chip-check' },
                  h('input', {
                    type: 'checkbox', value: r,
                    onchange: (e) => {
                      if (e.target.checked) state.regioes.push(r);
                      else state.regioes = state.regioes.filter(x => x !== r);
                      recompute();
                    }
                  }),
                  ' ' + r
                )
              )
            )
          ),
          h('div', { class: 'count-pill', id: 'b-count' }, '—'),

          h('h3', { style: { marginTop: '24px' } }, '2. Mensagem'),
          field('Template (só aprovados)', selectEl('f-template',
            [{ v: '', t: templates.length ? 'Selecione…' : 'Nenhum aprovado ainda' }]
              .concat(templates.map(t => ({ v: t.id, t: `${t.name} (${t.category})` }))),
            state.templateId, (val) => { state.templateId = val; renderPreview(); updateSendState(); })),
          h('div', { class: 'preview-box', id: 'b-preview' },
            h('div', { class: 'row-sub' }, 'Selecione um template para ver a prévia.')),

          h('button', { class: 'btn btn-primary', id: 'b-send', style: { width: '100%' }, disabled: true, onclick: doSend },
            icons.send(), 'Disparar'),
          h('div', { class: 'row-sub', style: { marginTop: '8px' } }, '~8 msg/s. A região é estimada pelo DDD e pode não bater 100%.')
        ),
        // Coluna 2 — histórico
        h('div', { class: 'card-block' },
          h('h3', {}, 'Histórico'),
          h('div', { id: 'b-history' }, h('div', { class: 'loading-row' }, 'Carregando…'))
        )
      )
    );
    renderLoteSelect();
    renderPreview();
    recompute();
    loadHistory();
    subscribeRealtime();
  }

  function field(label, control) {
    return h('label', { class: 'field' }, h('span', {}, label), control);
  }

  function selectEl(id, opts, current, onChange) {
    return h('select', { id, onchange: (e) => onChange(e.target.value) },
      ...opts.map(o => h('option', { value: o.v, selected: o.v === current || null }, o.t)));
  }

  function renderLoteSelect() {
    const wrap = document.getElementById('f-lote-wrap');
    if (!wrap) return;
    const lotes = lotesDoEvento();
    setContent(wrap, selectEl('f-lote',
      [{ v: '', t: 'Todos os lotes' }].concat(lotes.map(l => ({ v: l, t: l }))),
      state.lote, (val) => { state.lote = val; recompute(); }));
  }

  function renderPreview() {
    const box = document.getElementById('b-preview');
    if (!box) return;
    const t = tplById(state.templateId);
    if (!t) { setContent(box, h('div', { class: 'row-sub' }, 'Selecione um template para ver a prévia.')); return; }
    const evName = evById(state.eventId)?.name || state.eventId;
    const body = (t.body_text || '')
      .replace(/\{\{1\}\}/g, t.var_mapping?.[0] === 'nome' ? 'Maria' : '{{1}}')
      .replace(/\{\{2\}\}/g, t.var_mapping?.[1] === 'evento' ? evName : '{{2}}');
    setContent(box,
      h('div', { class: 'wa-bubble' },
        t.header_text ? h('div', { class: 'wa-header' }, t.header_text) : null,
        h('div', { class: 'wa-body' }, body),
        t.footer_text ? h('div', { class: 'wa-footer' }, t.footer_text) : null
      )
    );
  }

  async function doSend() {
    const t = tplById(state.templateId);
    if (!t || matched.length === 0) return;
    const evName = evById(state.eventId)?.name || state.eventId;

    const parts = [evName];
    if (state.checkin) parts.push(state.checkin === 'checked' ? 'fez check-in' : 'não fez check-in');
    if (state.lote) parts.push(state.lote);
    if (state.regioes.length) parts.push(state.regioes.join('/'));
    const label = parts.join(' · ');

    if (!confirm(`Disparar "${t.name}" para ${matched.length} pessoa(s)?\n\nFiltro: ${label}`)) return;

    const btn = document.getElementById('b-send');
    btn.disabled = true; btn.textContent = 'Criando disparo…';
    try {
      const { supabase: sb } = await import('../data/supabase.js');
      const { data: bc, error } = await sb.from('wa_broadcasts').insert({
        event_id: state.eventId,
        template_id: t.id,
        template_name: t.name,
        audience: 'filtered',
        audience_label: label,
        status: 'queued',
        total: matched.length
      }).select().single();
      if (error) throw error;

      callFn('whatsapp-broadcast', {
        broadcast_id: bc.id,
        participant_ids: matched.map(p => p.id)
      }).catch(err => console.error(err));

      toast.success('Disparo iniciado! Acompanhe no histórico.');
      loadHistory();
    } catch (e) {
      toast.danger('Erro: ' + e.message);
    } finally {
      btn.disabled = false; btn.innerHTML = ''; btn.append(icons.send(), document.createTextNode('Disparar'));
    }
  }

  async function loadHistory() {
    const wrap = document.getElementById('b-history');
    if (!wrap) return;
    const { supabase: sb } = await import('../data/supabase.js');
    const { data } = await sb.from('wa_broadcasts').select('*').order('created_at', { ascending: false }).limit(20);
    if (!data?.length) { setContent(wrap, h('div', { class: 'loading-row' }, 'Nenhum disparo ainda.')); return; }
    setContent(wrap, ...data.map(histItem));
  }

  function histItem(b) {
    const pct = b.total ? Math.round(((b.sent + b.failed) / b.total) * 100) : 0;
    const lbl = { queued: 'Na fila', sending: 'Enviando', done: 'Concluído', failed: 'Falhou', draft: 'Rascunho', canceled: 'Cancelado' }[b.status] || b.status;
    const cls = b.status === 'done' ? 'status live' : b.status === 'sending' ? 'status done' : 'status done';
    return h('div', { class: 'hist-item', 'data-id': b.id },
      h('div', { class: 'hist-head' },
        h('strong', {}, b.template_name),
        h('span', { class: cls }, lbl)
      ),
      h('div', { class: 'row-sub', style: { margin: '2px 0 8px' } },
        `${b.audience_label || b.event_id} · ${fmtRelative(b.created_at)}`),
      h('div', { class: 'progress' }, h('div', { class: 'progress-bar', style: { width: pct + '%' } })),
      h('div', { class: 'row-sub', style: { marginTop: '6px' } },
        `${b.sent} enviados · ${b.failed} falharam · ${b.total} total`)
    );
  }

  async function subscribeRealtime() {
    const { supabase: sb } = await import('../data/supabase.js');
    sb.channel('wa_broadcasts_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_broadcasts' }, (payload) => {
        const b = payload.new; if (!b) return;
        const el = document.querySelector(`.hist-item[data-id="${b.id}"]`);
        if (el) el.replaceWith(histItem(b)); else loadHistory();
      })
      .subscribe();
  }

  // Init
  await loadEventPeople();
  render();
}
