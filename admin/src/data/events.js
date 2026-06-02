import { supabase } from './supabase.js';

// Lista todos os eventos, ordenados por data (asc) e depois por created_at.
export async function listEvents() {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('date_start', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

// Busca um evento por id.
export async function getEvent(id) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Atualiza campos de um evento.
export async function updateEvent(id, patch) {
  const { data, error } = await supabase
    .from('events')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Filtra eventos por status.
export async function listEventsByStatus(status) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', status)
    .order('date_start', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
