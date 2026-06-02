import { supabase } from './supabase.js';

// Lista TODOS os participantes de um evento (até 2000 por evento, suficiente).
// Filtro/busca são feitos client-side — mais rápido e robusto para 200-500 inscritos.
export async function listAllParticipants(eventId) {
  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('event_id', eventId)
    .order('name', { ascending: true })
    .limit(2000);
  if (error) {
    console.error('Erro ao buscar participantes:', error);
    throw error;
  }
  return data ?? [];
}

// Busca paginada via RPC (mantido por compatibilidade, mas não usado na tela de detalhe).
export async function searchParticipants(eventId, opts = {}) {
  const { query = '', onlyPending = false, limit = 50, offset = 0 } = opts;
  const { data, error } = await supabase.rpc('search_participants', {
    p_event_id: eventId,
    p_query: query,
    p_only_pending: onlyPending,
    p_limit: limit,
    p_offset: offset
  });
  if (error) throw error;
  return data ?? [];
}

// Total de participantes do evento.
export async function countParticipants(eventId, onlyPending = false) {
  let q = supabase
    .from('participants')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);
  if (onlyPending) q = q.eq('checked', false);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

// Marca check-in (RPC segura, idempotente).
export async function checkinParticipant(id) {
  const { data, error } = await supabase.rpc('checkin_participant', { p_id: id });
  if (error) throw error;
  return data;
}

// Desfaz check-in (admin only).
export async function uncheckinParticipant(id) {
  const { data, error } = await supabase.rpc('uncheckin_participant', { p_id: id });
  if (error) throw error;
  return data;
}
