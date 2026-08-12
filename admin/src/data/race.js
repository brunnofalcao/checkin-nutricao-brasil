import { supabase } from './supabase.js';

// ── NB Run · perfis de corrida ────────────────────────────────────────────────
// race_profiles é 1:1 com participants (participant_id, UNIQUE + FK CASCADE).
// A leitura é feita por join no evento — não altera as queries do congresso.

// Retorna um mapa { participant_id -> race_profile } de um evento de corrida.
export async function listRaceProfiles(eventId) {
  // Sem limite explícito valia o teto padrão do PostgREST (1000). Com 1.500
  // corredores, os que sobrassem apareceriam como "sem perfil" E sumiriam da
  // conta de camiseta — que é justamente o que alimenta o alerta de ruptura.
  const { data, error } = await supabase
    .from('race_profiles')
    .select('*, participants!inner(event_id)')
    .eq('participants.event_id', eventId)
    .limit(5000);
  if (error) throw error;
  const map = {};
  (data ?? []).forEach((rp) => {
    map[rp.participant_id] = rp;
  });
  return map;
}

// "Corrida 5Km" -> "5K" · "Corrida 10Km" -> "10K" (fallback: valor original).
export function distanceLabel(d) {
  if (!d) return '';
  const m = String(d).match(/(\d+)\s*k/i);
  return m ? `${m[1]}K` : String(d).trim();
}

// "CAMISETA GG" -> "GG" (fallback: valor original).
export function shirtLabel(s) {
  if (!s) return '';
  const clean = String(s).replace(/camiseta/i, '').replace(/[^a-zA-Z]/g, '').trim().toUpperCase();
  return clean || String(s).trim().toUpperCase();
}

// Ordena tamanhos na sequência natural de mesa de kit (P antes de M etc).
const SHIRT_ORDER = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EG', 'EGG'];
export function shirtSortKey(size) {
  const i = SHIRT_ORDER.indexOf(size);
  return i === -1 ? 100 : i;
}

// Agrega camisetas por tamanho: { size: { total, taken } }.
// "Retirado" segue a convenção do projeto: participants.checked = kit entregue.
export function aggregateShirts(raceMap, participants) {
  const checkedIds = new Set(participants.filter((p) => p.checked).map((p) => p.id));
  const bySize = {};
  Object.values(raceMap).forEach((rp) => {
    const size = shirtLabel(rp.shirt_size) || '?';
    if (!bySize[size]) bySize[size] = { total: 0, taken: 0 };
    bySize[size].total++;
    if (checkedIds.has(rp.participant_id)) bySize[size].taken++;
  });
  return Object.entries(bySize).sort(
    (a, b) => shirtSortKey(a[0]) - shirtSortKey(b[0]) || a[0].localeCompare(b[0])
  );
}
