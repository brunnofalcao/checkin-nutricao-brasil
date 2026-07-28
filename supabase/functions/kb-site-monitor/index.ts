// ============================================================
// Edge Function: kb-site-monitor (v2)
//
// v1 só DETECTAVA: comparava o hash da página e escrevia um alerta em
// kb_changelog dizendo "rodar análise e atualizar a Base de Conhecimento".
// Ninguém rodava. Em 28/07/2026 havia 9 alertas sem leitura desde 25/07 e a
// Kcal seguia dizendo "a programação de Belém ainda está sendo confirmada"
// para leads que tinham acabado de receber a campanha de Belém.
//
// v2 fecha o circuito: detecta, lê a mudança e REESCREVE o tópico da
// Base de Conhecimento. Cada alteração guarda o texto anterior, então
// qualquer uma volta atrás com um clique no painel.
//
// Trava: só reescreve página que tem kb_topic + sync_auto = true. Página
// não mapeada continua só alertando — nunca inventa tópico novo sozinha.
// Chave ai_settings.kb_sync_modo: auto | proposta | off.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const MODELOS = ["claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001"];

// Extrai texto visível. Diferente do v1: preserva alt de imagem, porque
// logo de patrocinador é <img alt="Nestlé Health Science"> — sem isso o
// monitor era cego justamente para as marcas.
function htmlToText(html: string): string {
  const alts: string[] = [];
  for (const m of html.matchAll(/<img[^>]*\balt="([^"]{2,80})"[^>]*>/gi)) alts.push(m[1]);

  const texto = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<img[^>]*\balt="([^"]{2,80})"[^>]*>/gi, " [imagem: $1] ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const marcas = [...new Set(alts)];
  return marcas.length ? `${texto}\n\nIMAGENS DA PÁGINA (marcas e logos): ${marcas.join(", ")}` : texto;
}

async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Reescreve o tópico a partir do texto novo da página.
async function reescreve(
  key: string,
  pagina: string,
  topicoAtual: string,
  titulo: string,
  instrucao: string,
  label: string,
): Promise<{ conteudo: string; resumo: string } | null> {
  const system = `Você mantém a base de fatos de um assistente de WhatsApp do evento Nutrição Brasil.
Recebe o TEXTO ATUAL DE UMA PÁGINA do site oficial e a VERSÃO ANTERIOR do tópico, e devolve a versão atualizada.

REGRAS ABSOLUTAS:
- Só afirme o que está literalmente no texto da página. Nunca deduza, complete ou estime.
- Fato que estava na versão anterior e NÃO aparece mais na página: mantenha apenas se for informação estável que a página simplesmente não repete (endereço, CNPJ, política). Se for preço, data, nome de palestrante ou marca, remova — sumiu da página porque mudou.
- Nada de opinião, adjetivo de venda ou instrução ao leitor. É base de fatos.
- Texto corrido, direto, em português do Brasil. Sem markdown, sem bullets, sem títulos.
- Preserve as regras de conduta que existirem na versão anterior (ex.: "informar só quando perguntado", "grade sujeita a ajustes").
- Se a página não tiver informação suficiente, devolva a versão anterior sem alteração.

Responda APENAS com JSON válido, sem cercas de código:
{"conteudo":"<texto do tópico>","resumo":"<uma frase dizendo o que mudou em relação à versão anterior>"}`;

  const user = `TÓPICO: ${titulo}
O QUE ESTE TÓPICO DEVE COBRIR: ${instrucao || "Fatos objetivos da página."}

VERSÃO ANTERIOR:
${topicoAtual || "(não existia)"}

TEXTO ATUAL DA PÁGINA "${label}":
${pagina.slice(0, 24000)}`;

  for (const model of MODELOS) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 2000, system, messages: [{ role: "user", content: user }] }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const txt = (data?.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
      const limpo = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const obj = JSON.parse(limpo);
      if (obj?.conteudo && typeof obj.conteudo === "string") {
        return { conteudo: obj.conteudo.trim(), resumo: String(obj.resumo || "").trim() };
      }
    } catch { /* tenta o próximo modelo */ }
  }
  return null;
}

// Barreira antes de gravar. Reescrita que não passa vira proposta, não vai ao ar.
function aceitavel(novo: string, velho: string): string | null {
  if (!novo || novo.length < 80) return "texto curto demais";
  if (novo.length > 8000) return "texto longo demais";
  if (/```|^\s*#|\bnão (consegui|foi possível)\b/i.test(novo)) return "veio com formatação ou recado do modelo";
  if (velho) {
    const r = novo.length / velho.length;
    if (r < 0.35) return `encolheu demais (${Math.round(r * 100)}% do anterior)`;
    if (r > 4) return `inchou demais (${Math.round(r * 100)}% do anterior)`;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";

  const { data: cfg } = await sb.from("ai_settings").select("value").eq("key", "kb_sync_modo").maybeSingle();
  const modo = (cfg?.value || "auto").toLowerCase(); // auto | proposta | off

  const { data: sources } = await sb.from("kb_sources").select("*").eq("active", true);
  if (!sources?.length) return json({ ok: true, idle: true });

  let checked = 0, changed = 0, aplicados = 0, propostas = 0, errors = 0;
  const detalhe: any[] = [];

  for (const s of sources) {
    try {
      const res = await fetch(s.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NB-KB-Monitor/2.0)" },
        redirect: "follow",
      });
      if (!res.ok) {
        errors++;
        await sb.from("kb_changelog").insert({
          source_id: s.id, url: s.url, change_kind: "erro", note: `HTTP ${res.status} ao acessar a página`,
        });
        await sb.from("kb_sources").update({ last_checked: new Date().toISOString() }).eq("id", s.id);
        continue;
      }

      const text = htmlToText(await res.text());
      const hash = await sha(text);
      const agora = new Date().toISOString();
      checked++;

      if (!s.last_hash) {
        await sb.from("kb_sources").update({
          last_hash: hash, last_text: text, last_checked: agora, last_changed: agora,
        }).eq("id", s.id);
        continue;
      }

      if (hash === s.last_hash) {
        await sb.from("kb_sources").update({ last_checked: agora }).eq("id", s.id);
        continue;
      }

      changed++;
      await sb.from("kb_sources").update({
        last_hash: hash, last_text: text, last_checked: agora, last_changed: agora,
      }).eq("id", s.id);

      const podeSync = s.kb_topic && s.sync_auto && ANTHROPIC_KEY && modo !== "off";
      if (!podeSync) {
        await sb.from("kb_changelog").insert({
          source_id: s.id, url: s.url, change_kind: "conteudo", topic: s.kb_topic || null,
          old_hash: s.last_hash, new_hash: hash,
          old_len: (s.last_text || "").length, new_len: text.length,
          note: `Alteração em "${s.label}" (${s.priority}). ${s.kb_topic ? "Sync desligado para esta página." : "Página sem tópico mapeado — revisar à mão."}`,
        });
        detalhe.push({ url: s.url, acao: "so_alerta" });
        continue;
      }

      const { data: atual } = await sb.from("ai_kb").select("*").eq("topic", s.kb_topic).maybeSingle();
      const reescrita = await reescreve(
        ANTHROPIC_KEY, text, atual?.content || "", s.kb_titulo || atual?.title || s.label, s.instrucao || "", s.label,
      );

      if (!reescrita) {
        errors++;
        await sb.from("kb_changelog").insert({
          source_id: s.id, url: s.url, change_kind: "erro", topic: s.kb_topic,
          old_hash: s.last_hash, new_hash: hash,
          note: `A página "${s.label}" mudou, mas a releitura falhou. Tópico "${s.kb_topic}" segue com o texto antigo — revisar à mão.`,
        });
        continue;
      }

      const igual = (atual?.content || "").trim() === reescrita.conteudo.trim();
      const veto = aceitavel(reescrita.conteudo, atual?.content || "");
      const aplica = modo === "auto" && !veto && !igual;

      await sb.from("kb_changelog").insert({
        source_id: s.id, url: s.url, change_kind: "conteudo", topic: s.kb_topic,
        old_hash: s.last_hash, new_hash: hash,
        old_len: (s.last_text || "").length, new_len: text.length,
        old_content: atual?.content || null,
        new_content: reescrita.conteudo,
        applied: aplica,
        applied_at: aplica ? agora : null,
        resumo: igual
          ? "A página mudou, mas nada que o tópico afirma mudou."
          : (reescrita.resumo || "Conteúdo do tópico atualizado."),
        note: aplica
          ? `"${s.label}" mudou e o tópico "${s.kb_topic}" foi atualizado automaticamente.`
          : igual
            ? `"${s.label}" mudou em algo que não afeta o tópico "${s.kb_topic}".`
            : veto
              ? `Atualização de "${s.kb_topic}" NÃO foi aplicada: ${veto}. Revisar antes de publicar.`
              : `Proposta de atualização para "${s.kb_topic}" aguardando aprovação.`,
      });

      if (aplica) {
        if (atual) {
          await sb.from("ai_kb").update({
            content: reescrita.conteudo,
            title: s.kb_titulo || atual.title,
            updated_at: agora,
          }).eq("id", atual.id);
        } else {
          await sb.from("ai_kb").insert({
            topic: s.kb_topic, title: s.kb_titulo || s.label,
            content: reescrita.conteudo, active: true, updated_at: agora,
          });
        }
        aplicados++;
        detalhe.push({ url: s.url, topic: s.kb_topic, acao: "aplicado", resumo: reescrita.resumo });
      } else if (!igual) {
        propostas++;
        detalhe.push({ url: s.url, topic: s.kb_topic, acao: veto ? "vetado" : "proposta", motivo: veto });
      }

      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      errors++;
      await sb.from("kb_changelog").insert({
        source_id: s.id, url: s.url, change_kind: "erro", note: String(e),
      });
    }
  }

  return json({ ok: true, modo, checked, changed, aplicados, propostas, errors, detalhe });
});
