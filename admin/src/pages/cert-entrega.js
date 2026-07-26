// =====================================================================
// ENTREGA DE CERTIFICADOS · Nutrição Brasil
// Onde o certificado deixa de ser arte e vira operação:
//   1. tabela de módulos (a fonte da verdade de data e carga horária)
//   2. situação da emissão
//   3. o link pessoal de cada inscrito, pronto para copiar
// Os dados que saem no certificado vêm daqui e do token. Nunca do navegador.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { supabase } from '../data/supabase.js';
import { toast } from '../ui/toast.js';

const BASE_ALUNO = 'https://checkin.nutricaobrasil.com.br/c/';
const BASE_CONF = 'https://checkin.nutricaobrasil.com.br/v/';

const estado = { eventos: [], eventId: null, modulos: [], pessoas: [], busca: '', so: 'todos' };

// ── dados ────────────────────────────────────────────────────────────
async function carregaEventos() {
  const { data, error } = await supabase
    .from('events')
    .select('id, name, city, state, event_date')
    .order('event_date', { ascending: true });
  if (error) throw error;
  const ids = (data ?? []).map((e) => e.id);
  if (!ids.length) return [];
  const { data: mods } = await supabase.from('cert_modulos').select('event_id').in('event_id', ids);
  const comModulo = new Set((mods ?? []).map((m) => m.event_id));
  return (data ?? []).map((e) => ({ ...e, temModulos: comModulo.has(e.id) }));
}

async function carregaModulos(eventId) {
  const { data, error } = await supabase
    .from('cert_modulos')
    .select('id, chave, nome, dias, data_extenso, data_curta, horas, ordem')
    .eq('event_id', eventId)
    .order('ordem');
  if (error) throw error;
  return data ?? [];
}

async function carregaPessoas(eventId) {
  const { data, error } = await supabase
    .from('participants')
    .select('id, name, email, lote, cert_token, checked, cert_emitidos(codigo, modulo_chave, downloads, ultimo_download)')
    .eq('event_id', eventId)
    .order('name');
  if (error) throw error;

  // uma linha por pessoa (token), juntando os módulos comprados
  const porToken = new Map();
  for (const p of data ?? []) {
    const chave = String(p.lote || '').replace(/^Pré-Venda — /, '');
    const k = p.cert_token || 'sem-token-' + p.id;
    if (!porToken.has(k)) {
      porToken.set(k, { token: p.cert_token, nome: p.name, email: p.email, checked: false, modulos: [], emitidos: [] });
    }
    const reg = porToken.get(k);
    if (p.checked) reg.checked = true;
    if (chave && !reg.modulos.includes(chave)) reg.modulos.push(chave);
    for (const e of p.cert_emitidos ?? []) reg.emitidos.push(e);
  }
  return [...porToken.values()];
}

async function salvaModulos(eventId, linhas) {
  const rows = linhas.map((m) => ({
    id: m.id,
    event_id: eventId,
    chave: m.chave,
    nome: (m.nome || '').trim(),
    dias: Math.max(1, Number(m.dias) || 1),
    data_extenso: (m.data_extenso || '').trim(),
    data_curta: (m.data_curta || '').trim(),
    horas: Math.max(1, Number(m.horas) || 1),
    ordem: Number(m.ordem) || 0,
    updated_at: new Date().toISOString()
  }));
  const { error } = await supabase.from('cert_modulos').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

// ── página ───────────────────────────────────────────────────────────
export async function pageCertEntrega(view) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));
  try {
    estado.eventos = await carregaEventos();
  } catch (e) {
    setContent(view, avisoErro(e));
    return;
  }
  const pref = estado.eventos.find((e) => e.temModulos) || estado.eventos[0];
  estado.eventId = estado.eventId || pref?.id || null;
  await recarrega(view);
}

async function recarrega(view) {
  if (!estado.eventId) { setContent(view, avisoErro(new Error('Nenhum evento cadastrado.'))); return; }
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));
  try {
    [estado.modulos, estado.pessoas] = await Promise.all([
      carregaModulos(estado.eventId),
      carregaPessoas(estado.eventId)
    ]);
  } catch (e) {
    setContent(view, avisoErro(e));
    return;
  }
  pinta(view);
}

function pinta(view) {
  const ev = estado.eventos.find((e) => e.id === estado.eventId);
  const s = resumo();

  setContent(view,
    h('div', { class: 'page-head' },
      h('div', {},
        h('div', { class: 'page-title' }, 'Entrega de certificados'),
        h('div', { class: 'page-sub' },
          'Cada inscrito tem um link pessoal. O que sai no documento vem da tabela de módulos ' +
          'abaixo — o participante não digita nada e não consegue mudar carga horária.')
      ),
      h('div', { class: 'evd-actions' },
        h('select', {
          class: 'input evd-select',
          onChange: async (e) => { estado.eventId = e.target.value; await recarrega(view); }
        }, ...estado.eventos.map((e) =>
          h('option', { value: e.id, selected: e.id === estado.eventId },
            e.name + (e.temModulos ? '' : ' · sem módulos')))
        )
      )
    ),

    // ── situação ──────────────────────────────────────────────────
    h('div', { class: 'table-card', style: { padding: '18px 20px', marginBottom: '16px' } },
      h('div', { class: 'evd-stats' },
        stat('Links gerados', s.links),
        stat('Certificados emitidos', s.emitidos),
        stat('Downloads', s.downloads),
        stat('Pessoas com 2 módulos', s.doisModulos),
        stat('Fizeram check-in', s.checkin)
      ),
      s.semToken > 0
        ? h('div', { class: 'evd-kit-warn' },
            s.semToken + ' inscrito(s) ainda sem link. Clique em "Gerar links que faltam".')
        : null
    ),

    // ── tabela de módulos ─────────────────────────────────────────
    h('div', { class: 'page-head', style: { marginTop: '4px' } },
      h('div', {},
        h('div', { class: 'page-title', style: { fontSize: '17px' } }, 'Módulos deste evento'),
        h('div', { class: 'page-sub' },
          'É daqui que saem a data e a carga horária impressas. Quem já baixou o certificado ' +
          'mantém os valores da emissão dele — mudar aqui só vale para quem ainda não baixou.')
      )
    ),
    estado.modulos.length
      ? tabelaModulos(view)
      : h('div', { class: 'table-card', style: { padding: '20px' } },
          h('div', { class: 'page-sub' },
            'Este evento ainda não tem módulos de certificado cadastrados.')),

    // ── links ─────────────────────────────────────────────────────
    h('div', { class: 'page-head', style: { marginTop: '26px' } },
      h('div', {},
        h('div', { class: 'page-title', style: { fontSize: '17px' } }, 'Links pessoais'),
        h('div', { class: 'page-sub' },
          'Este é o link que vai no e-mail. Sem ele ninguém acessa; com ele não dá para ver ' +
          'o de outra pessoa.')
      ),
      h('div', { class: 'evd-actions' },
        h('button', { class: 'btn btn-ghost', onClick: () => copiaTodos() }, 'Copiar tudo (CSV)'),
        h('button', { class: 'btn btn-ghost', onClick: () => gerarFaltantes(view) }, 'Gerar links que faltam')
      )
    ),
    h('div', { class: 'evd-subtoolbar' },
      h('input', {
        class: 'input', placeholder: 'Buscar por nome ou e-mail…', value: estado.busca,
        onInput: (e) => { estado.busca = e.target.value; redesenhaLista(); }
      }),
      h('select', {
        class: 'input evd-select',
        onChange: (e) => { estado.so = e.target.value; redesenhaLista(); }
      },
        h('option', { value: 'todos', selected: estado.so === 'todos' }, 'Todos'),
        h('option', { value: 'emitidos', selected: estado.so === 'emitidos' }, 'Já baixaram'),
        h('option', { value: 'pendentes', selected: estado.so === 'pendentes' }, 'Ainda não baixaram')
      )
    ),
    h('div', { class: 'table-card', id: 'lista-links' }, tabelaPessoas())
  );
}

function stat(rotulo, valor) {
  return h('div', {},
    h('div', { class: 'evd-stat-label' }, rotulo),
    h('div', { class: 'evd-stat-value mono' }, String(valor))
  );
}

function resumo() {
  const p = estado.pessoas;
  return {
    links: p.filter((x) => x.token).length,
    semToken: p.filter((x) => !x.token).length,
    emitidos: p.filter((x) => x.emitidos.length).length,
    downloads: p.reduce((s, x) => s + x.emitidos.reduce((a, e) => a + (e.downloads || 0), 0), 0),
    doisModulos: p.filter((x) => x.modulos.length > 1).length,
    checkin: p.filter((x) => x.checked).length
  };
}

// ── tabela de módulos ────────────────────────────────────────────────
function tabelaModulos(view) {
  const rascunho = estado.modulos.map((m) => ({ ...m }));
  const campo = (m, k, tipo, largura) =>
    h('input', {
      class: 'input' + (tipo === 'number' ? ' mono' : ''),
      type: tipo || 'text',
      value: m[k] == null ? '' : String(m[k]),
      style: largura ? { width: largura } : null,
      onInput: (e) => { m[k] = e.target.value; }
    });

  return h('div', { class: 'table-card' },
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        h('th', { style: { width: '20%' } }, 'Nome no certificado'),
        h('th', { style: { width: '9%' } }, 'Dias'),
        h('th', { style: { width: '30%' } }, 'Data por extenso (PDF)'),
        h('th', { style: { width: '20%' } }, 'Data curta (feed e story)'),
        h('th', { style: { width: '10%' } }, 'Horas')
      )),
      h('tbody', {}, ...rascunho.map((m) =>
        h('tr', {},
          h('td', {}, campo(m, 'nome'),
            h('div', { class: 'row-sub mono', style: { marginTop: '4px' } }, 'lote: ' + m.chave)),
          h('td', {}, campo(m, 'dias', 'number', '70px')),
          h('td', {}, campo(m, 'data_extenso')),
          h('td', {}, campo(m, 'data_curta')),
          h('td', {}, campo(m, 'horas', 'number', '80px'))
        ))
      )
    ),
    h('div', { class: 'btn-row', style: { padding: '14px 16px', gap: '10px', display: 'flex' } },
      h('button', {
        class: 'btn btn-primary',
        onClick: async (e) => {
          const b = e.currentTarget; b.disabled = true; b.textContent = 'Salvando…';
          try {
            await salvaModulos(estado.eventId, rascunho);
            toast('Módulos salvos. Vale para quem ainda não baixou.');
            await recarrega(view);
          } catch (err) {
            toast('Não salvou: ' + (err.message || err), 'error');
            b.disabled = false; b.textContent = 'Salvar módulos';
          }
        }
      }, 'Salvar módulos'),
      h('div', { class: 'page-sub', style: { margin: '0', alignSelf: 'center' } },
        'Dia único sai "realizado no dia"; mais de um dia sai "realizado nos dias".')
    )
  );
}

// ── tabela de pessoas ────────────────────────────────────────────────
function filtradas() {
  const q = estado.busca.trim().toLowerCase();
  return estado.pessoas.filter((p) => {
    if (q && !((p.nome || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q))) return false;
    if (estado.so === 'emitidos' && !p.emitidos.length) return false;
    if (estado.so === 'pendentes' && p.emitidos.length) return false;
    return true;
  });
}

function redesenhaLista() {
  const alvo = document.getElementById('lista-links');
  if (!alvo) return;
  alvo.replaceChildren(tabelaPessoas());
}

function tabelaPessoas() {
  const linhas = filtradas();
  const mostra = linhas.slice(0, 300);
  return h('div', {},
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        h('th', { style: { width: '28%' } }, 'Pessoa'),
        h('th', { style: { width: '22%' } }, 'Módulo'),
        h('th', { style: { width: '16%' } }, 'Situação'),
        h('th', { style: { width: '14%' } }, 'Downloads'),
        h('th', { style: { width: '20%', textAlign: 'right' } }, 'Link pessoal')
      )),
      h('tbody', {}, ...mostra.map(linhaPessoa))
    ),
    linhas.length > mostra.length
      ? h('div', { class: 'page-sub', style: { padding: '12px 16px' } },
          'Mostrando 300 de ' + linhas.length + '. Use a busca para afunilar.')
      : null,
    !linhas.length
      ? h('div', { class: 'page-sub', style: { padding: '20px 16px' } }, 'Ninguém neste filtro.')
      : null
  );
}

function linhaPessoa(p) {
  const baixou = p.emitidos.reduce((s, e) => s + (e.downloads || 0), 0);
  const url = p.token ? BASE_ALUNO + p.token : null;
  return h('tr', {},
    h('td', {},
      h('div', { class: 'row-name' }, p.nome || '—'),
      h('div', { class: 'row-sub' }, p.email || 'sem e-mail')
    ),
    h('td', {},
      h('div', {}, p.modulos.join(' + ') || '—'),
      p.modulos.length > 1
        ? h('div', { class: 'row-sub' }, '2 certificados no mesmo link')
        : null
    ),
    h('td', {},
      p.emitidos.length
        ? h('span', { class: 'status live' }, 'Emitido')
        : h('span', { class: 'status done' }, 'Não baixou'),
      p.emitidos.length
        ? h('div', { class: 'row-sub mono', style: { marginTop: '4px' } },
            p.emitidos.map((e) => e.codigo).join(' · '))
        : null
    ),
    h('td', { class: 'mono' }, baixou ? String(baixou) : '—'),
    h('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
      url
        ? [
            h('button', {
              class: 'btn btn-ghost btn-sm',
              onClick: () => {
                navigator.clipboard.writeText(url)
                  .then(() => toast('Link copiado.'))
                  .catch(() => toast('Não consegui copiar.', 'error'));
              }
            }, 'Copiar'),
            h('a', { class: 'btn btn-ghost btn-sm', href: url, target: '_blank', rel: 'noopener', style: { marginLeft: '6px' } }, 'Abrir')
          ]
        : h('span', { class: 'row-sub' }, 'sem link')
    )
  );
}

// ── ações ────────────────────────────────────────────────────────────
function copiaTodos() {
  const linhas = [['nome', 'email', 'modulos', 'link'].join(';')];
  for (const p of filtradas()) {
    if (!p.token) continue;
    linhas.push([
      (p.nome || '').replace(/;/g, ','),
      p.email || '',
      p.modulos.join(' + '),
      BASE_ALUNO + p.token
    ].join(';'));
  }
  navigator.clipboard.writeText(linhas.join('\n'))
    .then(() => toast(linhas.length - 1 + ' linhas copiadas. Cole na planilha do disparo.'))
    .catch(() => toast('Não consegui copiar.', 'error'));
}

async function gerarFaltantes(view) {
  const faltam = estado.pessoas.filter((p) => !p.token);
  if (!faltam.length) { toast('Todo mundo já tem link.'); return; }
  try {
    const { error } = await supabase.rpc('cert_gera_tokens', { p_event_id: estado.eventId });
    if (error) throw error;
    toast('Links gerados.');
    await recarrega(view);
  } catch (e) {
    toast('Não deu: ' + (e.message || e), 'error');
  }
}

function avisoErro(e) {
  return h('div', { class: 'table-card', style: { padding: '24px' } },
    h('div', { class: 'page-title', style: { fontSize: '16px' } }, 'Não consegui carregar'),
    h('div', { class: 'page-sub' }, String(e?.message || e))
  );
}

export { BASE_ALUNO, BASE_CONF };
