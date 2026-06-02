import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { getEvent } from '../data/events.js';
import { listAllParticipants } from '../data/participants.js';
import { toast } from '../ui/toast.js';
import { navigate } from '../core/router.js';
import { fmtDate, fmtRelative } from '../core/utils.js';

// Chamada pelo botão "Certificado" dentro da tela de detalhe do evento.
// Substitui o conteúdo do view (sem mudar a rota).
export async function pageEventCertificates(view, event, onBack) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));

  const hasTemplate = !!(event.certificate_template_url && event.certificate_layout);

  // Pega só quem fez check-in
  let all = [];
  try {
    const raw = await listAllParticipants(event.id);
    all = raw.filter(p => p.checked === true);
  } catch (e) {
    toast.danger('Erro ao carregar participantes: ' + e.message);
    return;
  }

  let query = '';

  function getFiltered() {
    if (!query) return all;
    const q = query.toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return all.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (qDigits && (p.phone || '').replace(/\D/g, '').includes(qDigits))
    );
  }

  function certStatus(p) {
    if (!p.certificate_url) return 'pendente';
    if (p.certificate_sent_at) return 'enviado';
    return 'gerado';
  }

  function statusBadge(p) {
    const s = certStatus(p);
    if (s === 'pendente') return h('span', { class: 'status done' }, 'Pendente');
    if (s === 'gerado')   return h('span', { class: 'status live' }, 'PDF pronto');
    // enviado
    return h('span', { class: 'status-cert-sent' },
      'Enviado · ' + fmtRelative(p.certificate_sent_at)
    );
  }

  function counters() {
    const pendente = all.filter(p => !p.certificate_url).length;
    const gerado   = all.filter(p => p.certificate_url && !p.certificate_sent_at).length;
    const enviado  = all.filter(p => p.certificate_sent_at).length;
    return { pendente, gerado, enviado };
  }

  function render() {
    const c = counters();
    const filtered = getFiltered();

    setContent(view,
      // Cabeçalho
      h('div', { class: 'evd-head', style: { marginBottom: '24px' } },
        h('div', {},
          h('button', {
            class: 'btn btn-ghost',
            style: { padding: '4px 8px', height: 'auto', marginBottom: '8px' },
            onclick: onBack
          }, icons.arrowLeft(), 'Voltar ao evento'),
          h('div', { class: 'evd-title' }, 'Certificados — ' + (event.name || event.slug)),
          h('div', { class: 'page-sub' },
            `${all.length} participantes com check-in · ` +
            `${c.pendente} pendentes · ${c.gerado} PDFs prontos · ${c.enviado} enviados`
          )
        ),
        h('div', { style: { display: 'flex', gap: '8px', flexShrink: '0' } },
          h('button', {
            class: 'btn btn-ghost',
            onclick: () => navigate(`/certificados/${event.id}`)
          }, hasTemplate ? 'Editar template' : 'Configurar template')
        )
      ),

      // Aviso se não tem template
      !hasTemplate ? h('div', { class: 'cert-warn' },
        h('b', {}, 'Template não configurado. '),
        'Você precisa configurar o template visual antes de gerar os certificados. ',
        h('a', {
          href: '#',
          onclick: (e) => { e.preventDefault(); navigate(`/certificados/${event.id}`); }
        }, 'Configurar agora →')
      ) : null,

      // Barra de ações bulk
      h('div', { class: 'cert-bulk-bar' },
        h('div', { class: 'toolbar-search', style: { flex: '1', maxWidth: '400px' } },
          icons.search(),
          h('input', {
            type: 'text',
            placeholder: 'Buscar por nome ou email...',
            value: query,
            oninput: (e) => { query = e.target.value; renderTable(); }
          })
        ),
        h('div', { class: 'cert-bulk-actions' },
          h('button', {
            class: 'btn btn-secondary',
            disabled: !hasTemplate || null,
            onclick: () => handleBulkGenerate()
          }, 'Gerar todos os PDFs'),
          h('button', {
            class: 'btn btn-secondary',
            disabled: !hasTemplate || null,
            onclick: () => handleBulkWhatsApp()
          }, icons.send(), 'WhatsApp para todos'),
          h('button', {
            class: 'btn btn-secondary',
            onclick: () => handleBulkDownload()
          }, 'Baixar todos')
        )
      ),

      // Tabela
      h('div', { class: 'table-card', id: 'cert-table-wrap' })
    );

    renderTable();
  }

  function renderTable() {
    const wrap = document.getElementById('cert-table-wrap');
    if (!wrap) return;
    const filtered = getFiltered();

    if (filtered.length === 0) {
      setContent(wrap, h('div', { class: 'empty' },
        h('div', { class: 'empty-title' }, query ? `Nenhum resultado para "${query}"` : 'Nenhum check-in registrado neste evento.'),
      ));
      return;
    }

    setContent(wrap,
      h('table', { class: 'table table-cert' },
        h('thead', {}, h('tr', {},
          h('th', { style: { width: '28%' } }, 'Participante'),
          h('th', {}, 'Email'),
          h('th', {}, 'Telefone'),
          h('th', {}, 'Status'),
          h('th', { style: { width: '160px', textAlign: 'right' } }, 'Ações')
        )),
        h('tbody', {}, ...filtered.map(rowFor))
      ),
      h('div', { class: 'table-pager' },
        h('span', {}, `${filtered.length} participante${filtered.length !== 1 ? 's' : ''} com check-in`)
      )
    );
  }

  function rowFor(p) {
    const s = certStatus(p);
    return h('tr', {},
      h('td', {},
        h('div', { class: 'row-name' }, p.name || '—')
      ),
      h('td', { class: 'mono', style: { fontSize: '12px' } }, p.email || '—'),
      h('td', { class: 'mono', style: { fontSize: '12px' } }, p.phone || '—'),
      h('td', {}, statusBadge(p)),
      h('td', { style: { textAlign: 'right' } },
        h('div', { class: 'cert-row-actions' },
          // Baixar (só se PDF existe)
          p.certificate_url ? h('a', {
            class: 'btn-icon',
            href: p.certificate_url,
            target: '_blank',
            title: 'Baixar PDF'
          }, icons.check()) : h('button', {
            class: 'btn-icon',
            title: 'Gerar PDF',
            onclick: () => handleGenerate(p)
          }, icons.plus()),
          // WhatsApp
          h('button', {
            class: 'btn-icon',
            title: 'Enviar por WhatsApp',
            onclick: () => handleWhatsApp(p)
          }, icons.send()),
          // Reenviar (só se já enviou)
          p.certificate_sent_at ? h('button', {
            class: 'btn-icon',
            title: 'Reenviar',
            onclick: () => handleWhatsApp(p)
          }, icons.check()) : null
        )
      )
    );
  }

  // ---- HANDLERS INDIVIDUAIS ----
  async function handleGenerate(p) {
    toast.info('Gerando PDF — em construção (próxima entrega)');
    // TODO: chamar Edge Function certificate-generate
    // const res = await fetch(`${SUPABASE_URL}/functions/v1/certificate-generate`, {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ participant_id: p.id })
    // });
  }

  async function handleWhatsApp(p) {
    if (!p.certificate_url) {
      toast.danger('Gera o PDF primeiro antes de enviar.');
      return;
    }
    toast.info('Disparo WhatsApp — em construção (próxima entrega)');
    // TODO: chamar whatsapp-broadcast individual
  }

  // ---- HANDLERS EM MASSA ----
  async function handleBulkGenerate() {
    const sem_pdf = all.filter(p => !p.certificate_url);
    if (sem_pdf.length === 0) { toast.success('Todos os PDFs já foram gerados.'); return; }
    toast.info(`Gerando ${sem_pdf.length} PDFs — em construção (próxima entrega)`);
    // TODO: loop chamando certificate-generate
  }

  async function handleBulkWhatsApp() {
    const com_pdf = all.filter(p => p.certificate_url);
    if (com_pdf.length === 0) { toast.danger('Nenhum PDF gerado ainda. Gera os PDFs primeiro.'); return; }
    toast.info(`Enviando WhatsApp para ${com_pdf.length} pessoas — em construção (próxima entrega)`);
    // TODO: chamar whatsapp-broadcast
  }

  async function handleBulkDownload() {
    const com_pdf = all.filter(p => p.certificate_url);
    if (com_pdf.length === 0) { toast.danger('Nenhum PDF gerado ainda.'); return; }
    toast.info('Download em lote — em construção. Por enquanto, baixe individualmente.');
    // TODO: gerar ZIP com todos os PDFs via Edge Function
  }

  render();
}
