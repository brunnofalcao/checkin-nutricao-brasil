import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { getEvent } from '../data/events.js';
import { listAllParticipants } from '../data/participants.js';
import { toast } from '../ui/toast.js';
import { navigate } from '../core/router.js';
import { fmtDate, fmtRelative } from '../core/utils.js';

const { SUPABASE_URL, SUPABASE_ANON } = window.__ENV;

export async function pageEventCertificates(view, event, onBack) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));

  const hasTemplate = !!(event.certificate_template_url && event.certificate_layout);

  let all = [];
  try {
    const raw = await listAllParticipants(event.id);
    all = raw.filter(p => p.checked === true);
  } catch (e) {
    toast.danger('Erro ao carregar: ' + e.message);
    return;
  }

  let query = '';
  let generating = false; // bloqueia duplo-clique no bulk

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
    if (p.certificate_sent_at) return 'enviado';
    if (p.certificate_url)     return 'gerado';
    return 'pendente';
  }

  function statusBadge(p) {
    const s = certStatus(p);
    if (s === 'enviado')
      return h('span', { class: 'status-cert-sent' }, 'Enviado · ' + fmtRelative(p.certificate_sent_at));
    if (s === 'gerado')
      return h('span', { class: 'status live' }, 'PDF pronto');
    return h('span', { class: 'status done' }, 'Pendente');
  }

  function counts() {
    return {
      pendente: all.filter(p => !p.certificate_url).length,
      gerado:   all.filter(p => p.certificate_url && !p.certificate_sent_at).length,
      enviado:  all.filter(p => p.certificate_sent_at).length
    };
  }

  async function callFn(path, body) {
    const { supabase: sb } = await import('../data/supabase.js');
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || JSON.stringify(j));
    return j;
  }

  async function refreshParticipant(id) {
    const { supabase: sb } = await import('../data/supabase.js');
    const { data } = await sb
      .from('participants')
      .select('id, certificate_url, certificate_sent_at')
      .eq('id', id)
      .single();
    if (data) {
      const idx = all.findIndex(p => p.id === id);
      if (idx !== -1) Object.assign(all[idx], data);
    }
    renderTable();
  }

  async function refreshAll() {
    const { supabase: sb } = await import('../data/supabase.js');
    const ids = all.map(p => p.id);
    const { data } = await sb
      .from('participants')
      .select('id, certificate_url, certificate_sent_at')
      .in('id', ids);
    if (data) {
      data.forEach(d => {
        const idx = all.findIndex(p => p.id === d.id);
        if (idx !== -1) Object.assign(all[idx], d);
      });
    }
    renderTable();
  }

  // ── Handlers individuais ─────────────────────────────────────────
  async function handleGenerate(p, btn) {
    if (!hasTemplate) { toast.danger('Configure o template primeiro.'); return; }
    btn.disabled = true;
    btn.textContent = '...';
    try {
      const r = await callFn('certificate-generate', { participant_id: p.id });
      toast.success('PDF gerado.');
      await refreshParticipant(p.id);
    } catch (e) {
      toast.danger('Erro: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function handleSendWhatsApp(p, btn) {
    if (!p.certificate_url) {
      toast.danger('Gera o PDF primeiro.'); return;
    }
    btn.disabled = true;
    try {
      await callFn('certificate-dispatch', { participant_id: p.id, channels: ['whatsapp'] });
      toast.success('WhatsApp enviado para ' + p.name);
      await refreshParticipant(p.id);
    } catch (e) {
      toast.danger('Erro WhatsApp: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  }

  function handleSendEmail(p) {
    if (!p.certificate_url) { toast.danger('Gera o PDF primeiro.'); return; }
    if (!p.email)            { toast.danger('Participante sem email cadastrado.'); return; }

    const eventName = event.name || 'Nutrição Brasil';
    const subject   = encodeURIComponent(`Seu certificado — ${eventName}`);
    const body      = encodeURIComponent(
      `Olá, ${p.name || ''}!\n\n` +
      `Seu certificado de participação no ${eventName} está pronto.\n\n` +
      `Baixe aqui: ${p.certificate_url}\n\n` +
      `Nutrição Brasil`
    );

    // Abre o cliente de email do usuário com tudo preenchido
    window.open(`mailto:${p.email}?subject=${subject}&body=${body}`);
    toast.success('Cliente de email aberto. Confira e clique Enviar.');
  }

  function handleCopyLink(p) {
    if (!p.certificate_url) { toast.danger('PDF ainda não gerado.'); return; }
    navigator.clipboard.writeText(p.certificate_url)
      .then(() => toast.success('Link copiado!'))
      .catch(() => toast.danger('Não foi possível copiar.'));
  }

  // ── Handlers bulk ─────────────────────────────────────────────────
  async function handleBulkGenerate() {
    if (!hasTemplate) { toast.danger('Configure o template primeiro.'); return; }
    const sem = all.filter(p => !p.certificate_url);
    if (sem.length === 0) { toast.success('Todos os PDFs já foram gerados.'); return; }
    if (!confirm(`Gerar ${sem.length} PDFs? Isso pode levar alguns minutos.`)) return;

    generating = true;
    renderTopBtns(true);

    let done = 0;
    for (const p of sem) {
      try {
        await callFn('certificate-generate', { participant_id: p.id });
        done++;
        // Atualiza só esse participante na lista
        const idx = all.findIndex(x => x.id === p.id);
        if (idx !== -1) {
          // Puxa a URL atualizada
          const { supabase: sb } = await import('../data/supabase.js');
          const { data } = await sb.from('participants').select('id, certificate_url').eq('id', p.id).single();
          if (data) Object.assign(all[idx], data);
        }
        renderTable();
        updateBulkProgress(`Gerando PDFs... ${done}/${sem.length}`);
      } catch (e) {
        console.error('Erro pra', p.name, e.message);
      }
    }
    generating = false;
    renderTopBtns(false);
    toast.success(`${done} PDFs gerados.`);
  }

  async function handleBulkWhatsApp() {
    const com_pdf = all.filter(p => p.certificate_url);
    if (com_pdf.length === 0) { toast.danger('Gera os PDFs primeiro.'); return; }
    if (!confirm(`Enviar WhatsApp para ${com_pdf.length} pessoas?`)) return;

    generating = true;
    renderTopBtns(true);

    let lastId = null, totalSent = 0, round = 0;
    while (true) {
      round++;
      try {
        const r = await callFn('certificate-dispatch', {
          event_id: event.id,
          channels: ['whatsapp'],
          last_id: lastId
        });
        totalSent += r.sent || 0;
        lastId = r.last_id;
        updateBulkProgress(`Enviando WhatsApp... ${totalSent} enviados`);
        await refreshAll();
        if (r.done || round > 20) break;
      } catch (e) {
        toast.danger('Erro no disparo: ' + e.message);
        break;
      }
    }
    generating = false;
    renderTopBtns(false);
    toast.success(`WhatsApp enviado para ${totalSent} pessoas.`);
  }

  // ── Render ───────────────────────────────────────────────────────
  function render() {
    const c = counts();
    setContent(view,
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
            `${c.pendente} sem PDF · ${c.gerado} PDFs prontos · ${c.enviado} enviados`
          )
        ),
        h('div', { style: { display: 'flex', gap: '8px', flexShrink: '0' } },
          h('button', {
            class: 'btn btn-ghost',
            onclick: () => navigate(`/certificados/${event.id}`)
          }, hasTemplate ? 'Editar template' : '⚠ Configurar template')
        )
      ),

      !hasTemplate ? h('div', { class: 'cert-warn' },
        h('b', {}, 'Template não configurado. '),
        'Configure o template visual antes de gerar os certificados. ',
        h('a', { href: '#', onclick: (e) => { e.preventDefault(); navigate(`/certificados/${event.id}`); } }, 'Configurar →')
      ) : null,

      // Barra de progresso bulk (inicialmente vazia)
      h('div', { id: 'cert-progress', style: { display: 'none' } }),

      // Botões bulk
      h('div', { class: 'cert-bulk-bar', id: 'cert-bulk-bar' }),

      // Tabela
      h('div', { class: 'table-card', id: 'cert-table-wrap' })
    );

    renderTopBtns(false);
    renderTable();
  }

  function renderTopBtns(disabled) {
    const bar = document.getElementById('cert-bulk-bar');
    if (!bar) return;
    setContent(bar,
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
          disabled: disabled || !hasTemplate || null,
          onclick: handleBulkGenerate
        }, 'Gerar todos os PDFs'),
        h('button', {
          class: 'btn btn-primary',
          disabled: disabled || null,
          onclick: handleBulkWhatsApp
        }, icons.send(), 'WhatsApp para todos')
      )
    );
  }

  function updateBulkProgress(msg) {
    const el = document.getElementById('cert-progress');
    if (!el) return;
    el.style.display = 'block';
    el.textContent = msg;
    el.className = 'cert-progress-bar';
  }

  function renderTable() {
    const wrap = document.getElementById('cert-table-wrap');
    if (!wrap) return;
    const filtered = getFiltered();

    if (filtered.length === 0) {
      setContent(wrap, h('div', { class: 'loading-row' },
        query ? `Nenhum resultado para "${query}".` : 'Nenhum participante com check-in.'
      ));
      return;
    }

    setContent(wrap,
      h('table', { class: 'table table-cert' },
        h('thead', {}, h('tr', {},
          h('th', { style: { width: '26%' } }, 'Participante'),
          h('th', {}, 'Email'),
          h('th', {}, 'Status'),
          h('th', { style: { width: '170px', textAlign: 'right' } }, 'Ações')
        )),
        h('tbody', {}, ...filtered.map(rowFor))
      ),
      h('div', { class: 'table-pager' },
        h('span', {}, `${filtered.length} participante${filtered.length !== 1 ? 's' : ''} com check-in`)
      )
    );
  }

  function rowFor(p) {
    const hasPdf = !!p.certificate_url;

    return h('tr', {},
      h('td', {},
        h('div', { class: 'row-name' }, p.name || '—'),
        h('div', { class: 'row-sub' }, p.phone || '—')
      ),
      h('td', { class: 'mono', style: { fontSize: '12px' } }, p.email || '—'),
      h('td', {}, statusBadge(p)),
      h('td', {},
        h('div', { class: 'cert-row-actions' },
          // Abrir PDF (quando existe)
          hasPdf
            ? h('a', { class: 'btn-icon', href: p.certificate_url, target: '_blank', title: 'Abrir PDF' }, icons.check())
            : null,
          // Gerar (sem PDF) ou Regenerar (já tem — usa template atualizado)
          h('button', {
            class: 'btn-icon',
            title: hasPdf ? 'Regenerar com novo template' : 'Gerar PDF',
            style: hasPdf ? { color: 'var(--amber)' } : {},
            onclick: (e) => handleGenerate(p, e.currentTarget)
          }, icons.plus()),

          // Copiar link
          h('button', {
            class: 'btn-icon' + (hasPdf ? '' : ' btn-icon-off'),
            title: hasPdf ? 'Copiar link do PDF' : 'Gere o PDF primeiro',
            onclick: () => handleCopyLink(p)
          }, icons.info()),

          // WhatsApp individual
          h('button', {
            class: 'btn-icon',
            title: 'Enviar por WhatsApp',
            onclick: (e) => handleSendWhatsApp(p, e.currentTarget)
          }, icons.send()),

          // Email individual
          h('button', {
            class: 'btn-icon',
            title: 'Enviar por email',
            onclick: () => handleSendEmail(p)
          }, icons.message())
        )
      )
    );
  }

  render();
}
