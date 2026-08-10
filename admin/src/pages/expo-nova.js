// =====================================================================
// NOVA EMPRESA EXPOSITORA · uma por vez
//
// O lote resolve a planilha do comercial no começo da temporada. Só que
// expositor entra até a véspera: fecha estande na quinta, quer o link na
// sexta. Para isso, abrir a tela de lote e colar uma linha só é caminho
// torto. Aqui é o caminho reto — nome, credenciais, e sai com o link e a
// mensagem prontos para colar no WhatsApp do contato.
//
// Regra de ouro da tela: ninguém sai daqui sem o link na mão. Criar o
// convite e não entregar o link é criar trabalho, não resolver.
// =====================================================================
import { h } from '../core/dom.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { supabase } from '../data/supabase.js';
import { mensagemConvite } from './expo-lote.js';

const BASE_FORM = 'https://checkin.nutricaobrasil.com.br/expositor-cadastro-time?e=';

function copia(txt, msg) {
  navigator.clipboard
    .writeText(txt)
    .then(() => toast.success(msg))
    .catch(() => toast.danger('Não consegui copiar.'));
}

// abreNovaEmpresa({ eventId, evento, jaExistentes, prazoPadrao, aoTerminar })
export function abreNovaEmpresa({
  eventId,
  evento,
  jaExistentes = [],
  prazoPadrao = '',
  aoTerminar
} = {}) {
  let cEmpresa, cCred, cCota, cEstande, cPrazo;
  let alerta;
  let salvando = false;

  const nomesUsados = new Set(
    jaExistentes.map((x) => (x.empresa || '').trim().toLowerCase()).filter(Boolean)
  );

  // Aviso de nome repetido aparece enquanto digita, não depois de salvar.
  // Dois convites para a mesma empresa = comercial mandando o código errado.
  function confereNome() {
    if (!alerta) return;
    const nome = (cEmpresa?.value || '').trim().toLowerCase();
    const repetido = nome && nomesUsados.has(nome);
    alerta.style.display = repetido ? '' : 'none';
  }

  const modal = openModal({
    title: 'Nova empresa expositora',
    body: () => {
      const wrap = h(
        'div',
        { class: 'expo-nova' },

        h(
          'p',
          { class: 'page-sub', style: { margin: '0 0 18px' } },
          'Cria o convite de uma empresa. No fim você recebe o código, o link do ' +
            'formulário e a mensagem pronta para mandar ao contato dela.'
        ),

        h(
          'div',
          { class: 'campo' },
          h('label', { class: 'campo-rot', for: 'nv-empresa' }, 'Nome da empresa'),
          h('input', {
            id: 'nv-empresa',
            class: 'input',
            type: 'text',
            autocomplete: 'off',
            placeholder: 'como deve aparecer no crachá da equipe',
            onInput: confereNome,
            ref: (el) => (cEmpresa = el)
          }),
          h(
            'div',
            {
              class: 'campo-aviso',
              style: { display: 'none' },
              ref: (el) => (alerta = el)
            },
            'Já existe um convite com esse nome. Se for a mesma empresa, use o ' +
              'código que já existe em vez de criar outro.'
          )
        ),

        h(
          'div',
          { class: 'nv-linha' },
          h(
            'div',
            { class: 'campo' },
            h('label', { class: 'campo-rot', for: 'nv-cred' }, 'Nº de credenciais'),
            h('input', {
              id: 'nv-cred',
              class: 'input',
              type: 'number',
              min: '1',
              max: '200',
              value: '5',
              ref: (el) => (cCred = el)
            }),
            h('div', { class: 'campo-dica' }, 'Quantos crachás a empresa pode gerar.')
          ),
          h(
            'div',
            { class: 'campo' },
            h('label', { class: 'campo-rot', for: 'nv-cota' }, 'Cota'),
            h('input', {
              id: 'nv-cota',
              class: 'input',
              type: 'text',
              autocomplete: 'off',
              placeholder: 'Diamante, Ouro…',
              ref: (el) => (cCota = el)
            }),
            h('div', { class: 'campo-dica' }, 'Opcional.')
          ),
          h(
            'div',
            { class: 'campo' },
            h('label', { class: 'campo-rot', for: 'nv-estande' }, 'Estande'),
            h('input', {
              id: 'nv-estande',
              class: 'input',
              type: 'text',
              autocomplete: 'off',
              placeholder: 'ex: 12',
              ref: (el) => (cEstande = el)
            }),
            h('div', { class: 'campo-dica' }, 'Opcional. Dá para preencher depois.')
          )
        ),

        h(
          'div',
          { class: 'campo' },
          h(
            'label',
            { class: 'campo-rot', for: 'nv-prazo' },
            'Prazo para a empresa preencher'
          ),
          h('input', {
            id: 'nv-prazo',
            class: 'input',
            type: 'text',
            value: prazoPadrao,
            placeholder: 'ex: 20 de agosto — deixe vazio para não citar prazo',
            ref: (el) => (cPrazo = el)
          }),
          h(
            'div',
            { class: 'campo-dica' },
            'Entra na mensagem. Depois do prazo o crachá sai impresso no balcão, na hora.'
          )
        )
      );

      requestAnimationFrame(() => cEmpresa?.focus());
      return wrap;
    },
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (fechar) => fechar() },
      {
        label: 'Criar e gerar link',
        kind: 'btn-primary',
        onClick: async () => {
          if (salvando) return;

          const empresa = (cEmpresa.value || '').trim();
          const limite = parseInt(cCred.value, 10);
          const cota = (cCota.value || '').trim() || null;
          const estande = (cEstande.value || '').trim() || null;
          const prazo = (cPrazo.value || '').trim();

          if (!empresa) {
            toast.danger('Falta o nome da empresa.');
            cEmpresa.focus();
            return;
          }
          if (!limite || limite < 1) {
            toast.danger('O número de credenciais precisa ser maior que zero.');
            cCred.focus();
            return;
          }

          salvando = true;
          try {
            const { data, error } = await supabase.rpc('expo_gera_convite', {
              p_event_id: eventId,
              p_empresa: empresa,
              p_limite: limite,
              p_cota: cota
            });
            if (error) throw error;

            // expo_gera_convite não recebe estande — grava logo em seguida.
            // Se esse update falhar, o convite continua válido: estande é
            // etiqueta, não permissão. Avisa e segue.
            if (estande) {
              const up = await supabase
                .from('exhibitors')
                .update({ estande })
                .eq('id', data.id);
              if (up.error) toast.danger('Convite criado, mas o estande não gravou.');
            }

            modal.close();
            aoTerminar?.();
            mostraResultado(
              { empresa, estande, cota, limite, codigo: data.codigo, id: data.id },
              { evento, prazo },
              // "Criar outra" volta com os mesmos padrões — quem cadastra
              // cinco empresas seguidas não quer reabrir menu cinco vezes.
              () =>
                abreNovaEmpresa({
                  eventId,
                  evento,
                  jaExistentes: [...jaExistentes, { empresa }],
                  prazoPadrao: prazo,
                  aoTerminar
                })
            );
          } catch (e) {
            toast.danger(e.message || String(e));
          } finally {
            salvando = false;
          }
        }
      }
    ]
  });
}

// ── o que a pessoa leva daqui ────────────────────────────────────────
function mostraResultado(x, ctx, aoCriarOutra) {
  const link = BASE_FORM + x.codigo;
  const msg = mensagemConvite(x, ctx);

  openModal({
    title: x.empresa + ' · convite criado',
    body: h(
      'div',
      { class: 'expo-nova' },

      h(
        'div',
        { class: 'nv-codigo-box' },
        h('div', { class: 'campo-rot' }, 'Código da empresa'),
        h('div', { class: 'nv-codigo mono' }, x.codigo),
        h(
          'div',
          { class: 'row-sub' },
          `${x.limite} ${x.limite === 1 ? 'credencial' : 'credenciais'}` +
            (x.cota ? ' · ' + x.cota : '') +
            (x.estande ? ' · estande ' + x.estande : '')
        )
      ),

      h('label', { class: 'campo-rot' }, 'Link do formulário'),
      h('div', { class: 'exp-link-box mono' }, link),

      h(
        'div',
        { class: 'lote-acoes' },
        h(
          'button',
          {
            class: 'btn btn-primary',
            onclick: () => copia(msg, 'Mensagem copiada. É só colar no WhatsApp.')
          },
          'Copiar mensagem'
        ),
        h(
          'button',
          { class: 'btn btn-secondary', onclick: () => copia(link, 'Link copiado.') },
          'Copiar link'
        ),
        h(
          'a',
          {
            class: 'btn btn-ghost',
            href: 'https://wa.me/?text=' + encodeURIComponent(msg),
            target: '_blank',
            rel: 'noopener'
          },
          'WhatsApp'
        )
      ),

      h('label', { class: 'campo-rot', style: { marginTop: '18px' } }, 'Prévia da mensagem'),
      h('div', { class: 'nv-previa' }, msg)
    ),
    actions: [
      {
        label: '+ Criar outra',
        kind: 'btn-ghost',
        onClick: (fechar) => {
          fechar();
          aoCriarOutra?.();
        }
      },
      { label: 'Pronto', kind: 'btn-primary', onClick: (fechar) => fechar() }
    ]
  });
}
