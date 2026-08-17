// =============================================================
// LEITOR DE CÓDIGO · credenciamento
//
// Até hoje o balcão achava a pessoa digitando nome ou código. Funciona,
// mas é o passo mais lento da fila e o que mais erra: nome com acento,
// nome social, dois "Ana Paula Silva" na mesma lista.
//
// Este módulo não sabe nada sobre participante, evento ou Supabase. Ele
// abre a câmera, devolve o texto que leu e mostra o que quem chamou
// respondeu. Toda a decisão — quem é, se já passou, se pode passar — fica
// no app.js, que é quem tem o estado.
//
// Duas engrenagens de leitura, porque nenhuma cobre a fila inteira:
//   · BarcodeDetector, nativo, no Android e no Chrome. Rápido e de graça.
//   · jsQR, carregado só quando a nativa não existe — que é o caso de todo
//     iPhone, porque o Safari não implementa BarcodeDetector. São 127 KB
//     que só descem no primeiro toque do botão, e só nesses aparelhos.
//
// A câmera fica ligada entre uma leitura e outra de propósito: numa fila
// ninguém abre e fecha o leitor a cada pessoa. Fecha uma vez, no fim.
// =============================================================

const ESPERA_MESMO_CODIGO = 3000;   // relê o mesmo código só depois disso
const TEMPO_DO_AVISO      = 1500;   // quanto o resultado fica na tela
const FPS_NATIVO          = 12;
const FPS_JSQR            = 8;      // jsQR é caro; mais que isso esquenta o aparelho

let aberto   = false;
let parar    = null;                // desliga tudo, seja qual for o caminho
let jsQRPronto = null;              // promessa única de carregamento

// -------------------------------------------------------------
// jsQR entra por <script> porque o pacote é UMD e não é módulo.
// Uma promessa só: dois toques rápidos no botão não baixam duas vezes.
// -------------------------------------------------------------
function carregaJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (jsQRPronto) return jsQRPronto;
  jsQRPronto = new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = 'jsQR.min.js';
    s.onload  = () => window.jsQR ? ok(window.jsQR) : falha(new Error('jsQR não subiu'));
    s.onerror = () => falha(new Error('não foi possível carregar o leitor'));
    document.head.appendChild(s);
  });
  return jsQRPronto;
}

async function detectorNativo() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const formatos = await window.BarcodeDetector.getSupportedFormats();
    if (!formatos.includes('qr_code')) return null;
    return new window.BarcodeDetector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// TELA
// -------------------------------------------------------------
function montaTela() {
  const el = document.createElement('div');
  el.className = 'leitor';
  el.innerHTML = `
    <video class="leitor-video" playsinline muted autoplay></video>
    <div class="leitor-escuro"></div>
    <div class="leitor-mira"><span></span><span></span><span></span><span></span></div>

    <div class="leitor-topo">
      <button class="leitor-x" type="button" aria-label="Fechar leitor">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
      <div class="leitor-conta" aria-live="polite"><b>0</b> credenciados agora</div>
      <button class="leitor-luz" type="button" hidden aria-label="Lanterna">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2z"/></svg>
      </button>
    </div>

    <div class="leitor-dica">Aponte para o código do ingresso ou do crachá</div>
    <div class="leitor-aviso" role="status" aria-live="assertive"></div>

    <div class="leitor-manual">
      <button class="leitor-digitar" type="button">Digitar o código na mão</button>
    </div>
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  return el;
}

function mostraAviso(el, r) {
  const cx = el.querySelector('.leitor-aviso');
  const cor = { ok: 'ok', repetido: 'rep', erro: 'erro' }[r.tipo] || 'erro';
  cx.className = `leitor-aviso ${cor} on`;
  cx.innerHTML = `
    <div class="la-ico">${r.tipo === 'ok' ? '✓' : r.tipo === 'repetido' ? '!' : '×'}</div>
    <div><div class="la-t">${r.titulo}</div>${r.sub ? `<div class="la-s">${r.sub}</div>` : ''}</div>
  `;
  clearTimeout(cx._t);
  cx._t = setTimeout(() => cx.classList.remove('on'), TEMPO_DO_AVISO);
}

function telaDeErro(el, titulo, texto) {
  el.querySelector('.leitor-dica').remove();
  const cx = document.createElement('div');
  cx.className = 'leitor-falha';
  cx.innerHTML = `<div class="lf-t">${titulo}</div><div class="lf-s">${texto}</div>`;
  el.querySelector('.leitor-mira').replaceWith(cx);
}

// -------------------------------------------------------------
// ABRE
//
// aoLer(codigo) devolve — ou promete — um objeto:
//   { tipo: 'ok' | 'repetido' | 'erro', titulo, sub, conta }
// `conta` é o total credenciado na sessão, só para o contador do topo.
// -------------------------------------------------------------
export async function abreLeitor({ aoLer, aoFechar, aoDigitar }) {
  if (aberto) return;
  aberto = true;

  const el = montaTela();
  const video = el.querySelector('.leitor-video');
  let fluxo = null, vivo = true, ultimo = { codigo: '', quando: 0 };

  function fecha() {
    if (!vivo) return;
    vivo = false;
    aberto = false;
    // Soltar as trilhas apaga a luz da câmera. Sem isso a operadora acha
    // que o aparelho continua filmando e fecha o app no meio da fila.
    if (fluxo) fluxo.getTracks().forEach(t => t.stop());
    document.removeEventListener('visibilitychange', naTroca);
    el.classList.remove('on');
    setTimeout(() => el.remove(), 200);
    aoFechar && aoFechar();
  }
  parar = fecha;

  el.querySelector('.leitor-x').addEventListener('click', fecha);
  el.querySelector('.leitor-digitar').addEventListener('click', () => {
    fecha();
    aoDigitar && aoDigitar();
  });
  // Voltar no Android fecha o leitor, não o app.
  const naTecla = (ev) => { if (ev.key === 'Escape') fecha(); };
  document.addEventListener('keydown', naTecla, { once: false });

  // Aba escondida com câmera aberta drena bateria e trava em alguns Android.
  function naTroca() {
    if (!fluxo) return;
    const t = fluxo.getVideoTracks()[0];
    if (t) t.enabled = document.visibilityState === 'visible';
  }
  document.addEventListener('visibilitychange', naTroca);

  try {
    fluxo = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
  } catch (e) {
    const negou = /NotAllowed|Permission/i.test(String(e && e.name));
    telaDeErro(el,
      negou ? 'Sem permissão para usar a câmera' : 'Não consegui abrir a câmera',
      negou
        ? 'Libere a câmera para este site nas configurações do navegador e toque em ler de novo. Enquanto isso dá para credenciar buscando pelo nome.'
        : 'Pode ser outro aplicativo usando a câmera. Feche os outros e tente de novo — a busca por nome continua funcionando.');
    return;
  }

  video.srcObject = fluxo;
  try { await video.play(); } catch { /* alguns navegadores já tocam sozinhos */ }

  // Lanterna, quando o aparelho tem. No pavilhão fechado faz diferença real.
  const trilha = fluxo.getVideoTracks()[0];
  const capac = trilha.getCapabilities ? trilha.getCapabilities() : {};
  if (capac && capac.torch) {
    const bt = el.querySelector('.leitor-luz');
    bt.hidden = false;
    let ligada = false;
    bt.addEventListener('click', async () => {
      ligada = !ligada;
      try {
        await trilha.applyConstraints({ advanced: [{ torch: ligada }] });
        bt.classList.toggle('on', ligada);
      } catch { bt.hidden = true; }
    });
  }

  // ---- escolhe a engrenagem ----
  const nativo = await detectorNativo();
  let leJsQR = null;
  if (!nativo) {
    try {
      leJsQR = await carregaJsQR();
    } catch {
      telaDeErro(el, 'Não consegui carregar o leitor',
        'A parte do leitor que este aparelho precisa não baixou. Confira a conexão, ou credencie pela busca por nome.');
      return;
    }
  }

  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const intervalo = 1000 / (nativo ? FPS_NATIVO : FPS_JSQR);
  let ultimoQuadro = 0;

  async function quadro(agora) {
    if (!vivo) return;
    requestAnimationFrame(quadro);
    if (agora - ultimoQuadro < intervalo) return;
    ultimoQuadro = agora;
    if (video.readyState < 2 || document.visibilityState !== 'visible') return;

    let texto = null;
    try {
      if (nativo) {
        const achados = await nativo.detect(video);
        if (achados && achados.length) texto = achados[0].rawValue;
      } else {
        // Metade da resolução: o QR de um ingresso é grande no quadro e
        // isso corta o custo do jsQR em quatro sem perder leitura.
        const l = Math.max(1, Math.floor(video.videoWidth  / 2));
        const a = Math.max(1, Math.floor(video.videoHeight / 2));
        if (cv.width !== l) { cv.width = l; cv.height = a; }
        ctx.drawImage(video, 0, 0, l, a);
        const img = ctx.getImageData(0, 0, l, a);
        const r = leJsQR(img.data, l, a, { inversionAttempts: 'dontInvert' });
        if (r && r.data) texto = r.data;
      }
    } catch { /* quadro ruim acontece; o próximo resolve */ }

    if (!texto) return;

    const codigo = String(texto).trim();
    const t = Date.now();
    if (codigo === ultimo.codigo && t - ultimo.quando < ESPERA_MESMO_CODIGO) return;
    ultimo = { codigo, quando: t };

    const r = await aoLer(codigo);
    if (!r) return;
    if (typeof r.conta === 'number') el.querySelector('.leitor-conta b').textContent = r.conta;
    mostraAviso(el, r);
  }
  requestAnimationFrame(quadro);
}

export function fechaLeitor() { if (parar) parar(); }

// O botão some quando não há como ler — melhor do que abrir e falhar
// na frente de uma fila.
export function temCamera() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}
