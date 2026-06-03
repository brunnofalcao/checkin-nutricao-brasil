import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { toast } from '../ui/toast.js';

const { SUPABASE_URL } = window.__ENV;

const STATUS_LABEL = {
  APPROVED: { txt: 'Aprovado',   cls: 'status live' },
  PENDING:  { txt: 'Em análise', cls: 'status done' },
  REJECTED: { txt: 'Reprovado',  cls: 'status danger' },
  PAUSED:   { txt: 'Pausado',    cls: 'status done' },
  DISABLED: { txt: 'Desativado', cls: 'status done' }
};

export async function pageTemplates(view) {
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

  async function loadTemplates() {
    const { supabase: sb } = await import('../data/supabase.js');
    const { data, error } = await sb.from('wa_templates').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  let templates = [];
  try {
    templates = await loadTemplates();
  } catch (e) {
    toast.danger('Erro ao carregar: ' + e.message);
    return;
  }

  let varMapping = [];
  let buttons = [];
  const expanded = new Set(); // ids expandidos
  const VAR_LABEL = { nome: 'Primeiro nome', evento: 'Nome do evento' };
  const VAR_SAMPLE = { nome: 'Maria', evento: 'Nutrição Brasil Brasília' };

  function render() {
    setContent(view,
      h('div', { class: 'evd-head', style: { marginBottom: '24px' } },
        h('div', {},
          h('div', { class: 'evd-title' }, 'Templates de WhatsApp'),
          h('div', { class: 'page-sub' },
            'Crie mensagens, envie pra aprovação da Meta e acompanhe o status. Templates aprovados ficam disponíveis em Disparos.')
        ),
        h('div', { style: { display: 'flex', gap: '8px', flexShrink: '0' } },
          h('button', { class: 'btn btn-ghost', onclick: doSync }, 'Sincronizar com a Meta'),
          h('button', { class: 'btn btn-primary', onclick: () => openModal() }, icons.plus(), 'Novo template')
        )
      ),
      h('div', { class: 'table-card', id: 'tpl-list' })
    );
    renderList();
  }

  function renderList() {
    const wrap = document.getElementById('tpl-list');
    if (!wrap) return;
    if (!templates.length) {
      setContent(wrap, h('div', { class: 'loading-row' }, 'Nenhum template ainda. Crie o primeiro.'));
      return;
    }
    setContent(wrap, ...templates.map(cardFor));
  }

  function cardFor(t) {
    const st = STATUS_LABEL[t.status] || STATUS_LABEL.PENDING;
    const isOpen = expanded.has(t.id);
    const btns = t.buttons || [];

    const head = h('div', { class: 'tpl-row-head', onclick: () => toggle(t.id) },
      h('span', { class: 'tpl-caret' + (isOpen ? ' open' : '') }, '▸'),
      h('span', { class: 'tpl-card-name' }, t.name),
      h('span', { class: st.cls }, st.txt),
      h('span', { class: 'row-sub', style: { marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '.04em', fontSize: '11px' } },
        `${t.category} · ${t.language}`)
    );

    const detail = isOpen ? h('div', { class: 'tpl-row-detail' },
      t.header_text ? h('div', { class: 'tpl-detail-header' }, t.header_text) : null,
      h('div', { class: 'tpl-card-body' }, t.body_text),
      t.footer_text ? h('div', { class: 'tpl-detail-footer' }, t.footer_text) : null,
      btns.length
        ? h('div', { class: 'tpl-card-btns' }, ...btns.map(b => h('span', { class: 'tpl-btn-chip' }, icons.info(), b.text)))
        : null,
      (t.status === 'REJECTED' && t.rejected_reason)
        ? h('div', { class: 'tpl-card-error' }, 'Motivo: ' + t.rejected_reason) : null,
      h('div', { class: 'tpl-actions' },
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => duplicate(t) }, 'Duplicar'),
        h('button', { class: 'btn btn-ghost btn-sm tpl-del', onclick: () => doDelete(t) }, 'Excluir')
      )
    ) : null;

    return h('div', { class: 'tpl-card' + (isOpen ? ' open' : '') }, head, detail);
  }

  function toggle(id) {
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    renderList();
  }

  async function doSync() {
    toast.info ? toast.info('Sincronizando com a Meta…') : toast.success('Sincronizando…');
    try {
      const r = await callFn('whatsapp-templates', { action: 'sync' });
      toast.success(`${r.updated} template(s) sincronizado(s).`);
      templates = await loadTemplates();
      renderList();
    } catch (e) { toast.danger('Erro: ' + e.message); }
  }

  async function doDelete(t) {
    if (!confirm(`Excluir o template "${t.name}"? Isso remove na Meta também.`)) return;
    try {
      await callFn('whatsapp-templates', { action: 'delete', id: t.id, name: t.name });
      toast.success('Excluído.');
      templates = await loadTemplates();
      renderList();
    } catch (e) { toast.danger('Erro: ' + e.message); }
  }

  // Duplicar: abre o modal já preenchido com o conteúdo, nome sugerido com sufixo
  function duplicate(t) {
    openModal({
      name: (t.name + '_copia').slice(0, 60),
      category: t.category,
      header_text: t.header_text || '',
      body_text: t.body_text || '',
      footer_text: t.footer_text || '',
      var_mapping: [...(t.var_mapping || [])],
      buttons: (t.buttons || []).map(b => ({ ...b }))
    });
  }

  function openModal(prefill) {
    varMapping = prefill ? [...(prefill.var_mapping || [])] : [];
    buttons = prefill ? prefill.buttons.map(b => ({ ...b })) : [];
    const backdrop = h('div', { class: 'modal-backdrop', id: 'tpl-modal' },
      h('div', { class: 'modal' },
        h('div', { class: 'modal-head' },
          h('h2', {}, prefill ? 'Duplicar template' : 'Novo template'),
          h('button', { class: 'modal-close', onclick: closeModal }, '×')
        ),
        h('div', { class: 'modal-body' },
          field('Nome interno (minúsculas, números e _)',
            h('input', { id: 'f-name', value: prefill?.name || '', placeholder: 'nb_lembrete_evento' })),
          field('Categoria',
            h('select', { id: 'f-category' },
              optionEl('UTILITY', 'Utilidade — lembrete, aviso (barato, aprova rápido)', prefill?.category),
              optionEl('MARKETING', 'Marketing — promoção, upsell (aprova mais devagar)', prefill?.category)
            )),
          field('Cabeçalho (opcional)',
            h('input', { id: 'f-header', value: prefill?.header_text || '', placeholder: 'Nutrição Brasil Brasília 2026' })),
          field('Mensagem',
            h('textarea', { id: 'f-body', rows: '5', placeholder: 'Olá {{1}}! Faltam poucos dias para o {{2}}.' },
              prefill?.body_text || '')),
          h('div', { class: 'var-buttons' },
            h('button', { type: 'button', class: 'btn-chip', onclick: () => insertVar('nome') }, '+ Primeiro nome'),
            h('button', { type: 'button', class: 'btn-chip', onclick: () => insertVar('evento') }, '+ Nome do evento')
          ),
          h('div', { id: 'f-samples' }),
          field('Rodapé (opcional)',
            h('input', { id: 'f-footer', value: prefill?.footer_text || '', placeholder: 'Science Play' })),
          h('div', { class: 'btn-section' },
            h('div', { class: 'btn-section-head' },
              h('span', {}, 'Botões de link (até 2)'),
              h('button', { type: 'button', class: 'btn-chip', id: 'add-btn', onclick: addButton }, '+ Adicionar botão')
            ),
            h('div', { id: 'f-buttons' })
          )
        ),
        h('div', { class: 'modal-foot' },
          h('button', { class: 'btn btn-ghost', onclick: closeModal }, 'Cancelar'),
          h('button', { class: 'btn btn-primary', id: 'f-save', onclick: doSave }, 'Enviar para aprovação')
        )
      )
    );
    document.body.appendChild(backdrop);
    if (varMapping.length) rebuildSamples();
    if (buttons.length) renderButtons();
  }

  function optionEl(val, label, current) {
    return h('option', { value: val, selected: val === current || null }, label);
  }
  function field(label, control) {
    return h('label', { class: 'field' }, h('span', {}, label), control);
  }

  function insertVar(v) {
    const body = document.getElementById('f-body');
    varMapping.push(v);
    const idx = varMapping.length;
    const pos = body.selectionStart ?? body.value.length;
    body.value = body.value.slice(0, pos) + `{{${idx}}}` + body.value.slice(pos);
    rebuildSamples();
    body.focus();
  }

  function rebuildSamples() {
    const box = document.getElementById('f-samples');
    if (!box) return;
    if (!varMapping.length) { setContent(box); return; }
    setContent(box,
      h('div', { class: 'samples-box' },
        h('strong', {}, 'Exemplos (exigido pela Meta):'),
        ...varMapping.map((v, i) =>
          h('label', { class: 'field' },
            h('span', {}, `{{${i + 1}}} — ${VAR_LABEL[v] || v}`),
            h('input', { class: 'f-sample', value: VAR_SAMPLE[v] || '' })
          )
        )
      )
    );
  }

  function addButton() {
    if (buttons.length >= 2) { toast.danger('Máximo de 2 botões.'); return; }
    buttons.push({ text: '', url: '' });
    renderButtons();
  }

  function renderButtons() {
    const box = document.getElementById('f-buttons');
    if (!box) return;
    const addBtn = document.getElementById('add-btn');
    if (addBtn) addBtn.style.display = buttons.length >= 2 ? 'none' : '';
    setContent(box,
      ...buttons.map((b, i) =>
        h('div', { class: 'btn-row' },
          h('div', { class: 'btn-row-fields' },
            h('input', { class: 'btn-row-text', placeholder: 'Texto do botão (ex: Ver local)', value: b.text, maxlength: '25',
              oninput: (e) => { buttons[i].text = e.target.value; } }),
            h('input', { class: 'btn-row-url', placeholder: 'https://...', value: b.url,
              oninput: (e) => { buttons[i].url = e.target.value; } })
          ),
          h('button', { type: 'button', class: 'btn-icon', title: 'Remover',
            onclick: () => { buttons.splice(i, 1); renderButtons(); } }, icons.info())
        )
      )
    );
  }

  function closeModal() {
    const m = document.getElementById('tpl-modal');
    if (m) m.remove();
  }

  async function doSave() {
    const name = document.getElementById('f-name').value.trim();
    const category = document.getElementById('f-category').value;
    const header_text = document.getElementById('f-header').value.trim() || null;
    const body_text = document.getElementById('f-body').value.trim();
    const footer_text = document.getElementById('f-footer').value.trim() || null;
    const var_samples = [...document.querySelectorAll('#f-samples .f-sample')].map(i => i.value);
    const cleanButtons = buttons.filter(b => b.text.trim() && b.url.trim());

    if (!name || !body_text) { toast.danger('Nome e mensagem são obrigatórios.'); return; }
    for (const b of cleanButtons) {
      if (!/^https?:\/\//i.test(b.url)) { toast.danger(`URL do botão "${b.text}" precisa começar com http:// ou https://`); return; }
    }

    const btn = document.getElementById('f-save');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await callFn('whatsapp-templates', {
        action: 'create', name, language: 'pt_BR', category,
        body_text, header_text, footer_text, var_samples, var_mapping: varMapping, buttons: cleanButtons
      });
      toast.success('Template enviado! A Meta analisa em até 24-48h.');
      closeModal();
      templates = await loadTemplates();
      renderList();
    } catch (e) {
      toast.danger('Erro: ' + e.message);
      btn.disabled = false; btn.textContent = 'Enviar para aprovação';
    }
  }

  render();
}
