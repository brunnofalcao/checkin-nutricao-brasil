import { supabase } from './supabase.js';

// Lista TODOS os participantes de um evento.
// Filtro/busca são feitos client-side — mais rápido e robusto para a escala
// destes eventos.
//
// A API do Supabase corta TODA resposta em 1.000 linhas, e esse corte não é
// negociável pelo cliente: pedir `.limit(2000)` devolve 1.000 do mesmo jeito.
// Brasília tem 1.318 inscritos, então a tela mostrava os 1.000 primeiros em
// ordem alfabética e sumia com 318 pessoas — de "Nadielli Ribeiro" em diante.
// Pior: sumia calado. A busca não achava essas pessoas, e todo contador da
// tela (inscritos, check-in, pendentes) mentia por 318.
//
// Agora a lista vem em páginas de 1.000 até acabar.
const PAGINA = 1000;   // teto por resposta da API
const TETO   = 20000;  // trava de segurança contra laço infinito

export async function listAllParticipants(eventId) {
  const todos = [];
  let total = null;

  for (let de = 0; de < TETO; de += PAGINA) {
    // Ordenar só por nome não basta para paginar: há nomes repetidos, e sem
    // critério de desempate a mesma pessoa pode cair em duas páginas (ou
    // sumir entre elas). O id resolve.
    const { data, error, count } = await supabase
      .from('participants')
      .select('*', { count: 'exact' })
      .eq('event_id', eventId)
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(de, de + PAGINA - 1);

    if (error) {
      console.error('Erro ao buscar participantes:', error);
      throw error;
    }

    if (total === null && typeof count === 'number') total = count;
    const lote = data ?? [];
    todos.push(...lote);

    if (lote.length < PAGINA) break;                 // acabou
    if (total !== null && todos.length >= total) break;
  }

  // Se ainda assim faltou gente (evento absurdo, acima do teto), a tela
  // precisa saber: os contadores dela passam a estar errados.
  if (total !== null && total > todos.length) {
    todos.__truncado = { mostrando: todos.length, total };
  }
  return todos;
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
