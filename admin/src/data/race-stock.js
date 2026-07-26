import { supabase } from './supabase.js';
import { shirtLabel, shirtSortKey } from './race.js';

// ── NB Run · estoque de itens do kit ─────────────────────────────────────────
// race_stock: quanto a produção comprou de cada tamanho. É o contraponto da
// demanda (race_profiles) e do que já saiu (participants.checked).
// Leitura: qualquer usuário autenticado. Escrita: só admin (RLS is_admin()).

export const SHIRT_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'];

// Retorna { tamanho -> qtd } do item informado (padrão: camiseta).
export async function listRaceStock(eventId, item = 'camiseta') {
  const { data, error } = await supabase
    .from('race_stock')
    .select('size, qty')
    .eq('event_id', eventId)
    .eq('item', item);
  if (error) throw error;
  const map = {};
  (data ?? []).forEach((r) => {
    const size = shirtLabel(r.size) || String(r.size || '').toUpperCase();
    if (size) map[size] = Number(r.qty) || 0;
  });
  return map;
}

// Grava o estoque inteiro de uma vez (upsert por event_id + item + size).
export async function saveRaceStock(eventId, sizes, item = 'camiseta') {
  const rows = Object.entries(sizes)
    .filter(([size]) => !!size)
    .map(([size, qty]) => ({
      event_id: eventId,
      item,
      size: String(size).toUpperCase(),
      qty: Math.max(0, Number(qty) || 0),
      updated_at: new Date().toISOString()
    }));
  if (!rows.length) return {};
  const { error } = await supabase
    .from('race_stock')
    .upsert(rows, { onConflict: 'event_id,item,size' });
  if (error) throw error;
  return listRaceStock(eventId, item);
}

// Junta demanda (inscritos), entregue (checked) e estoque numa linha por tamanho.
// saldo    = o que ainda está fisicamente na mesa
// cobertura= saldo - pendente → negativo significa ruptura anunciada
export function buildStockRows(raceMap, participants, stock) {
  const checkedIds = new Set(participants.filter((p) => p.checked).map((p) => p.id));
  const demand = {};
  Object.values(raceMap).forEach((rp) => {
    const size = shirtLabel(rp.shirt_size) || '?';
    if (!demand[size]) demand[size] = { demanda: 0, entregue: 0 };
    demand[size].demanda++;
    if (checkedIds.has(rp.participant_id)) demand[size].entregue++;
  });

  const known = Object.keys(stock || {}).length > 0;
  const sizes = new Set([...Object.keys(demand), ...Object.keys(stock || {})]);

  return [...sizes]
    .map((size) => {
      const d = demand[size] || { demanda: 0, entregue: 0 };
      const estoque = known ? (stock[size] ?? 0) : null;
      const pendente = d.demanda - d.entregue;
      const saldo = estoque === null ? null : estoque - d.entregue;
      const cobertura = saldo === null ? null : saldo - pendente;
      return { size, ...d, pendente, estoque, saldo, cobertura };
    })
    .sort((a, b) => shirtSortKey(a.size) - shirtSortKey(b.size) || a.size.localeCompare(b.size));
}
