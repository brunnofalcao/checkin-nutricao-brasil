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

          h('button', { class: 'btn btn-primary', id: 'd-prepare', style: { width: '100%' }, disabled: true, onclick: prepare },
            'Preparar lotes')
        ),
        // Coluna 2 — lotes + progresso
        h('div', { class: 'card-block' },
          h('h3', {}, 'Lotes'),
          h('div', { id: 'batches' }, h('div', { class: 'row-sub' }, 'Suba a lista e prepare os lotes pra disparar.'))
        )
      )
    );
    setupUpload();
    renderPreview();
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
    const btn = document.getElementById('d-prepare');
    if (btn) btn.disabled = !(state.contacts.length && state.templateId);
  }

  // ── Preparar lotes: cria campanha no banco e divide a lista ──
  async function prepare() {
    const t = tplById(state.templateId);
    if (!t || !state.contacts.length) return;
    const evName = evById(state.eventId)?.name || state.eventId;
    const nBatches = Math.ceil(state.contacts.length / BATCH_SIZE);

    const btn = document.getElementById('d-prepare');
    btn.disabled = true; btn.textContent = 'Preparando…';
    try {
      const { supabase: sb } = await import('../data/supabase.js');
      const { data: camp, error } = await sb.from('wa_div_campaigns').insert({
        event_id: state.eventId, event_label: evName,
        template_id: t.id, template_name: t.name,
        list_size: state.contacts.length, batch_size: BATCH_SIZE,
        total_batches: nBatches, status: 'ready'
      }).select().single();
      if (error) throw error;

      state.campaign = camp;
      state.batches = [];
      for (let i = 0; i < nBatches; i++) {
        state.batches.push({
          n: i + 1,
          contacts: state.contacts.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE),
          status: 'ready'
        });
      }
      toast.success(`${nBatches} lote(s) prontos. Dispare um por vez.`);
      renderBatches();
    } catch (e) {
      toast.danger('Erro: ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Preparar lotes';
    }
  }

  function renderBatches() {
    const box = document.getElementById('batches');
    if (!box) return;
    if (!state.batches.length) {
      setContent(box, h('div', { class: 'row-sub' }, 'Suba a lista e prepare os lotes pra disparar.'));
      return;
    }
    setContent(box,
      h('div', { class: 'batch-head' },
        h('strong', {}, state.campaign.template_name),
        h('span', { class: 'row-sub' }, ` · ${state.campaign.event_label}`)),
      ...state.batches.map(batchRow),
      h('div', { class: 'batch-note row-sub' },
        'Recomendado: dispare 1 lote, espere ~20min, dispare o próximo. Protege a entrega e a saúde do número.')
    );
  }

  function batchRow(b) {
    const statusTxt = { ready: 'Pronto', sending: 'Enviando…', done: 'Concluído', failed: 'Falhou' }[b.status] || b.status;
    const cls = b.status === 'done' ? 'status live' : b.status === 'sending' ? 'status done' : 'status done';
    return h('div', { class: 'batch-row', 'data-n': b.n },
      h('div', { class: 'batch-info' },
        h('span', { class: 'batch-num' }, `Lote ${b.n}`),
        h('span', { class: 'row-sub' }, `${b.contacts.length} contatos`)
      ),
      h('div', { class: 'batch-action' },
        b.status === 'done'
          ? h('span', { class: cls }, statusTxt)
          : h('button', {
              class: 'btn btn-primary btn-sm',
              disabled: b.status === 'sending' || null,
              onclick: (e) => fireBatch(b, e.currentTarget)
            }, b.status === 'sending' ? 'Enviando…' : `Disparar lote ${b.n}`)
      )
    );
  }

  async function fireBatch(b, btn) {
    if (!confirm(`Disparar o lote ${b.n} (${b.contacts.length} contatos) agora?`)) return;
    b.status = 'sending';
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const r = await callFn('whatsapp-divulgacao', {
        campaign_id: state.campaign.id,
        batch_number: b.n,
        contacts: b.contacts
      });
      b.status = 'done';
      toast.success(`Lote ${b.n}: ${r.sent} enviados, ${r.failed} falharam` + (r.skipped ? `, ${r.skipped} já recebidos` : ''));
      renderBatches();
    } catch (e) {
      b.status = 'ready';
      toast.danger('Erro no lote ' + b.n + ': ' + e.message);
      renderBatches();
    }
  }

  render();
}
