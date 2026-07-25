// certificate-render-v2 — motor de certificados server-side (P2)
// ADITIVO: não substitui certificate-generate/certificate-dispatch (produção intocada).
//
// Formatos:
//   pdf   → certificado "Padrão" (A4 paisagem, mesmo template/layout do evento — compatível com o v1;
//           grava no MESMO caminho pdfs/{event_id}/{participant_id}.pdf e atualiza participants.certificate_url)
//   feed  → arte social 1080×1350 (PNG) — corrida
//   story → arte social 1080×1920 (PNG) — corrida
//
// Chamadas (POST, admin logado no painel):
//   { participant_id, formats?: ['pdf','feed','story'], force?, test_mode? }
//   { event_id, formats: [...], limit?: 30, force?, test_mode?, include_unchecked? }  → lote paginado
//
// Lote responde { generated, errors, remaining, done } — o painel repete até done=true.
// test_mode: sem template no Storage, renderiza fundo sintético "TEMPLATE DE TESTE" (valida o pipeline).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import { Resvg, initWasm } from 'https://esm.sh/@resvg/resvg-wasm@2.6.2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

// ── Inicialização preguiçosa (1x por instância) ──────────────────────────────
let wasmReady: Promise<void> | null = null;
function ensureWasm() {
  if (!wasmReady) {
    wasmReady = (async () => {
      const r = await fetch('https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm');
      await initWasm(r);
    })();
  }
  return wasmReady;
}

let fontsCache: Promise<Uint8Array[]> | null = null;
function ensureFonts() {
  if (!fontsCache) {
    fontsCache = (async () => {
      // UA sem suporte a woff2 → o Google Fonts responde com URLs .ttf
      const families = [
        'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap',
        'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&display=swap'
      ];
      const urls: string[] = [];
      for (const f of families) {
        const css = await (await fetch(f, { headers: { 'User-Agent': 'curl/8.5.0' } })).text();
        for (const m of css.matchAll(/url\((https:[^)]+\.ttf)\)/g)) urls.push(m[1]);
      }
      const bufs: Uint8Array[] = [];
      for (const u of [...new Set(urls)]) {
        bufs.push(new Uint8Array(await (await fetch(u)).arrayBuffer()));
      }
      if (!bufs.length) throw new Error('nenhuma fonte TTF obtida');
      return bufs;
    })();
  }
  return fontsCache;
}

// ── Auth (mesmo modelo do certificate-generate) ──────────────────────────────
async function requireAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return false;
  const { data } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return data?.role === 'admin';
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fmtDate(iso: string | null): string {
  if (!iso) return new Date().toLocaleDateString('pt-BR');
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function distanceLabel(d: string | null): string {
  if (!d) return '';
  const m = String(d).match(/(\d+)\s*k/i);
  return m ? `${m[1]}K` : String(d).trim();
}
function titleCaseName(s: string): string {
  return s.trim();
}

type Slot = {
  key: string; x: number; y: number; size: number;
  align?: 'left' | 'center' | 'right';
  color?: string; font?: string; weight?: number;
  max_w?: number; visible?: boolean; uppercase?: boolean;
};

function buildValues(p: any, ev: any, rp: any): Record<string, string> {
  const nome = p.name || '';
  return {
    NOME: titleCaseName(nome),
    PRIMEIRO_NOME: nome.trim().split(/\s+/)[0] || '',
    DATA: fmtDate(ev.date_end || ev.date_start || (ev.event_date ? ev.event_date + 'T12:00:00' : null)),
    HORAS: ev.certificate_hours ? `${ev.certificate_hours}h` : '',
    DISTANCIA: rp ? distanceLabel(rp.distance) : '',
    EVENTO: ev.name || '',
    CIDADE: ev.city || ''
  };
}

// Auto-ajuste: encolhe a fonte se o texto estourar a largura máxima (estimativa 0.56×size por caractere).
function fitSize(text: string, size: number, maxWidthPx: number): number {
  let s = size;
  while (s > 10 && text.length * s * 0.56 > maxWidthPx) s -= 2;
  return s;
}

// Fundo sintético de teste (pipeline válido sem arte oficial no Storage).
function testBackgroundSvg(w: number, h: number, label: string): string {
  return `
  <rect width="${w}" height="${h}" fill="#080014"/>
  <defs>
    <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#A78BFA"/><stop offset="1" stop-color="#22D3EE"/>
    </linearGradient>
  </defs>
  <circle cx="${w * 0.85}" cy="${h * 0.12}" r="${w * 0.35}" fill="#A78BFA" opacity="0.16"/>
  <circle cx="${w * 0.1}" cy="${h * 0.9}" r="${w * 0.3}" fill="#22D3EE" opacity="0.12"/>
  <rect x="${w * 0.06}" y="${h * 0.055}" width="${w * 0.2}" height="${h * 0.006}" fill="url(#g1)"/>
  <text x="${w * 0.06}" y="${h * 0.11}" font-family="Bricolage Grotesque" font-weight="800" font-size="${Math.round(w * 0.045)}" fill="#FFFFFF">${esc(label)}</text>
  <text x="${w * 0.06}" y="${h * 0.145}" font-family="DM Sans" font-weight="500" font-size="${Math.round(w * 0.02)}" fill="#B8B2D8">TEMPLATE DE TESTE — SUBSTITUIR PELA ARTE OFICIAL</text>`;
}

async function downloadTemplate(path: string): Promise<Uint8Array | null> {
  const { data, error } = await sb.storage.from('certificates').download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

function toDataUrl(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return 'data:image/png;base64,' + btoa(bin);
}

// ── Render PNG (feed/story) via SVG → resvg ──────────────────────────────────
async function renderPng(opts: {
  w: number; h: number;
  templateBytes: Uint8Array | null;
  testLabel: string;
  layout: Slot[];
  values: Record<string, string>;
}): Promise<Uint8Array> {
  await ensureWasm();
  const fonts = await ensureFonts();
  const { w, h, templateBytes, layout, values, testLabel } = opts;

  const bg = templateBytes
    ? `<image href="${toDataUrl(templateBytes)}" x="0" y="0" width="${w}" height="${h}"/>`
    : testBackgroundSvg(w, h, testLabel);

  const texts = layout
    .filter((s) => s.visible !== false)
    .map((s) => {
      let text = values[s.key] || '';
      if (!text) return '';
      if (s.uppercase) text = text.toUpperCase();
      const maxW = (s.max_w ?? 0.9) * w;
      const size = fitSize(text, s.size, maxW);
      const anchor = s.align === 'left' ? 'start' : s.align === 'right' ? 'end' : 'middle';
      const x = s.x * w;
      const y = s.y * h + size * 0.35; // baseline ≈ mesma semântica do PDF v1
      const fam = s.font || 'DM Sans';
      const weight = s.weight || (fam.includes('Bricolage') ? 800 : 700);
      const fill = s.color || '#FFFFFF';
      return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${esc(fam)}" font-weight="${weight}" font-size="${size}" fill="${esc(fill)}">${esc(text)}</text>`;
    })
    .join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg}\n${texts}</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: w },
    font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: 'DM Sans' }
  });
  return resvg.render().asPng();
}

// ── Render PDF "Padrão" (idêntico ao v1) ─────────────────────────────────────
async function renderPdf(ev: any, p: any): Promise<Uint8Array> {
  const tpl = await downloadTemplate(`${ev.id}/template.png`);
  if (!tpl) throw new Error('template do evento não encontrado no Storage (' + ev.id + '/template.png)');

  const layout: Slot[] = ev.certificate_layout || [
    { key: 'NOME', x: 0.5, y: 0.45, size: 56, align: 'center', visible: true },
    { key: 'DATA', x: 0.5, y: 0.62, size: 22, align: 'center', visible: true },
    { key: 'HORAS', x: 0.5, y: 0.7, size: 22, align: 'center', visible: true }
  ];

  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  const { width: W, height: H } = page.getSize();

  let bg;
  try { bg = await doc.embedPng(tpl); } catch { bg = await doc.embedJpg(tpl); }
  page.drawImage(bg, { x: 0, y: 0, width: W, height: H });

  const values = buildValues(p, ev, p.__rp || null);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const slot of layout) {
    if (slot.visible === false) continue;
    const text = values[slot.key] || '';
    if (!text) continue;
    const size = slot.size || 24;
    const tw = font.widthOfTextAtSize(text, size);
    const x = slot.align === 'center' ? slot.x * W - tw / 2 : slot.x * W;
    const y = (1 - slot.y) * H - size * 0.35;
    page.drawText(text, { x, y, size, font, color: rgb(0.08, 0.08, 0.08) });
  }
  return await doc.save();
}

// ── Geração por participante/formato ─────────────────────────────────────────
const SOCIAL_DEFAULT: Record<string, { w: number; h: number; layout: Slot[] }> = {
  feed: {
    w: 1080, h: 1350,
    layout: [
      { key: 'NOME', x: 0.5, y: 0.56, size: 72, align: 'center', font: 'Bricolage Grotesque', weight: 800, color: '#FFFFFF', max_w: 0.86 },
      { key: 'DISTANCIA', x: 0.5, y: 0.66, size: 44, align: 'center', font: 'DM Sans', weight: 700, color: '#22D3EE' },
      { key: 'DATA', x: 0.5, y: 0.72, size: 26, align: 'center', font: 'DM Sans', weight: 500, color: '#B8B2D8' }
    ]
  },
  story: {
    w: 1080, h: 1920,
    layout: [
      { key: 'NOME', x: 0.5, y: 0.52, size: 76, align: 'center', font: 'Bricolage Grotesque', weight: 800, color: '#FFFFFF', max_w: 0.86 },
      { key: 'DISTANCIA', x: 0.5, y: 0.6, size: 48, align: 'center', font: 'DM Sans', weight: 700, color: '#22D3EE' },
      { key: 'DATA', x: 0.5, y: 0.65, size: 28, align: 'center', font: 'DM Sans', weight: 500, color: '#B8B2D8' }
    ]
  }
};

async function generateOne(
  p: any, ev: any, kind: string,
  fmtRows: Record<string, any>, testMode: boolean
): Promise<string> {
  if (kind === 'pdf') {
    const bytes = await renderPdf(ev, p);
    const path = `pdfs/${ev.id}/${p.id}.pdf`;
    const { error } = await sb.storage.from('certificates')
      .upload(path, bytes, { upsert: true, contentType: 'application/pdf' });
    if (error) throw new Error('upload pdf: ' + error.message);
    const { data: pub } = sb.storage.from('certificates').getPublicUrl(path);
    await sb.from('participants').update({ certificate_url: pub.publicUrl }).eq('id', p.id);
    await sb.from('certificate_assets').upsert(
      { participant_id: p.id, kind: 'pdf', url: pub.publicUrl, storage_path: path, generated_at: new Date().toISOString() },
      { onConflict: 'participant_id,kind' }
    );
    return pub.publicUrl;
  }

  // feed / story
  const def = SOCIAL_DEFAULT[kind];
  if (!def) throw new Error('formato inválido: ' + kind);
  const cfg = fmtRows[kind] || null;
  const w = cfg?.width || def.w;
  const h = cfg?.height || def.h;
  const layout: Slot[] = (cfg?.layout && cfg.layout.length ? cfg.layout : def.layout);

  let tplBytes: Uint8Array | null = null;
  if (cfg?.template_path) tplBytes = await downloadTemplate(cfg.template_path);
  if (!tplBytes) tplBytes = await downloadTemplate(`${ev.id}/template_${kind}.png`);
  if (!tplBytes && !testMode) {
    throw new Error(`template ${kind} não encontrado (suba ${ev.id}/template_${kind}.png no bucket certificates ou use test_mode)`);
  }

  const bytes = await renderPng({
    w, h, templateBytes: tplBytes,
    testLabel: ev.name || 'NB RUN 2026',
    layout, values: buildValues(p, ev, p.__rp || null)
  });

  const path = `social/${ev.id}/${kind}/${p.id}.png`;
  const { error } = await sb.storage.from('certificates')
    .upload(path, bytes, { upsert: true, contentType: 'image/png' });
  if (error) throw new Error('upload png: ' + error.message);
  const { data: pub } = sb.storage.from('certificates').getPublicUrl(path);
  await sb.from('certificate_assets').upsert(
    { participant_id: p.id, kind, url: pub.publicUrl, storage_path: path, generated_at: new Date().toISOString() },
    { onConflict: 'participant_id,kind' }
  );
  return pub.publicUrl;
}

// ── Consultas ────────────────────────────────────────────────────────────────
const EV_SELECT = 'id, name, city, location, date_start, date_end, event_date, event_type, certificate_template_url, certificate_layout, certificate_hours';

async function loadEventBundle(eventId: string) {
  const { data: ev, error } = await sb.from('events').select(EV_SELECT).eq('id', eventId).single();
  if (error || !ev) throw new Error('evento não encontrado');
  const { data: fmts } = await sb.from('certificate_formats').select('*').eq('event_id', eventId).eq('active', true);
  const fmtRows: Record<string, any> = {};
  (fmts || []).forEach((f: any) => { fmtRows[f.kind] = f; });
  return { ev, fmtRows };
}

async function attachRaceProfiles(ev: any, ps: any[]) {
  if (ev.event_type !== 'race' || !ps.length) return;
  const ids = ps.map((p) => p.id);
  const { data } = await sb.from('race_profiles').select('*').in('participant_id', ids);
  const map: Record<string, any> = {};
  (data || []).forEach((r: any) => { map[r.participant_id] = r; });
  ps.forEach((p) => { p.__rp = map[p.id] || null; });
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (!(await requireAdmin(req.headers.get('Authorization'))))
      return json({ error: 'admin required' }, 403);

    const body = await req.json();
    const formats: string[] = (body.formats && body.formats.length ? body.formats : ['pdf'])
      .filter((f: string) => ['pdf', 'feed', 'story'].includes(f));
    const testMode = body.test_mode === true;
    const force = body.force === true;

    // ── Modo individual ──
    if (body.participant_id) {
      const { data: p, error } = await sb.from('participants').select('*').eq('id', body.participant_id).single();
      if (error || !p) return json({ error: 'participant not found' }, 404);
      if (!p.checked && !body.include_unchecked) return json({ error: 'participant has not checked in' }, 400);

      const { ev, fmtRows } = await loadEventBundle(p.event_id);
      await attachRaceProfiles(ev, [p]);

      const urls: Record<string, string> = {};
      for (const kind of formats) {
        urls[kind] = await generateOne(p, ev, kind, fmtRows, testMode);
      }
      return json({ urls });
    }

    // ── Modo lote ──
    if (body.event_id) {
      const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 50);
      const { ev, fmtRows } = await loadEventBundle(body.event_id);

      let q = sb.from('participants').select('*').eq('event_id', body.event_id).order('name');
      if (!body.include_unchecked) q = q.eq('checked', true);
      const { data: all, error } = await q.limit(3000);
      if (error) throw error;

      const ids = (all || []).map((p) => p.id);
      const existing = new Set<string>();
      if (ids.length && !force) {
        const { data: assets } = await sb.from('certificate_assets')
          .select('participant_id, kind').in('participant_id', ids).in('kind', formats);
        (assets || []).forEach((a: any) => existing.add(a.participant_id + '|' + a.kind));
        if (formats.includes('pdf')) {
          (all || []).forEach((p) => { if (p.certificate_url) existing.add(p.id + '|pdf'); });
        }
      }

      const pending: Array<{ p: any; kind: string }> = [];
      for (const p of all || []) {
        for (const kind of formats) {
          if (!existing.has(p.id + '|' + kind)) pending.push({ p, kind });
        }
      }

      const slice = pending.slice(0, limit);
      const uniqueP = [...new Map(slice.map((x) => [x.p.id, x.p])).values()];
      await attachRaceProfiles(ev, uniqueP);

      let generated = 0;
      const errors: string[] = [];
      for (const { p, kind } of slice) {
        try {
          await generateOne(p, ev, kind, fmtRows, testMode);
          generated++;
        } catch (e) {
          errors.push(`${p.name} [${kind}]: ${e instanceof Error ? e.message : e}`);
          if (errors.length >= 5) break; // falha sistêmica: para cedo e reporta
        }
      }

      const remaining = pending.length - slice.length + (slice.length - generated);
      return json({
        generated,
        errors: errors.slice(0, 5),
        remaining,
        done: remaining <= 0 || errors.length >= 5,
        total_pending_before: pending.length
      });
    }

    return json({ error: 'participant_id ou event_id obrigatório' }, 400);
  } catch (e) {
    console.error(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    return json({ error: e instanceof Error ? e.message : 'internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}
