// =====================================================================
// EXPOSITORES · convites, equipes e retirada de crachás
//
// O time interno gera o código, manda junto do contrato, a empresa preenche
// sozinha. Aqui a gente acompanha quem preencheu, quem falta e quem retirou.
//
// A versão anterior misturava três assuntos numa página só — contador do
// evento inteiro, QR de visitante e gestão de expositores — e mostrava a
// equipe de cada empresa aberta dentro do cartão. Com duas empresas parecia
// bom. Com trinta viraria rolagem sem fim, com o que importa embaixo da
// dobra. Agora: uma linha por empresa, equipe abre em painel, e a primeira
// coisa da tela é quem ainda não preencheu.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { supabase } from '../data/supabase.js';
import { toast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { abreLote } from './expo-lote.js';
import { abreNovaEmpresa } from './expo-nova.js';
import { telefoneBonito } from '../core/utils.js';
import { abreCrachas } from './crachas.js';
import { abreCortesias } from './expo-cortesias.js';

const BASE_FORM = 'https://checkin.nutricaobrasil.com.br/expositor-cadastro-time?e=';
// O manual NÃO leva o código na URL — a página pede que a pessoa digite.
// Por isso ele é igual para todas as empresas, e por isso o código sempre
// tem que ir junto no texto.
const BASE_MANUAL = 'https://checkin.nutricaobrasil.com.br/manual-expositor';

// view fica no estado porque ações de dentro de um modal (mudar o limite)
// precisam repintar a faixa de números — só trocar a lista deixa o painel
// dizendo "1 acima do limite" depois de o limite já ter sido corrigido.
const E = { eventos: [], eventId: null, empresas: [], busca: '', filtro: 'todas', visitante: null, view: null };

// ── dados ────────────────────────────────────────────────────────────
async function carrega(eventId) {
  const emp = await supabase.from('exhibitors')
    // exhibitor_members tem DUAS ligações com participants (o dono do crachá e quem
    // retirou). Sem nomear a constraint, o PostgREST não sabe qual seguir.
    .select('id, codigo, token, empresa, cnpj, estande, cota, limite_credenciais, status, ' +
            'resp_nome, resp_whatsapp, cad_nome, preenchido_em, ' +
            'cortesias_total, cortesias_codigo, cortesias_pausado, cortesias_prazo, ' +
            'cortesias_uso(id), ' +
            'exhibitor_members(id, cargo, pode_retirar, retirado_em, retirado_por_nome, ' +
            'participants!exhibitor_members_participant_id_fkey(id, name, phone, email, code, checked))')
    .eq('event_id', eventId)
    .order('empresa');
  if (emp.error) throw emp.error;

  // O evento de visitantes é irmão do de expositores: mesmo pai, mesma porta física.
  const vis = await supabase.from('events')
    .select('id, name, public_token, total_inscritos')
    .eq('event_type', 'visitor').limit(1).maybeSingle();
  E.visitante = vis.data || null;

  E.empresas = (emp.data ?? []).map((x) => {
    const time = (x.exhibitor_members ?? []).map((m) => ({
      id: m.id, cargo: m.cargo, pode_retirar: m.pode_retirar,
      retirado_em: m.retirado_em, retirado_por: m.retirado_por_nome,
      nome: m.participants?.name, phone: m.participants?.phone, email: m.participants?.email,
      participant_id: m.participants?.id, code: m.participants?.code
    })).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    return { ...x, time, retirados: time.filter((p) => p.retirado_em).length,
             cortesias_usadas: (x.cortesias_uso ?? []).length };
  });
}

// ── página ───────────────────────────────────────────────────────────
export async function pageExpositores(view) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));
  const { data, error } = await supabase
    .from('events').select('id, name, event_type, slug, event_date, date_start')
    .eq('event_type', 'exhibitor').order('event_date');
  if (error || !data?.length) {
    setContent(view, aviso('Nenhum evento de expositores cadastrado.'));
    return;
  }
  E.eventos = data;
  E.eventId = E.eventId || data[0].id;
  E.view = view;
  await recarrega(view);
}

async function recarrega(view) {
  E.view = view;
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));
  try { await carrega(E.eventId); } catch (e) { setContent(view, aviso(e.message || e)); return; }
  pinta(view);
}

function contas() {
  const emp = E.empresas;
  return {
    empresas: emp.length,
    preencheram: emp.filter((x) => x.status !== 'convidado').length,
    faltam: emp.filter((x) => x.status === 'convidado').length,
    pessoas: emp.reduce((s, x) => s + x.time.length, 0),
    vagas: emp.reduce((s, x) => s + (x.limite_credenciais || 0), 0),
    retirados: emp.reduce((s, x) => s + x.retirados, 0),
    estourou: emp.filter((x) => x.time.length > x.limite_credenciais).length,
    ctTotal: emp.reduce((s, x) => s + (x.cortesias_total || 0), 0),
    ctUsadas: emp.reduce((s, x) => s + (x.cortesias_usadas || 0), 0),
    ctEmpresas: emp.filter((x) => (x.cortesias_total || 0) > 0).length
  };
}

function pinta(view) {
  const c = contas();

  setContent(view,
    h('div', { class: 'page-head' },
      h('div', {},
        h('div', { class: 'page-title' }, 'Expositores'),
        h('div', { class: 'page-sub' },
          'Um código por empresa. Mande junto do contrato — a empresa preenche a equipe ' +
          'sozinha e no credenciamento os crachás já estão impressos.')
      ),
      h('div', { class: 'evd-actions' },
        E.eventos.length > 1
          ? h('select', { class: 'input evd-select',
              onChange: async (e) => { E.eventId = e.target.value; await recarrega(view); } },
              ...E.eventos.map((e) => h('option', { value: e.id, selected: e.id === E.eventId }, e.name)))
          : null,
        h('button', { class: 'btn btn-ghost', onClick: () => imprimeCrachas(), disabled: !c.pessoas || null,
          title: c.pessoas ? 'Gerar a folha A4 dos crachás das equipes'
                           : 'Nenhuma equipe cadastrada ainda' }, 'Crachás'),
        h('button', { class: 'btn btn-secondary', onClick: () => loteDeConvites(view) }, 'Importar planilha'),
        h('button', { class: 'btn btn-primary', onClick: () => novaEmpresa(view) }, '+ Nova empresa')
      )
    ),

    // Uma faixa, não quatro cartões. O número que importa é quantas
    // empresas ainda não preencheram — ele vem primeiro e em destaque.
    h('div', { class: 'exp-faixa' },
      faixaItem('Empresas', c.empresas),
      faixaItem('Preencheram', `${c.preencheram} de ${c.empresas}`, c.preencheram === c.empresas && c.empresas ? 'ok' : ''),
      faixaItem('Faltam preencher', c.faltam, c.faltam ? 'alerta' : 'ok'),
      faixaItem('Credenciais usadas', `${c.pessoas} de ${c.vagas}`),
      faixaItem('Crachás retirados', c.retirados),
      c.ctTotal ? faixaItem('Cortesias usadas', `${c.ctUsadas} de ${c.ctTotal}`,
        c.ctUsadas >= c.ctTotal ? 'alerta' : '') : null,
      c.estourou ? faixaItem('Acima do limite', c.estourou, 'ruim') : null
    ),

    // ── barra de trabalho: filtro + busca ─────────────────────────
    h('div', { class: 'exp-barra' },
      h('div', { class: 'exp-chips' },
        chip('Todas', 'todas', c.empresas),
        chip('Não preencheram', 'faltam', c.faltam),
        chip('Preenchidas', 'ok', c.preencheram),
        c.estourou ? chip('Acima do limite', 'estourou', c.estourou) : null
      ),
      h('input', { class: 'input exp-busca', placeholder: 'Buscar empresa, código ou pessoa…',
        value: E.busca, onInput: (e) => { E.busca = e.target.value; redesenha(); } })
    ),

    h('div', { id: 'lista-exp' }, lista()),

    blocoVisitante()
  );
}

function faixaItem(rot, valor, tom) {
  return h('div', { class: 'exp-faixa-item' + (tom ? ' ' + tom : '') },
    h('div', { class: 'exp-faixa-rot' }, rot),
    h('div', { class: 'exp-faixa-num mono' }, String(valor)));
}

function chip(rot, valor, n) {
  return h('button', {
    class: 'exp-chip' + (E.filtro === valor ? ' on' : ''),
    onclick: () => { E.filtro = valor; redesenha(); atualizaChips(); }
  }, rot, h('span', { class: 'exp-chip-n' }, String(n)));
}

function atualizaChips() {
  document.querySelectorAll('.exp-chip').forEach((b, i) => {
    const ordem = ['todas', 'faltam', 'ok', 'estourou'];
    b.classList.toggle('on', ordem[i] === E.filtro);
  });
}

function aviso(msg) {
  return h('div', { class: 'table-card', style: { padding: '24px' } },
    h('div', { class: 'page-sub' }, String(msg)));
}

function redesenha() {
  const el = document.getElementById('lista-exp');
  if (el) el.replaceChildren(lista());
}

function visiveis() {
  const q = E.busca.trim().toLowerCase();
  return E.empresas.filter((x) => {
    if (E.filtro === 'faltam' && x.status !== 'convidado') return false;
    if (E.filtro === 'ok' && x.status === 'convidado') return false;
    if (E.filtro === 'estourou' && x.time.length <= x.limite_credenciais) return false;
    if (!q) return true;
    return (x.empresa || '').toLowerCase().includes(q) ||
           (x.codigo || '').toLowerCase().includes(q) ||
           x.time.some((p) => String(p.nome).toLowerCase().includes(q));
  });
}

// ── lista: uma linha por empresa ─────────────────────────────────────
function lista() {
  const linhas = visiveis();
  if (!linhas.length) {
    return h('div', { class: 'empty' },
      h('div', { class: 'empty-title' },
        E.empresas.length ? 'Nenhuma empresa neste filtro' : 'Nenhuma empresa cadastrada ainda'),
      h('div', { class: 'empty-body' },
        E.empresas.length
          ? 'Troque o filtro ou limpe a busca.'
          : 'Crie uma por vez em "Nova empresa", ou suba a planilha do comercial de uma vez em "Importar planilha".'));
  }

  return h('div', { class: 'table-card exp-tabela' },
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Empresa'),
        h('th', { style: { width: '110px' } }, 'Código'),
        h('th', { style: { width: '110px' } }, 'Cota'),
        h('th', { style: { width: '80px' } }, 'Estande'),
        h('th', { style: { width: '140px' } }, 'Credenciais'),
        h('th', { style: { width: '120px' } }, 'Cortesias'),
        h('th', { style: { width: '130px' } }, 'Situação'),
        h('th', { style: { width: '190px' } }, '')
      )),
      h('tbody', {}, ...linhas.map(linha))));
}

function linha(x) {
  const total = x.time.length;
  const limite = x.limite_credenciais || 0;
  const pct = limite ? Math.min(100, Math.round((total / limite) * 100)) : 0;
  const estourou = total > limite;
  const preenchida = x.status !== 'convidado';

  // A linha inteira abre a equipe — o cursor do tema já é de clique, e
  // obrigar a mira num botão de 60px é ruim no notebook e pior no tablet
  // do credenciamento. Os botões param a propagação para não abrir junto.
  const btn = (rot, titulo, fn) =>
    h('button', {
      class: 'btn btn-ghost btn-sm', title: titulo,
      onclick: (e) => { e.stopPropagation(); fn(); }
    }, rot);

  return h('tr', { class: 'exp-linha', onclick: () => abreEquipe(x) },
    h('td', { dataset: { rot: 'Empresa' } },
      h('div', { class: 'row-name' },
        x.empresa || h('span', { class: 'muted' }, 'sem nome')),
      x.resp_nome
        ? h('div', { class: 'row-sub' }, 'resp. ' + x.resp_nome)
        : h('div', { class: 'row-sub muted' }, 'sem responsável ainda')),

    h('td', { dataset: { rot: 'Código' } }, h('span', { class: 'exp-codigo mono' }, x.codigo || '—')),
    h('td', { class: 'row-sub', dataset: { rot: 'Cota' } }, x.cota || '—'),
    h('td', { class: 'row-sub mono', dataset: { rot: 'Estande' } }, x.estande || '—'),

    h('td', { dataset: { rot: 'Credenciais' } },
      h('div', { class: 'exp-cred' },
        h('span', { class: 'mono' + (estourou ? ' ruim' : '') }, `${total} de ${limite}`),
        h('div', { class: 'exp-barra-mini',
          role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(limite),
          'aria-valuenow': String(total),
          'aria-label': `${total} de ${limite} credenciais usadas` },
          h('div', { class: 'exp-barra-fill' + (estourou ? ' estourou' : ''),
            style: { width: (estourou ? 100 : pct) + '%' } }))),
      x.retirados
        ? h('div', { class: 'row-sub' },
            x.retirados === 1 ? '1 crachá retirado' : `${x.retirados} crachás retirados`)
        : null),

    h('td', { dataset: { rot: 'Cortesias' } },
      x.cortesias_total
        ? h('div', {},
            h('span', { class: 'mono' }, `${x.cortesias_usadas || 0} de ${x.cortesias_total}`),
            x.cortesias_pausado
              ? h('div', { class: 'row-sub ruim' }, 'pausado')
              : h('div', { class: 'row-sub' }, x.cortesias_codigo || ''))
        : h('span', { class: 'muted' }, '—')),

    h('td', { dataset: { rot: 'Situação' } },
      preenchida
        ? h('span', { class: 'status live' }, 'Preenchida')
        : h('span', { class: 'status warn' }, 'Não preencheu'),
      estourou ? h('div', { class: 'row-sub ruim' }, 'acima do limite') : null),

    // UM botão, não três. Três links na linha obrigavam a escolher antes de
    // entender, e a escolha errada gerava a pergunta que o comercial não sabia
    // responder: "mando qual?". O manual é a porta única — abre credencial,
    // cortesia e o resto. Os outros links continuam existindo, mas dentro da
    // empresa, onde já se sabe do que se está falando.
    h('td', { class: 'exp-acoes' },
      btn('Copiar manual', 'Link do manual + o código desta empresa',
        () => copia(textoManual(x), 'Manual e código copiados. Cole no WhatsApp.')),
      h('span', { class: 'exp-seta', 'aria-hidden': 'true' }, '›')));
}

// O link do manual sozinho não serve: a página pede o código digitado. Quem
// copia só a URL manda a empresa para uma tela que ela não consegue abrir —
// foi exatamente isso que travou o comercial. Então o que se copia é sempre
// o par, nunca só o endereço.
function textoManual(x) {
  return `${BASE_MANUAL}\nCódigo da ${x.empresa || 'empresa'}: ${x.codigo}`;
}

function textoConvite(x) {
  const ev = E.eventos.find((e) => e.id === E.eventId);
  const linhas = [
    'Oi! Aqui é do *Nutrição Brasil*.',
    '',
    `A *${x.empresa}* está confirmada na exposição${ev ? ' — ' + rotuloEvento(ev) : ''}` +
      `${x.estande ? `, no estande *${x.estande}*` : ''}.`,
    '',
    'Tudo que vocês precisam está no manual do expositor: montagem, cadastro da equipe' +
      (x.cortesias_total ? ', cortesias' : '') + ' e prazos.',
    '',
    `🔗 ${BASE_MANUAL}`,
    `🔑 Código da empresa: *${x.codigo}*`,
    '',
    'É só abrir o link e digitar o código.',
    '',
    `Vocês têm direito a *${x.limite_credenciais} ` +
      `${x.limite_credenciais === 1 ? 'credencial' : 'credenciais'}* para a equipe` +
      (x.cortesias_total
        ? ` e *${x.cortesias_total} ${x.cortesias_total === 1 ? 'cortesia' : 'cortesias'}* ` +
          'para convidar clientes e parceiros'
        : '') + '.',
    '',
    'Qualquer dúvida, é só responder aqui.',
    '',
    '*Nutrição Brasil*'
  ];
  return linhas.join('\n');
}

// A equipe abre em painel. Aberta dentro da linha, empurrava a página
// inteira para baixo e fazia perder o lugar da leitura.
function abreEquipe(x) {
  const link = BASE_FORM + x.codigo;
  openModal({
    title: x.empresa || 'Empresa sem nome',
    body: h('div', {},
      h('div', { class: 'exp-modal-topo' },
        h('span', { class: 'exp-codigo mono' }, x.codigo),
        x.cota ? h('span', { class: 'row-sub' }, x.cota) : null,
        x.estande ? h('span', { class: 'row-sub' }, 'estande ' + x.estande) : null,
        h('span', { class: 'row-sub' }, `${x.time.length} de ${x.limite_credenciais} credenciais`)),

      x.time.length
        ? h('table', { class: 'table' },
            h('thead', {}, h('tr', {},
              h('th', {}, 'Pessoa'),
              h('th', { style: { width: '24%' } }, 'Cargo no crachá'),
              h('th', { style: { width: '20%' } }, 'WhatsApp'),
              h('th', { style: { width: '18%' } }, 'Crachá'))),
            h('tbody', {}, ...x.time.map((p) =>
              h('tr', {},
                h('td', {},
                  h('div', { class: 'row-name' }, p.nome),
                  p.pode_retirar ? h('div', { class: 'row-sub' }, 'retira os crachás') : null),
                h('td', {}, p.cargo || '—'),
                h('td', { class: 'mono' }, p.phone ? telefoneBonito(p.phone) : '—'),
                h('td', {},
                  p.retirado_em
                    ? h('div', {},
                        h('span', { class: 'status live' }, 'Retirado'),
                        p.retirado_por ? h('div', { class: 'row-sub' }, 'por ' + p.retirado_por) : null)
                    : h('span', { class: 'status done' }, 'No balcão'))))))
        : h('div', { class: 'empty', style: { padding: '28px 10px' } },
            h('div', { class: 'empty-title' }, 'Ninguém cadastrado ainda'),
            h('div', { class: 'empty-body' },
              'A empresa ainda não abriu o manual. Copie o convite e mande de novo.')),

      // Os três endereços moram aqui, com a explicação do que cada um abre.
      // Na linha da lista eles só geravam dúvida; aqui, com a empresa aberta
      // na frente, a diferença fica óbvia.
      h('div', { class: 'exp-links' },
        h('div', { class: 'page-sub', style: { marginBottom: '10px' } }, 'Links desta empresa'),
        linkDaEmpresa('Manual do expositor',
          'Abre tudo: montagem, equipe, cortesias e prazos. É o que se manda.',
          BASE_MANUAL, () => copia(textoManual(x), 'Manual e código copiados.')),
        linkDaEmpresa('Cadastro da equipe',
          'Atalho direto para credenciar, já com o código na URL.',
          link, () => copia(link, 'Link do cadastro de equipe copiado.')),
        x.cortesias_total
          ? linkDaEmpresa('Cortesias',
              `${x.cortesias_usadas} de ${x.cortesias_total} usadas. Código ${x.cortesias_codigo || '—'}.`,
              null, () => cortesias(x), 'Abrir cortesias')
          : null),

      h('div', { class: 'exp-modal-acoes' },
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => mudaLimite(x) },
          'Alterar credenciais'),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => cortesias(x) },
          x.cortesias_total ? 'Gerenciar cortesias' : 'Dar cortesias'))),
    actions: [
      { label: 'Fechar', kind: 'btn-ghost', onClick: (fechar) => fechar() },
      { label: 'Copiar só o manual', kind: 'btn-secondary',
        onClick: () => copia(textoManual(x), 'Manual e código copiados.') },
      { label: 'Copiar convite', kind: 'btn-primary',
        onClick: () => copia(textoConvite(x), 'Convite copiado. Cole no WhatsApp.') }
    ]
  });
}

// Cada link com o nome do que ele abre por cima do endereço. Sem a linha de
// explicação, três URLs parecidas viram três chances de mandar a errada.
function linkDaEmpresa(titulo, explica, url, onClick, rotulo) {
  return h('div', { class: 'exp-link-item' },
    h('div', {},
      h('div', { class: 'row-name' }, titulo),
      h('div', { class: 'row-sub' }, explica),
      url ? h('div', { class: 'exp-link-box mono' }, url) : null),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: onClick }, rotulo || 'Copiar'));
}

// Entrada de visitante: o QR da porta. Fica no fim porque é configuração,
// não operação do dia — mas continua a um clique.
function blocoVisitante() {
  if (!E.visitante) return null;
  const url = `https://checkin.nutricaobrasil.com.br/visitante?t=${E.visitante.public_token}`;
  return h('div', { class: 'exp-visitante' },
    h('div', {},
      h('div', { class: 'exp-visitante-t' }, 'Entrada de visitantes'),
      h('div', { class: 'row-sub' },
        'Endereço do QR da porta. Quem chega sem inscrição se cadastra e entra no contador oficial. ' +
        (E.visitante.total_inscritos || 0) + ' cadastrados até agora.')),
    h('div', { class: 'exp-visitante-acoes' },
      h('button', { class: 'btn btn-ghost btn-sm',
        onclick: () => copia(url, 'Link do QR copiado.') }, 'Copiar link do QR'),
      h('a', { class: 'btn btn-ghost btn-sm', href: url, target: '_blank', rel: 'noopener' }, 'Ver a página')));
}

// ── ações ────────────────────────────────────────────────────────────
function copia(txt, msg) {
  navigator.clipboard.writeText(txt).then(() => toast.success(msg)).catch(() => toast.danger('Não consegui copiar.'));
}

function novaEmpresa(view) {
  const ev = E.eventos.find((e) => e.id === E.eventId);
  abreNovaEmpresa({
    eventId: E.eventId,
    evento: rotuloEvento(ev),
    jaExistentes: E.empresas,
    prazoPadrao: prazoSugerido(ev),
    aoTerminar: () => recarrega(view)
  });
}

// Imprimir crachá de expositor morava só no detalhe do evento — para chegar
// lá era preciso passar por uma tela com "importar lista" e "disparar
// mensagem". Aqui é onde a pessoa já está quando pensa em crachá de equipe,
// e mantém o acesso de Exposição restrito ao que é de Exposição.
function imprimeCrachas() {
  const ev = E.eventos.find((e) => e.id === E.eventId);
  const pessoas = E.empresas.flatMap((x) =>
    x.time
      .filter((p) => p.participant_id)
      // `checked` é o que o modal usa para separar "já retirou" de "no
      // balcão". Em expositor, isso é a retirada do crachá.
      .map((p) => ({ id: p.participant_id, name: p.nome, code: p.code,
                     checked: !!p.retirado_em, __empresa: x.empresa, __estande: x.estande }))
  );
  if (!pessoas.length) {
    toast.danger('Nenhuma equipe cadastrada ainda — não há crachá para imprimir.');
    return;
  }
  abreCrachas({ evento: ev, participantes: pessoas });
}

function cortesias(x) {
  const ev = E.eventos.find((e) => e.id === E.eventId);
  abreCortesias({
    empresa: x,
    evento: rotuloEvento(ev),
    aoTerminar: () => { if (E.view) recarrega(E.view); }
  });
}

function loteDeConvites(view) {
  const ev = E.eventos.find((e) => e.id === E.eventId);
  abreLote({
    eventId: E.eventId,
    evento: rotuloEvento(ev),
    jaExistentes: E.empresas,
    prazoPadrao: prazoSugerido(ev),
    aoTerminar: () => recarrega(view)
  });
}

function mudaLimite(x) {
  let campo;
  openModal({
    title: 'Credenciais da ' + (x.empresa || 'empresa'),
    body: h('div', {},
      h('p', { class: 'page-sub' },
        `A empresa já cadastrou ${x.time.length} pessoa(s). O limite define até quantos crachás ela pode gerar.`),
      h('label', { class: 'campo-rot' }, 'Número de credenciais'),
      h('input', { class: 'input', type: 'number', min: '1', max: '200',
        value: String(x.limite_credenciais || 5), ref: (el) => { campo = el; } })),
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (fechar) => fechar() },
      { label: 'Salvar', kind: 'btn-primary', onClick: async (fechar) => {
          const n = parseInt(campo.value, 10);
          if (!n || n < 1) { toast.danger('Precisa ser um número maior que zero.'); return; }
          if (n < x.time.length) {
            toast.danger(`A empresa já tem ${x.time.length} pessoas. Não dá para baixar para ${n}.`);
            return;
          }
          const { error } = await supabase.from('exhibitors')
            .update({ limite_credenciais: n }).eq('id', x.id);
          if (error) { toast.danger(error.message); return; }
          x.limite_credenciais = n;
          fechar();
          // Repinta a página inteira, não só a lista: o total de vagas e o
          // contador de "acima do limite" mudaram junto.
          if (E.view) pinta(E.view); else redesenha();
          toast.success(`${x.empresa}: limite agora é ${n} credenciais.`);
        } }
    ]
  });
}

// "Expositores – Brasília" → "Nutrição Brasil Brasília", que é como a empresa
// conhece o evento. Ninguém comprou estande no "evento de expositores".
function rotuloEvento(ev) {
  const cidade = String(ev?.name || '').split('–').pop().trim();
  return cidade ? 'Nutrição Brasil ' + cidade : '';
}

// Uma semana antes do evento: é o corte real para o crachá sair impresso.
function prazoSugerido(ev) {
  const d = ev?.event_date || ev?.date_start;
  if (!d) return '';
  const dt = new Date(d);
  dt.setDate(dt.getDate() - 7);
  const meses = ['janeiro','fevereiro','março','abril','maio','junho',
                 'julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${dt.getUTCDate()} de ${meses[dt.getUTCMonth()]}`;
}
