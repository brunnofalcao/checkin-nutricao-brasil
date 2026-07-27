// =====================================================================
// ADICIONAR PESSOA
//
// Um único formulário, usado em dois lugares: na tela de Pessoas (escolhe
// o evento) e dentro de um evento (evento já travado). A regra que importa
// é uma só: antes de criar, procurar. Duplicata no balcão é fila parada.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { normalizePhone } from '../core/utils.js';
import {
  criaInscricao,
  geraTokensCertificado,
  procuraParecidos,
  soDigitos
} from '../data/pessoas.js';
import { checkinParticipant } from '../data/participants.js';

const TIPO_ROTULO = {
  congress: 'Congresso',
  race: 'Corrida',
  exhibitor: 'Exposição',
  visitor: 'Visitante'
};

// abreAdicionarPessoa({ eventos, eventoId, pessoas, lotes, comCertificado, aoCriar })
//   eventos        : lista completa de eventos (para o seletor)
//   eventoId       : se vier, o evento fica travado
//   pessoas        : base já agrupada, para checar duplicata sem ir ao servidor
//   comCertificado : Set de event_id que têm certificado configurado
//   aoCriar(linha) : callback com a inscrição criada
export function abreAdicionarPessoa({
  eventos = [],
  eventoId = null,
  pessoas = [],
  comCertificado = new Set(),
  preencher = null,
  aoCriar
} = {}) {
  const abertos = eventos.filter((e) => e.status !== 'encerrado');
  const lista = abertos.length ? abertos : eventos;

  const form = {
    event_id: eventoId || lista[0]?.id || '',
    name: preencher?.name || '',
    phone: preencher?.phone || '',
    email: preencher?.email || '',
    lote: '',
    notes: '',
    presenca: false
  };

  let caixaAlerta;
  let salvando = false;

  // Lotes que já existem no evento escolhido — evita inventar nome de lote.
  function lotesDo(evId) {
    const set = new Set();
    pessoas.forEach((pe) =>
      pe.inscricoes.forEach((i) => {
        if (i.event_id === evId && i.lote) set.add(i.lote);
      })
    );
    return [...set].sort();
  }

  function eventoAtual() {
    return eventos.find((e) => e.id === form.event_id) || null;
  }

  // ── Duplicata ──────────────────────────────────────────────────────────────
  // Roda a cada digitada. Barra só o caso real (mesma pessoa, mesmo evento).
  function revisaDuplicata() {
    if (!caixaAlerta) return { trava: false };
    const achados = procuraParecidos(pessoas, form, form.event_id);
    setContent(caixaAlerta);
    if (!achados.length) return { trava: false };

    const noEvento = achados.filter((a) => a.noEvento);
    const fora = achados.filter((a) => !a.noEvento);

    if (noEvento.length) {
      const a = noEvento[0];
      const insc = a.pessoa.inscricoes.find((i) => i.event_id === form.event_id);
      setContent(
        caixaAlerta,
        h(
          'div',
          { class: 'pn-alerta trava' },
          h('div', { class: 'pn-alerta-icone' }, icons.alert()),
          h(
            'div',
            {},
            h('div', { class: 'pn-alerta-titulo' }, 'Essa pessoa já está inscrita neste evento'),
            h(
              'div',
              { class: 'pn-alerta-texto' },
              `${a.pessoa.nome}${insc?.lote ? ' · ' + (/^lote/i.test(insc.lote) ? insc.lote : 'lote ' + insc.lote) : ''}${
                insc?.checked ? ' · presença já confirmada' : ' · presença pendente'
              }. Cadastrar de novo cria duplicata e quebra a contagem do dia.`
            )
          )
        )
      );
      return { trava: true };
    }

    const a = fora[0];
    const onde = a.pessoa.inscricoes
      .map((i) => i.evento?.city || i.evento?.name || '')
      .filter(Boolean);
    setContent(
      caixaAlerta,
      h(
        'div',
        { class: 'pn-alerta' },
        h('div', { class: 'pn-alerta-icone' }, icons.info()),
        h(
          'div',
          { style: { flex: '1' } },
          h('div', { class: 'pn-alerta-titulo' }, 'Já temos essa pessoa na base'),
          h(
            'div',
            { class: 'pn-alerta-texto' },
            `${a.pessoa.nome} — ${[...new Set(onde)].join(', ') || 'outro evento'}. ` +
              `Bateu pelo ${a.motivo === 'email' ? 'e-mail' : a.motivo === 'telefone' ? 'telefone' : 'nome'}.`
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost btn-sm',
              style: { marginTop: '8px' },
              onclick: () => {
                form.name = a.pessoa.nome;
                form.email = a.pessoa.email || form.email;
                form.phone = a.pessoa.phone || form.phone;
                desenha();
              }
            },
            'Usar os dados dela'
          )
        )
      )
    );
    return { trava: false };
  }

  // ── Formulário ─────────────────────────────────────────────────────────────
  let campos;

  function desenha() {
    if (!campos) return;
    const ev = eventoAtual();
    const lotes = lotesDo(form.event_id);
    setContent(
      campos,

      // Evento
      eventoId
        ? h(
            'div',
            { class: 'pn-evento-fixo' },
            h('span', { class: 'status soon' }, TIPO_ROTULO[ev?.event_type] || 'Evento'),
            h('strong', {}, ev?.name || 'Evento')
          )
        : h(
            'div',
            { class: 'field' },
            h('label', { for: 'pn-ev' }, 'Evento'),
            h(
              'select',
              {
                id: 'pn-ev',
                class: 'input',
                onchange: (e) => {
                  form.event_id = e.target.value;
                  desenha();
                  revisaDuplicata();
                }
              },
              ...lista.map((e) =>
                h(
                  'option',
                  { value: e.id, selected: e.id === form.event_id || null },
                  `${e.name}${e.event_type && e.event_type !== 'congress' ? ' · ' + (TIPO_ROTULO[e.event_type] || e.event_type) : ''}`
                )
              )
            )
          ),

      // Nome
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'pn-nome' }, 'Nome completo'),
        h('input', {
          id: 'pn-nome',
          class: 'input',
          type: 'text',
          autocomplete: 'off',
          placeholder: 'Como vai sair no crachá e no certificado',
          value: form.name,
          oninput: (e) => {
            form.name = e.target.value;
            revisaDuplicata();
          }
        }),
        h('div', { class: 'pn-dica' }, 'Sai exatamente assim no crachá e no certificado.')
      ),

      // Contato
      h(
        'div',
        { class: 'pn-linha' },
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'pn-tel' }, 'WhatsApp'),
          h('input', {
            id: 'pn-tel',
            class: 'input',
            type: 'tel',
            inputmode: 'tel',
            autocomplete: 'off',
            placeholder: '(61) 99999-0000',
            value: form.phone,
            oninput: (e) => {
              form.phone = e.target.value;
              revisaDuplicata();
            },
            onblur: (e) => {
              const n = normalizePhone(e.target.value);
              if (n) {
                form.phone = n;
                e.target.value = n;
              }
            }
          })
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'pn-mail' }, 'E-mail'),
          h('input', {
            id: 'pn-mail',
            class: 'input',
            type: 'email',
            autocomplete: 'off',
            placeholder: 'nome@email.com',
            value: form.email,
            oninput: (e) => {
              form.email = e.target.value.trim();
              revisaDuplicata();
            }
          })
        )
      ),
      h(
        'div',
        { class: 'pn-dica', style: { marginTop: '-8px', marginBottom: '16px' } },
        comCertificado.has(form.event_id)
          ? 'O e-mail é o que carrega o certificado. Sem ele a pessoa entra, mas não recebe o link.'
          : 'Preencha pelo menos um dos dois. O WhatsApp é o canal que a gente usa de verdade.'
      ),

      // Lote + observação
      h(
        'div',
        { class: 'pn-linha' },
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'pn-lote' }, 'Lote'),
          h('input', {
            id: 'pn-lote',
            class: 'input',
            type: 'text',
            list: 'pn-lotes',
            autocomplete: 'off',
            placeholder: lotes[0] ? `ex: ${lotes[0]}` : 'opcional',
            value: form.lote,
            oninput: (e) => {
              form.lote = e.target.value;
            }
          }),
          h('datalist', { id: 'pn-lotes' }, ...lotes.map((l) => h('option', { value: l })))
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'pn-obs' }, 'Observação'),
          h('input', {
            id: 'pn-obs',
            class: 'input',
            type: 'text',
            autocomplete: 'off',
            placeholder: 'cortesia, imprensa, convidado…',
            value: form.notes,
            oninput: (e) => {
              form.notes = e.target.value;
            }
          })
        )
      ),

      // Presença agora
      h(
        'label',
        { class: 'pn-check' },
        h('input', {
          type: 'checkbox',
          checked: form.presenca || null,
          onchange: (e) => {
            form.presenca = e.target.checked;
          }
        }),
        h(
          'span',
          {},
          h('strong', {}, 'Já está no balcão — confirmar presença agora'),
          h(
            'span',
            { class: 'pn-dica' },
            'Marque só se a pessoa está na sua frente. Isso entra no contador oficial do evento.'
          )
        )
      )
    );
  }

  const { close } = openModal({
    title: 'Adicionar pessoa',
    body: () => {
      const wrap = h('div', { class: 'pessoa-nova' });
      caixaAlerta = h('div', { class: 'pn-alertas' });
      campos = h('div', {});
      wrap.append(caixaAlerta, campos);
      desenha();
      if (preencher) revisaDuplicata();
      requestAnimationFrame(() => {
        // Se já veio preenchido, o foco vai para o que falta escolher.
        const alvo = preencher ? '#pn-ev, #pn-lote' : '#pn-nome';
        wrap.querySelector(alvo)?.focus();
      });
      return wrap;
    },
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (fechar) => fechar() },
      {
        label: 'Adicionar',
        kind: 'btn-primary',
        onClick: async () => {
          if (salvando) return;

          const nome = form.name.trim().replace(/\s+/g, ' ');
          if (nome.length < 3) return toast.danger('Escreva o nome completo.');
          if (!form.event_id) return toast.danger('Escolha o evento.');
          const tel = normalizePhone(form.phone);
          const mail = form.email.trim().toLowerCase();
          if (!tel && !mail) return toast.danger('Preencha o WhatsApp ou o e-mail.');
          if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
            return toast.danger('Esse e-mail não parece válido.');
          }
          if (tel && soDigitos(tel).length < 12) {
            return toast.danger('O WhatsApp precisa de DDD. Ex: (61) 99999-0000.');
          }
          if (revisaDuplicata().trava) {
            return toast.danger('Essa pessoa já está inscrita neste evento.');
          }

          salvando = true;
          try {
            const linha = await criaInscricao({
              event_id: form.event_id,
              name: nome,
              phone: tel || null,
              email: mail || null,
              lote: form.lote.trim() || null,
              notes: form.notes.trim() || null
            });

            if (form.presenca) {
              try {
                await checkinParticipant(linha.id);
                linha.checked = true;
                linha.checked_at = new Date().toISOString();
              } catch (e) {
                toast.warn('Pessoa criada, mas a presença não foi marcada. Marque na lista.');
              }
            }

            // Certificado só existe onde há módulo configurado.
            if (comCertificado.has(form.event_id) && mail) {
              try {
                await geraTokensCertificado(form.event_id);
              } catch (e) {
                console.warn('token de certificado', e);
              }
            }

            toast.success(
              form.presenca ? `${nome.split(' ')[0]} adicionado e presente.` : `${nome.split(' ')[0]} adicionado.`
            );
            aoCriar?.(linha);
            close();
          } catch (e) {
            console.error(e);
            toast.danger(e.duplicado ? e.message : 'Não deu para salvar: ' + (e.message || e));
          } finally {
            salvando = false;
          }
        }
      }
    ]
  });
}
