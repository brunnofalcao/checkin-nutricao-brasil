// =====================================================================
// CONVITES DE EXPOSITOR EM LOTE
//
// A lista de expositores vive numa planilha do comercial. Gerar convite a
// convite, no prompt(), com 20 empresas, é uma tarde perdida. Aqui você cola
// a planilha inteira, confere o que vai ser criado e gera tudo de uma vez —
// já saindo com a mensagem pronta para o comercial disparar.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { supabase } from '../data/supabase.js';

const BASE_FORM = 'https://checkin.nutricaobrasil.com.br/expositor-cadastro-time?e=';

// Aceita colagem de planilha (TAB) ou digitação com ponto-e-vírgula.
// Vírgula não entra: nome de empresa tem vírgula com frequência.
function separa(linha) {
  if (linha.includes('\t')) return linha.split('\t');
  if (linha.includes(';')) return linha.split(';');
  return [linha];
}

export function parseLista(texto, jaExistentes = []) {
  const nomes = new Set(jaExistentes.map((x) => (x.empresa || '').trim().toLowerCase()));
  const vistos = new Set();
  return String(texto || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const [empresa = '', estande = '', cota = '', cred = ''] = separa(l).map((c) => c.trim());
      const limite = parseInt(String(cred).replace(/\D/g, ''), 10);
      const chave = empresa.toLowerCase();
      const avisos = [];
      if (!empresa) avisos.push('sem nome');
      if (!cred) avisos.push('sem nº de credenciais — vai com 5');
      else if (!limite || limite < 1) avisos.push('credenciais inválidas — vai com 5');
      if (empresa && nomes.has(chave)) avisos.push('já existe convite com esse nome');
      if (empresa && vistos.has(chave)) avisos.push('repetida na sua lista');
      if (empresa) vistos.add(chave);
      const duplicada = avisos.some((a) => /já existe|repetida/.test(a));
      return {
        i,
        empresa,
        estande: estande || null,
        cota: cota || null,
        limite: limite && limite > 0 ? limite : 5,
        avisos,
        duplicada,
        bloqueia: !empresa,
        // Duplicata entra desmarcada: gerar dois códigos para a mesma empresa
        // faz o comercial mandar o link errado. Dá para marcar de novo à mão.
        marcada: !!empresa && !duplicada
      };
    });
}

// Mensagem que o comercial dispara para a empresa. Texto livre — não é
// template da Meta, vai pelo WhatsApp da pessoa mesmo.
export function mensagemConvite(x, { evento, prazo }) {
  const linhas = [
    'Oi! Aqui é do *Nutrição Brasil*.',
    '',
    `A *${x.empresa}* está confirmada na exposição${evento ? ' do ' + evento : ''}` +
      `${x.estande ? `, no estande *${x.estande}*` : ''}.`,
    '',
    'Para credenciar a equipe, cada empresa preenche a própria lista. ' +
      'Leva dois minutos e evita fila no dia:',
    '',
    `🔗 ${BASE_FORM}${x.codigo}`,
    `🔑 Código: *${x.codigo}*`,
    '',
    `Vocês têm direito a *${x.limite} ${x.limite === 1 ? 'credencial' : 'credenciais'}*.`
  ];
  if (prazo) {
    linhas.push(
      `Preenchendo até *${prazo}*, os crachás já saem impressos e é só retirar. ` +
        'Depois dessa data a gente imprime no balcão, na hora.'
    );
  }
  linhas.push('', 'Qualquer dúvida, é só responder aqui.', '', '*Nutrição Brasil*');
  return linhas.join('\n');
}

function copia(txt, msg) {
  navigator.clipboard
    .writeText(txt)
    .then(() => toast.success(msg))
    .catch(() => toast.danger('Não consegui copiar.'));
}

// abreLote({ eventId, evento, jaExistentes, prazoPadrao, aoTerminar })
export function abreLote({ eventId, evento, jaExistentes = [], prazoPadrao = '', aoTerminar } = {}) {
  let texto = '';
  let prazo = prazoPadrao;
  let previa;
  let rodape;
  let gerando = false;

  const desmarcadas = new Set();   // índices que o usuário desligou
  const remarcadas = new Set();    // duplicatas que o usuário ligou de propósito

  function linhas() {
    return parseLista(texto, jaExistentes).map((l) => ({
      ...l,
      marcada: remarcadas.has(l.i) ? true : desmarcadas.has(l.i) ? false : l.marcada
    }));
  }

  function desenhaPrevia() {
    if (!previa) return;
    const ls = linhas();
    const validas = ls.filter((l) => l.marcada);
    if (!ls.length) {
      setContent(
        previa,
        h(
          'div',
          { class: 'lote-vazio' },
          'Cole a lista acima. Uma empresa por linha.'
        )
      );
    } else {
      setContent(
        previa,
        h(
          'table',
          { class: 'table lote-table' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', { style: { width: '34px' } }, ''),
              h('th', { style: { width: '38%' } }, 'Empresa'),
              h('th', {}, 'Estande'),
              h('th', {}, 'Cota'),
              h('th', {}, 'Credenciais'),
              h('th', {}, '')
            )
          ),
          h(
            'tbody',
            {},
            ...ls.map((l) =>
              h(
                'tr',
                { class: (l.bloqueia ? 'lote-ruim' : '') + (l.marcada ? '' : ' lote-fora') },
                h(
                  'td',
                  {},
                  l.bloqueia
                    ? null
                    : h('input', {
                        type: 'checkbox',
                        class: 'lote-check',
                        checked: l.marcada || null,
                        'aria-label': 'Gerar convite para ' + l.empresa,
                        onchange: (e) => {
                          if (e.target.checked) { remarcadas.add(l.i); desmarcadas.delete(l.i); }
                          else { desmarcadas.add(l.i); remarcadas.delete(l.i); }
                          desenhaPrevia();
                        }
                      })
                ),
                h('td', {}, l.empresa || h('span', { class: 'muted' }, '(linha sem nome)')),
                h('td', { class: 'muted' }, l.estande || '—'),
                h('td', { class: 'muted' }, l.cota || '—'),
                h('td', {}, String(l.limite)),
                h(
                  'td',
                  {},
                  l.avisos.length
                    ? h('span', { class: 'lote-aviso' }, l.avisos.join(' · '))
                    : h('span', { class: 'status live' }, 'ok')
                )
              )
            )
          )
        )
      );
    }
    if (rodape) {
      const fora = ls.filter((l) => !l.marcada && !l.bloqueia).length;
      const semNome = ls.filter((l) => l.bloqueia).length;
      const notas = [];
      if (fora) notas.push(`${fora} de fora por repetição — marque se for de propósito`);
      if (semNome) notas.push(`${semNome} linha(s) sem nome ignoradas`);
      setContent(
        rodape,
        validas.length
          ? `${validas.length} ${validas.length === 1 ? 'convite será gerado' : 'convites serão gerados'}` +
              (notas.length ? ' · ' + notas.join(' · ') : '')
          : ls.length
            ? 'Nenhuma linha marcada.' + (notas.length ? ' ' + notas.join(' · ') : '')
            : 'Nada para gerar ainda.'
      );
    }
  }

  const modal = openModal({
    title: 'Convites em lote',
    body: () => {
      const wrap = h('div', { class: 'expo-lote' });
      previa = h('div', { class: 'lote-previa' });
      rodape = h('div', { class: 'lote-rodape' });

      const area = h('textarea', {
        class: 'input lote-area',
        rows: '7',
        spellcheck: 'false',
        placeholder:
          'Nestlé Nutrition & Health\t12\tDiamante\t8\n' +
          'Rousselot\t07\tOuro\t5\n' +
          'Prana Bebidas Leves; 22; Prata; 3',
        oninput: (e) => {
          texto = e.target.value;
          desenhaPrevia();
        }
      });

      wrap.append(
        h(
          'div',
          { class: 'lote-ajuda' },
          h('strong', {}, 'Uma empresa por linha: '),
          'empresa, estande, cota, nº de credenciais. ',
          'Pode colar direto da planilha (separado por TAB) ou digitar com ponto-e-vírgula. ',
          'Só o nome é obrigatório — sem número de credenciais, entra com 5.'
        ),
        area,
        h(
          'div',
          { class: 'field lote-prazo' },
          h('label', { for: 'lote-prazo' }, 'Prazo para a empresa preencher (entra na mensagem)'),
          h('input', {
            id: 'lote-prazo',
            class: 'input',
            type: 'text',
            value: prazo,
            placeholder: 'ex: 20 de agosto — deixe vazio para não citar prazo',
            oninput: (e) => (prazo = e.target.value.trim())
          })
        ),
        previa,
        rodape
      );
      desenhaPrevia();
      requestAnimationFrame(() => area.focus());
      return wrap;
    },
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (fechar) => fechar() },
      {
        label: 'Gerar convites',
        kind: 'btn-primary',
        onClick: async () => {
          if (gerando) return;
          const alvo = linhas().filter((l) => l.marcada);
          if (!alvo.length) return toast.danger('Marque pelo menos uma empresa.');
          gerando = true;
          toast.info(`Gerando ${alvo.length}…`);

          const feitos = [];
          const falhas = [];
          for (const l of alvo) {
            try {
              const { data, error } = await supabase.rpc('expo_gera_convite', {
                p_event_id: eventId,
                p_empresa: l.empresa,
                p_limite: l.limite,
                p_cota: l.cota
              });
              if (error) throw error;
              // expo_gera_convite não recebe estande — grava depois.
              if (l.estande) {
                await supabase.from('exhibitors').update({ estande: l.estande }).eq('id', data.id);
              }
              feitos.push({ ...l, codigo: data.codigo, id: data.id });
            } catch (e) {
              falhas.push({ ...l, erro: e.message || String(e) });
            }
          }

          gerando = false;
          modal.close();
          aoTerminar?.();
          abreResultado(feitos, falhas, { evento, prazo });
        }
      }
    ]
  });
}

// ── Resultado: o que o comercial leva daqui ─────────────────────────────────
function abreResultado(feitos, falhas, ctx) {
  const csv = [
    'empresa;estande;cota;credenciais;codigo;link',
    ...feitos.map((x) =>
      [x.empresa, x.estande || '', x.cota || '', x.limite, x.codigo, BASE_FORM + x.codigo].join(';')
    )
  ].join('\n');

  openModal({
    title: feitos.length ? `${feitos.length} convites gerados` : 'Nada foi gerado',
    body: () =>
      h(
        'div',
        { class: 'expo-lote' },
        falhas.length
          ? h(
              'div',
              { class: 'pn-alerta trava', style: { marginBottom: '14px' } },
              h(
                'div',
                {},
                h('div', { class: 'pn-alerta-titulo' }, `${falhas.length} não deram certo`),
                h(
                  'div',
                  { class: 'pn-alerta-texto' },
                  falhas.map((f) => `${f.empresa}: ${f.erro}`).join(' · ')
                )
              )
            )
          : null,

        feitos.length
          ? h(
              'div',
              { class: 'lote-acoes' },
              h(
                'button',
                { class: 'btn btn-primary', onclick: () => copia(csv, 'Planilha copiada.') },
                'Copiar planilha (CSV)'
              ),
              h(
                'button',
                {
                  class: 'btn btn-secondary',
                  onclick: () =>
                    copia(
                      feitos.map((x) => mensagemConvite(x, ctx)).join('\n\n———\n\n'),
                      'Todas as mensagens copiadas.'
                    )
                },
                'Copiar todas as mensagens'
              )
            )
          : null,

        ...feitos.map((x) =>
          h(
            'div',
            { class: 'lote-card' },
            h(
              'div',
              { class: 'lote-card-topo' },
              h(
                'div',
                {},
                h('div', { class: 'row-name' }, x.empresa),
                h(
                  'div',
                  { class: 'row-sub' },
                  [x.estande ? 'estande ' + x.estande : null, x.cota, `${x.limite} credenciais`]
                    .filter(Boolean)
                    .join(' · ')
                )
              ),
              h('code', { class: 'lote-codigo' }, x.codigo)
            ),
            h(
              'div',
              { class: 'lote-card-acoes' },
              h(
                'button',
                {
                  class: 'btn btn-ghost btn-sm',
                  onclick: () => copia(BASE_FORM + x.codigo, 'Link copiado.')
                },
                'Copiar link'
              ),
              h(
                'button',
                {
                  class: 'btn btn-secondary btn-sm',
                  onclick: () => copia(mensagemConvite(x, ctx), 'Mensagem copiada.')
                },
                'Copiar mensagem pronta'
              ),
              x.phone
                ? null
                : h(
                    'a',
                    {
                      class: 'btn btn-ghost btn-sm',
                      href:
                        'https://wa.me/?text=' + encodeURIComponent(mensagemConvite(x, ctx)),
                      target: '_blank',
                      rel: 'noopener'
                    },
                    'Abrir no WhatsApp'
                  )
            )
          )
        )
      ),
    actions: [{ label: 'Fechar', kind: 'btn-primary', onClick: (fechar) => fechar() }]
  });
}
