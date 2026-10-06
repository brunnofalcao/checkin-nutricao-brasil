// =====================================================================
// EVENTOS — o calendário
//
// ORDEM
// A lista vinha do banco em date_start ascendente e era desenhada assim,
// o que colocava março, maio e agosto no topo e deixava o que ainda vai
// acontecer no fim da página. Num calendário de nove datas o efeito é
// que a tela abre mostrando passado: para achar a próxima cidade era
// preciso rolar até embaixo.
//
// Agora a ordem é por proximidade: o que vem primeiro é o próximo evento,
// e o passado desce para um grupo próprio, do mais recente para o mais
// antigo. Quem já aconteceu continua clicável e continua contando no
// filtro — só para de disputar a primeira linha com quem ainda vai
// acontecer.
//
// FAMÍLIA
// O calendário deixou de ser só Nutrição Brasil: entrou evento gratuito,
// de aplicação, com outra marca. Nove datas pagas misturadas com os
// gratuitos viram ruído. As fichas de família filtram sem esconder nada —
// "Todos" continua sendo o padrão.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { listEvents } from '../data/events.js';
import { navigate } from '../core/router.js';
import { fmtDate } from '../core/utils.js';
import { abreNovoEvento } from './evento-novo.js';

// Rótulo bonito por família. Família que não estiver aqui aparece com o
// próprio slug — melhor um nome feio do que um evento invisível.
const FAMILIA_ROTULO = {
  'nutricao-brasil': 'Nutrição Brasil',
  gratuitos: 'Gratuitos'
};

const DIA = 86400000;

// Meia-noite de hoje no fuso de quem está olhando. Comparar com
// Date.now() faria o evento de hoje à tarde contar como passado às 15h,
// e evento do dia é exatamente o que não pode sair da primeira linha.
function inicioDeHoje() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function quando(ev) {
  return ev.date_start || (ev.event_date ? ev.event_date + 'T00:00:00' : null);
}

// Passado por data OU por status. Os dois caminhos existem porque data é
// o que manda, mas evento sem data cadastrada precisa de alguma resposta.
function jaAconteceu(ev, hoje) {
  const iso = quando(ev);
  if (iso) {
    const fim = ev.date_end || iso;
    return new Date(fim).getTime() < hoje;
  }
  return ev.status === 'encerrado';
}

// "em 29 dias", "amanhã", "hoje", "há 2 meses". A data crua já está na
// coluna; isto é o que a pessoa realmente quer saber ao bater o olho.
function distancia(ev, hoje) {
  const iso = quando(ev);
  if (!iso) return null;
  const dias = Math.round((new Date(iso).setHours(0, 0, 0, 0) - hoje) / DIA);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  if (dias === -1) return 'ontem';
  if (dias > 0) return dias < 45 ? `em ${dias} dias` : `em ${Math.round(dias / 30)} meses`;
  const atras = -dias;
  return atras < 45 ? `há ${atras} dias` : `há ${Math.round(atras / 30)} meses`;
}

export async function pageEvents(view) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));

  const events = await listEvents();
  const hoje = inicioDeHoje();

  let filtro = 'todos';     // todos | vendas | encerrados
  let familia = 'todas';
  let searchTerm = '';

  // Só mostra ficha de família se houver mais de uma no calendário.
  // Enquanto existia só Nutrição Brasil, a ficha era enfeite.
  const familias = Array.from(new Set(events.map((e) => e.familia || 'nutricao-brasil')));

  function render() {
    const filtered = events.filter((e) => {
      const passou = jaAconteceu(e, hoje);
      const matchesFilter =
        filtro === 'todos' ||
        (filtro === 'vendas' && !passou && e.status !== 'encerrado') ||
        (filtro === 'encerrados' && (passou || e.status === 'encerrado'));
      const matchesFamilia =
        familia === 'todas' || (e.familia || 'nutricao-brasil') === familia;
      const matchesSearch =
        !searchTerm ||
        (e.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.location || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.city || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesFilter && matchesFamilia && matchesSearch;
    });

    // Próximos em ordem crescente (o mais perto primeiro); passados em
    // ordem decrescente (o mais recente primeiro). Evento sem data cai no
    // fim do próprio grupo, não no meio do calendário.
    const t = (e) => { const i = quando(e); return i ? new Date(i).getTime() : null; };
    const proximos = filtered.filter((e) => !jaAconteceu(e, hoje))
      .sort((a, b) => (t(a) ?? Infinity) - (t(b) ?? Infinity));
    const passados = filtered.filter((e) => jaAconteceu(e, hoje))
      .sort((a, b) => (t(b) ?? -Infinity) - (t(a) ?? -Infinity));

    const counts = {
      todos: events.length,
      vendas: events.filter((e) => !jaAconteceu(e, hoje) && e.status !== 'encerrado').length,
      encerrados: events.filter((e) => jaAconteceu(e, hoje) || e.status === 'encerrado').length
    };

    const corpo = [];
    if (proximos.length) {
      // O cabeçalho de grupo só aparece quando há os dois: com uma lista
      // só, ele é uma linha a mais dizendo o que já está evidente.
      if (passados.length) corpo.push(grupo(`Próximos · ${proximos.length}`));
      proximos.forEach((e) => corpo.push(renderRow(e, false)));
    }
    if (passados.length) {
      if (proximos.length) corpo.push(grupo(`Já aconteceram · ${passados.length}`));
      passados.forEach((e) => corpo.push(renderRow(e, true)));
    }

    setContent(
      view,
      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', { class: 'page-title' }, 'Eventos'),
          h('div', { class: 'page-sub' },
            proximos.length
              ? `Próximo: ${proximos[0].name || proximos[0].slug} · ${distancia(proximos[0], hoje) || 'sem data'}.`
              : 'O calendário Nutrição Brasil. Clique em qualquer evento para abrir.')
        ),
        h('div', { class: 'page-actions' },
          h('button', { class: 'btn btn-primary', onclick: () => abreNovoEvento({
              eventos: events,
              aoCriar: (novo) => {
                events.push(novo);
                navigate('/eventos/' + novo.id);
              }
            }) },
            icons.plus(), 'Novo evento'
          )
        )
      ),

      h('div', { class: 'table-card' },
        h('div', { class: 'table-toolbar' },
          h('div', { class: 'toolbar-search' },
            icons.search(),
            h('input', {
              type: 'text',
              placeholder: 'Buscar por cidade ou nome...',
              value: searchTerm,
              oninput: (e) => { searchTerm = e.target.value; render(); }
            })
          ),
          h('div', { class: 'exp-chips', style: { marginLeft: 'auto' } },
            ...(familias.length > 1
              ? [
                  ficha('todas', 'Todas as marcas', familia, (k) => { familia = k; render(); }),
                  ...familias.map((f) =>
                    ficha(f, FAMILIA_ROTULO[f] || f, familia, (k) => { familia = k; render(); }))
                ]
              : []),
            ficha('todos', `Todos · ${counts.todos}`, filtro, (k) => { filtro = k; render(); }),
            ficha('vendas', `Em vendas · ${counts.vendas}`, filtro, (k) => { filtro = k; render(); }),
            ficha('encerrados', `Encerrados · ${counts.encerrados}`, filtro, (k) => { filtro = k; render(); })
          )
        ),

        corpo.length === 0
          ? h('div', { class: 'loading-row' }, 'Nenhum evento encontrado.')
          : h('table', { class: 'table' },
              h('thead', {},
                h('tr', {},
                  h('th', { style: { width: '28%' } }, 'Evento'),
                  h('th', {}, 'Data'),
                  h('th', {}, 'Local'),
                  h('th', {}, 'Inscritos'),
                  h('th', {}, 'Check-in'),
                  h('th', {}, 'Status')
                )
              ),
              h('tbody', {}, ...corpo)
            )
      )
    );
  }

  function grupo(rotulo) {
    return h('tr', { class: 'ev-grupo' }, h('td', { colspan: '6' }, rotulo));
  }

  function renderRow(ev, passou) {
    const pct = ev.total_inscritos
      ? Math.round(((ev.total_checkins || 0) / ev.total_inscritos) * 100)
      : 0;
    const dist = distancia(ev, hoje);

    return h('tr', {
        class: passou ? 'ev-passado' : '',
        onclick: () => navigate(`/eventos/${ev.id}`)
      },
      h('td', {},
        h('div', { class: 'row-name-wrap' },
          h('div', { class: 'row-name' }, ev.name || ev.slug),
          ev.event_type === 'race' ? h('span', { class: 'race-badge' }, 'Corrida') : null,
          ev.gratuito ? h('span', { class: 'race-badge' }, 'Gratuito') : null
        ),
        ev.slug ? h('div', { class: 'row-sub' }, ev.slug) : null
      ),
      h('td', {},
        h('div', { class: 'mono' }, fmtDate(quando(ev))),
        dist ? h('div', { class: 'row-sub' }, dist) : null
      ),
      h('td', {}, ev.location || ev.venue || h('span', { style: { color: 'var(--ink-mute)' } }, 'A confirmar')),
      h('td', {}, progressMini(ev.total_inscritos || 0, capacity(ev))),
      h('td', { class: 'mono' },
        passou && ev.total_inscritos
          ? `${ev.total_checkins || 0} · ${pct}%`
          : '—'
      ),
      h('td', {}, renderStatus(ev.status, passou))
    );
  }

  render();
}

function ficha(key, label, ativo, onPick) {
  return h('button', {
    class: 'exp-chip' + (ativo === key ? ' on' : ''),
    onclick: () => onPick(key)
  }, label);
}

function progressMini(value, total) {
  if (!total) return h('span', { class: 'mono', style: { color: 'var(--ink-mute)' } }, value);
  const pct = Math.min(100, Math.round((value / total) * 100));
  return h('div', { class: 'progress-mini' },
    h('div', { class: 'progress-bar' }, h('div', { class: 'progress-fill', style: { width: pct + '%' } })),
    h('div', { class: 'progress-text' }, `${value} / ${total}`)
  );
}

// Teto declarado do evento. Enquanto a coluna capacity não existia, isto
// caía em total_inscritos — e aí toda barra marcava 100%, o que fazia a
// ocupação parecer cheia em evento com três inscritos. Sem teto
// cadastrado, mostra só a contagem.
function capacity(ev) {
  return ev.capacity || 0;
}

function renderStatus(status, passou) {
  const map = {
    ativo: { cls: 'soon', label: 'Em vendas' },
    embreve: { cls: 'soon', label: 'Em breve' },
    encerrado: { cls: 'done', label: 'Encerrado' }
  };
  const cfg = map[status] || { cls: 'done', label: status || '—' };
  // Evento cuja data passou mas que ninguém marcou como encerrado ficava
  // escrito "Em vendas" semanas depois de acontecer.
  if (passou && status !== 'encerrado') return h('span', { class: 'status done' }, 'Já aconteceu');
  return h('span', { class: `status ${cfg.cls}` }, cfg.label);
}
