// =====================================================================
// TRIAGEM DE APLICAÇÕES
//
// Evento gratuito com vaga limitada não vende ingresso: recebe aplicação
// e escolhe. O Health Influence Day é o primeiro desse formato — a pessoa
// preenche o formulário, cai no RD, entra aqui como inscrição SEM
// classificação e não recebe nada. Só depois de alguém decidir é que a
// mensagem sai.
//
// Esta tela é esse "alguém decidir". Três decisões possíveis:
//
//   Convidado  entra no evento, recebe o ingresso light
//   Premium    entra no evento e no tour, recebe o ingresso black
//   Lead       não entra nesta edição, fica na base para a próxima
//
// O CRITÉRIO É PERFIL, NÃO ORDEM DE CHEGADA
// Quem é a pessoa (profissão) e que alcance ela tem (Instagram). Por isso
// o @ é link clicável e não texto solto: decidir 86 aplicações copiando e
// colando @ no navegador não é triagem, é garimpo. A contagem de
// seguidores vem do cache em instagram_perfis, alimentado pela function
// insta-seguidores — e quando não existe, a coluna diz que não existe, em
// vez de mostrar zero. Zero seguidores e "não consegui saber" levam a
// decisões opostas.
//
// POR QUE NÃO FALA COM O BANCO DIRETO
// Classificar não é só gravar uma coluna: grava, troca a tag no RD
// Station e registra a conversão que dispara o e-mail de lá. Isso mora na
// edge function `triagem`, que tem a chave do RD. Chamar o banco direto
// daqui gravaria a classificação e deixaria o RD para trás — a pessoa
// aprovada no painel e ainda marcada como lead na automação.
//
// O AVISO DO TOPO É A PARTE MAIS IMPORTANTE DA TELA
// Classificar como convidado NÃO manda mensagem por si. Quem manda é o
// cron `hid-envia`, e enquanto existir lista branca de teste só os
// e-mails dela saem. Sem dizer isso na cara, quem aprova 70 pessoas sai
// achando que 70 pessoas foram avisadas.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { supabase } from '../data/supabase.js';
import { toast } from '../ui/toast.js';
import { telaDeErro } from '../ui/estado.js';
import { fmtRelative, fmtDate, telefoneBonito } from '../core/utils.js';
import { openModal } from '../ui/modal.js';

const EVENTO_PADRAO = 'health-influence-day-2026';
const API = window.__ENV.SUPABASE_URL + '/functions/v1/triagem';
const API_INSTA = window.__ENV.SUPABASE_URL + '/functions/v1/insta-seguidores';

const CLASSES = [
  { key: 'convidado', rot: 'Convidado', cls: 'live' },
  { key: 'premium', rot: 'Premium', cls: 'soon' },
  { key: 'lead', rot: 'Lead', cls: 'done' }
];
const POR_CHAVE = Object.fromEntries(CLASSES.map((c) => [c.key, c]));

// Chamada autenticada pela sessão do painel. O token é lido na hora de
// cada chamada, não guardado: com autoRefreshToken ligado, um token lido
// no carregamento da página vence no meio de uma triagem longa.
async function chama(url, opcoes = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sua sessão expirou. Saia e entre de novo.');
  const res = await fetch(url, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      ...(opcoes.headers || {})
    }
  });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok || corpo?.erro) {
    throw new Error(corpo?.erro || `o servidor respondeu ${res.status}`);
  }
  return corpo;
}

// 12,3 mil · 1,2 mi. Número cheio em coluna de tabela rouba a atenção de
// quem está comparando alcance entre dez linhas.
function seguidoresBonito(n) {
  if (n === null || n === undefined) return null;
  if (n < 1000) return String(n);
  if (n < 1000000) {
    const m = n / 1000;
    return (m < 100 ? m.toFixed(1).replace('.', ',') : Math.round(m)) + ' mil';
  }
  return (n / 1000000).toFixed(1).replace('.', ',') + ' mi';
}

export async function pageTriagem(view, ctx = {}) {
  const slug = ctx?.query?.evento || EVENTO_PADRAO;
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));

  let dados;
  try {
    dados = await chama(`${API}?api=lista&evento=${encodeURIComponent(slug)}`);
  } catch (e) {
    return telaDeErro(view, e, () => pageTriagem(view, ctx), 'Não consegui carregar a triagem');
  }

  const lista = dados.lista || [];
  const ev = dados.evento || null;
  const envio = dados.envio || { armado: false, lista_teste: [] };

  let filtro = 'pendentes';
  let busca = '';
  let ordem = 'recentes';   // recentes | alcance

  function conta(classe) {
    return lista.filter((i) => (i.classificacao || null) === classe).length;
  }

  function render() {
    const pendentes = conta(null);
    const convidados = conta('convidado');
    const premium = conta('premium');
    const leads = conta('lead');
    const aprovados = convidados + premium;
    const teto = ev?.capacity || 0;
    const comSeguidores = lista.filter((i) => i.instagram_seguidores != null).length;

    const termo = busca.trim().toLowerCase();
    let filtrada = lista.filter((i) => {
      const classe = i.classificacao || null;
      const passaFiltro =
        filtro === 'todas' ||
        (filtro === 'pendentes' && classe === null) ||
        filtro === classe;
      if (!passaFiltro) return false;
      if (!termo) return true;
      return [i.nome, i.email, i.instagram, i.profissao, i.estado, i.phone]
        .some((v) => String(v || '').toLowerCase().includes(termo));
    });

    // Ordenar por alcance é o que transforma a lista em fila de decisão:
    // quem tem mais público primeiro. Sem seguidores conhecidos vai para o
    // fim — não para o topo com zero, que seria mentira.
    if (ordem === 'alcance') {
      filtrada = filtrada.slice().sort((a, b) => {
        const sa = a.instagram_seguidores, sb = b.instagram_seguidores;
        if (sa == null && sb == null) return 0;
        if (sa == null) return 1;
        if (sb == null) return -1;
        return sb - sa;
      });
    }

    setContent(
      view,

      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', { class: 'page-title' }, 'Triagem de aplicações'),
          h('div', { class: 'page-sub' },
            ev
              ? `${ev.name} · ${fmtDate(ev.event_date + 'T00:00:00')} · ${ev.venue || ''}${ev.city ? ' · ' + ev.city : ''}`
              : 'Aplicações recebidas pelo formulário.')
        ),
        h('div', { class: 'page-actions' },
          h('button', {
            class: 'btn btn-secondary',
            onclick: (e) => atualizaSeguidores(e.currentTarget)
          }, 'Buscar seguidores'),
          h('button', {
            class: 'btn btn-secondary',
            onclick: () => pageTriagem(view, ctx)
          }, 'Atualizar')
        )
      ),

      bannerDoEnvio(envio),

      h('div', { class: 'pes-stats' },
        estat('Aplicações', lista.length, 'recebidas pelo formulário'),
        estat('Sem classificar', pendentes,
          pendentes ? 'ninguém foi avisado ainda' : 'fila zerada',
          pendentes ? 'alerta' : ''),
        estat('Aprovados', aprovados, `${convidados} convidado · ${premium} premium`, 'destaque'),
        estat('Leads', leads, 'ficam na base para a próxima'),
        teto
          ? estat('Lugares livres', Math.max(0, teto - aprovados), `teto de ${teto} presenciais`)
          : null
      ),

      h('div', { class: 'table-card' },
        h('div', { class: 'table-toolbar' },
          h('div', { class: 'toolbar-search' },
            icons.search(),
            h('input', {
              type: 'text',
              placeholder: 'Buscar por nome, profissão, @, e-mail ou estado...',
              value: busca,
              oninput: (e) => { busca = e.target.value; render(); }
            })
          ),
          h('div', { class: 'exp-chips', style: { marginLeft: 'auto' } },
            aba('pendentes', 'Sem classificar', pendentes),
            aba('convidado', 'Convidados', convidados),
            aba('premium', 'Premium', premium),
            aba('lead', 'Leads', leads),
            aba('todas', 'Todas', lista.length)
          )
        ),

        h('div', { class: 'table-toolbar', style: { borderTop: 'none', paddingTop: '0' } },
          h('div', { class: 'exp-chips' },
            h('button', {
              class: 'exp-chip' + (ordem === 'recentes' ? ' on' : ''),
              onclick: () => { ordem = 'recentes'; render(); }
            }, 'Mais recentes'),
            h('button', {
              class: 'exp-chip' + (ordem === 'alcance' ? ' on' : ''),
              onclick: () => { ordem = 'alcance'; render(); }
            }, 'Maior alcance')
          ),
          h('div', { style: { marginLeft: 'auto', fontSize: '12px', color: 'var(--ink-mute)' } },
            comSeguidores
              ? `seguidores conhecidos de ${comSeguidores} de ${lista.length}`
              : 'seguidores ainda não coletados')
        ),

        filtrada.length === 0
          ? h('div', { class: 'loading-row' },
              termo
                ? 'Nenhuma aplicação casa com essa busca.'
                : filtro === 'pendentes'
                  ? 'Nenhuma aplicação esperando decisão.'
                  : 'Nada nesta lista.')
          : h('table', { class: 'table' },
              h('thead', {},
                h('tr', {},
                  h('th', { style: { width: '22%' } }, 'Quem aplicou'),
                  h('th', {}, 'Instagram'),
                  h('th', {}, 'Contato'),
                  h('th', {}, 'Perfil'),
                  h('th', {}, 'Situação'),
                  h('th', { style: { width: '22%' } }, 'Decisão')
                )
              ),
              h('tbody', {}, ...filtrada.map(linha))
            )
      )
    );
  }

  function estat(rot, val, sub, variante) {
    return h('div', { class: 'pes-stat' + (variante ? ' ' + variante : '') },
      h('div', { class: 'pes-stat-rot' }, rot),
      h('div', { class: 'pes-stat-val' }, String(val)),
      sub ? h('div', { class: 'pes-stat-sub' }, sub) : null);
  }

  function aba(key, rot, n) {
    return h('button', {
      class: 'exp-chip' + (filtro === key ? ' on' : ''),
      onclick: () => { filtro = key; render(); }
    }, rot, h('span', { class: 'exp-chip-n' }, String(n)));
  }

  // A célula do Instagram. Três estados possíveis, e cada um significa
  // uma coisa diferente na hora de decidir:
  //   handle + número   conta profissional, alcance conhecido
  //   handle sem número conta pessoal ou ainda não coletada
  //   sem handle        a pessoa não digitou um @ utilizável
  function celulaInstagram(i) {
    if (!i.instagram_handle) {
      return h('div', {},
        h('div', { class: 'row-sub' }, i.instagram || '—'),
        h('div', { class: 'row-sub', style: { color: 'var(--ink-mute)' } }, 'sem @ utilizável'));
    }
    const seg = seguidoresBonito(i.instagram_seguidores);
    return h('div', {},
      h('a', {
        href: 'https://instagram.com/' + i.instagram_handle,
        target: '_blank',
        rel: 'noopener',
        style: { fontSize: '13px', fontWeight: '600', color: 'var(--violet)', textDecoration: 'none' }
      }, '@' + i.instagram_handle, h('span', { 'aria-hidden': 'true' }, ' ↗')),
      seg
        ? h('div', { class: 'row-sub mono', style: { fontWeight: '600' } }, seg + ' seguidores')
        : h('div', { class: 'row-sub', style: { color: 'var(--ink-mute)' } },
            i.instagram_erro ? 'alcance não disponível' : 'alcance não coletado')
    );
  }

  function linha(i) {
    const classe = i.classificacao || null;
    const cfg = classe ? POR_CHAVE[classe] : null;

    return h('tr', {},
      h('td', {},
        h('div', { class: 'row-name' }, i.nome || 'Sem nome'),
        i.profissao
          ? h('div', { class: 'row-sub' }, i.profissao)
          : h('div', { class: 'row-sub', style: { color: 'var(--ink-mute)' } }, 'profissão não informada')
      ),
      h('td', {}, celulaInstagram(i)),
      h('td', {},
        h('div', { style: { fontSize: '13px' } }, i.email || '—'),
        i.sem_telefone
          ? h('div', { class: 'row-sub', style: { color: 'var(--amber)' } },
              'telefone recusado' + (i.telefone_bruto ? ' · ' + i.telefone_bruto : ''))
          : h('div', { class: 'row-sub mono' }, telefoneBonito(i.phone))
      ),
      h('td', {},
        h('div', { style: { fontSize: '13px' } }, i.faturamento || '—'),
        i.estado ? h('div', { class: 'row-sub' }, i.estado) : null
      ),
      h('td', {},
        cfg
          ? h('div', {},
              h('span', { class: 'status ' + cfg.cls }, cfg.rot),
              h('div', { class: 'row-sub' },
                i.checked
                  ? 'presente no evento'
                  : i.ja_recebeu_whatsapp
                    ? 'ingresso enviado'
                    : classe === 'lead'
                      ? 'sem mensagem, por decisão'
                      : 'na fila de envio')
            )
          : h('div', {},
              h('span', { class: 'status warn' }, 'Esperando'),
              h('div', { class: 'row-sub' }, 'aplicou ' + fmtRelative(i.created_at))
            )
      ),
      h('td', {},
        h('div', { class: 'btn-row', style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
          ...CLASSES.map((c) => h('button', {
            class: 'btn btn-sm ' + (classe === c.key ? 'btn-primary' : 'btn-ghost'),
            disabled: classe === c.key,
            onclick: (e) => decide(i, c.key, e.currentTarget)
          }, c.rot))
        )
      )
    );
  }

  // Trazer os seguidores é uma ida à API da Meta por perfil. Em lote, com
  // teto, e só de quem ainda não foi conferido — a cota da Graph API é
  // finita e perfil conferido esta semana não muda de ordem de grandeza.
  async function atualizaSeguidores(botao) {
    const rotulo = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Buscando...';
    try {
      const r = await chama(`${API_INSTA}?limite=100`);
      toast.success(
        `${r.processados} perfis conferidos · ${r.com_seguidores} com alcance conhecido` +
        (r.sem_dado ? ` · ${r.sem_dado} sem dado (conta pessoal ou @ errado)` : '')
      );
      pageTriagem(view, ctx);
    } catch (e) {
      const m = String(e.message || e);
      if (/credenciais/i.test(m)) {
        toast.warn('Falta ligar a conta do Instagram da Science Play. A triagem funciona sem isso; só o número de seguidores fica vazio.');
      } else {
        toast.danger('Não consegui buscar os seguidores: ' + m);
      }
      botao.disabled = false;
      botao.textContent = rotulo;
    }
  }

  // Trocar a classificação de quem já recebeu o ingresso não é a mesma
  // coisa que classificar quem está esperando: a mensagem já saiu. Então
  // pergunta antes — e só nesse caso, para não encher de modal a triagem
  // normal, que é clique em sequência.
  function decide(item, classe, botao) {
    const atual = item.classificacao || null;
    if (atual && (item.ja_recebeu_whatsapp || item.checked)) {
      openModal({
        title: 'Trocar a classificação de quem já recebeu?',
        body: h('div', {},
          h('p', {}, `${item.nome} já está como ${POR_CHAVE[atual]?.rot || atual} e já recebeu o ingresso.`),
          h('p', {},
            classe === 'lead'
              ? 'Marcar como Lead não cancela o ingresso que já está no celular dela. ' +
                'Se a pessoa não pode mais entrar, avise na portaria também.'
              : 'A classificação muda aqui e no RD, mas o sistema NÃO manda mensagem de novo — ' +
                'o ingresso que está no celular dela continua sendo o antigo.')
        ),
        actions: [
          { label: 'Deixar como está', kind: 'btn-secondary', onClick: (fecha) => fecha() },
          {
            label: 'Trocar mesmo assim',
            kind: 'btn-primary',
            onClick: (fecha) => { fecha(); aplica(item, classe, botao); }
          }
        ]
      });
      return;
    }
    aplica(item, classe, botao);
  }

  async function aplica(item, classe, botao) {
    const antes = item.classificacao || null;
    if (botao) botao.disabled = true;
    // Otimista na tela, confirmado no servidor. Triagem é clique em
    // sequência: esperar a volta da rede a cada linha transforma 76
    // decisões em 76 esperas.
    item.classificacao = classe;
    render();
    try {
      const r = await chama(API, {
        method: 'POST',
        body: JSON.stringify({ id: item.id, classificacao: classe })
      });
      if (r.rd) {
        toast.success(`${item.nome}: ${POR_CHAVE[classe].rot} · tag ${r.rd} no RD`);
      } else {
        // Classificou no banco mas não marcou no RD. Isso não é detalhe:
        // a automação de e-mail do RD não vai disparar para essa pessoa.
        toast.warn(
          `${item.nome}: ${POR_CHAVE[classe].rot} salvo, mas o RD não aceitou a tag` +
          (r.rd_erro ? ' (' + r.rd_erro + ')' : '') + '. Confira a automação.'
        );
      }
    } catch (e) {
      item.classificacao = antes;
      render();
      toast.danger('Não deu para classificar: ' + (e.message || e));
    }
  }

  render();
}

// O estado do disparo, em cima de tudo. Três situações possíveis e cada
// uma muda o que o clique em "Convidado" significa na vida real.
function bannerDoEnvio(envio) {
  if (!envio.armado) {
    return h('div', { class: 'test-banner' },
      h('div', { class: 'test-banner-icon' }, '⏸'),
      h('div', { class: 'test-banner-main' },
        h('div', { class: 'test-banner-title' }, 'Disparo desarmado'),
        h('div', { class: 'test-banner-sub' },
          'Pode classificar à vontade: ninguém recebe mensagem agora. ' +
          'A classificação fica guardada e o ingresso sai quando o disparo for armado.')
      )
    );
  }
  if (envio.lista_teste.length) {
    return h('div', { class: 'test-banner' },
      h('div', { class: 'test-banner-icon' }, '🧪'),
      h('div', { class: 'test-banner-main' },
        h('div', { class: 'test-banner-title' },
          `Lista de teste ativa · ${envio.lista_teste.length} e-mail${envio.lista_teste.length > 1 ? 's' : ''}`),
        h('div', { class: 'test-banner-sub' },
          'Só estes endereços recebem WhatsApp ao serem aprovados: ' +
          envio.lista_teste.join(', ') + '. ' +
          'Todo o resto é classificado e fica esperando — ninguém mais é avisado ' +
          'enquanto a lista existir.')
      )
    );
  }
  return h('div', { class: 'test-banner' },
    h('div', { class: 'test-banner-icon' }, '📣'),
    h('div', { class: 'test-banner-main' },
      h('div', { class: 'test-banner-title' }, 'Disparo ao vivo'),
      h('div', { class: 'test-banner-sub' },
        'Quem você marcar como Convidado ou Premium recebe o WhatsApp com o ' +
        'ingresso em até dois minutos. Lead não recebe nada.')
    )
  );
}
