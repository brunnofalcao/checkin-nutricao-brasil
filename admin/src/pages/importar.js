// =====================================================================
// IMPORTAR LISTA
//
// É por aqui que entra gente que não veio de Hotmart nem de TicketSports:
// visitante vindo do RD Station, cortesia, imprensa, convidado, lista de
// last minute que o comercial mandou por planilha.
//
// A regra é a mesma do cadastro manual: antes de criar, conferir. Nada é
// gravado antes de você ver linha por linha o que vai entrar, o que já
// está no evento e o que vai ser ignorado.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { supabase } from '../data/supabase.js';
import { normalizePhone } from '../core/utils.js';
import { parseCSV, detectaSeparador, adivinhaColuna, pareceCabecalho } from '../core/csv.js';
import { soDigitos, dobra } from '../data/pessoas.js';

const CAMPOS = [
  { v: '', rot: '— ignorar —' },
  { v: 'name', rot: 'Nome' },
  { v: 'email', rot: 'E-mail' },
  { v: 'phone', rot: 'WhatsApp' },
  { v: 'code', rot: 'Código' },
  { v: 'lote', rot: 'Lote' },
  { v: 'notes', rot: 'Observação' }
];

const LOTE = 200; // linhas por requisição

// Monta as linhas prontas para inserir e classifica cada uma.
export function preparaLinhas(matriz, mapa, temCabecalho, jaNoEvento) {
  const corpo = temCabecalho ? matriz.slice(1) : matriz;
  const emails = new Set(jaNoEvento.map((p) => dobra(p.email)).filter(Boolean));
  const fones = new Set(jaNoEvento.map((p) => soDigitos(p.phone).slice(-11)).filter((x) => x.length >= 10));
  const vistosEmail = new Set();
  const vistosFone = new Set();

  return corpo.map((linha, i) => {
    const d = {};
    mapa.forEach((campo, col) => {
      if (campo && linha[col] !== undefined) d[campo] = linha[col];
    });

    const nome = String(d.name || '').replace(/\s+/g, ' ').trim();
    const email = String(d.email || '').trim().toLowerCase();
    const fone = normalizePhone(d.phone || '');
    const chaveFone = soDigitos(fone).slice(-11);

    let situacao = 'nova';
    let motivo = '';

    if (nome.length < 3) {
      situacao = 'ruim';
      motivo = 'sem nome';
    } else if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      situacao = 'ruim';
      motivo = 'e-mail inválido';
    } else if (!email && !fone) {
      situacao = 'ruim';
      motivo = 'sem e-mail e sem WhatsApp';
    } else if (email && emails.has(dobra(email))) {
      situacao = 'existe';
      motivo = 'já está no evento (e-mail)';
    } else if (chaveFone.length >= 10 && fones.has(chaveFone)) {
      situacao = 'existe';
      motivo = 'já está no evento (WhatsApp)';
    } else if (email && vistosEmail.has(dobra(email))) {
      situacao = 'repetida';
      motivo = 'repetida no arquivo';
    } else if (chaveFone.length >= 10 && vistosFone.has(chaveFone)) {
      situacao = 'repetida';
      motivo = 'repetida no arquivo';
    }

    if (situacao === 'nova') {
      if (email) vistosEmail.add(dobra(email));
      if (chaveFone.length >= 10) vistosFone.add(chaveFone);
    }

    return {
      i: i + (temCabecalho ? 2 : 1), // número da linha na planilha
      situacao,
      motivo,
      dados: {
        name: nome,
        email: email || null,
        phone: fone || null,
        code: String(d.code || '').trim() || null,
        lote: String(d.lote || '').trim() || null,
        notes: String(d.notes || '').trim() || null
      }
    };
  });
}

// abreImportar({ evento, participantes, aoImportar })
export function abreImportar({ evento, participantes = [], aoImportar } = {}) {
  let texto = '';
  let sep = ';';
  let matriz = [];
  let mapa = [];
  let temCabecalho = true;
  let corpo;
  let importando = false;

  function processa(novoTexto) {
    texto = novoTexto;
    sep = detectaSeparador(texto);
    matriz = parseCSV(texto, sep);
    temCabecalho = matriz.length ? pareceCabecalho(matriz[0]) : false;
    const largura = matriz.reduce((m, l) => Math.max(m, l.length), 0);
    mapa = Array.from({ length: largura }, (_, c) =>
      temCabecalho ? adivinhaColuna(matriz[0][c]) : ''
    );
    // Sem cabeçalho e duas colunas: o palpite honesto é nome + telefone.
    if (!temCabecalho && largura >= 2) { mapa[0] = 'name'; mapa[1] = 'phone'; }
    desenha();
  }

  function linhasPreparadas() {
    if (!matriz.length || !mapa.includes('name')) return [];
    return preparaLinhas(matriz, mapa, temCabecalho, participantes);
  }

  // ── Desenho ───────────────────────────────────────────────────────────────
  function desenha() {
    if (!corpo) return;

    if (!matriz.length) {
      setContent(corpo, entrada());
      return;
    }

    const linhas = linhasPreparadas();
    const novas = linhas.filter((l) => l.situacao === 'nova');
    const existem = linhas.filter((l) => l.situacao === 'existe');
    const repetidas = linhas.filter((l) => l.situacao === 'repetida');
    const ruins = linhas.filter((l) => l.situacao === 'ruim');
    const semNome = !mapa.includes('name');

    setContent(
      corpo,
      h(
        'div',
        { class: 'imp-topo' },
        h('div', {},
          h('strong', {}, `${matriz.length - (temCabecalho ? 1 : 0)} linhas lidas`),
          h('span', { class: 'pn-dica' },
            `separador ${sep === '\t' ? 'TAB' : sep === ';' ? 'ponto-e-vírgula' : 'vírgula'}` +
            ` · ${mapa.length} colunas` +
            (temCabecalho ? ' · primeira linha é cabeçalho' : ' · sem cabeçalho'))
        ),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { matriz = []; texto = ''; desenha(); } },
          'Trocar arquivo')
      ),

      h('label', { class: 'pn-check imp-cab' },
        h('input', {
          type: 'checkbox',
          checked: temCabecalho || null,
          onchange: (e) => {
            temCabecalho = e.target.checked;
            mapa = mapa.map((_, c) => (temCabecalho ? adivinhaColuna(matriz[0][c]) : ''));
            if (!temCabecalho && mapa.length >= 2) { mapa[0] = 'name'; mapa[1] = 'phone'; }
            desenha();
          }
        }),
        h('span', {}, h('strong', {}, 'A primeira linha é cabeçalho'),
          h('span', { class: 'pn-dica' }, 'Desmarque se a planilha já começa nos dados.'))
      ),

      h('div', { class: 'cr-rot' }, 'De onde vem cada coisa'),
      h('div', { class: 'imp-mapa' },
        ...mapa.map((atual, c) =>
          h('div', { class: 'imp-col' },
            h('div', { class: 'imp-col-tit' },
              temCabecalho ? (matriz[0][c] || `coluna ${c + 1}`) : `coluna ${c + 1}`),
            h('div', { class: 'imp-col-ex' },
              (matriz[temCabecalho ? 1 : 0] || [])[c] || '—'),
            h('select', {
              class: 'input imp-sel',
              'aria-label': 'Campo da coluna ' + (c + 1),
              onchange: (e) => { mapa[c] = e.target.value; desenha(); }
            }, ...CAMPOS.map((f) =>
              h('option', { value: f.v, selected: f.v === atual || null }, f.rot)))
          ))
      ),

      semNome
        ? h('div', { class: 'pn-alerta trava imp-alerta' },
            h('div', {},
              h('div', { class: 'pn-alerta-titulo' }, 'Falta dizer qual coluna é o Nome'),
              h('div', { class: 'pn-alerta-texto' },
                'Sem nome não dá para imprimir crachá nem emitir certificado. ' +
                'Escolha a coluna do nome acima.')))
        : h('div', {},
            h('div', { class: 'cr-rot' }, 'O que vai acontecer'),
            h('div', { class: 'imp-placar' },
              placar('Entram', novas.length, 'ok'),
              placar('Já estão no evento', existem.length, existem.length ? 'aviso' : ''),
              placar('Repetidas no arquivo', repetidas.length, repetidas.length ? 'aviso' : ''),
              placar('Ignoradas', ruins.length, ruins.length ? 'ruim' : '')
            ),
            linhas.length ? previa(linhas) : null),

      h('details', { class: 'imp-ajuda' },
        h('summary', {}, 'Como sai do RD Station e de outras ferramentas'),
        h('div', { class: 'imp-ajuda-corpo' },
          'Exporte os contatos em CSV e arraste o arquivo aqui — não precisa arrumar nada antes. ' +
          'A tela lê os nomes das colunas e já propõe o encaixe; se errar, você corrige no seletor. ' +
          'Colunas que não interessam ficam em "ignorar" e nem chegam ao banco. ' +
          'Quem já está no evento é reconhecido pelo e-mail ou pelo WhatsApp e não entra duas vezes, ' +
          'então dá para reimportar a mesma lista sem medo.'))
    );
  }

  function placar(rot, n, tom) {
    return h('div', { class: 'imp-placar-item' + (tom ? ' ' + tom : '') },
      h('div', { class: 'imp-placar-num' }, String(n)),
      h('div', { class: 'imp-placar-rot' }, rot));
  }

  function previa(linhas) {
    const mostra = linhas.slice(0, 25);
    return h('div', { class: 'imp-previa' },
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {},
          h('th', { style: { width: '46px' } }, 'Lin'),
          h('th', {}, 'Nome'),
          h('th', {}, 'Contato'),
          h('th', {}, 'Lote'),
          h('th', {}, ''))),
        h('tbody', {}, ...mostra.map((l) =>
          h('tr', { class: l.situacao !== 'nova' ? 'lote-fora' : '' },
            h('td', { class: 'muted mono' }, String(l.i)),
            h('td', {}, l.dados.name || h('span', { class: 'muted' }, '—')),
            h('td', { class: 'muted' },
              [l.dados.email, l.dados.phone].filter(Boolean).join(' · ') || '—'),
            h('td', { class: 'muted' }, l.dados.lote || '—'),
            h('td', {}, l.situacao === 'nova'
              ? h('span', { class: 'status live' }, 'entra')
              : h('span', { class: 'lote-aviso' }, l.motivo)))))),
      linhas.length > 25
        ? h('div', { class: 'imp-mais' }, `e mais ${linhas.length - 25} linhas`)
        : null);
  }

  function entrada() {
    const zona = h('div', { class: 'upload-drop imp-drop', tabindex: '0', role: 'button' },
      h('div', { class: 'upload-drop-title' }, 'Arraste o CSV aqui ou clique para escolher'),
      h('div', { class: 'upload-drop-sub' },
        'Vale o que sai do RD Station, do Excel, do Google Sheets. ' +
        'Vírgula, ponto-e-vírgula ou TAB — a tela descobre sozinha.'));

    const arquivo = h('input', {
      type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/plain',
      style: { display: 'none' },
      onchange: (e) => { const f = e.target.files?.[0]; if (f) le(f); }
    });

    const le = (f) => {
      if (f.size > 8 * 1024 * 1024) return toast.danger('Arquivo muito grande (máx 8 MB).');
      const r = new FileReader();
      r.onload = () => processa(String(r.result || ''));
      r.onerror = () => toast.danger('Não consegui ler o arquivo.');
      r.readAsText(f, 'utf-8');
    };

    zona.onclick = () => arquivo.click();
    zona.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); arquivo.click(); } };
    zona.ondragover = (e) => { e.preventDefault(); zona.classList.add('on'); };
    zona.ondragleave = () => zona.classList.remove('on');
    zona.ondrop = (e) => {
      e.preventDefault(); zona.classList.remove('on');
      const f = e.dataTransfer?.files?.[0];
      if (f) le(f);
    };

    return h('div', {},
      zona, arquivo,
      h('div', { class: 'imp-ou' }, 'ou cole as linhas'),
      h('textarea', {
        class: 'input lote-area',
        rows: '6',
        spellcheck: 'false',
        placeholder: 'Nome\tE-mail\tWhatsApp\nAna Paula Gonçalves\tana@exemplo.com\t61999990001',
        oninput: (e) => { if (e.target.value.trim()) processa(e.target.value); }
      }));
  }

  // ── Gravação ──────────────────────────────────────────────────────────────
  async function grava(novas, fechar) {
    importando = true;
    const registros = novas.map((l) => ({ ...l.dados, event_id: evento.id, source: 'import' }));
    let entraram = 0;
    const falhas = [];

    for (let i = 0; i < registros.length; i += LOTE) {
      const pedaco = registros.slice(i, i + LOTE);
      const { data, error } = await supabase.from('participants').insert(pedaco).select('id');
      if (!error) {
        entraram += data?.length ?? pedaco.length;
        continue;
      }
      // Um choque de chave derruba o lote inteiro. Refaz linha a linha para
      // salvar as que dão certo e dizer exatamente qual travou.
      for (const r of pedaco) {
        const um = await supabase.from('participants').insert(r).select('id');
        if (um.error) falhas.push({ nome: r.name, erro: um.error.code === '23505' ? 'já existia' : um.error.message });
        else entraram++;
      }
    }

    importando = false;
    fechar();
    aoImportar?.(entraram);

    if (falhas.length) {
      toast.warn(`${entraram} entraram · ${falhas.length} não deram certo.`);
      openModal({
        title: `${entraram} importados, ${falhas.length} de fora`,
        body: () => h('div', {},
          h('div', { class: 'pn-dica', style: { marginBottom: '12px' } },
            'Essas linhas não entraram. O resto da lista foi importado normalmente.'),
          h('table', { class: 'table' },
            h('tbody', {}, ...falhas.slice(0, 60).map((f) =>
              h('tr', {}, h('td', {}, f.nome), h('td', { class: 'lote-aviso' }, f.erro)))))),
        actions: [{ label: 'Entendi', kind: 'btn-primary', onClick: (f) => f() }]
      });
    } else {
      toast.success(`${entraram} ${entraram === 1 ? 'pessoa importada' : 'pessoas importadas'}.`);
    }
  }

  openModal({
    title: 'Importar lista',
    body: () => {
      const wrap = h('div', { class: 'importar' });
      corpo = h('div', {});
      wrap.append(
        h('div', { class: 'lote-ajuda' },
          'Entra em ', h('strong', {}, evento?.name || 'este evento'),
          '. Nada é gravado antes de você conferir a prévia.'),
        corpo
      );
      desenha();
      return wrap;
    },
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (fechar) => fechar() },
      {
        label: 'Importar',
        kind: 'btn-primary',
        onClick: async (fechar) => {
          if (importando) return;
          if (!matriz.length) return toast.danger('Escolha um arquivo ou cole as linhas.');
          if (!mapa.includes('name')) return toast.danger('Diga qual coluna é o Nome.');
          const novas = linhasPreparadas().filter((l) => l.situacao === 'nova');
          if (!novas.length) return toast.danger('Nenhuma linha nova para importar.');
          toast.info(`Importando ${novas.length}…`);
          await grava(novas, fechar);
        }
      }
    ]
  });
}
