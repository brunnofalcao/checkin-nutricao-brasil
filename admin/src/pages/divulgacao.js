import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { listEvents } from '../data/events.js';

const { SUPABASE_URL } = window.__ENV;
const BATCH_SIZE = 500;

const CSV_EXEMPLO = `nome,telefone
Maria Silva,5561999998888
João Souza,5511988887777
Ana Paula Costa,5547988776655
Carlos Eduardo Lima,5521977665544
Fernanda Oliveira,5562966554433`;

const GPT_PROMPT = `Use o arquivo csvexemplo.csv como padrão de formato. Pegue a lista de participantes que estou subindo e gere um novo CSV no mesmo formato: apenas as colunas "nome" e "telefone". Formate todos os telefones como 55 + DDD + número, só dígitos, sem espaços, parênteses ou traços (exemplo: 5561999998888). Remova linhas sem telefone válido e remova telefones duplicados. Me devolva o arquivo CSV pronto para download.`;

export async function pageDivulgacao(view) {
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

  let events = [], templates = [];
  try {
    events = await listEvents();
    const { supabase: sb } = await import('../data/supabase.js');
    const { data } = await sb.from('wa_templates').select('*').eq('status', 'APPROVED').order('created_at', { ascending: false });
    templates = (data || []).filter(t => t.category === 'MARKETING' || true); // mostra todos aprovados
  } catch (e) {
    toast.danger('Erro ao carregar: ' + e.message);
    return;
  }

  let state = {
    eventId: events[0]?.id || '',
    templateId: '',
    contacts: [],     // [{ phone, name }] válidos e deduplicados
    invalid: 0,
    dupes: 0,
    campaign: null,   // campanha criada (com lotes)
    batches: []       // [{ n, contacts, status }]
  };

  function tplById(id) { return templates.find(t => t.id === id); }
  function evById(id) { return events.find(e => e.id === id); }

  // ── Parsing de CSV (vanilla, sem libs) ──
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return { contacts: [], invalid: 0, dupes: 0 };

    // Detecta separador (vírgula ou ponto-e-vírgula)
    const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';

    // Detecta se a 1ª linha é cabeçalho
    const first = lines[0].toLowerCase();
    const hasHeader = /tel|fone|whats|nome|name|phone/.test(first);
    const dataLines = hasHeader ? lines.slice(1) : lines;

    // Descobre índice das colunas (se tiver header)
    let phoneIdx = 0, nameIdx = -1;
    if (hasHeader) {
      const cols = lines[0].split(sep).map(c => c.trim().toLowerCase());
      const pIdx = cols.findIndex(c => /tel|fone|whats|phone/.test(c));
      const nIdx = cols.findIndex(c => /nome|name/.test(c));
      if (pIdx !== -1) phoneIdx = pIdx;
      if (nIdx !== -1) nameIdx = nIdx;
    } else {
      // Sem header: assume [nome, telefone] se 2 colunas, ou [telefone] se 1
      const cols = lines[0].split(sep);
      if (cols.length >= 2) { nameIdx = 0; phoneIdx = 1; }
    }

    const seen = new Set();
    const contacts = [];
    let invalid = 0, dupes = 0;

    for (const line of dataLines) {
      const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
      const rawPhone = cols[phoneIdx] || '';
      const name = nameIdx >= 0 ? (cols[nameIdx] || '') : '';
      const norm = normalizePhone(rawPhone);
      if (!norm) { invalid++; continue; }
      if (seen.has(norm)) { dupes++; continue; }
      seen.add(norm);
      contacts.push({ phone: norm, name });
    }
    return { contacts, invalid, dupes };
  }

  function normalizePhone(raw) {
    if (!raw) return null;
    let d = String(raw).replace(/\D/g, '');
    if (d.startsWith('0')) d = d.replace(/^0+/, '');
    if (d.length === 10 || d.length === 11) d = '55' + d;
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
    if (d.length >= 12 && d.length <= 13) return d;
    return null;
  }

  function openHelp() {
    const backdrop = h('div', { class: 'modal-backdrop', id: 'help-modal' },
      h('div', { class: 'modal' },
        h('div', { class: 'modal-head' },
          h('h2', {}, 'Como preparar a lista'),
          h('button', { class: 'modal-close', onclick: () => document.getElementById('help-modal')?.remove() }, '×')
        ),
        h('div', { class: 'modal-body' },
          h('p', { class: 'help-p' }, 'A tela precisa de um CSV com as colunas ', h('strong', {}, 'nome'), ' e ', h('strong', {}, 'telefone'), '. O telefone no formato 55 + DDD + número (ex: 5561999998888).'),
          h('p', { class: 'help-p' }, 'Você não precisa formatar na mão. Pegue a lista crua que exportou (do RD Station, por exemplo), suba no ChatGPT junto com o ', h('strong', {}, 'csvexemplo.csv'), ' (botão de download ao lado), e use o comando abaixo:'),
          h('div', { class: 'help-prompt', id: 'help-prompt-text' }, GPT_PROMPT),
          h('button', { class: 'btn btn-ghost btn-sm', onclick: copyPrompt }, 'Copiar comando'),
          h('p', { class: 'help-p', style: { marginTop: '16px' } }, 'O GPT devolve um CSV limpo e pronto. É só subir aqui. Se a lista não tiver nomes, pode subir só o telefone — a mensagem usa uma saudação genérica nesses casos.')
        ),
        h('div', { class: 'modal-foot' },
          h('button', { class: 'btn btn-primary', onclick: () => document.getElementById('help-modal')?.remove() }, 'Entendi')
        )
      )
    );
    document.body.appendChild(backdrop);
  }

  function copyPrompt() {
    navigator.clipboard.writeText(GPT_PROMPT)
      .then(() => toast.success('Comando copiado! Cole no ChatGPT.'))
      .catch(() => toast.danger('Não foi possível copiar.'));
  }

  function render() {
    setContent(view,
      h('div', { class: 'evd-head', style: { marginBottom: '24px' } },
        h('div', {},
          h('div', { class: 'evd-title' }, 'Divulgação'),
          h('div', { class: 'page-sub' }, 'Suba uma lista da sua base e dispare a divulgação de um evento em lotes de 500. A lista não é salva — só o registro do envio.')
        )
      ),
      h('div', { class: 'div-grid' },
        // Coluna 1 — configuração
        h('div', { class: 'card-block' },
          h('h3', {}, '1. Lista de contatos'),
          h('div', { class: 'upload-drop', id: 'drop' },
            icons.plus(),
            h('div', { class: 'upload-drop-title' }, 'Arraste um CSV ou clique para escolher'),
            h('div', { class: 'upload-drop-sub' }, 'Colunas aceitas: nome e telefone (ou só telefone). Separador vírgula ou ponto-e-vírgula.'),
            h('input', { type: 'file', id: 'csv-input', accept: '.csv,text/csv', style: { display: 'none' } })
          ),
          h('div', { class: 'csv-help-row' },
            h('a', {
              class: 'csv-help-link',
              href: 'data:text/csv;charset=utf-8,' + encodeURIComponent(CSV_EXEMPLO),
              download: 'csvexemplo.csv'
            }, '⬇ Baixar CSV de exemplo'),
            h('button', { class: 'csv-help-link', onclick: openHelp }, '❓ Como preparar a lista')
          ),
          h('div', { id: 'list-summary' }),

          h('h3', {}, '2. Mensagem'),
          field('Evento', selectEl('d-event',
            events.map(e => ({ v: e.id, t: e.name || e.slug || e.id })), state.eventId,
            (val) => { state.eventId = val; renderPreview(); })),
          field('Template aprovado', selectEl('d-template',
            [{ v: '', t: templates.length ? 'Selecione…' : 'Nenhum aprovado ainda' }]
              .concat(templates.map(t => ({ v: t.id, t: `${t.name} (${t.category})` }))),
            state.templateId, (val) => { state.templateId = val; renderPreview(); updateReady(); })),
          h('div', { class: 'preview-box', id: 'd-preview' },
            h('div', { class: 'row-sub' }, 'Selecione um template para ver a prévia.')),

          h('button', { class: 'btn btn-primary', id: 'd-prepare', style: { width: '100%' }, disabled: true, onclick: () => prepare(null) },
            'Disparar agora'),

          h('div', { class: 'sched-box' },
            h('div', { class: 'sched-label' }, 'Ou agende para depois:'),
            h('div', { class: 'sched-row' },
              h('input', { type: 'datetime-local', id: 'd-sched', class: 'sched-input' }),
              h('button', { class: 'btn btn-secondary', id: 'd-schedule', disabled: true, onclick: agendar },
                'Agendar')
            ),
            h('div', { class: 'sched-hint row-sub' }, 'Horário de Brasília. O disparo começa sozinho na hora marcada.')
          )
        ),
        // Coluna 2 — lotes + progresso
        h('div', { class: 'card-block' },
          h('h3', {}, 'Progresso'),
          h('div', { id: 'batches' }, h('div', { class: 'row-sub' }, 'Suba a lista e dispare pra acompanhar o progresso aqui.'))
        )
      )
    );
    setupUpload();
    renderPreview();
    loadHistory();
  }

  // ── Histórico de campanhas (carrega do banco, mostra na coluna direita) ──
  async function loadHistory() {
    const box = document.getElementById('batches');
    if (!box) return;
    try {
      const { supabase: sb } = await import('../data/supabase.js');
      const { data } = await sb.from('wa_div_campaigns')
        .select('*').order('created_at', { ascending: false }).limit(20);
      renderHistory(data || []);
    } catch (e) {
      // silencioso — histórico é secundário
    }
  }

  function renderHistory(camps) {
    const box = document.getElementById('batches');
    if (!box) return;
    if (!camps.length) {
      setContent(box, h('div', { class: 'row-sub' }, 'Nenhuma campanha ainda. Suba uma lista e dispare.'));
      return;
    }
    setContent(box, ...camps.map(histRow));
  }

  function histRow(c) {
    const total = c.list_size || 0;
    const done = (c.sent || 0) + (c.failed || 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const running = c.auto_status === 'running';
    const scheduled = c.auto_status === 'scheduled';
    const finished = c.auto_status === 'done' || c.status === 'done';

    const statusBadge = running
      ? h('span', { class: 'status live' }, 'Enviando')
      : scheduled
        ? h('span', { class: 'status sched' }, 'Agendado')
        : finished
          ? h('span', { class: 'status done' }, 'Concluído')
          : h('span', { class: 'status done' }, c.status || '—');

    const when = c.created_at ? new Date(c.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const schedTxt = scheduled && c.scheduled_for
      ? new Date(c.scheduled_for).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : null;

    return h('div', { class: 'hist-row', onclick: () => running ? watchCampaign(c.id) : null, style: running ? { cursor: 'pointer' } : {} },
      h('div', { class: 'hist-top' },
        h('strong', { class: 'hist-name' }, c.template_name || '—'),
        statusBadge
      ),
      h('div', { class: 'hist-meta' }, `${c.event_label || ''} · ${when}`),
      scheduled
        ? h('div', { class: 'sched-info' },
            h('span', {}, `⏰ Dispara em ${schedTxt}`),
            h('button', { class: 'sched-cancel', onclick: (e) => { e.stopPropagation(); cancelarAgendamento(c.id); } }, 'Cancelar')
          )
        : h('div', { class: 'prog-bar', style: { marginTop: '8px' } },
            h('div', { class: 'prog-fill', style: { width: pct + '%' } })),
      scheduled ? null : h('div', { class: 'prog-stats' },
        h('span', {}, `${c.sent || 0} enviados${c.failed ? ` · ${c.failed} falhas` : ''}`),
        h('span', {}, `${done}/${total}`))
    );
  }

  // Cancela um agendamento (apaga a campanha e a fila antes da hora)
  async function cancelarAgendamento(campaignId) {
    if (!confirm('Cancelar este agendamento? A lista será descartada e o disparo não acontecerá.')) return;
    try {
      const { supabase: sb } = await import('../data/supabase.js');
      await sb.from('wa_div_queue').delete().eq('campaign_id', campaignId);
      await sb.from('wa_div_campaigns').delete().eq('id', campaignId);
      toast.success('Agendamento cancelado.');
      loadHistory();
    } catch (e) {
      toast.danger('Erro ao cancelar: ' + e.message);
    }
  }

  // Acompanha uma campanha em andamento ao vivo
  async function watchCampaign(campaignId) {
    state.campaign = { id: campaignId };
    startProgress(campaignId);
  }

  function field(label, control) { return h('label', { class: 'field' }, h('span', {}, label), control); }
  function selectEl(id, opts, current, onChange) {
    return h('select', { id, onchange: (e) => onChange(e.target.value) },
      ...opts.map(o => h('option', { value: o.v, selected: o.v === current || null }, o.t)));
  }

  function setupUpload() {
    const drop = document.getElementById('drop');
    const input = document.getElementById('csv-input');
    drop.onclick = () => input.click();
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('drag'); };
    drop.ondragleave = () => drop.classList.remove('drag');
    drop.ondrop = (e) => {
      e.preventDefault(); drop.classList.remove('drag');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    };
    input.onchange = () => { if (input.files[0]) handleFile(input.files[0]); };
  }

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const { contacts, invalid, dupes } = parseCSV(reader.result);
      state.contacts = contacts;
      state.invalid = invalid;
      state.dupes = dupes;
      renderSummary();
      updateReady();
    };
    reader.readAsText(file, 'UTF-8');
  }

  function renderSummary() {
    const box = document.getElementById('list-summary');
    if (!box) return;
    if (!state.contacts.length) {
      setContent(box, h('div', { class: 'list-warn' }, 'Nenhum telefone válido encontrado no arquivo.'));
      return;
    }
    const nBatches = Math.ceil(state.contacts.length / BATCH_SIZE);
    setContent(box,
      h('div', { class: 'list-summary-box' },
        h('div', { class: 'list-stat' }, h('strong', {}, String(state.contacts.length)), ' contatos válidos'),
        h('div', { class: 'list-stat-sub' },
          `${nBatches} lote(s) de até ${BATCH_SIZE}` +
          (state.dupes ? ` · ${state.dupes} duplicado(s) removido(s)` : '') +
          (state.invalid ? ` · ${state.invalid} inválido(s) ignorado(s)` : ''))
      )
    );
  }

  function renderPreview() {
    const box = document.getElementById('d-preview');
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
        btns.length ? h('div', { class: 'wa-btns' }, ...btns.map(b => h('div', { class: 'wa-btn' }, icons.info(), b.text))) : null
      )
    );
  }

  function updateReady() {
    const ready = !!(state.contacts.length && state.templateId);
    const btn = document.getElementById('d-prepare');
    if (btn) btn.disabled = !ready;
    const sbtn = document.getElementById('d-schedule');
    if (sbtn) sbtn.disabled = !ready;
  }

  // ── Disparar em background: grava a fila e liga a campanha ──
  // Converte datetime-local (horário de Brasília) para ISO UTC
  function brasiliaToISO(localValue) {
    if (!localValue) return null;
    const iso = localValue.length === 16 ? localValue + ':00' : localValue;
    return new Date(iso + '-03:00').toISOString();
  }

  async function agendar() {
    const val = document.getElementById('d-sched')?.value;
    if (!val) { toast.danger('Escolha a data e a hora.'); return; }
    const when = brasiliaToISO(val);
    if (new Date(when) <= new Date()) { toast.danger('A data precisa ser no futuro.'); return; }
    prepare(when);
  }

  async function prepare(scheduledFor) {
    const t = tplById(state.templateId);
    if (!t || !state.contacts.length) return;
    const evName = evById(state.eventId)?.name || state.eventId;

    const isScheduled = !!scheduledFor;
    const whenTxt = isScheduled
      ? new Date(scheduledFor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : null;
    const confirmMsg = isScheduled
      ? `Agendar disparo para ${state.contacts.length} contatos em ${whenTxt}?\n\nNa hora marcada, o envio começa sozinho no servidor.`
      : `Disparar para ${state.contacts.length} contatos?\n\nO envio roda automaticamente no servidor (~250/min). Você pode fechar esta aba — o progresso continua.`;
    if (!confirm(confirmMsg)) return;

    const btn = document.getElementById(isScheduled ? 'd-schedule' : 'd-prepare');
    btn.disabled = true; btn.textContent = isScheduled ? 'Agendando…' : 'Preparando envio…';
    try {
      const { supabase: sb } = await import('../data/supabase.js');

      // 1. Cria a campanha (scheduled se agendado, idle se imediato)
      const { data: camp, error } = await sb.from('wa_div_campaigns').insert({
        event_id: state.eventId, event_label: evName,
        template_id: t.id, template_name: t.name,
        list_size: state.contacts.length, batch_size: BATCH_SIZE,
        total_batches: Math.ceil(state.contacts.length / BATCH_SIZE),
        status: isScheduled ? 'scheduled' : 'sending',
        auto_status: isScheduled ? 'scheduled' : 'idle',
        scheduled_for: scheduledFor
      }).select().single();
      if (error) throw error;
      state.campaign = camp;

      // 2. Grava a fila em blocos (insert de muitos de uma vez)
      btn.textContent = isScheduled ? 'Gravando lista…' : 'Gravando lista…';
      const CHUNK = 500;
      for (let i = 0; i < state.contacts.length; i += CHUNK) {
        const slice = state.contacts.slice(i, i + CHUNK).map(c => ({
          campaign_id: camp.id, phone: c.phone, name: c.name || '', status: 'pending'
        }));
        const { error: qErr } = await sb.from('wa_div_queue').insert(slice);
        if (qErr) throw qErr;
      }

      // 3. Se imediato, liga já. Se agendado, o cron liga na hora.
      if (!isScheduled) {
        await sb.from('wa_div_campaigns').update({ auto_status: 'running' }).eq('id', camp.id);
        toast.success('Disparo iniciado! Rodando no servidor — pode fechar a aba.');
        startProgress(camp.id);
      } else {
        toast.success(`Agendado para ${whenTxt}! Pode fechar a aba.`);
        loadHistory();
      }
    } catch (e) {
      toast.danger('Erro: ' + e.message);
      btn.disabled = false;
      btn.textContent = isScheduled ? 'Agendar' : 'Disparar agora';
    }
  }

  // ── Progresso ao vivo via Realtime ──
  async function startProgress(campaignId) {
    const { supabase: sb } = await import('../data/supabase.js');

    async function refresh() {
      const { data } = await sb.from('wa_div_campaigns').select('*').eq('id', campaignId).single();
      if (data) { state.campaign = data; renderProgress(); }
    }
    await refresh();

    // Atualiza ao vivo quando a campanha muda
    sb.channel('div-progress-' + campaignId)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wa_div_campaigns', filter: `id=eq.${campaignId}` },
        (payload) => { state.campaign = payload.new; renderProgress(); })
      .subscribe();

    // Fallback: atualiza a cada 15s também (caso o realtime perca algo)
    if (state._poll) clearInterval(state._poll);
    state._poll = setInterval(refresh, 15000);
  }

  function renderProgress() {
    const box = document.getElementById('batches');
    if (!box || !state.campaign) return;
    const c = state.campaign;
    const total = c.list_size || 0;
    const done = (c.sent || 0) + (c.failed || 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const finished = c.auto_status === 'done';

    if (finished && state._poll) { clearInterval(state._poll); state._poll = null; }

    setContent(box,
      h('div', { class: 'batch-head' },
        h('strong', {}, c.template_name),
        h('span', { class: 'row-sub' }, ` · ${c.event_label}`)),
      h('div', { class: 'prog-wrap' },
        h('div', { class: 'prog-bar' }, h('div', { class: 'prog-fill', style: { width: pct + '%' } })),
        h('div', { class: 'prog-stats' },
          h('span', {}, `${done} de ${total}`),
          h('span', {}, `${pct}%`))
      ),
      h('div', { class: 'prog-detail' },
        h('span', { class: 'status live' }, `${c.sent || 0} enviados`),
        (c.failed ? h('span', { class: 'status danger' }, `${c.failed} falharam`) : null)
      ),
      finished
        ? h('div', { class: 'batch-note row-sub', style: { background: 'var(--green-soft)' } },
            '✓ Disparo concluído. A lista foi apagada do servidor.')
        : h('div', { class: 'batch-note row-sub' },
            'Rodando no servidor (~250/min). Pode fechar a aba — o envio continua sozinho.'),
      h('button', { class: 'btn btn-ghost btn-sm', style: { marginTop: '12px' }, onclick: loadHistory },
        '← Ver todas as campanhas')
    );
  }

  render();
}
