// =====================================================================
// EXPOSITORES · convites, equipes e retirada de crachás
// O time interno gera o código, manda junto do contrato, a empresa preenche
// sozinha. Aqui a gente acompanha quem preencheu, quem falta e quem retirou.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { supabase } from '../data/supabase.js';
import { toast } from '../ui/toast.js';

const BASE_FORM = 'https://checkin.nutricaobrasil.com.br/expositor-cadastro-time?e=';

const E = { eventos: [], eventId: null, empresas: [], busca: '', publico: [] };

// ── dados ────────────────────────────────────────────────────────────
async function carrega(eventId) {
  const [emp, pub] = await Promise.all([
    supabase.from('exhibitors')
      // exhibitor_members tem DUAS ligações com participants (o dono do crachá e quem
      // retirou). Sem nomear a constraint, o PostgREST não sabe qual seguir.
      .select('id, codigo, token, empresa, cnpj, estande, cota, limite_credenciais, status, ' +
              'resp_nome, resp_whatsapp, cad_nome, preenchido_em, ' +
              'exhibitor_members(id, cargo, pode_retirar, retirado_em, retirado_por_nome, ' +
              'participants!exhibitor_members_participant_id_fkey(id, name, phone, email))')
      .eq('event_id', eventId)
      .order('empresa'),
    supabase.from('nb_publico').select('*')
  ]);
  if (emp.error) throw emp.error;
  E.empresas = (emp.data ?? []).map((x) => {
    const time = (x.exhibitor_members ?? []).map((m) => ({
      id: m.id, cargo: m.cargo, pode_retirar: m.pode_retirar,
      retirado_em: m.retirado_em, retirado_por: m.retirado_por_nome,
      nome: m.participants?.name, phone: m.participants?.phone, email: m.participants?.email
    })).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    return { ...x, time, retirados: time.filter((p) => p.retirado_em).length };
  });
  E.publico = pub.data ?? [];
}

// ── página ───────────────────────────────────────────────────────────
export async function pageExpositores(view) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));
  const { data, error } = await supabase
    .from('events').select('id, name, event_type, slug')
    .eq('event_type', 'exhibitor').order('event_date');
  if (error || !data?.length) {
    setContent(view, aviso('Nenhum evento de expositores cadastrado.'));
    return;
  }
  E.eventos = data;
  E.eventId = E.eventId || data[0].id;
  await recarrega(view);
}

async function recarrega(view) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));
  try { await carrega(E.eventId); } catch (e) { setContent(view, aviso(e.message || e)); return; }
  pinta(view);
}

function pinta(view) {
  const emp = E.empresas;
  const pessoas = emp.reduce((s, x) => s + x.time.length, 0);
  const retirados = emp.reduce((s, x) => s + x.retirados, 0);
  const preenchidos = emp.filter((x) => x.status !== 'convidado').length;
  const totalPublico = E.publico.reduce((s, l) => s + (l.inscritos || 0), 0);
  const totalPresentes = E.publico.reduce((s, l) => s + (l.presentes || 0), 0);

  setContent(view,
    h('div', { class: 'page-head' },
      h('div', {},
        h('div', { class: 'page-title' }, 'Expositores'),
        h('div', { class: 'page-sub' },
          'Gere um código por empresa e mande junto do contrato. A empresa preenche a equipe ' +
          'sozinha, e no credenciamento os crachás já estão impressos.')
      ),
      h('div', { class: 'evd-actions' },
        E.eventos.length > 1
          ? h('select', { class: 'input evd-select',
              onChange: async (e) => { E.eventId = e.target.value; await recarrega(view); } },
              ...E.eventos.map((e) => h('option', { value: e.id, selected: e.id === E.eventId }, e.name)))
          : null,
        h('button', { class: 'btn btn-primary', onClick: () => novoConvite(view) }, '+ Novo convite')
      )
    ),

    // ── contador oficial do evento ────────────────────────────────
    h('div', { class: 'table-card', style: { padding: '18px 20px', marginBottom: '16px' } },
      h('div', { class: 'evd-stat-label', style: { marginBottom: '10px' } },
        'Público do Nutrição Brasil Brasília · todos os eventos somados'),
      h('div', { class: 'evd-stats' },
        stat('Inscritos no total', totalPublico),
        stat('Presentes', totalPresentes),
        ...E.publico
          .sort((a, b) => (b.inscritos || 0) - (a.inscritos || 0))
          .map((l) => stat(curto(l.name), (l.presentes || 0) + ' / ' + (l.inscritos || 0)))
      ),
      h('div', { class: 'evd-kit-note' },
        'Crachá retirado conta como presença. Este é o contador oficial do evento — ' +
        'congresso, expositores, corrida e visitantes no mesmo número.')
    ),

    // ── situação dos expositores ──────────────────────────────────
    h('div', { class: 'table-card', style: { padding: '18px 20px', marginBottom: '16px' } },
      h('div', { class: 'evd-stats' },
        stat('Empresas convidadas', emp.length),
        stat('Já preencheram', preenchidos),
        stat('Pessoas cadastradas', pessoas),
        stat('Crachás retirados', retirados)
      )
    ),

    h('div', { class: 'evd-subtoolbar' },
      h('input', { class: 'input', placeholder: 'Buscar empresa, código ou pessoa…', value: E.busca,
        onInput: (e) => { E.busca = e.target.value; redesenha(); } })
    ),
    h('div', { id: 'lista-exp' }, lista())
  );
}

function curto(n) { return String(n || '').split('–')[0].trim(); }
function stat(rotulo, valor) {
  return h('div', {},
    h('div', { class: 'evd-stat-label' }, rotulo),
    h('div', { class: 'evd-stat-value mono' }, String(valor))
  );
}
function aviso(msg) {
  return h('div', { class: 'table-card', style: { padding: '24px' } },
    h('div', { class: 'page-sub' }, String(msg)));
}
function redesenha() {
  const el = document.getElementById('lista-exp');
  if (el) el.replaceChildren(lista());
}

function lista() {
  const q = E.busca.trim().toLowerCase();
  const filtradas = E.empresas.filter((x) => {
    if (!q) return true;
    return (x.empresa || '').toLowerCase().includes(q) ||
           (x.codigo || '').toLowerCase().includes(q) ||
           x.time.some((p) => String(p.nome).toLowerCase().includes(q));
  });
  if (!filtradas.length) {
    return aviso(E.empresas.length ? 'Nenhuma empresa neste filtro.'
      : 'Nenhum convite gerado ainda. Clique em "+ Novo convite".');
  }
  return h('div', {}, ...filtradas.map(cartao));
}

function cartao(x) {
  const link = BASE_FORM + x.codigo;
  const total = x.time.length;
  const falta = x.limite_credenciais - total;
  return h('div', { class: 'table-card', style: { marginBottom: '12px', overflow: 'hidden' } },
    h('div', { style: { padding: '16px 18px', display: 'flex', gap: '16px',
                        alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' } },
      h('div', { style: { minWidth: '240px' } },
        h('div', { class: 'row-name', style: { fontSize: '16px' } },
          x.empresa || h('span', { style: { color: 'var(--ink-mute)' } }, 'aguardando preenchimento')),
        h('div', { class: 'row-sub' },
          [x.codigo, x.cota, x.estande ? 'estande ' + x.estande : null,
           x.resp_nome ? 'resp. ' + x.resp_nome : null].filter(Boolean).join(' · ')),
        h('div', { style: { marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          x.status === 'convidado'
            ? h('span', { class: 'status done' }, 'Não preencheu')
            : h('span', { class: 'status live' }, 'Preenchido'),
          h('span', { class: 'row-sub mono' },
            total + ' de ' + x.limite_credenciais + ' credenciais' +
            (x.retirados ? ' · ' + x.retirados + ' retirados' : '')),
          falta < 0 ? h('span', { class: 'status done' }, 'acima do limite') : null)
      ),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn btn-ghost btn-sm',
          onClick: () => copia(link, 'Link do formulário copiado.') }, 'Copiar link'),
        h('button', { class: 'btn btn-ghost btn-sm',
          onClick: () => copia(x.codigo, 'Código copiado.') }, 'Copiar código'),
        h('button', { class: 'btn btn-ghost btn-sm',
          onClick: (e) => {
            const alvo = e.currentTarget.closest('.table-card').querySelector('.expo-time');
            const abrindo = alvo.classList.contains('hide');
            alvo.classList.toggle('hide');
            e.currentTarget.textContent = abrindo ? 'Fechar equipe' : 'Ver equipe';
          } }, 'Ver equipe'),
        h('button', { class: 'btn btn-ghost btn-sm', onClick: () => mudaLimite(x) }, 'Limite')
      )
    ),
    h('div', { class: 'expo-time hide', style: { borderTop: '1px solid var(--line)' } },
      total
        ? h('table', { class: 'table' },
            h('thead', {}, h('tr', {},
              h('th', { style: { width: '32%' } }, 'Pessoa'),
              h('th', { style: { width: '22%' } }, 'Cargo no crachá'),
              h('th', { style: { width: '20%' } }, 'WhatsApp'),
              h('th', {}, 'Crachá')
            )),
            h('tbody', {}, ...x.time.map((p) =>
              h('tr', {},
                h('td', {},
                  h('div', { class: 'row-name' }, p.nome),
                  p.pode_retirar ? h('div', { class: 'row-sub' }, 'pode retirar os crachás') : null),
                h('td', {}, p.cargo || '—'),
                h('td', { class: 'mono' }, p.phone || '—'),
                h('td', {},
                  p.retirado_em
                    ? [h('span', { class: 'status live' }, 'Retirado'),
                       p.retirado_por ? h('div', { class: 'row-sub' }, 'por ' + p.retirado_por) : null]
                    : h('span', { class: 'status done' }, 'No balcão'))
              )))
          )
        : h('div', { class: 'page-sub', style: { padding: '16px 18px' } },
            'A empresa ainda não cadastrou ninguém. Link: ' + link)
    )
  );
}

// ── ações ────────────────────────────────────────────────────────────
function copia(txt, msg) {
  navigator.clipboard.writeText(txt).then(() => toast(msg)).catch(() => toast('Não consegui copiar.', 'error'));
}

async function novoConvite(view) {
  const empresa = prompt('Nome da empresa (pode deixar em branco e a própria empresa preenche):', '');
  if (empresa === null) return;
  const lim = prompt('Quantas credenciais essa cota dá?', '5');
  if (lim === null) return;
  try {
    const { data, error } = await supabase.rpc('expo_gera_convite', {
      p_event_id: E.eventId,
      p_empresa: empresa.trim() || null,
      p_limite: Math.max(1, parseInt(lim, 10) || 5),
      p_cota: null
    });
    if (error) throw error;
    await navigator.clipboard.writeText(BASE_FORM + data.codigo).catch(() => {});
    toast('Convite ' + data.codigo + ' criado. Link copiado.');
    await recarrega(view);
  } catch (e) {
    toast('Não deu: ' + (e.message || e), 'error');
  }
}

async function mudaLimite(x) {
  const v = prompt('Quantas credenciais para ' + (x.empresa || x.codigo) + '?', String(x.limite_credenciais));
  if (v === null) return;
  const n = Math.max(1, parseInt(v, 10) || x.limite_credenciais);
  const { error } = await supabase.from('exhibitors')
    .update({ limite_credenciais: n, updated_at: new Date().toISOString() }).eq('id', x.id);
  if (error) { toast('Não deu: ' + error.message, 'error'); return; }
  x.limite_credenciais = n;
  toast('Limite atualizado para ' + n + '.');
  redesenha();
}
