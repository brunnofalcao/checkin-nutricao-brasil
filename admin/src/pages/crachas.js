// =====================================================================
// CRACHÁS E ETIQUETAS · folha de impressão
//
// O time interno imprime antes do evento; no dia o balcão só entrega.
// A saída é uma janela de impressão com medidas em milímetro, não um PDF
// gerado no navegador: imprime igual em qualquer máquina e o próprio
// diálogo do navegador salva em PDF se alguém quiser mandar para gráfica.
//
// Com QR desde 08/2026. O comentário anterior dizia "sem QR de propósito,
// o app não lê código" — deixou de valer no dia em que o leitor de câmera
// entrou no credenciamento. O QR carrega exatamente o mesmo `code` que sai
// impresso embaixo dele: quem tem o crachá passa pelo leitor, quem perdeu
// o crachá é achado pelo código digitado, e os dois caminhos levam ao
// mesmo registro.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { supabase } from '../data/supabase.js';
import qrcode from '../qrcode.min.mjs';

// SVG embutido, não imagem externa: a folha de impressão é escrita numa
// aba nova e precisa imprimir sem depender de rede. Correção de erro no
// nível M — sobra tolerância para dobra e reflexo do porta-crachá sem
// inchar o desenho.
function qrSvg(texto) {
  if (!texto) return '';
  const q = qrcode(0, 'M');
  q.addData(String(texto));
  q.make();
  const n = q.getModuleCount();
  const partes = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (q.isDark(r, c)) partes.push(`M${c} ${r}h1v1h-1z`);
    }
  }
  // viewBox com 2 módulos de margem: a zona clara é exigência do padrão,
  // sem ela leitor nenhum enxerga o código.
  return `<svg class="qr" viewBox="-2 -2 ${n + 4} ${n + 4}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">` +
         `<rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/>` +
         `<path d="${partes.join('')}" fill="#000"/></svg>`;
}

// Formatos em milímetro. A4 = 210 × 297.
export const FORMATOS = {
  grande: {
    rot: 'Crachá grande · 10 × 14 cm',
    sub: '2 por folha — o tamanho do porta-crachá de cordão',
    l: 100, a: 140, cols: 2, linhas: 1, mx: 4, my: 8, escala: 1
  },
  padrao: {
    rot: 'Crachá padrão · 9 × 12,5 cm',
    sub: '4 por folha — economiza papel sem perder leitura',
    l: 90, a: 125, cols: 2, linhas: 2, mx: 12, my: 18, escala: 0.88
  },
  etiqueta: {
    rot: 'Etiqueta · 9 × 5,5 cm',
    sub: '10 por folha — adesiva ou porta-crachá pequeno',
    l: 90, a: 55, cols: 2, linhas: 5, mx: 12, my: 8, escala: 0.55
  }
};

const PUBLICOS = {
  congress: { rot: 'CONGRESSISTA', cor: '#6b2d8b' },
  race: { rot: 'CORRIDA', cor: '#0b6d9e' },
  exhibitor: { rot: 'EXPOSITOR', cor: '#8a6300' },
  visitor: { rot: 'VISITANTE', cor: '#1a7a52' }
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Nome vira duas linhas: o primeiro nome grande (é o que se lê de longe)
// e o resto embaixo. Nome de uma palavra só ocupa a linha de cima.
export function parteNome(nome) {
  const limpo = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!limpo) return { alto: '—', baixo: '' };
  const p = limpo.split(' ');
  return { alto: p[0], baixo: p.slice(1).join(' ') };
}

// Corta o que não cabe, em vez de deixar estourar a caixa e desalinhar a folha.
export function encurta(texto, max) {
  const t = String(texto || '').trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}

// Dado de participante vem de Hotmart, TicketSports e digitação humana.
// Nada disso entra em HTML sem passar por aqui.
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function dataCurta(ev) {
  const ini = ev?.date_start || ev?.event_date;
  if (!ini) return '';
  const a = new Date(ini);
  const b = ev.event_end_date ? new Date(ev.event_end_date) : null;
  const d = (x) => `${x.getUTCDate()} ${MESES[x.getUTCMonth()]}`;
  return b && b > a ? `${a.getUTCDate()}–${d(b)}` : d(a);
}

// ── A folha ─────────────────────────────────────────────────────────────────
function montaHTML(itens, { formato, evento, tipo, corte, mostraCodigo, mostraQR }) {
  const f = FORMATOS[formato];
  const pub = PUBLICOS[tipo] || PUBLICOS.congress;
  const porFolha = f.cols * f.linhas;
  const linhaEvento = [evento?.city || evento?.name, dataCurta(evento)].filter(Boolean).join(' · ');
  const e = f.escala;

  const cartoes = itens
    .map((p) => {
      const n = parteNome(p.name);
      const detalhe = [];
      if (tipo === 'exhibitor') {
        if (p.__empresa) detalhe.push(`<div class="emp">${esc(encurta(p.__empresa, 34))}</div>`);
        if (p.__estande) detalhe.push(`<div class="det">estande ${esc(p.__estande)}</div>`);
      } else if (tipo === 'race') {
        const r = [];
        if (p.__peito) r.push(`peito ${esc(p.__peito)}`);
        if (p.__dist) r.push(esc(p.__dist));
        if (p.__camisa) r.push('camiseta ' + esc(p.__camisa));
        if (r.length) detalhe.push(`<div class="det">${r.join(' · ')}</div>`);
      } else if (p.lote) {
        detalhe.push(`<div class="det">${esc(encurta(p.lote, 28))}</div>`);
      }
      // O QR sempre carrega o `code`. cert_token é do certificado, tem outro
      // ciclo de vida e não é o que o leitor procura na lista.
      const codReal = p.code || '';
      const cod = mostraCodigo ? codReal || p.cert_token?.slice(0, 8) || '' : '';
      const qr = mostraQR && codReal ? qrSvg(codReal) : '';
      return `<div class="c">
  <div class="topo">
    <div class="marca">nutrição<b>brasil</b></div>
    <div class="ev">${esc(linhaEvento)}</div>
  </div>
  <div class="nome">
    <div class="alto">${esc(encurta(n.alto, 14))}</div>
    ${n.baixo ? `<div class="baixo">${esc(encurta(n.baixo, 26))}</div>` : ''}
    ${detalhe.join('')}
  </div>
  <div class="faixa">
    <span>${esc(pub.rot)}</span>
    <span class="fim">
      ${cod ? `<span class="cod">${esc(cod)}</span>` : ''}
      ${qr}
    </span>
  </div>
</div>`;
    })
    .join('\n');

  // Quebra de página a cada N cartões, via nth-child.
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Crachás · ${esc(evento?.name || 'Nutrição Brasil')}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: #fff; color: #16101f;
    font-family: 'DM Sans', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .folha {
    display: grid;
    grid-template-columns: repeat(${f.cols}, ${f.l}mm);
    grid-auto-rows: ${f.a}mm;
    justify-content: center;
    align-content: start;
    gap: ${f.my}mm ${f.mx}mm;
    padding: ${f.my}mm 0;
  }
  .c {
    width: ${f.l}mm; height: ${f.a}mm;
    padding: ${5 * e}mm ${5 * e}mm 0;
    display: flex; flex-direction: column;
    overflow: hidden;
    ${corte ? 'outline: 0.2mm dashed #c9c2d4; outline-offset: 0;' : ''}
    break-inside: avoid; page-break-inside: avoid;
  }
  .c:nth-child(${porFolha}n) { break-after: page; page-break-after: always; }
  .c:last-child { break-after: auto; page-break-after: auto; }

  .topo { border-bottom: 0.3mm solid #e4dced; padding-bottom: ${2.5 * e}mm; }
  .marca {
    font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700;
    font-size: ${4.6 * e}mm; letter-spacing: -0.03em; line-height: 1;
  }
  .marca b { color: ${pub.cor}; font-weight: 700; }
  .ev { font-size: ${2.9 * e}mm; color: #6f6383; margin-top: ${1 * e}mm; }

  .nome { flex: 1; display: flex; flex-direction: column; justify-content: center; min-height: 0; }
  .alto {
    font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700;
    font-size: ${11 * e}mm; line-height: 0.98; letter-spacing: -0.035em;
    color: #0a0610; word-break: break-word;
  }
  .baixo {
    font-size: ${5 * e}mm; font-weight: 500; color: #4a3f5c;
    margin-top: ${1.4 * e}mm; line-height: 1.15;
  }
  .emp {
    font-size: ${4.4 * e}mm; font-weight: 700; color: ${pub.cor};
    margin-top: ${2.6 * e}mm; line-height: 1.15;
  }
  .det { font-size: ${3.4 * e}mm; color: #6f6383; margin-top: ${1.4 * e}mm; }

  .faixa {
    margin: 0 ${-5 * e}mm; padding: ${2.6 * e}mm ${5 * e}mm;
    background: ${pub.cor}; color: #fff;
    display: flex; align-items: center; justify-content: space-between; gap: 2mm;
    font-size: ${3.2 * e}mm; font-weight: 700; letter-spacing: 0.12em;
  }
  .cod { font-family: 'JetBrains Mono', ui-monospace, monospace; letter-spacing: 0.02em; opacity: .85; }
  .fim { display: flex; align-items: center; gap: ${2 * e}mm; flex: none; }
  /* Fundo branco atrás do QR mesmo dentro da faixa colorida: sem contraste
     de preto sobre branco, leitor nenhum decodifica. */
  /* 13 mm fixos, sem acompanhar a escala do formato.
     Medido, não estimado: um QR de 21 módulos renderizado e reduzido ao que
     a câmera enxerga só lê de forma firme a partir de ~61 px de lado. Na
     escala da etiqueta o QR caía para 7 mm — decodifica em bancada e falha
     no balcão, com reflexo do porta-crachá, ângulo e mão tremendo.
     Na etiqueta isso engorda a faixa, e é troca boa: crachá que não lê é
     crachá que devolve a fila para a digitação. */
  .qr {
    width: 13mm; height: 13mm;
    flex: none;                 /* sem isto o flex da faixa espreme o QR na
                                   etiqueta estreita e ele para de decodificar */
    display: block; background: #fff;
    border-radius: ${0.8 * e}mm; padding: ${0.4 * e}mm;
  }

  @media screen {
    body { background: #efeaf5; padding: 10mm 0; }
    .folha { background: #fff; width: 210mm; margin: 0 auto 8mm; box-shadow: 0 2px 12px rgba(0,0,0,.14); min-height: 297mm; }
    .aviso {
      width: 210mm; margin: 0 auto 10mm; padding: 14px 18px; background: #fff;
      border-left: 4px solid ${pub.cor}; border-radius: 6px; font-size: 13px; line-height: 1.55;
    }
    .aviso b { display: block; font-size: 15px; margin-bottom: 4px; }
    .aviso button {
      margin-top: 10px; padding: 9px 16px; border: 0; border-radius: 6px;
      background: ${pub.cor}; color: #fff; font: inherit; font-weight: 700; cursor: pointer;
    }
  }
  @media print { .aviso { display: none; } }
</style></head>
<body>
<div class="aviso">
  <b>${itens.length} ${itens.length === 1 ? 'crachá' : 'crachás'} · ${Math.ceil(itens.length / porFolha)} folha(s) A4</b>
  Confira uma folha antes de mandar o lote. No diálogo de impressão: papel A4,
  margens <b style="display:inline">nenhuma</b> e a opção de imprimir cor de fundo ligada —
  sem ela a faixa colorida sai branca.
  <button onclick="window.print()">Imprimir agora</button>
</div>
<div class="folha">
${cartoes}
</div>
</body></html>`;
}

// ── Modal ───────────────────────────────────────────────────────────────────
// abreCrachas({ evento, participantes })
export function abreCrachas({ evento, participantes = [] } = {}) {
  const tipoEvento = evento?.event_type || 'congress';
  const cfg = {
    formato: 'padrao',
    quem: 'todos',
    corte: true,
    codigo: true,
    qr: true
  };
  let extras = null; // dados de empresa/corrida carregados sob demanda
  let resumo;

  function elegiveis() {
    let lista = participantes.slice();
    if (cfg.quem === 'pendentes') lista = lista.filter((p) => !p.checked);
    else if (cfg.quem === 'retirados') lista = lista.filter((p) => p.checked);
    return lista.sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
    );
  }

  function atualizaResumo() {
    if (!resumo) return;
    const n = elegiveis().length;
    const f = FORMATOS[cfg.formato];
    const folhas = Math.ceil(n / (f.cols * f.linhas));
    setContent(
      resumo,
      n
        ? `${n} ${n === 1 ? 'crachá' : 'crachás'} · ${folhas} folha(s) A4 · ${f.rot.split('·')[1].trim()}`
        : 'Ninguém neste filtro.'
    );
  }

  function opcao(campo, valor, titulo, sub) {
    const ligado = cfg[campo] === valor;
    return h(
      'button',
      {
        type: 'button',
        class: 'cr-opt' + (ligado ? ' on' : ''),
        'aria-pressed': ligado ? 'true' : 'false',
        onclick: () => {
          cfg[campo] = valor;
          desenha();
        }
      },
      h('div', { class: 'cr-opt-tit' }, titulo),
      sub ? h('div', { class: 'cr-opt-sub' }, sub) : null
    );
  }

  let corpo;
  function desenha() {
    if (!corpo) return;
    const pendentes = participantes.filter((p) => !p.checked).length;
    setContent(
      corpo,
      h('div', { class: 'cr-rot' }, 'Formato'),
      h(
        'div',
        { class: 'cr-grid' },
        ...Object.entries(FORMATOS).map(([k, f]) => opcao('formato', k, f.rot, f.sub))
      ),

      h('div', { class: 'cr-rot' }, 'Quem entra'),
      h(
        'div',
        { class: 'cr-grid' },
        opcao('quem', 'todos', 'Todos', `${participantes.length} inscritos`),
        opcao('quem', 'pendentes', 'Só quem ainda não retirou', `${pendentes} pessoas`),
        opcao('quem', 'retirados', 'Só quem já retirou', `${participantes.length - pendentes} pessoas`)
      ),

      h(
        'label',
        { class: 'pn-check', style: { marginTop: '4px' } },
        h('input', {
          type: 'checkbox',
          checked: cfg.corte || null,
          onchange: (e) => (cfg.corte = e.target.checked)
        }),
        h(
          'span',
          {},
          h('strong', {}, 'Linha de corte tracejada'),
          h('span', { class: 'pn-dica' }, 'Guia para a guilhotina. Desligue se for usar papel picotado.')
        )
      ),
      h(
        'label',
        { class: 'pn-check', style: { marginTop: '8px' } },
        h('input', {
          type: 'checkbox',
          checked: cfg.codigo || null,
          onchange: (e) => (cfg.codigo = e.target.checked)
        }),
        h(
          'span',
          {},
          h('strong', {}, 'Imprimir o código na faixa'),
          h('span', { class: 'pn-dica' }, 'É por ele que o balcão acha a pessoa se o nome estiver errado.')
        )
      ),
      h(
        'label',
        { class: 'pn-check', style: { marginTop: '8px' } },
        h('input', {
          type: 'checkbox',
          checked: cfg.qr || null,
          onchange: (e) => (cfg.qr = e.target.checked)
        }),
        h(
          'span',
          {},
          h('strong', {}, 'Imprimir o QR na faixa'),
          h('span', { class: 'pn-dica' }, 'É o que o leitor de câmera do credenciamento lê. Sem ele a fila volta a ser por busca de nome.')
        )
      ),

      (resumo = h('div', { class: 'cr-resumo' }))
    );
    atualizaResumo();
  }

  openModal({
    title: 'Crachás e etiquetas',
    body: () => {
      const wrap = h('div', { class: 'crachas' });
      corpo = h('div', {});
      wrap.append(
        h(
          'div',
          { class: 'lote-ajuda' },
          'Gera a folha de impressão para o time interno. Abre numa aba nova já ' +
            'pronta para imprimir — e o próprio diálogo do navegador salva em PDF.'
        ),
        corpo
      );
      desenha();
      return wrap;
    },
    actions: [
      { label: 'Fechar', kind: 'btn-ghost', onClick: (fechar) => fechar() },
      {
        label: 'Abrir para impressão',
        kind: 'btn-primary',
        onClick: async () => {
          const itens = elegiveis();
          if (!itens.length) return toast.danger('Ninguém neste filtro.');

          // Abre a janela ANTES do await: navegador bloqueia popup aberto
          // depois de uma promise, mesmo tendo vindo de clique do usuário.
          const win = window.open('', '_blank');
          if (!win) return toast.danger('O navegador bloqueou a janela. Libere o popup e tente de novo.');
          win.document.write('<p style="font:14px system-ui;padding:24px">Montando a folha…</p>');

          try {
            if (!extras) extras = await carregaExtras(evento, itens);
            itens.forEach((p) => Object.assign(p, extras.get(p.id) || {}));
            win.document.open();
            win.document.write(
              montaHTML(itens, {
                formato: cfg.formato,
                evento,
                tipo: tipoEvento,
                corte: cfg.corte,
                mostraCodigo: cfg.codigo,
                mostraQR: cfg.qr
              })
            );
            win.document.close();
            toast.success(`${itens.length} crachás prontos na aba nova.`);
          } catch (e) {
            win.close();
            toast.danger('Não deu para montar: ' + (e.message || e));
          }
        }
      }
    ]
  });
}

// Empresa/estande (expositor) e peito/distância/camiseta (corrida) vivem em
// outras tabelas. Só busca se o evento for desse tipo.
async function carregaExtras(evento, itens) {
  const mapa = new Map();
  const ids = itens.map((p) => p.id);
  if (!ids.length) return mapa;

  if (evento?.event_type === 'exhibitor') {
    const { data } = await supabase
      .from('exhibitor_members')
      .select('participant_id, exhibitors(empresa, estande)')
      .in('participant_id', ids);
    (data ?? []).forEach((m) =>
      mapa.set(m.participant_id, {
        __empresa: m.exhibitors?.empresa || '',
        __estande: m.exhibitors?.estande || ''
      })
    );
  } else if (evento?.event_type === 'race') {
    const { data } = await supabase
      .from('race_profiles')
      .select('participant_id, bib_number, distance, shirt_size')
      .in('participant_id', ids);
    (data ?? []).forEach((r) =>
      mapa.set(r.participant_id, {
        __peito: r.bib_number || '',
        __dist: r.distance || '',
        __camisa: r.shirt_size || ''
      })
    );
  }
  return mapa;
}
