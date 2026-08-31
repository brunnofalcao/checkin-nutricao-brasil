// =====================================================================
// ENTREGA DE CERTIFICADOS · Nutrição Brasil
// A tela onde o certificado vira operação:
//   1. tabela de módulos (a fonte da verdade de data e carga horária)
//   2. a lista COMPLETA de inscritos, com check-in e situação do envio
//   3. incluir quem ficou de fora, na mão ou por planilha
//   4. marcar presença e enviar o certificado, pessoa a pessoa
// O que sai no documento vem daqui e do token. Nunca do navegador.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { supabase } from '../data/supabase.js';
import { toast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';

const BASE_ALUNO = 'https://checkin.nutricaobrasil.com.br/c/';
const BASE_CONF  = 'https://checkin.nutricaobrasil.com.br/v/';

// A API corta toda resposta em 1.000 linhas. Brasília tem 1.318: sem
// paginar, 318 pessoas somem da tela e da busca, caladas.
const PAGINA = 1000;
const TETO   = 20000;

const estado = {
  eventos: [], eventId: null, modulos: [], pessoas: [],
  busca: '', filtro: 'todos', pagina: 300
};

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
  const linhas = [];
  for (let de = 0; de < TETO; de += PAGINA) {
    const { data, error } = await supabase
      .from('participants')
      .select('id, name, email, phone, lote, cert_token, checked, checked_at, certificate_sent_at, ' +
              'cert_emitidos(codigo, modulo_chave, downloads, ultimo_download)')
      .eq('event_id', eventId)
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    const lote = data ?? [];
    linhas.push(...lote);
    if (lote.length < PAGINA) break;
  }

  // Uma linha por pessoa (token). Quem comprou dois módulos tem um token
  // só e aparece uma vez, com os dois módulos juntos.
  const porToken = new Map();
  for (const p of linhas) {
    const chave = String(p.lote || '').replace(/^Pré-Venda — /, '');
    const k = p.cert_token || 'sem-token-' + p.id;
    if (!porToken.has(k)) {
      porToken.set(k, {
        id: p.id, ids: [], token: p.cert_token, nome: p.name, email: p.email,
        telefone: p.phone, checked: false, enviadoEm: null, modulos: [], emitidos: []
      });
    }
    const reg = porToken.get(k);
    reg.ids.push(p.id);
    if (p.checked) { reg.checked = true; reg.id = p.id; }
    if (p.certificate_sent_at && !reg.enviadoEm) reg.enviadoEm = p.certificate_sent_at;
    if (chave && !reg.modulos.includes(chave)) reg.modulos.push(chave);
    for (const e of p.cert_emitidos ?? []) reg.emitidos.push(e);
  }
  return [...porToken.values()];
}

async function salvaModulos(eventId, linhas) {
  const rows = linhas.map((m) => ({
    id: m.id, event_id: eventId, chave: m.chave,
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
  } catch (e) { setContent(view, avisoErro(e)); return; }
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
  } catch (e) { setContent(view, avisoErro(e)); return; }
  pinta(view);
}

function pinta(view) {
  const s = resumo();

  setContent(view,
    h('div', { class: 'page-head' },
      h('div', {},
        h('div', { class: 'page-title' }, 'Entrega de certificados'),
        h('div', { class: 'page-sub' },
          'A lista completa do evento. Marque presença de quem ficou sem check-in, ' +
          'inclua quem não está aqui e envie o certificado pessoa a pessoa.')
      ),
      h('div', { class: 'evd-actions' },
        h('select', {
          class: 'input evd-select',
          onChange: async (e) => { estado.eventId = e.target.value; estado.busca = ''; estado.filtro = 'todos'; await recarrega(view); }
        }, ...estado.eventos.map((e) =>
          h('option', { value: e.id, selected: e.id === estado.eventId },
            e.name + (e.temModulos ? '' : ' · sem módulos')))
        )
      )
    ),

    // ── situação ──────────────────────────────────────────────────
    h('div', { class: 'table-card', style: { padding: '18px 20px', marginBottom: '16px' } },
      h('div', { class: 'evd-stats' },
        stat('Inscritos', s.total),
        stat('Com check-in', s.checkin),
        stat('Sem check-in', s.semCheckin),
        stat('Certificado enviado', s.enviados),
        stat('Já baixaram', s.baixaram)
      ),
      s.semToken > 0
        ? h('div', { class: 'evd-kit-warn' },
            s.semToken + ' inscrito(s) ainda sem link. Clique em "Gerar links que faltam".')
        : null
    ),

    // ── ações da lista ────────────────────────────────────────────
    h('div', { class: 'evd-actions', style: { marginBottom: '14px', flexWrap: 'wrap', gap: '8px' } },
      h('button', { class: 'btn btn-primary', onClick: () => abreAdicionar(view) }, '+ Adicionar pessoa'),
      h('button', { class: 'btn btn-secondary', onClick: () => abreImportarCsv(view) }, 'Importar planilha'),
      h('button', { class: 'btn btn-ghost', onClick: baixaModelo }, 'Baixar modelo'),
      h('button', { class: 'btn btn-ghost', onClick: () => gerarFaltantes(view) }, 'Gerar links que faltam'),
      h('button', { class: 'btn btn-ghost', onClick: copiaTodos }, 'Copiar tudo (CSV)')
    ),

    // ── tabela de módulos ─────────────────────────────────────────
    h('div', { class: 'page-head', style: { marginTop: '4px' } },
      h('div', {},
        h('div', { class: 'page-title', style: { fontSize: '17px' } }, 'Módulos deste evento'),
        h('div', { class: 'page-sub' },
          'É daqui que saem a data e a carga horária impressas. Quem já baixou mantém ' +
          'os valores da emissão dele; mudar aqui só vale para quem ainda não baixou.')
      )
    ),
    estado.modulos.length
      ? tabelaModulos(view)
      : h('div', { class: 'table-card', style: { padding: '20px' } },
          h('div', { class: 'page-sub' }, 'Este evento ainda não tem módulos de certificado cadastrados.')),

    // ── lista ─────────────────────────────────────────────────────
    h('div', { class: 'page-head', style: { marginTop: '26px' } },
      h('div', {},
        h('div', { class: 'page-title', style: { fontSize: '17px' } }, 'Inscritos'),
        h('div', { class: 'page-sub' },
          'O link é pessoal: sem ele ninguém acessa, e com ele não dá para ver o de outra pessoa.')
      )
    ),
    h('div', { class: 'evd-subtoolbar' },
      h('input', {
        class: 'input', placeholder: 'Buscar por nome, e-mail ou telefone…', value: estado.busca,
        onInput: (e) => { estado.busca = e.target.value; estado.pagina = 300; redesenhaLista(); }
      })
    ),
    h('div', { class: 'evd-subtoolbar', id: 'cert-filtros' }, ...chipsFiltro()),
    h('div', { class: 'table-card', id: 'lista-links' }, tabelaPessoas(view))
  );
}

function chipsFiltro() {
  const s = resumo();
  const op = [
    ['todos',       `Todos · ${s.total}`],
    ['sem-checkin', `Sem check-in · ${s.semCheckin}`],
    ['nao-enviado', `Não recebeu · ${s.naoEnviados}`],
    ['nao-baixou',  `Não baixou · ${s.naoBaixaram}`],
    ['baixou',      `Já baixou · ${s.baixaram}`]
  ];
  return op.map(([k, rot]) =>
    h('button', {
      class: 'btn',
      style: {
        padding: '6px 12px', height: 'auto', fontSize: '12px',
        background: estado.filtro === k ? 'var(--bg-2)' : 'transparent',
        color: estado.filtro === k ? 'var(--ink-strong)' : 'var(--ink-soft)'
      },
      onClick: () => {
        estado.filtro = k; estado.pagina = 300;
        const barra = document.getElementById('cert-filtros');
        if (barra) barra.replaceChildren(...chipsFiltro());
        redesenhaLista();
      }
    }, rot));
}

function stat(rotulo, valor) {
  return h('div', {},
    h('div', { class: 'evd-stat-label' }, rotulo),
    h('div', { class: 'evd-stat-value mono' }, String(valor)));
}

function resumo() {
  const p = estado.pessoas;
  const baixou = (x) => x.emitidos.length > 0;
  return {
    total:       p.length,
    checkin:     p.filter((x) => x.checked).length,
    semCheckin:  p.filter((x) => !x.checked).length,
    semToken:    p.filter((x) => !x.token).length,
    enviados:    p.filter((x) => x.enviadoEm).length,
    naoEnviados: p.filter((x) => x.checked && !x.enviadoEm).length,
    baixaram:    p.filter(baixou).length,
    naoBaixaram: p.filter((x) => x.checked && !baixou(x)).length
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
            toast.success('Módulos salvos. Vale para quem ainda não baixou.');
            await recarrega(view);
          } catch (err) {
            toast.danger('Não salvou: ' + (err.message || err));
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
  const qd = q.replace(/\D/g, '');
  const baixou = (x) => x.emitidos.length > 0;
  return estado.pessoas.filter((p) => {
    if (q) {
      const bate =
        (p.nome || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (qd && (p.telefone || '').replace(/\D/g, '').includes(qd));
      if (!bate) return false;
    }
    if (estado.filtro === 'sem-checkin') return !p.checked;
    if (estado.filtro === 'nao-enviado') return p.checked && !p.enviadoEm;
    if (estado.filtro === 'nao-baixou')  return p.checked && !baixou(p);
    if (estado.filtro === 'baixou')      return baixou(p);
    return true;
  });
}

function redesenhaLista() {
  const alvo = document.getElementById('lista-links');
  if (alvo) alvo.replaceChildren(tabelaPessoas());
}

function tabelaPessoas(view) {
  const linhas = filtradas();
  const mostra = linhas.slice(0, estado.pagina);
  return h('div', {},
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        h('th', { style: { width: '26%' } }, 'Pessoa'),
        h('th', { style: { width: '18%' } }, 'Módulo'),
        h('th', { style: { width: '12%' } }, 'Check-in'),
        h('th', { style: { width: '18%' } }, 'Certificado'),
        h('th', { style: { width: '26%', textAlign: 'right' } }, 'Ações')
      )),
      h('tbody', {}, ...mostra.map((p) => linhaPessoa(p, view)))
    ),
    linhas.length > mostra.length
      ? h('div', { class: 'table-pager' },
          h('span', {}, `Mostrando ${mostra.length} de ${linhas.length}`),
          h('button', {
            class: 'btn btn-ghost',
            onClick: () => { estado.pagina += 300; redesenhaLista(); }
          }, 'Carregar mais'))
      : h('div', { class: 'table-pager' },
          h('span', {}, `${linhas.length} ${linhas.length === 1 ? 'pessoa' : 'pessoas'}`)),
    !linhas.length
      ? h('div', { class: 'page-sub', style: { padding: '20px 16px' } }, 'Ninguém neste filtro.')
      : null
  );
}

function linhaPessoa(p, view) {
  const baixou = p.emitidos.reduce((s, e) => s + (e.downloads || 0), 0);
  const url = p.token ? BASE_ALUNO + '?t=' + p.token : null;

  return h('tr', {},
    h('td', {},
      h('div', { class: 'row-name' }, p.nome || '—'),
      h('div', { class: 'row-sub' }, p.email || 'sem e-mail'),
      p.telefone ? h('div', { class: 'row-sub mono' }, p.telefone) : null
    ),
    h('td', {},
      h('div', {}, p.modulos.join(' + ') || '—'),
      p.modulos.length > 1 ? h('div', { class: 'row-sub' }, '2 certificados no mesmo link') : null
    ),
    h('td', {},
      p.checked
        ? h('span', { class: 'status live' }, 'Sim')
        : h('span', { class: 'status done' }, 'Não')
    ),
    h('td', {},
      p.enviadoEm
        ? h('span', { class: 'status live' }, 'Enviado')
        : h('span', { class: 'status done' }, 'Não enviado'),
      p.emitidos.length
        ? h('div', { class: 'row-sub mono', style: { marginTop: '4px' } },
            'baixou ' + baixou + 'x · ' + p.emitidos.map((e) => e.codigo).join(' · '))
        : h('div', { class: 'row-sub', style: { marginTop: '4px' } }, 'não baixou')
    ),
    h('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
      !p.checked
        ? h('button', {
            class: 'btn btn-secondary btn-sm',
            onClick: (e) => marcaCheckin(p, e.currentTarget, view)
          }, 'Marcar check-in')
        : h('button', {
            class: 'btn btn-primary btn-sm',
            onClick: (e) => enviaCertificado(p, e.currentTarget, view)
          }, p.enviadoEm ? 'Reenviar' : 'Enviar certificado'),
      url
        ? h('button', {
            class: 'btn btn-ghost btn-sm', style: { marginLeft: '6px' },
            onClick: () => {
              navigator.clipboard.writeText(url)
                .then(() => toast.success('Link copiado.'))
                .catch(() => toast.danger('Não consegui copiar.'));
            }
          }, 'Copiar link')
        : null
    )
  );
}

// ── ações por pessoa ─────────────────────────────────────────────────
async function marcaCheckin(p, btn, view) {
  btn.disabled = true; btn.textContent = 'Marcando…';
  try {
    const { error } = await supabase.rpc('checkin_participant', { p_id: p.id });
    if (error) throw error;
    p.checked = true;
    toast.success('Check-in de ' + (p.nome || 'participante') + ' registrado. O certificado já está liberado.');
    await recarrega(view);
  } catch (e) {
    toast.danger('Não deu para marcar: ' + (e.message || e));
    btn.disabled = false; btn.textContent = 'Marcar check-in';
  }
}

async function enviaCertificado(p, btn, view) {
  const rot = btn.textContent;
  if (p.enviadoEm && !confirm(`${p.nome} já recebeu o certificado. Enviar de novo?`)) return;
  btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const { data, error } = await supabase.rpc('cert_envia_individual', {
      p_participant_id: p.id, p_email: true, p_whatsapp: true
    });
    if (error) throw error;
    if (!data?.ok) { toast.danger('Não enviou: ' + (data?.erro || 'motivo desconhecido')); }
    else {
      const canais = [data.email_enviado ? 'e-mail' : null, data.whatsapp_enviado ? 'WhatsApp' : null]
        .filter(Boolean).join(' e ');
      const obs = (data.observacoes || []).length ? ' (' + data.observacoes.join('; ') + ')' : '';
      toast.success('Enviado por ' + canais + ' para ' + (data.nome || p.nome) + obs);
      p.enviadoEm = new Date().toISOString();
      redesenhaLista();
    }
  } catch (e) {
    toast.danger('Erro no envio: ' + (e.message || e));
  } finally {
    btn.disabled = false; btn.textContent = rot;
  }
}

// ── inclusão manual ──────────────────────────────────────────────────
function abreAdicionar(view) {
  let form;
  const chaves = estado.modulos.map((m) => m.chave);
  openModal({
    title: 'Adicionar pessoa',
    body: () => {
      form = h('div', {},
        h('div', { class: 'page-sub', style: { marginBottom: '14px' } },
          'Nenhuma mensagem automática sai deste cadastro. O certificado só ' +
          'libera depois do check-in.'),
        campoTexto('nome', 'Nome completo (como sai no certificado)', ''),
        campoTexto('email', 'E-mail', '', 'email'),
        campoTexto('telefone', 'WhatsApp com DDD', '', 'tel'),
        h('div', { class: 'field' },
          h('label', {}, 'Módulo'),
          h('select', { class: 'input', name: 'modulo' },
            ...(chaves.length
              ? chaves.map((c) => h('option', { value: c }, c))
              : [h('option', { value: '' }, 'nenhum módulo cadastrado')]))
        ),
        h('div', { class: 'field' },
          h('label', {}, h('input', { type: 'checkbox', name: 'checkin', checked: true }),
            ' Já marcar o check-in'))
      );
      return form;
    },
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (close) => close() },
      { label: 'Adicionar', kind: 'btn-primary', onClick: async (close) => {
          const v = (n) => form.querySelector(`[name="${n}"]`)?.value?.trim() || '';
          const nome = v('nome'), email = v('email').toLowerCase(), tel = v('telefone');
          const modulo = v('modulo');
          const marcar = form.querySelector('[name="checkin"]').checked;
          if (!nome)   { toast.danger('O nome é obrigatório.'); return; }
          if (!email && !tel) { toast.danger('Informe ao menos e-mail ou WhatsApp.'); return; }
          try {
            const linhas = await insereLinhas(estado.eventId, [{ nome, email, telefone: tel, modulo }], marcar);
            toast.success(linhas + ' pessoa adicionada.');
            close();
            await recarrega(view);
          } catch (e) { toast.danger('Não deu: ' + (e.message || e)); }
        } }
    ]
  });
}

function campoTexto(nome, rotulo, valor, tipo) {
  return h('div', { class: 'field' },
    h('label', {}, rotulo),
    h('input', { class: 'input', name: nome, type: tipo || 'text', value: valor || '' }));
}

// Grava as linhas e gera os links. Nunca dispara mensagem: os eventos
// encerrados estão na trava `eventos_sem_mensagem`.
async function insereLinhas(eventId, linhas, marcarCheckin) {
  const rows = linhas.map((l) => ({
    event_id: eventId,
    name: l.nome,
    email: l.email || null,
    phone: (l.telefone || '').replace(/\D/g, '') || null,
    lote: l.modulo || null,
    source: 'manual',
    checked: !!marcarCheckin,
    checked_at: marcarCheckin ? new Date().toISOString() : null
  }));
  const { error } = await supabase.from('participants').insert(rows);
  if (error) throw error;
  const { error: e2 } = await supabase.rpc('cert_gera_tokens', { p_event_id: eventId });
  if (e2) throw e2;
  return rows.length;
}

// ── importação por planilha ──────────────────────────────────────────
const COLUNAS = ['nome', 'email', 'telefone', 'modulo'];

function baixaModelo() {
  const chaves = estado.modulos.map((m) => m.chave);
  const exemplo = chaves[0] || 'Plenária Principal';
  const linhas = [
    COLUNAS.join(';'),
    `Maria Souza da Silva;maria.souza@exemplo.com;61988887777;${exemplo}`,
    `João Pereira Lima;joao.lima@exemplo.com;11977776666;${chaves[1] || exemplo}`
  ];
  const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'modelo-inscritos-nutricao-brasil.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast.success('Modelo baixado. Use ponto e vírgula entre as colunas.');
}

function separa(linha) {
  const sep = linha.includes(';') ? ';' : ',';
  return linha.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
}

function leCsv(texto) {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return { erro: 'arquivo vazio' };
  // Cabeçalho vindo de Excel chega de tudo quanto é jeito: "E-mail",
  // "Módulo", "Telefone ". Normaliza acento e tira o resto.
  const arruma = (c) => c.toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const cab = separa(linhas[0]).map(arruma);
  const faltam = COLUNAS.filter((c) => !cab.includes(c));
  if (faltam.length) return { erro: 'faltam as colunas: ' + faltam.join(', ') };
  const idx = Object.fromEntries(COLUNAS.map((c) => [c, cab.indexOf(c)]));
  const out = [];
  for (let i = 1; i < linhas.length; i++) {
    const c = separa(linhas[i]);
    out.push({
      linha: i + 1,
      nome: c[idx.nome] || '',
      email: (c[idx.email] || '').toLowerCase(),
      telefone: c[idx.telefone] || '',
      modulo: c[idx.modulo] || ''
    });
  }
  return { linhas: out };
}

function abreImportarCsv(view) {
  const chaves = estado.modulos.map((m) => m.chave);
  let escolhidas = [];
  let problemas = [];
  let marcar = true;

  openModal({
    title: 'Importar planilha',
    body: () => {
      const alvo = h('div', {});
      const painel = h('div', {},
        h('div', { class: 'page-sub', style: { marginBottom: '12px' } },
          'CSV com as colunas ', h('strong', {}, COLUNAS.join(', ')),
          '. O módulo tem que ser exatamente um destes: ',
          h('strong', {}, chaves.join(' · ') || 'nenhum cadastrado'),
          '. Nenhuma mensagem automática sai da importação.'),
        h('button', { class: 'btn btn-ghost', onClick: baixaModelo }, 'Baixar modelo'),
        h('input', {
          type: 'file', accept: '.csv,text/csv', class: 'input',
          style: { marginTop: '12px' },
          onChange: async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            const r = leCsv(await f.text());
            if (r.erro) { setContent(alvo, h('div', { class: 'evd-kit-warn' }, r.erro)); return; }
            escolhidas = []; problemas = [];
            for (const l of r.linhas) {
              if (!l.nome) { problemas.push(`linha ${l.linha}: sem nome`); continue; }
              if (!l.email && !l.telefone) { problemas.push(`linha ${l.linha}: sem e-mail e sem telefone`); continue; }
              if (chaves.length && !chaves.includes(l.modulo)) {
                problemas.push(`linha ${l.linha}: módulo "${l.modulo || '(vazio)'}" não existe`); continue;
              }
              escolhidas.push(l);
            }
            setContent(alvo,
              h('div', { style: { marginTop: '12px' } },
                h('div', { class: 'row-name' }, `${escolhidas.length} linha(s) prontas para importar`),
                problemas.length
                  ? h('div', { class: 'evd-kit-warn', style: { marginTop: '8px' } },
                      h('div', {}, `${problemas.length} linha(s) fora do padrão e serão ignoradas:`),
                      h('div', { class: 'row-sub', style: { marginTop: '4px', whiteSpace: 'pre-wrap' } },
                        problemas.slice(0, 12).join('\n') +
                        (problemas.length > 12 ? `\n… e mais ${problemas.length - 12}` : '')))
                  : null));
          }
        }),
        h('div', { class: 'field', style: { marginTop: '12px' } },
          h('label', {}, h('input', {
            type: 'checkbox', checked: true,
            onChange: (e) => { marcar = e.target.checked; }
          }), ' Já marcar o check-in de todos')),
        alvo);
      return painel;
    },
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (close) => close() },
      { label: 'Importar', kind: 'btn-primary', onClick: async (close) => {
          if (!escolhidas.length) { toast.danger('Nenhuma linha válida no arquivo.'); return; }
          try {
            const n = await insereLinhas(estado.eventId, escolhidas, marcar);
            toast.success(n + ' pessoa(s) importada(s).');
            close();
            await recarrega(view);
          } catch (e) { toast.danger('Não deu: ' + (e.message || e)); }
        } }
    ]
  });
}

// ── ações gerais ─────────────────────────────────────────────────────
function copiaTodos() {
  const linhas = [['nome', 'email', 'telefone', 'modulos', 'checkin', 'enviado', 'link'].join(';')];
  for (const p of filtradas()) {
    linhas.push([
      (p.nome || '').replace(/;/g, ','),
      p.email || '', p.telefone || '',
      p.modulos.join(' + '),
      p.checked ? 'sim' : 'nao',
      p.enviadoEm ? 'sim' : 'nao',
      p.token ? BASE_ALUNO + '?t=' + p.token : ''
    ].join(';'));
  }
  navigator.clipboard.writeText(linhas.join('\n'))
    .then(() => toast.success(linhas.length - 1 + ' linhas copiadas.'))
    .catch(() => toast.danger('Não consegui copiar.'));
}

async function gerarFaltantes(view) {
  const faltam = estado.pessoas.filter((p) => !p.token);
  if (!faltam.length) { toast.success('Todo mundo já tem link.'); return; }
  try {
    const { error } = await supabase.rpc('cert_gera_tokens', { p_event_id: estado.eventId });
    if (error) throw error;
    toast.success('Links gerados.');
    await recarrega(view);
  } catch (e) { toast.danger('Não deu: ' + (e.message || e)); }
}

function avisoErro(e) {
  return h('div', { class: 'table-card', style: { padding: '24px' } },
    h('div', { class: 'page-title', style: { fontSize: '16px' } }, 'Não consegui carregar'),
    h('div', { class: 'page-sub' }, String(e?.message || e)));
}

export { BASE_ALUNO, BASE_CONF };
