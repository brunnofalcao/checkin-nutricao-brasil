import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { listEvents, getEvent } from '../data/events.js';
import {
  uploadCertificateTemplate,
  saveCertificateConfig,
  removeCertificateTemplate,
  defaultLayout
} from '../data/certificates.js';
import { toast } from '../ui/toast.js';
import { navigate } from '../core/router.js';
import { fmtDate } from '../core/utils.js';

const SAMPLE_NAME = 'Brunno Falcão';

export async function pageCertificates(view, { params }) {
  if (params?.id) {
    await pageEditor(view, params.id);
  } else {
    await pageList(view);
  }
}

// =====================================================================
// LISTA DE EVENTOS
// =====================================================================
async function pageList(view) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));
  const events = await listEvents();
  setContent(view,
    h('div', { class: 'page-head' },
      h('div', {},
        h('div', { class: 'page-title' }, 'Certificados'),
        h('div', { class: 'page-sub' },
          'Configure o template visual de cada evento. Quando pronto, dispara os PDFs personalizados via WhatsApp ou Email.'
        )
      )
    ),
    h('div', { class: 'table-card' },
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {},
          h('th', { style: { width: '40%' } }, 'Evento'),
          h('th', {}, 'Data'),
          h('th', {}, 'Check-in'),
          h('th', {}, 'Template'),
          h('th', { style: { width: '180px' } }, '')
        )),
        h('tbody', {}, ...events.map(rowFor))
      )
    )
  );
}

function rowFor(ev) {
  const hasTemplate = !!(ev.certificate_template_url && ev.certificate_layout);
  const checkins = ev.total_checkins || 0;
  return h('tr', {},
    h('td', {},
      h('div', { class: 'row-name' }, ev.name || ev.slug),
      h('div', { class: 'row-sub' }, ev.location || 'A confirmar')
    ),
    h('td', {}, ev.date_start ? fmtDate(ev.date_start) : '—'),
    h('td', { class: 'mono' }, checkins > 0 ? String(checkins) : '—'),
    h('td', {},
      hasTemplate
        ? h('span', { class: 'status live' }, 'Configurado')
        : h('span', { class: 'status done' }, 'Pendente')
    ),
    h('td', { style: { textAlign: 'right' } },
      h('button', {
        class: 'btn btn-primary',
        style: { padding: '6px 14px', height: 'auto', fontSize: '12px' },
        onclick: () => navigate(`/certificados/${ev.id}`)
      }, hasTemplate ? 'Editar template' : 'Configurar')
    )
  );
}

// =====================================================================
// EDITOR DO CERTIFICADO
// =====================================================================
async function pageEditor(view, eventId) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));
  const event = await getEvent(eventId);
  if (!event) {
    setContent(view, h('div', { class: 'empty' },
      h('div', { class: 'empty-title' }, 'Evento não encontrado'),
      h('button', { class: 'btn btn-secondary', onclick: () => navigate('/certificados') }, 'Voltar')
    ));
    return;
  }

  let templateUrl = event.certificate_template_url || null;
  let layout = (event.certificate_layout && event.certificate_layout.length > 0)
    ? JSON.parse(JSON.stringify(event.certificate_layout))
    : defaultLayout();
  // Garante que todos os slots têm o campo visible
  layout.forEach(s => { if (s.visible === undefined) s.visible = true; });
  let hours = event.certificate_hours || 8;
  let selectedSlot = null;
  let previewMode = false;

  function render() {
    setContent(view,
      h('div', { class: 'cert-head' },
        h('button', {
          class: 'btn btn-ghost',
          style: { padding: '4px 8px', height: 'auto', marginBottom: '8px' },
          onclick: () => navigate('/certificados')
        }, icons.arrowLeft(), 'Certificados'),
        h('div', { class: 'cert-head-row' },
          h('div', {},
            h('div', { class: 'evd-title' }, event.name || event.slug),
            h('div', { class: 'page-sub' }, 'Configuração do certificado')
          ),
          h('div', { class: 'cert-head-actions' },
            templateUrl ? h('button', {
              class: 'btn btn-ghost',
              onclick: () => { previewMode = !previewMode; render(); }
            }, previewMode ? 'Sair do preview' : 'Pré-visualizar') : null,
            templateUrl ? h('button', {
              class: 'btn btn-primary',
              onclick: handleSave
            }, 'Salvar configuração') : null
          )
        )
      ),
      templateUrl ? editorBody() : uploadZone()
    );
  }

  function uploadZone() {
    return h('div', { class: 'upload-zone' },
      h('div', { class: 'upload-icon' }, icons.upload()),
      h('div', { class: 'upload-title' }, 'Sobe o template do certificado'),
      h('div', { class: 'upload-body' },
        'PNG · 2480×1754 px recomendado (A4 paisagem) · até 5MB',
        h('br'),
        'O arquivo deve ter logo, bordas e texto fixo. Os campos variáveis serão posicionados depois.'
      ),
      h('input', {
        type: 'file',
        accept: 'image/png,image/jpeg',
        id: 'cert-file-input',
        style: { display: 'none' },
        onchange: handleUpload
      }),
      h('button', {
        class: 'btn btn-primary',
        style: { marginTop: '16px' },
        onclick: () => document.getElementById('cert-file-input').click()
      }, icons.upload(), 'Escolher arquivo PNG')
    );
  }

  function editorBody() {
    return h('div', { class: 'cert-editor' },
      h('aside', { class: 'cert-side' },
        h('div', { class: 'cert-side-section' },
          h('div', { class: 'cert-side-title' }, 'Variáveis'),
          h('div', { class: 'cert-side-body' }, 'Ative, oculte e arraste cada campo para posicioná-lo no certificado.')
        ),
        h('div', { class: 'cert-side-section' },
          ...layout.map((slot, idx) => slotConfig(slot, idx))
        ),
        h('div', { class: 'cert-side-section' },
          h('div', { class: 'cert-side-title' }, 'Carga horária'),
          h('div', { class: 'field' },
            h('label', {}, 'Horas certificadas'),
            h('input', {
              class: 'input',
              type: 'number',
              step: '0.5',
              min: '0',
              value: String(hours),
              oninput: (e) => { hours = parseFloat(e.target.value) || 0; updateBoxes(); }
            })
          )
        ),
        h('div', { class: 'cert-side-section' },
          h('button', {
            class: 'btn btn-ghost',
            style: { width: '100%', color: 'var(--red)' },
            onclick: handleRemove
          }, 'Remover template e recomeçar')
        )
      ),
      h('div', { class: 'cert-canvas-wrap' },
        h('div', { class: 'cert-canvas', id: 'cert-canvas' },
          h('img', {
            src: templateUrl,
            alt: 'Template do certificado',
            class: 'cert-bg',
            draggable: 'false'
          }),
          ...layout.map((slot, idx) => slotBox(slot, idx))
        )
      )
    );
  }

  function slotConfig(slot, idx) {
    const isSelected = selectedSlot === idx;
    return h('div', {
      class: 'slot-config' + (isSelected ? ' selected' : '') + (!slot.visible ? ' hidden-slot' : ''),
      onclick: () => { selectedSlot = idx; renderSidePanel(); updateBoxes(); }
    },
      h('div', { class: 'slot-config-head' },
        h('span', { class: 'slot-dot' + (!slot.visible ? ' dot-off' : '') }),
        h('span', { class: 'slot-name' }, labelOf(slot.key)),
        // Toggle visibilidade
        h('button', {
          class: 'slot-toggle' + (!slot.visible ? ' off' : ''),
          title: slot.visible ? 'Ocultar esta variável' : 'Mostrar esta variável',
          onclick: (e) => {
            e.stopPropagation();
            slot.visible = !slot.visible;
            selectedSlot = idx;
            renderSidePanel();
            updateBoxes();
          }
        }, slot.visible ? 'Visível' : 'Oculto')
      ),
      slot.visible ? h('div', { class: 'slot-config-row' },
        h('span', { class: 'slot-label' }, 'Tamanho'),
        h('input', {
          class: 'input slot-size',
          type: 'number',
          min: '8',
          max: '120',
          value: String(slot.size),
          onclick: (e) => e.stopPropagation(),
          oninput: (e) => { slot.size = parseInt(e.target.value) || 24; updateBoxes(); }
        })
      ) : h('div', { class: 'slot-config-row' },
        h('span', { class: 'slot-label', style: { fontStyle: 'italic', color: 'var(--ink-dim)' } },
          'Campo oculto — não aparece no certificado'
        )
      )
    );
  }

  function slotBox(slot, idx) {
    if (!slot.visible) {
      // Caixa fantasma: visível no editor mas não no preview nem no PDF
      if (previewMode) return null;
      return h('div', {
        class: 'cert-slot hidden-ghost',
        'data-idx': String(idx),
        style: {
          left: `${slot.x * 100}%`,
          top: `${slot.y * 100}%`,
          fontSize: `${slot.size}px`
        },
        onpointerdown: (e) => startDrag(e, idx)
      }, `{{${slot.key}}} (oculto)`);
    }
    const isSelected = selectedSlot === idx;
    const value = previewMode ? sampleFor(slot.key, event, hours) : `{{${slot.key}}}`;
    return h('div', {
      class: 'cert-slot' + (isSelected ? ' selected' : '') + (previewMode ? ' preview' : ''),
      'data-idx': String(idx),
      style: {
        left: `${slot.x * 100}%`,
        top: `${slot.y * 100}%`,
        fontSize: `${slot.size}px`,
        textAlign: slot.align || 'center'
      },
      onpointerdown: (e) => startDrag(e, idx)
    }, value);
  }

  function updateBoxes() {
    const canvas = document.getElementById('cert-canvas');
    if (!canvas) return;
    const boxes = canvas.querySelectorAll('.cert-slot');
    boxes.forEach((box) => {
      const idx = parseInt(box.getAttribute('data-idx'));
      const slot = layout[idx];
      if (!slot) return;
      box.style.left = `${slot.x * 100}%`;
      box.style.top = `${slot.y * 100}%`;
      box.style.fontSize = `${slot.size}px`;
      if (!slot.visible) {
        box.textContent = previewMode ? '' : `{{${slot.key}}} (oculto)`;
        box.className = previewMode ? 'cert-slot hidden-ghost' : 'cert-slot hidden-ghost';
        return;
      }
      box.textContent = previewMode ? sampleFor(slot.key, event, hours) : `{{${slot.key}}}`;
      box.className = 'cert-slot' + (selectedSlot === idx ? ' selected' : '') + (previewMode ? ' preview' : '');
    });
  }

  function renderSidePanel() {
    const side = view.querySelector('.cert-side');
    if (!side) return;
    setContent(side,
      h('div', { class: 'cert-side-section' },
        h('div', { class: 'cert-side-title' }, 'Variáveis'),
        h('div', { class: 'cert-side-body' }, 'Ative, oculte e arraste cada campo para posicioná-lo no certificado.')
      ),
      h('div', { class: 'cert-side-section' },
        ...layout.map((slot, idx) => slotConfig(slot, idx))
      ),
      h('div', { class: 'cert-side-section' },
        h('div', { class: 'cert-side-title' }, 'Carga horária'),
        h('div', { class: 'field' },
          h('label', {}, 'Horas certificadas'),
          h('input', {
            class: 'input',
            type: 'number',
            step: '0.5',
            min: '0',
            value: String(hours),
            oninput: (e) => { hours = parseFloat(e.target.value) || 0; updateBoxes(); }
          })
        )
      ),
      h('div', { class: 'cert-side-section' },
        h('button', {
          class: 'btn btn-ghost',
          style: { width: '100%', color: 'var(--red)' },
          onclick: handleRemove
        }, 'Remover template e recomeçar')
      )
    );
  }

  // ----- DRAG -----
  let dragState = null;
  function startDrag(e, idx) {
    if (previewMode) return;
    e.preventDefault();
    selectedSlot = idx;
    const canvas = document.getElementById('cert-canvas');
    const rect = canvas.getBoundingClientRect();
    dragState = {
      idx, canvasRect: rect,
      startX: e.clientX, startY: e.clientY,
      origX: layout[idx].x, origY: layout[idx].y
    };
    document.addEventListener('pointermove', onDrag);
    document.addEventListener('pointerup', endDrag);
    updateBoxes();
    renderSidePanel();
  }
  function onDrag(e) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const slot = layout[dragState.idx];
    slot.x = clamp(dragState.origX + dx / dragState.canvasRect.width, 0, 1);
    slot.y = clamp(dragState.origY + dy / dragState.canvasRect.height, 0, 1);
    updateBoxes();
  }
  function endDrag() {
    document.removeEventListener('pointermove', onDrag);
    document.removeEventListener('pointerup', endDrag);
    dragState = null;
  }

  // ----- HANDLERS -----
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.danger('Arquivo maior que 5MB. Reduz e tenta de novo.'); return; }
    if (!['image/png', 'image/jpeg'].includes(file.type)) { toast.danger('Formato inválido. Sobe um PNG ou JPG.'); return; }
    toast.info('Enviando arquivo...');
    try {
      templateUrl = await uploadCertificateTemplate(eventId, file);
      layout = defaultLayout();
      layout.forEach(s => { s.visible = true; });
      selectedSlot = null;
      previewMode = false;
      render();
      toast.success('Template enviado! Posiciona os campos arrastando.');
    } catch (err) { toast.danger('Erro no upload: ' + err.message); }
  }

  async function handleSave() {
    // Salva todos os slots (com visible=true e visible=false)
    try {
      await saveCertificateConfig(eventId, { templateUrl, layout, hours });
      toast.success('Configuração salva.');
      navigate('/certificados');
    } catch (err) { toast.danger('Erro ao salvar: ' + err.message); }
  }

  async function handleRemove() {
    if (!confirm('Tem certeza? O template atual será apagado.')) return;
    try {
      await removeCertificateTemplate(eventId);
      templateUrl = null;
      layout = defaultLayout();
      render();
      toast.success('Template removido.');
    } catch (err) { toast.danger('Erro ao remover: ' + err.message); }
  }

  render();
}

// =====================================================================
// HELPERS
// =====================================================================
function labelOf(key) {
  return ({ NOME: 'Nome do participante', DATA: 'Data do evento', HORAS: 'Carga horária' })[key] || key;
}
function sampleFor(key, event, hours) {
  if (key === 'NOME') return SAMPLE_NAME;
  if (key === 'DATA') return event.date_end
    ? fmtDate(event.date_end)
    : event.date_start ? fmtDate(event.date_start) : new Date().toLocaleDateString('pt-BR');
  if (key === 'HORAS') return `${hours}h`;
  return `{{${key}}}`;
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
