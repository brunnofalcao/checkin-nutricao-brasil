// =====================================================================
// PESSOAS · a base compartilhada do ecossistema
//
// O painel inteiro é organizado por função, não por cidade. Esta tela é a
// única que não pertence a um evento: ela mostra a PESSOA e, dentro dela,
// por quantos eventos ela já passou. É daqui que sai o "essa nutricionista
// já veio em BH e agora está em Brasília".
//
// A base é carregada de uma vez e filtrada no navegador. Isso é de propósito:
// busca sem acento, instantânea, e resistente a wi-fi ruim de balcão.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { fmtRelative, fmtDateTime, debounce, normalizePhone } from '../core/utils.js';
import { listEvents } from '../data/events.js';
import { checkinParticipant, uncheckinParticipant } from '../data/participants.js';
import {
  carregaInscricoes,
  eventosComCertificado,
  atualizaInscricoes,
  agrupaPessoas,
  filtraPessoas,
  soDigitos,
  TETO_BASE
} from '../data/pessoas.js';
import { abreAdicionarPessoa } from './pessoa-nova.js';

const TIPO_ROTULO = {
  congress: 'Congresso',
  race: 'Corrida',
  exhibitor: 'Exposição',
  visitor: 'Visitante'
};
const PAGINA = 50;

export async function pagePessoas(view) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));

  let eventos = [];
  let inscricoes = [];
  let comCertificado = new Set();
  try {
    [eventos, inscricoes, comCertificado] = await Promise.all([
      listEvents(),
      carregaInscricoes(),
      eventosComCertificado()
    ]);
  } catch (e) {
    console.error(e);
    setContent(
      view,
      h(
        'div',
        { class: 'empty' },
        h('div', { class: 'empty-icon' }, icons.alert()),
        h('div', { class: 'empty-title' }, 'Não consegui carregar a base'),
        h('div', { class: 'empty-body' }, String(e.message || e)),
        h('button', { class: 'btn btn-primary', onclick: () => pagePessoas(view) }, 'Tentar de novo')
      )
    );
    return;
  }

  const eventosPorId = new Map(eventos.map((e) => [e.id, e]));
  let pessoas = agrupaPessoas(inscricoes, eventosPorId);

  let termo = '';
  let filtroEvento = 'todos';
  let filtroSituacao = 'todos';
  let limite = PAGINA;

  // ── Filtro ────────────────────────────────────────────────────────────────
  function visiveis() {
    let lista = filtraPessoas(pessoas, termo);
    if (filtroEvento !== 'todos') {
      lista = lista.filter((pe) => pe.eventos.includes(filtroEvento));
    }
    if (filtroSituacao === 'presentes') {
      lista = lista.filter((pe) =>
        filtroEvento === 'todos'
          ? pe.presencas > 0
          : pe.inscricoes.some((i) => i.event_id === filtroEvento && i.checked)
      );
    } else if (filtroSituacao === 'pendentes') {
      lista = lista.filter((pe) =>
        filtroEvento === 'todos'
          ? pe.presencas === 0
          : pe.inscricoes.some((i) => i.event_id === filtroEvento && !i.checked)
      );
    } else if (filtroSituacao === 'recorrentes') {
      lista = lista.filter((pe) => pe.eventos.length > 1);
    }
    return lista;
  }

  // ── Recarrega depois de mexer no banco ────────────────────────────────────
  async function recarrega() {
    inscricoes = await carregaInscricoes();
    pessoas = agrupaPessoas(inscricoes, eventosPorId);
    render();
  }

  // Atualiza só uma inscrição em memória — evita recarregar 1000 linhas
  // por causa de um check-in.
  function aplicaLocal(id, patch) {
    const alvo = inscricoes.find((i) => i.id === id);
    if (alvo) Object.assign(alvo, patch);
    pessoas = agrupaPessoas(inscricoes, eventosPorId);
  }

  // ── Cabeçalho ─────────────────────────────────────────────────────────────
  function cabecalho() {
    const totalInsc = inscricoes.length;
    const presencas = inscricoes.filter((i) => i.checked).length;
    const recorrentes = pessoas.filter((pe) => pe.eventos.length > 1).length;
    const semContato = pessoas.filter((pe) => !pe.email && !pe.phone).length;

    return h(
      'div',
      {},
      h(
        'div',
        { class: 'page-head' },
        h(
          'div',
          {},
          h('h1', { class: 'page-title' }, 'Pessoas'),
          h(
            'div',
            { class: 'page-sub' },
            'A base compartilhada. Uma linha por pessoa, com todas as inscrições dela em todos os eventos.'
          )
        ),
        h(
          'div',
          { class: 'page-actions' },
          h(
            'button',
            { class: 'btn btn-ghost', onclick: () => recarrega().then(() => toast.info('Base atualizada.')) },
            'Atualizar'
          ),
          h(
            'button',
            { class: 'btn btn-primary', onclick: abreCadastro },
            icons.plus(),
            'Adicionar pessoa'
          )
        )
      ),

      totalInsc >= TETO_BASE
        ? h(
            'div',
            { class: 'pes-teto' },
            icons.alert(),
            h(
              'span',
              {},
              `A base passou de ${TETO_BASE.toLocaleString('pt-BR')} inscrições e esta tela carrega até esse limite. ` +
                'Os números abaixo estão truncados — avise para ligarmos a busca no servidor.'
            )
          )
        : null,

      h(
        'div',
        { class: 'pes-stats' },
        cartao('Pessoas na base', pessoas.length.toLocaleString('pt-BR'), 'únicas, sem duplicata'),
        cartao('Inscrições', totalInsc.toLocaleString('pt-BR'), 'somando todos os eventos'),
        cartao('Presenças confirmadas', presencas.toLocaleString('pt-BR'), 'contador oficial'),
        cartao(
          'Voltaram',
          recorrentes.toLocaleString('pt-BR'),
          recorrentes ? 'em mais de um evento' : 'ninguém ainda',
          'destaque'
        ),
        semContato
          ? cartao('Sem contato', semContato.toLocaleString('pt-BR'), 'nem e-mail nem WhatsApp', 'alerta')
          : null
      )
    );
  }

  function cartao(rotulo, valor, sub, tom) {
    return h(
      'div',
      { class: 'pes-stat' + (tom ? ' ' + tom : '') },
      h('div', { class: 'pes-stat-rot' }, rotulo),
      h('div', { class: 'pes-stat-val' }, valor),
      h('div', { class: 'pes-stat-sub' }, sub)
    );
  }

  // ── Barra de filtros ──────────────────────────────────────────────────────
  function barra() {
    const buscaDebounce = debounce((v) => {
      termo = v;
      limite = PAGINA;
      renderCorpo();
    }, 140);

    return h(
      'div',
      { class: 'table-toolbar pes-toolbar' },
      h(
        'div',
        { class: 'toolbar-search' },
        icons.search(),
        h('input', {
          type: 'search',
          placeholder: 'Nome, e-mail, telefone ou código…',
          'aria-label': 'Buscar pessoa',
          value: termo,
          oninput: (e) => buscaDebounce(e.target.value)
        })
      ),
      h(
        'select',
        {
          class: 'input pes-sel',
          'aria-label': 'Filtrar por evento',
          onchange: (e) => {
            filtroEvento = e.target.value;
            limite = PAGINA;
            renderCorpo();
          }
        },
        h('option', { value: 'todos', selected: filtroEvento === 'todos' || null }, 'Todos os eventos'),
        ...eventos.map((e) =>
          h(
            'option',
            { value: e.id, selected: e.id === filtroEvento || null },
            `${e.city || e.name}${e.event_type && e.event_type !== 'congress' ? ' · ' + (TIPO_ROTULO[e.event_type] || '') : ''}`
          )
        )
      ),
      h(
        'div',
        { class: 'chip-group' },
        chip('todos', 'Todas'),
        chip('presentes', 'Com presença'),
        chip('pendentes', 'Sem presença'),
        chip('recorrentes', 'Voltaram')
      )
    );
  }

  function chip(valor, rotulo) {
    return h(
      'button',
      {
        class: 'btn-chip' + (filtroSituacao === valor ? ' on' : ''),
        'aria-pressed': filtroSituacao === valor ? 'true' : 'false',
        onclick: () => {
          filtroSituacao = valor;
          limite = PAGINA;
          renderCorpo();
        }
      },
      rotulo
    );
  }

  // ── Lista ─────────────────────────────────────────────────────────────────
  function renderCorpo() {
    const alvo = document.getElementById('pes-corpo');
    if (!alvo) return;
    const lista = visiveis();
    const pagina = lista.slice(0, limite);

    if (!lista.length) {
      setContent(
        alvo,
        h(
          'div',
          { class: 'loading-row' },
          termo
            ? `Ninguém encontrado para "${termo}".`
            : 'Nenhuma pessoa com esses filtros.'
        )
      );
      return;
    }

    setContent(
      alvo,
      h(
        'table',
        { class: 'table pes-table' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { style: { width: '34%' } }, 'Pessoa'),
            h('th', {}, 'Contato'),
            h('th', {}, 'Eventos'),
            h('th', { style: { width: '110px' } }, 'Presenças'),
            h('th', { style: { width: '120px' } }, 'Última inscrição')
          )
        ),
        h('tbody', {}, ...pagina.map(linha))
      ),
      h(
        'div',
        { class: 'table-pager' },
        h(
          'span',
          {},
          `${Math.min(limite, lista.length).toLocaleString('pt-BR')} de ${lista.length.toLocaleString('pt-BR')} pessoas`
        ),
        lista.length > limite
          ? h(
              'div',
              { class: 'pager-actions' },
              h(
                'button',
                {
                  class: 'btn btn-ghost btn-sm',
                  onclick: () => {
                    limite += 200;
                    renderCorpo();
                  }
                },
                'Mostrar mais'
              )
            )
          : null
      )
    );
  }

  function linha(pe) {
    const chips = pe.inscricoes.map((i) =>
      h(
        'span',
        {
          class: 'pes-ev' + (i.checked ? ' presente' : ''),
          title: `${i.evento?.name || 'Evento'}${i.lote ? ' · ' + i.lote : ''}${i.checked ? ' · presente' : ' · pendente'}`
        },
        // Congresso é identificado pela cidade; corrida/expo/visitante pelo
        // que são — senão vira "Brasília" três vezes na mesma linha.
        i.evento?.event_type && i.evento.event_type !== 'congress'
          ? TIPO_ROTULO[i.evento.event_type] || i.evento.name
          : i.evento?.city || i.evento?.name || 'Evento'
      )
    );

    return h(
      'tr',
      {
        tabindex: '0',
        role: 'button',
        onclick: () => abrePessoa(pe),
        onkeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            abrePessoa(pe);
          }
        }
      },
      h(
        'td',
        {},
        h('div', { class: 'row-name' }, pe.nome),
        pe.eventos.length > 1
          ? h('div', { class: 'row-sub pes-volta' }, `Voltou · ${pe.eventos.length} eventos`)
          : null
      ),
      h(
        'td',
        {},
        h('div', { class: 'pes-contato' }, pe.email || h('span', { class: 'muted' }, 'sem e-mail')),
        h(
          'div',
          { class: 'pes-contato mono' },
          pe.phone ? telefoneBonito(pe.phone) : h('span', { class: 'muted' }, 'sem WhatsApp')
        )
      ),
      h('td', {}, h('div', { class: 'pes-evs' }, ...chips)),
      h(
        'td',
        {},
        pe.presencas
          ? h('span', { class: 'status live' }, `${pe.presencas} de ${pe.inscricoes.length}`)
          : h('span', { class: 'status done' }, 'nenhuma')
      ),
      h('td', { class: 'muted' }, fmtRelative(pe.ultima))
    );
  }

  // ── Ficha da pessoa ───────────────────────────────────────────────────────
  function abrePessoa(pe) {
    let corpo;
    let ficha;
    // O id da inscrição é estável; a chave de identidade não é (muda se o
    // e-mail for corrigido). Por isso a ficha se reencontra pelo id.
    const ancora = new Set(pe.inscricoes.map((i) => i.id));

    function desenhaFicha() {
      const atual =
        pessoas.find((x) => x.inscricoes.some((i) => ancora.has(i.id))) || pe;
      atual.inscricoes.forEach((i) => ancora.add(i.id));
      setContent(
        corpo,
        h(
          'div',
          { class: 'pes-ficha-topo' },
          h(
            'div',
            {},
            h('div', { class: 'pes-ficha-contato' }, atual.email || 'sem e-mail'),
            h(
              'div',
              { class: 'pes-ficha-contato mono' },
              atual.phone ? telefoneBonito(atual.phone) : 'sem WhatsApp'
            )
          ),
          h(
            'div',
            { class: 'pes-ficha-acoes' },
            atual.phone
              ? h(
                  'a',
                  {
                    class: 'btn btn-ghost btn-sm',
                    href: `https://wa.me/${soDigitos(atual.phone)}`,
                    target: '_blank',
                    rel: 'noopener'
                  },
                  'Abrir WhatsApp'
                )
              : null,
            h(
              'button',
              { class: 'btn btn-secondary btn-sm', onclick: () => abreEdicao(atual, desenhaFicha) },
              icons.edit(),
              'Editar dados'
            )
          )
        ),

        h('div', { class: 'pes-ficha-titulo' }, `Inscrições (${atual.inscricoes.length})`),

        ...atual.inscricoes.map((i) => fichaInscricao(i, desenhaFicha)),

        h(
          'button',
          {
            class: 'btn btn-ghost btn-sm',
            style: { marginTop: '14px' },
            onclick: () => {
              ficha?.close?.();
              abreCadastro({
                preencher: { name: atual.nome, email: atual.email, phone: atual.phone }
              });
            }
          },
          icons.plus(),
          'Inscrever em outro evento'
        )
      );
    }

    ficha = openModal({
      title: pe.nome,
      body: () => {
        corpo = h('div', { class: 'pes-ficha' });
        desenhaFicha();
        return corpo;
      },
      actions: [{ label: 'Fechar', kind: 'btn-secondary', onClick: (fechar) => fechar() }]
    });
  }

  function fichaInscricao(i, redesenha) {
    const ev = i.evento;
    const linkCert = i.cert_token
      ? `https://checkin.nutricaobrasil.com.br/c/${i.cert_token}`
      : null;

    return h(
      'div',
      { class: 'pes-insc' + (i.checked ? ' presente' : '') },
      h(
        'div',
        { class: 'pes-insc-top' },
        h(
          'div',
          {},
          h('div', { class: 'pes-insc-nome' }, ev?.name || 'Evento removido'),
          h(
            'div',
            { class: 'pes-insc-meta' },
            [
              ev?.event_type && ev.event_type !== 'congress' ? TIPO_ROTULO[ev.event_type] : null,
              i.lote ? (/^lote/i.test(i.lote) ? i.lote : 'lote ' + i.lote) : null,
              i.code ? 'cód ' + i.code : null,
              'origem ' + (i.source || 'manual')
            ]
              .filter(Boolean)
              .join(' · ')
          ),
          i.notes ? h('div', { class: 'pes-insc-obs' }, i.notes) : null
        ),
        i.checked
          ? h('span', { class: 'status live' }, 'Presente · ' + fmtRelative(i.checked_at))
          : h('span', { class: 'status done' }, 'Pendente')
      ),
      h(
        'div',
        { class: 'pes-insc-acoes' },
        h(
          'button',
          {
            class: 'btn btn-sm ' + (i.checked ? 'btn-ghost' : 'btn-primary'),
            onclick: async (e) => {
              const btn = e.currentTarget;
              btn.disabled = true;
              try {
                if (i.checked) {
                  await uncheckinParticipant(i.id);
                  aplicaLocal(i.id, { checked: false, checked_at: null });
                  toast.info('Presença desfeita.');
                } else {
                  await checkinParticipant(i.id);
                  aplicaLocal(i.id, { checked: true, checked_at: new Date().toISOString() });
                  toast.success('Presença confirmada.');
                }
                redesenha();
                renderCorpo();
                atualizaStats();
              } catch (err) {
                toast.danger('Não deu: ' + (err.message || err));
                btn.disabled = false;
              }
            }
          },
          i.checked ? 'Desfazer presença' : 'Confirmar presença'
        ),
        linkCert
          ? h(
              'button',
              {
                class: 'btn btn-ghost btn-sm',
                onclick: () => {
                  navigator.clipboard
                    ?.writeText(linkCert)
                    .then(() => toast.success('Link do certificado copiado.'))
                    .catch(() => toast.danger('Não consegui copiar.'));
                }
              },
              icons.award(),
              'Copiar link do certificado'
            )
          : null,
        h(
          'span',
          { class: 'pes-insc-data' },
          'inscrito em ' + fmtDateTime(i.created_at)
        )
      )
    );
  }

  // ── Editar dados ──────────────────────────────────────────────────────────
  function abreEdicao(pe, aoSalvar) {
    const dados = { name: pe.nome, email: pe.email || '', phone: pe.phone || '' };
    let todas = pe.inscricoes.length > 1;

    openModal({
      title: 'Editar dados',
      body: () =>
        h(
          'div',
          {},
          h(
            'div',
            { class: 'field' },
            h('label', { for: 'ed-nome' }, 'Nome completo'),
            h('input', {
              id: 'ed-nome',
              class: 'input',
              value: dados.name,
              oninput: (e) => (dados.name = e.target.value)
            })
          ),
          h(
            'div',
            { class: 'field' },
            h('label', { for: 'ed-mail' }, 'E-mail'),
            h('input', {
              id: 'ed-mail',
              class: 'input',
              type: 'email',
              value: dados.email,
              oninput: (e) => (dados.email = e.target.value.trim())
            }),
            h(
              'div',
              { class: 'pn-dica' },
              'Trocar o e-mail muda o link do certificado dessa pessoa.'
            )
          ),
          h(
            'div',
            { class: 'field' },
            h('label', { for: 'ed-tel' }, 'WhatsApp'),
            h('input', {
              id: 'ed-tel',
              class: 'input',
              type: 'tel',
              value: dados.phone,
              oninput: (e) => (dados.phone = e.target.value)
            })
          ),
          pe.inscricoes.length > 1
            ? h(
                'label',
                { class: 'pn-check' },
                h('input', {
                  type: 'checkbox',
                  checked: true,
                  onchange: (e) => (todas = e.target.checked)
                }),
                h(
                  'span',
                  {},
                  h('strong', {}, `Aplicar nas ${pe.inscricoes.length} inscrições dessa pessoa`),
                  h(
                    'span',
                    { class: 'pn-dica' },
                    'Desmarque para corrigir só a inscrição mais recente.'
                  )
                )
              )
            : null
        ),
      actions: [
        { label: 'Cancelar', kind: 'btn-ghost', onClick: (fechar) => fechar() },
        {
          label: 'Salvar',
          kind: 'btn-primary',
          onClick: async (fechar) => {
            const nome = dados.name.trim().replace(/\s+/g, ' ');
            if (nome.length < 3) return toast.danger('Escreva o nome completo.');
            if (dados.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dados.email)) {
              return toast.danger('Esse e-mail não parece válido.');
            }
            const alvos = todas ? pe.inscricoes.map((i) => i.id) : [pe.inscricoes[0].id];
            const patch = {
              name: nome,
              email: dados.email || null,
              phone: normalizePhone(dados.phone) || null
            };
            try {
              await atualizaInscricoes(alvos, patch);
              alvos.forEach((id) => aplicaLocal(id, patch));
              toast.success(alvos.length > 1 ? `${alvos.length} inscrições atualizadas.` : 'Dados atualizados.');
              fechar();
              aoSalvar?.();
              renderCorpo();
            } catch (err) {
              toast.danger(
                err.code === '23505'
                  ? 'Já existe outra inscrição com esse e-mail nesse evento.'
                  : 'Não deu para salvar: ' + (err.message || err)
              );
            }
          }
        }
      ]
    });
  }

  // ── Cadastro ──────────────────────────────────────────────────────────────
  function abreCadastro(opts = {}) {
    abreAdicionarPessoa({
      eventos,
      eventoId: filtroEvento !== 'todos' ? filtroEvento : null,
      pessoas,
      comCertificado,
      aoCriar: (linha) => {
        inscricoes.unshift(linha);
        pessoas = agrupaPessoas(inscricoes, eventosPorId);
        render();
      },
      ...opts
    });
  }

  function atualizaStats() {
    const topo = document.getElementById('pes-topo');
    if (topo) setContent(topo, cabecalho());
  }

  function render() {
    setContent(
      view,
      h('div', { id: 'pes-topo' }, cabecalho()),
      h('div', { class: 'table-card' }, barra(), h('div', { id: 'pes-corpo' }))
    );
    renderCorpo();
  }

  render();
}

// Deixa o telefone legível sem mexer no dado guardado.
function telefoneBonito(raw) {
  const d = soDigitos(raw);
  const s = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  if (s.length === 11) return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`;
  return raw;
}
