// =====================================================================
// INSCRITOS POR MÓDULO
//
// O campo `lote` que a Hotmart manda carrega duas informações grudadas:
// o módulo e a fase da venda. "Pré-Venda — Plenária Principal" e
// "Plenária Principal" são o MESMO módulo em momentos diferentes, e
// contá-los separado esconde o número que importa na hora de dimensionar
// sala, coffee e crachá.
//
// A lista oficial de módulos é a cert_modulos — a mesma que o certificado
// usa. Módulo cadastrado com zero venda aparece com zero, de propósito:
// é assim que se percebe que um produto não está vendendo (ou que a
// integração não está trazendo).
//
// Lote que não bate com nenhum módulo vira grupo próprio em vez de sumir
// ou ser chutado para dentro do módulo mais parecido. Foi assim que os
// lotes "kv5pzf60" de Belém ficaram visíveis: são código de oferta da
// Hotmart vazando no lugar do nome.
// =====================================================================
import { supabase } from './supabase.js';

export async function listModulos(eventId) {
  const { data, error } = await supabase
    .from('cert_modulos')
    .select('chave, nome, ordem')
    .eq('event_id', eventId)
    .order('ordem');
  if (error) throw error;
  return data ?? [];
}

// minúsculas, sem acento, espaços normalizados
export function dobra(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const PRE_VENDA = /^pr[ée][\s-]?venda\b/i;

// Um lote é pré-venda quando começa marcando isso E sobra alguma coisa
// depois. "Pré-Venda" sozinho (Belém) é o nome do lote, não uma fase de
// um módulo — senão ele viraria um grupo de barra vazia.
export function ehPreVenda(lote, modulo) {
  if (!modulo) return false;
  const d = dobra(lote);
  return PRE_VENDA.test(d) && d !== dobra(modulo);
}

// Acha o módulo cadastrado que o lote menciona. Casa pelo nome mais longo
// primeiro, para "Plenária Principal" ganhar de um eventual "Plenária".
export function moduloDoLote(lote, modulos) {
  const d = dobra(lote);
  if (!d) return null;
  const ordenados = [...modulos].sort(
    (a, b) => dobra(b.chave || b.nome).length - dobra(a.chave || a.nome).length
  );
  for (const m of ordenados) {
    const chave = dobra(m.chave || m.nome);
    if (chave && d.includes(chave)) return m;
  }
  return null;
}

// Devolve as barras já prontas para desenhar, maior primeiro.
// [{ nome, total, presentes, preVenda, loteAtual, cadastrado, lotes: [{lote,n}] }]
export function agrupaPorModulo(participantes, modulos = []) {
  const grupos = new Map();

  const pega = (nome, cadastrado, ordem) => {
    if (!grupos.has(nome)) {
      grupos.set(nome, {
        nome, cadastrado, ordem,
        total: 0, presentes: 0, preVenda: 0, loteAtual: 0,
        lotes: new Map()
      });
    }
    return grupos.get(nome);
  };

  // módulo cadastrado nasce com zero — some da tela só se nunca existiu
  modulos.forEach((m, i) => pega(m.nome || m.chave, true, m.ordem ?? i));

  for (const p of participantes) {
    const lote = (p.lote || '').trim();
    const m = moduloDoLote(lote, modulos);
    const nome = m ? (m.nome || m.chave) : (lote || 'Sem lote');
    const g = pega(nome, !!m, m ? (m.ordem ?? 900) : 900);

    g.total++;
    if (p.checked) g.presentes++;
    if (m && ehPreVenda(lote, m.chave || m.nome)) g.preVenda++;
    else g.loteAtual++;

    const chaveLote = lote || 'Sem lote';
    g.lotes.set(chaveLote, (g.lotes.get(chaveLote) || 0) + 1);
  }

  return [...grupos.values()]
    .map((g) => ({
      ...g,
      lotes: [...g.lotes.entries()]
        .map(([lote, n]) => ({ lote, n }))
        .sort((a, b) => b.n - a.n)
    }))
    .sort((a, b) => b.total - a.total || a.ordem - b.ordem || a.nome.localeCompare(b.nome));
}
