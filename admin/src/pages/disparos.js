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
    const ready = !(!state.templateId || matched.length === 0);
    const btn = document.getElementById('b-send');
    if (btn) btn.disabled = !ready;
    const sbtn = document.getElementById('b-schedule');
    if (sbtn) sbtn.disabled = !ready;
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
      // ── Box de teste — largura cheia, no topo ──
      h('div', { class: 'test-banner' },
        h('div', { class: 'test-banner-icon' }, '🧪'),
        h('div', { class: 'test-banner-main' },
          h('div', { class: 'test-banner-title' }, 'Enviar teste para um número'),
          h('div', { class: 'test-banner-sub' }, 'Manda na hora pra 1 número só — veja como a mensagem chega antes do disparo em massa.'),
          h('div', { class: 'test-banner-row' },
            h('input', { id: 't-phone', class: 'test-input', placeholder: 'DDD + número (ex: 61998318817)' }),
            h('select', { id: 't-template', class: 'test-select' },
              h('option', { value: '' }, 'Escolha o template…'),
              ...templates.map(t => h('option', { value: t.id }, t.name))
            ),
            h('button', { class: 'btn btn-primary', id: 't-send', onclick: doTest }, icons.send(), 'Enviar teste')
          )
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

          h('button', { class: 'btn btn-primary', id: 'b-send', style: { width: '100%' }, disabled: true, onclick: () => doSend(null) },
            icons.send(), 'Disparar'),

          h('div', { class: 'sched-box' },
            h('div', { class: 'sched-label' }, 'Ou agende para depois:'),
            h('div', { class: 'sched-row' },
              h('input', { type: 'datetime-local', id: 'b-sched', class: 'sched-input' }),
              h('button', { class: 'btn btn-secondary', id: 'b-schedule', disabled: true, onclick: doSchedule },
                'Agendar')
            ),
            h('div', { class: 'sched-hint row-sub' }, 'Horário de Brasília. Os destinatários são congelados no momento do agendamento.')
          ),
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
    const btns = t.buttons || [];
    setContent(box,
      h('div', { class: 'wa-bubble' },
        t.header_text ? h('div', { class: 'wa-header' }, t.header_text) : null,
        h('div', { class: 'wa-body' }, body),
        t.footer_text ? h('div', { class: 'wa-footer' }, t.footer_text) : null,
        btns.length
          ? h('div', { class: 'wa-btns' },
              ...btns.map(b => h('div', { class: 'wa-btn' }, icons.info(), b.text)))
          : null
      )
    );
  }

  function brasiliaToISO(localValue) {
    if (!localValue) return null;
    const iso = localValue.length === 16 ? localValue + ':00' : localValue;
    return new Date(iso + '-03:00').toISOString();
  }

  async function doSchedule() {
    const val = document.getElementById('b-sched')?.value;
    if (!val) { toast.danger('Escolha a data e a hora.'); return; }
    const when = brasiliaToISO(val);
    if (new Date(when) <= new Date()) { toast.danger('A data precisa ser no futuro.'); return; }
    doSend(when);
  }

  async function doSend(scheduledFor) {
    const t = tplById(state.templateId);
    if (!t || matched.length === 0) return;
    const evName = evById(state.eventId)?.name || state.eventId;

    const parts = [evName];
    if (state.checkin) parts.push(state.checkin === 'checked' ? 'fez check-in' : 'não fez check-in');
    if (state.lote) parts.push(state.lote);
    if (state.regioes.length) parts.push(state.regioes.join('/'));
    const label = parts.join(' · ');

    const isScheduled = !!scheduledFor;
    const whenTxt = isScheduled
      ? new Date(scheduledFor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : null;
    const confirmMsg = isScheduled
      ? `Agendar "${t.name}" para ${matched.length} pessoa(s) em ${whenTxt}?\n\nFiltro: ${label}\n\nOs destinatários são congelados agora.`
      : `Disparar "${t.name}" para ${matched.length} pessoa(s)?\n\nFiltro: ${label}`;
    if (!confirm(confirmMsg)) return;

    const btn = document.getElementById(isScheduled ? 'b-schedule' : 'b-send');
    btn.disabled = true; btn.textContent = isScheduled ? 'Agendando…' : 'Criando disparo…';
    try {
      const { supabase: sb } = await import('../data/supabase.js');
      const { data: bc, error } = await sb.from('wa_broadcasts').insert({
        event_id: state.eventId,
        template_id: t.id,
        template_name: t.name,
        audience: 'filtered',
        audience_label: label,
        status: isScheduled ? 'scheduled' : 'queued',
        total: matched.length,
        scheduled_for: scheduledFor,
        auto_status: isScheduled ? 'scheduled' : 'idle',
        participant_ids: isScheduled ? matched.map(p => p.id) : null
      }).select().single();
      if (error) throw error;

      if (!isScheduled) {
        callFn('whatsapp-broadcast', {
          broadcast_id: bc.id,
          participant_ids: matched.map(p => p.id)
        }).catch(err => console.error(err));
        toast.success('Disparo iniciado! Acompanhe no histórico.');
      } else {
        toast.success(`Agendado para ${whenTxt}!`);
      }
      loadHistory();
    } catch (e) {
      toast.danger('Erro: ' + e.message);
    } finally {
      const sb2 = document.getElementById('b-send');
      if (sb2) { sb2.disabled = false; sb2.innerHTML = ''; sb2.append(icons.send(), document.createTextNode('Disparar')); }
      const sc = document.getElementById('b-schedule');
      if (sc) { sc.disabled = false; sc.textContent = 'Agendar'; }
    }
  }

  async function doTest() {
    const phone = document.getElementById('t-phone').value.trim();
    const tplId = document.getElementById('t-template').value;
    if (!phone) { toast.danger('Digite um número.'); return; }
    if (!tplId) { toast.danger('Escolha um template.'); return; }
    const evName = evById(state.eventId)?.name || 'Nutrição Brasil';
    const btn = document.getElementById('t-send');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await callFn('whatsapp-broadcast', {
        test_phone: phone, template_id: tplId, event_label: evName, test_name: 'Teste'
      });
      toast.success('Teste enviado! Confira o WhatsApp do número.');
    } catch (e) {
      toast.danger('Erro: ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Enviar teste agora';
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
    const scheduled = b.auto_status === 'scheduled';
    const pct = b.total ? Math.round(((b.sent + b.failed) / b.total) * 100) : 0;
    const lbl = scheduled ? 'Agendado' : ({ queued: 'Na fila', sending: 'Enviando', done: 'Concluído', failed: 'Falhou', draft: 'Rascunho', canceled: 'Cancelado' }[b.status] || b.status);
    const cls = scheduled ? 'status sched' : (b.status === 'done' ? 'status live' : b.status === 'sending' ? 'status done' : 'status done');
    const schedTxt = scheduled && b.scheduled_for
      ? new Date(b.scheduled_for).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : null;

    return h('div', { class: 'hist-item', 'data-id': b.id },
      h('div', { class: 'hist-head' },
        h('strong', {}, b.template_name),
        h('span', { class: cls }, lbl)
      ),
      h('div', { class: 'row-sub', style: { margin: '2px 0 8px' } },
        `${b.audience_label || b.event_id} · ${fmtRelative(b.created_at)}`),
      scheduled
        ? h('div', { class: 'sched-info' },
            h('span', {}, `⏰ Dispara em ${schedTxt} · ${b.total} pessoas`),
            h('button', { class: 'sched-cancel', onclick: () => cancelarDisparo(b.id) }, 'Cancelar')
          )
        : h('div', { class: 'progress' }, h('div', { class: 'progress-bar', style: { width: pct + '%' } })),
      scheduled ? null : h('div', { class: 'row-sub', style: { marginTop: '6px' } },
        `${b.sent} enviados · ${b.failed} falharam · ${b.total} total`)
    );
  }

  async function cancelarDisparo(broadcastId) {
    if (!confirm('Cancelar este agendamento? O disparo não acontecerá.')) return;
    try {
      const { supabase: sb } = await import('../data/supabase.js');
      await sb.from('wa_broadcasts').delete().eq('id', broadcastId);
      toast.success('Agendamento cancelado.');
      loadHistory();
    } catch (e) {
      toast.danger('Erro ao cancelar: ' + e.message);
    }
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
