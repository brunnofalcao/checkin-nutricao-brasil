// =====================================================================
// ATENDIMENTO — a fila que a Kcal passou para humano
//
// Ordenada por quem espera há mais tempo, não por quem chegou por último:
// a pessoa esquecida há 13 dias tem que estar no topo, não no fim.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import {
  listaFila, conversa, resolve, reabre,
  motivoRot, ehUrgente, esperaRot, telRot, linkWa, MOTIVOS
} from '../data/atendimento.js';

export async function pageAtendimento(view) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));

  let fila = [];
  let motivo = '';   // '' = todos

  try {
    fila = await listaFila();
  } catch (e) {
    setContent(view, h('div', { class: 'empty' },
      h('div', { class: 'empty-icon' }, icons.alert()),
      h('div', { class: 'empty-title' }, 'Não deu para carregar a fila'),
      h('div', { class: 'empty-body' }, e.message || ''),
      h('button', { class: 'btn btn-secondary', onclick: () => location.reload() }, 'Recarregar')));
    return;
  }

  // `avisa` só quando o clique foi do usuário: recarregar depois de resolver
  // já tem o toast da própria ação, e dois toques seguidos viram ruído.
  async function recarrega({ avisa = false } = {}) {
    const antes = fila.length;
    try {
      fila = await listaFila();
      render();
      if (!avisa) return;
      const dif = fila.length - antes;
      toast.info(
        dif > 0 ? `${dif} nova${dif > 1 ? 's' : ''} na fila — ${fila.length} no total`
        : dif < 0 ? `${-dif} saíram — ${fila.length} ainda esperando`
        : fila.length ? `Sem novidade — ${fila.length} esperando` : 'Fila vazia'
      );
    } catch (e) { toast.danger(e.message); }
  }

  function visiveis() {
    return motivo ? fila.filter((c) => (c.escal_motivo || 'outro') === motivo) : fila;
  }

  function render() {
    const lista = visiveis();
    const urgentes = fila.filter(ehUrgente).length;
    const velha = fila[0];

    setContent(view,
      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', { class: 'page-title' }, 'Atendimento'),
          h('div', { class: 'page-sub' },
            'Conversas que a Kcal passou para uma pessoa. Ela para de responder ' +
            'nessas até alguém marcar como resolvida.')),
        h('div', { class: 'page-actions' },
          h('button', { class: 'btn btn-secondary', onclick: () => recarrega({ avisa: true }) }, 'Atualizar'))),

      fila.length
        ? h('div', { class: 'at-resumo' },
            cartao('Na fila', String(fila.length), fila.length > 5 ? 'alerta' : ''),
            cartao('Precisam de resposta hoje', String(urgentes), urgentes ? 'alerta' : ''),
            cartao('Espera mais longa', velha ? esperaRot(velha.horas_esperando) : '—',
              velha && velha.horas_esperando > 48 ? 'alerta' : ''))
        : null,

      fila.length
        ? h('div', { class: 'at-filtros' },
            chip('Todos', '', fila.length),
            ...Object.keys(MOTIVOS)
              .map((k) => [k, fila.filter((c) => (c.escal_motivo || 'outro') === k).length])
              .filter(([, n]) => n > 0)
              .map(([k, n]) => chip(motivoRot(k), k, n)))
        : null,

      lista.length
        ? h('div', { class: 'at-lista' }, ...lista.map(linha))
        : h('div', { class: 'empty' },
            h('div', { class: 'empty-icon' }, icons.check()),
            h('div', { class: 'empty-title' }, fila.length ? 'Nada neste filtro' : 'Fila vazia'),
            h('div', { class: 'empty-body' },
              fila.length
                ? 'Nenhuma conversa com esse motivo.'
                : 'Ninguém esperando. A Kcal está dando conta sozinha.'))
    );
  }

  function cartao(rot, valor, classe) {
    return h('div', { class: 'at-card ' + (classe || '') },
      h('div', { class: 'at-card-rot' }, rot),
      h('div', { class: 'at-card-num mono' }, valor));
  }

  function chip(rot, valor, n) {
    return h('button', {
      class: 'at-chip' + (motivo === valor ? ' on' : ''),
      onclick: () => { motivo = valor; render(); }
    }, rot, h('span', { class: 'at-chip-n' }, String(n)));
  }

  function linha(c) {
    const urgente = ehUrgente(c);
    return h('div', { class: 'at-item' + (urgente ? ' urgente' : '') },
      h('div', { class: 'at-item-corpo', onclick: () => abre(c) },
        h('div', { class: 'at-item-topo' },
          h('span', { class: 'at-nome' }, c.nome || telRot(c.phone)),
          h('span', { class: 'at-motivo' }, motivoRot(c.escal_motivo)),
          h('span', { class: 'at-espera' + (urgente ? ' urgente' : '') },
            esperaRot(c.horas_esperando))),
        h('div', { class: 'at-pergunta' }, c.ultima_pergunta || '(sem mensagem)'),
        c.nome ? h('div', { class: 'at-tel mono' }, telRot(c.phone)) : null),
      h('div', { class: 'at-item-acoes' },
        h('a', {
          class: 'btn btn-secondary', href: linkWa(c.phone), target: '_blank', rel: 'noopener',
          onclick: (e) => e.stopPropagation()
        }, 'Abrir WhatsApp'),
        h('button', { class: 'btn btn-primary', onclick: () => marcaResolvida(c) }, 'Resolvida')));
  }

  async function abre(c) {
    let msgs = [];
    try { msgs = await conversa(c.id); }
    catch (e) { return toast.danger(e.message); }

    openModal({
      title: c.nome || telRot(c.phone),
      body: h('div', {},
        h('div', { class: 'at-modal-topo' },
          h('span', { class: 'at-motivo' }, motivoRot(c.escal_motivo)),
          h('span', { class: 'at-espera urgente' }, 'esperando ' + esperaRot(c.horas_esperando)),
          h('a', { class: 'at-link', href: linkWa(c.phone), target: '_blank', rel: 'noopener' },
            telRot(c.phone))),
        h('div', { class: 'at-conversa' }, ...msgs.map((m) =>
          h('div', { class: 'at-bolha ' + (m.role === 'user' ? 'deles' : 'nossa') },
            h('div', { class: 'at-bolha-txt' }, m.content),
            h('div', { class: 'at-bolha-hora' },
              new Date(m.created_at).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
              })))))),
      actions: [
        { label: 'Fechar', kind: 'btn-ghost', onClick: (fechar) => fechar() },
        {
          label: 'Abrir WhatsApp', kind: 'btn-secondary',
          onClick: () => window.open(linkWa(c.phone), '_blank', 'noopener')
        },
        {
          label: 'Marcar resolvida', kind: 'btn-primary',
          onClick: (fechar) => { fechar(); marcaResolvida(c); }
        }
      ]
    });
  }

  // Resolver devolve a conversa para a Kcal. Se o assunto for daqueles que
  // ela nunca vai resolver, dá para deixar travado — mas aí sai da fila e
  // fica registrado que alguém decidiu isso.
  function marcaResolvida(c) {
    openModal({
      title: 'Marcar como resolvida',
      body: h('div', {},
        h('p', { class: 'kb-del-warn' },
          'Some da fila e a Kcal ', h('strong', {}, 'volta a responder'),
          ' esta pessoa normalmente.'),
        h('p', { class: 'kb-del-warn muted' },
          'Se o assunto ainda estiver aberto com o time, use "Resolvida, mas sem bot" — ' +
          'ela sai da fila e a Kcal continua calada.')),
      actions: [
        { label: 'Cancelar', kind: 'btn-ghost', onClick: (fechar) => fechar() },
        {
          label: 'Resolvida, sem bot', kind: 'btn-ghost',
          onClick: (fechar) => { fechar(); aplica(c, false); }
        },
        {
          label: 'Resolvida', kind: 'btn-primary',
          onClick: (fechar) => { fechar(); aplica(c, true); }
        }
      ]
    });
  }

  async function aplica(c, voltaBot) {
    try {
      await resolve(c.id, voltaBot);
      toast.success(
        (c.nome || telRot(c.phone)) +
        (voltaBot ? ' — resolvida, Kcal volta a responder.' : ' — resolvida, Kcal segue calada.'),
        {
          acao: {
            label: 'Desfazer',
            onClick: async () => {
              try { await reabre(c.id); await recarrega(); toast.success('Voltou para a fila.'); }
              catch (e) { toast.danger(e.message); }
            }
          }
        }
      );
      await recarrega();
    } catch (e) { toast.danger(e.message); }
  }

  render();
}
