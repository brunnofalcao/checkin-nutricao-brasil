// =====================================================================
// CORTESIAS DA EMPRESA · cota, código e quem usou
//
// Tudo o que decide uma cortesia mora nesta tela: quantas a empresa tem,
// qual o código que ela distribui, até quando vale, e a lista de quem já
// entrou. Pausar fica ao lado do código de propósito — quando o comercial
// desconfia de vazamento, o botão precisa estar onde ele já está olhando.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { supabase } from '../data/supabase.js';
import { leArquivo } from '../core/planilha.js';
import { leLista, MODULOS } from '../core/cortesias-lista.js';

const BASE = 'https://checkin.nutricaobrasil.com.br/cortesias';

// PRANA20 a partir de "Prana Nutrition" com cota 20: o patrocinador fala
// esse código no estande sem precisar soletrar.
export function sugereCodigo(empresa, total) {
  const base = String(empresa || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  if (!base) return '';
  return base + (total > 0 ? String(total) : '');
}

export function linkCortesia(codigo) {
  return `${BASE}?c=${encodeURIComponent(codigo || '')}`;
}

export function mensagemCortesia(x, { evento, prazo }) {
  const l = [
    'Oi! Aqui é do *Nutrição Brasil*.',
    '',
    `A *${x.empresa}* tem *${x.cortesias_total} cortesias* para distribuir` +
      `${evento ? ' no ' + evento : ''}.`,
    '',
    'Cada convidado se inscreve sozinho por este link, escolhendo os módulos que vai assistir:',
    '',
    `🔗 ${linkCortesia(x.cortesias_codigo)}`,
    `🔑 Código: *${x.cortesias_codigo}*`,
    '',
    '*Importante:* a cortesia é por módulo. Se a pessoa marcar dois módulos, ' +
      'usa duas cortesias da sua cota.'
  ];
  if (prazo) l.push('', `As cortesias valem até *${prazo}* — ou até a cota acabar, o que vier primeiro.`);
  l.push('', 'Você recebe um WhatsApp a cada cortesia usada, com o nome de quem entrou.',
    '', '*Nutrição Brasil*');
  return l.join('\n');
}

function copia(txt, msg) {
  navigator.clipboard.writeText(txt)
    .then(() => toast.success(msg))
    .catch(() => toast.danger('Não consegui copiar.'));
}

const fmtData = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—');

// abreCortesias({ empresa, evento, prazoPadrao, aoTerminar })
export function abreCortesias({ empresa: x, evento, prazoPadrao = '2026-08-26', aoTerminar } = {}) {
  let cTotal, cCodigo, cPrazo, cPausa;
  let usos = [];
  let corpoLista;
  let salvando = false;
  let entradaArquivo, avisoArquivo, previaImport;
  let listaLida = null;

  const restantes = () => Math.max(0, (x.cortesias_total || 0) - usos.length);

  // O modelo sai daqui para o patrocinador preencher. Sem lista suspensa
  // (isso o .xlsx do sistema faz), mas com as colunas exatas — o leitor
  // aceita as duas formas.
  function baixaModelo() {
    const csv = [
      'primeiro nome;ultimo nome;e-mail;celular;estado;profissao;' + MODULOS.join(';'),
      'Marina;Lopes;marina@empresa.com;(61) 98138-2900;Distrito Federal (DF);Nutrição;X;X;'
    ].join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: `cortesias-${(x.empresa || 'empresa').toLowerCase().replace(/\s+/g, '-')}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function recebeArquivo(f) {
    if (!f) return;
    if (!/\.(xlsx|csv|tsv|txt)$/i.test(f.name)) {
      setContent(avisoArquivo, h('span', { class: 'lote-aviso' },
        `"${f.name}" não é planilha. Suba .xlsx ou .csv.`));
      return;
    }
    setContent(avisoArquivo, h('span', { class: 'muted' }, 'Lendo ' + f.name + '…'));
    try {
      const r = leLista(await leArquivo(f));
      if (r.erro) throw new Error(r.erro);
      listaLida = r;
      setContent(avisoArquivo,
        h('span', { class: 'lote-arquivo-ok' }, '✓ ' + f.name),
        h('span', { class: 'muted' }, ` · ${r.total} linha(s)`));
      desenhaPrevia();
    } catch (e) {
      listaLida = null;
      setContent(avisoArquivo, h('span', { class: 'lote-aviso' }, e.message || String(e)));
      setContent(previaImport);
    }
  }

  function desenhaPrevia() {
    const r = listaLida;
    if (!r) return;
    const cabe = r.custoTotal <= restantes();
    setContent(previaImport,
      h('div', { class: 'lote-rodape' },
        `${r.validas} pessoa(s) entram · custam ${r.custoTotal} cortesia(s) · restam ${restantes()}` +
        (r.comProblema ? ` · ${r.comProblema} com problema` : '')),
      !cabe
        ? h('div', { class: 'pn-alerta trava', style: { margin: '8px 0' } },
            h('div', {},
              h('div', { class: 'pn-alerta-titulo' }, 'Não cabe na cota'),
              h('div', { class: 'pn-alerta-texto' },
                `A lista custa ${r.custoTotal} e restam ${restantes()}. ` +
                'Aumente a cota acima ou tire gente da planilha.')))
        : null,
      h('div', { class: 'lote-previa' },
        h('table', { class: 'table lote-table' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Pessoa'),
            h('th', { style: { width: '78px' } }, 'Custa'),
            h('th', { style: { width: '150px' } }, 'Situação'))),
          h('tbody', {}, ...r.pessoas.map((p) =>
            h('tr', { class: p.ok ? '' : 'lote-fora' },
              h('td', {},
                h('div', { class: 'row-name' }, p.nome || `(linha ${p.linha})`),
                h('div', { class: 'row-sub' },
                  [p.email, p.modulos.join(' + ')].filter(Boolean).join(' · '))),
              h('td', { class: 'mono' }, String(p.custo)),
              h('td', {},
                p.problemas.length
                  ? h('span', { class: 'lote-aviso' }, p.problemas.join(' · '))
                  : p.avisos.length
                    ? h('span', { class: 'lote-aviso' }, p.avisos.join(' · '))
                    : h('span', { class: 'status live' }, 'ok'))))))),
      cabe && r.validas
        ? h('div', { class: 'lote-acoes' },
            h('button', { class: 'btn btn-primary btn-sm', onclick: () => enviaLista() },
              `Cadastrar ${r.validas} pessoa(s)`))
        : null);
  }

  async function enviaLista() {
    const r = listaLida;
    if (!r || salvando) return;
    salvando = true;
    toast.info(`Cadastrando ${r.validas}…`);
    const pessoas = r.pessoas.filter((p) => p.ok).map((p) => ({
      primeiro_nome: p.primeiro_nome, ultimo_nome: p.ultimo_nome,
      email: p.email, celular: p.celular,
      estado: p.estado, formacao: p.formacao, modulos: p.modulos
    }));
    const { data, error } = await supabase.functions.invoke('cortesia-inscreve', {
      body: { acao: 'registra', codigo: x.cortesias_codigo, pessoas, origem: 'patrocinador' }
    });
    salvando = false;
    if (error || data?.erro) {
      toast.danger(data?.erro === 'cota'
        ? `A cota não cobre: restam ${data.restantes}, a lista pede ${data.pedido}.`
        : (error?.message || 'Não consegui cadastrar.'));
      return;
    }
    listaLida = null;
    setContent(previaImport); setContent(avisoArquivo);
    if (entradaArquivo) entradaArquivo.value = '';
    await carregaUsos();
    aoTerminar?.();
    const n = (data.criados || []).length;
    toast.success(`${n} cortesia(s) usadas. Restam ${data.restantes}.`);
    if ((data.avisos || []).length) console.warn('cortesias:', data.avisos);
  }

  async function carregaUsos() {
    const { data } = await supabase.from('cortesias_uso')
      .select('id, nome, email, modulo, origem, criado_em')
      .eq('exhibitor_id', x.id)
      .order('criado_em', { ascending: false });
    usos = data || [];
    desenhaLista();
  }

  function desenhaLista() {
    if (!corpoLista) return;
    if (!usos.length) {
      setContent(corpoLista, h('div', { class: 'empty', style: { padding: '22px 10px' } },
        h('div', { class: 'empty-title' }, 'Nenhuma cortesia usada ainda'),
        h('div', { class: 'empty-body' },
          x.cortesias_codigo
            ? 'Assim que alguém se inscrever com o código, aparece aqui.'
            : 'Defina a cota e gere o código para a empresa começar a distribuir.')));
      return;
    }
    setContent(corpoLista,
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Pessoa'),
          h('th', { style: { width: '30%' } }, 'Módulo'),
          h('th', { style: { width: '110px' } }, 'Veio de'),
          h('th', { style: { width: '110px' } }, 'Quando'))),
        h('tbody', {}, ...usos.map((u) =>
          h('tr', {},
            h('td', {},
              h('div', { class: 'row-name' }, u.nome || '—'),
              h('div', { class: 'row-sub' }, u.email || '')),
            h('td', { class: 'row-sub' }, u.modulo),
            h('td', {}, h('span', { class: 'status ' + (u.origem === 'patrocinador' ? 'soon' : 'done') },
              u.origem === 'patrocinador' ? 'Empresa' : 'Convidado')),
            h('td', { class: 'row-sub' },
              new Date(u.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
              ' ' + new Date(u.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))))))
    );
  }

  const usadas = () => usos.length;

  const modal = openModal({
    title: 'Cortesias · ' + (x.empresa || 'empresa'),
    body: () => {
      const wrap = h('div', { class: 'expo-nova' });
      corpoLista = h('div', { class: 'ct-lista' });

      wrap.append(
        h('p', { class: 'page-sub', style: { margin: '0 0 18px' } },
          'A cortesia é por módulo: quem marcar dois módulos consome duas da cota. ' +
          'A cada uso, o responsável da empresa recebe um WhatsApp com o nome de quem entrou.'),

        h('div', { class: 'nv-linha' },
          h('div', { class: 'campo' },
            h('label', { class: 'campo-rot', for: 'ct-total' }, 'Cortesias contratadas'),
            h('input', { id: 'ct-total', class: 'input', type: 'number', min: '0', max: '500',
              value: String(x.cortesias_total || 0), ref: (el) => (cTotal = el),
              // Enquanto o código não for editado à mão, ele acompanha a cota:
              // digitar 20 já deixa PRANA20 pronto para copiar.
              onInput: () => {
                if (cCodigo.dataset.auto !== '1') return;
                const n = parseInt(cTotal.value, 10) || 0;
                cCodigo.value = n > 0 ? sugereCodigo(x.empresa, n) : '';
              } }),
            h('div', { class: 'campo-dica' }, 'Acessos, não pessoas. 0 desliga o código.')),

          h('div', { class: 'campo' },
            h('label', { class: 'campo-rot', for: 'ct-codigo' }, 'Código da cortesia'),
            h('input', { id: 'ct-codigo', class: 'input', type: 'text', autocomplete: 'off',
              value: x.cortesias_codigo || '',
              dataset: { auto: x.cortesias_codigo ? '0' : '1' },
              placeholder: sugereCodigo(x.empresa, x.cortesias_total || 0) || 'PRANA20',
              ref: (el) => (cCodigo = el),
              onInput: (e) => { e.target.dataset.auto = '0'; } }),
            h('div', { class: 'campo-dica' }, 'É o que o convidado digita. Vazio = sugerido pelo nome.')),

          h('div', { class: 'campo' },
            h('label', { class: 'campo-rot', for: 'ct-prazo' }, 'Vale até'),
            h('input', { id: 'ct-prazo', class: 'input', type: 'date',
              value: x.cortesias_prazo || prazoPadrao, ref: (el) => (cPrazo = el) }),
            h('div', { class: 'campo-dica' }, 'Depois disso o código para sozinho.'))),

        h('label', { class: 'check-linha', style: { margin: '2px 0 16px' } },
          h('input', { type: 'checkbox', checked: x.cortesias_pausado || null,
            ref: (el) => (cPausa = el) }),
          h('div', {},
            h('strong', {}, 'Pausar agora'),
            h('div', { class: 'row-sub' },
              'Para na hora, sem mexer em quem já se inscreveu. Use se desconfiar que o código vazou.'))),

        x.cortesias_codigo
          ? h('div', {},
              h('label', { class: 'campo-rot' }, 'Link para o patrocinador divulgar'),
              h('div', { class: 'exp-link-box mono' }, linkCortesia(x.cortesias_codigo)),
              h('div', { class: 'lote-acoes' },
                h('button', { class: 'btn btn-secondary btn-sm',
                  onclick: () => copia(mensagemCortesia(x, { evento, prazo: fmtData(x.cortesias_prazo) }),
                    'Mensagem copiada.') }, 'Copiar mensagem pronta'),
                h('button', { class: 'btn btn-ghost btn-sm',
                  onclick: () => copia(linkCortesia(x.cortesias_codigo), 'Link copiado.') }, 'Copiar link'),
                h('button', { class: 'btn btn-ghost btn-sm',
                  onclick: () => copia(x.cortesias_codigo, 'Código copiado.') }, 'Copiar código')))
          : null,

        // Cadastrar pela planilha do patrocinador. Só faz sentido depois
        // que existe código e cota — antes disso não há de onde descontar.
        x.cortesias_codigo
          ? h('div', { class: 'ct-import' },
              h('label', { class: 'campo-rot', style: { marginTop: '18px' } },
                'Cadastrar pela planilha do patrocinador'),
              h('div', { class: 'lote-drop' },
                h('div', { class: 'lote-drop-txt' },
                  h('strong', {}, 'Suba a lista de convidados'),
                  h('div', { class: 'muted' }, 'Excel (.xlsx) ou CSV, no modelo do patrocinador')),
                h('div', { class: 'lote-drop-acoes' },
                  h('button', { class: 'btn btn-secondary btn-sm',
                    onclick: () => entradaArquivo.click() }, 'Escolher arquivo'),
                  h('button', { class: 'btn btn-ghost btn-sm',
                    onclick: () => baixaModelo() }, 'Baixar modelo')),
                entradaArquivo = h('input', {
                  type: 'file', class: 'sr-only',
                  accept: '.xlsx,.csv,.tsv,.txt',
                  onChange: (e) => recebeArquivo(e.target.files?.[0])
                })),
              avisoArquivo = h('div', { class: 'lote-arquivo-nome' }),
              previaImport = h('div'))
          : null,

        h('label', { class: 'campo-rot', style: { marginTop: '20px' } }, 'Quem já usou'),
        corpoLista
      );

      carregaUsos();
      return wrap;
    },
    actions: [
      { label: 'Fechar', kind: 'btn-ghost', onClick: (fechar) => fechar() },
      {
        label: 'Salvar',
        kind: 'btn-primary',
        onClick: async (fechar) => {
          if (salvando) return;
          const total = parseInt(cTotal.value, 10);
          if (isNaN(total) || total < 0) { toast.danger('Cortesias precisa ser 0 ou mais.'); return; }
          if (total < usadas()) {
            toast.danger(`A empresa já usou ${usadas()}. Não dá para baixar a cota para ${total}.`);
            return;
          }
          let codigo = cCodigo.value.trim().toUpperCase();
          if (total > 0 && !codigo) codigo = sugereCodigo(x.empresa, total);
          if (codigo && !/^[A-Z0-9-]{4,20}$/.test(codigo)) {
            toast.danger('O código aceita letras, números e hífen, de 4 a 20 caracteres.');
            return;
          }

          salvando = true;
          const patch = {
            cortesias_total: total,
            cortesias_codigo: total > 0 ? codigo : null,
            cortesias_pausado: !!cPausa.checked,
            cortesias_prazo: cPrazo.value || null
          };
          const { error } = await supabase.from('exhibitors').update(patch).eq('id', x.id);
          salvando = false;

          if (error) {
            // Índice único do código: o comercial precisa saber que a culpa
            // é do nome repetido, não do sistema.
            toast.danger(/duplicate|unique/i.test(error.message)
              ? `O código "${codigo}" já é de outra empresa. Escolha outro.`
              : error.message);
            return;
          }
          Object.assign(x, patch);
          fechar();
          aoTerminar?.();
          toast.success(total > 0
            ? `${x.empresa}: ${total} cortesias com o código ${codigo}.`
            : `${x.empresa}: cortesias desligadas.`);
        }
      }
    ]
  });

  return modal;
}
