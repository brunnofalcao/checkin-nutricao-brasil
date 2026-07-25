import { supabase } from './supabase.js';

// ── Base de Conhecimento da Kcal (tabela ai_kb) ──────────────────────────────
// A Kcal (whatsapp-inbound) lê os tópicos ativos desta tabela a cada conversa.
// Tudo que for salvo aqui entra no ar imediatamente — sem deploy.
// updated_at é gravado no client (não há trigger no banco para esta tabela).

// Lista todos os tópicos (ativos e inativos), ordenados por topic.
export async function listKbTopics() {
  const { data, error } = await supabase
    .from('ai_kb')
    .select('*')
    .order('topic', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Cria um tópico novo.
export async function createKbTopic({ topic, title, content, active = true }) {
  const { data, error } = await supabase
    .from('ai_kb')
    .insert({ topic, title, content, active, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Atualiza um tópico (sempre carimba updated_at).
export async function updateKbTopic(id, patch) {
  const { data, error } = await supabase
    .from('ai_kb')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Liga/desliga um tópico sem mexer no conteúdo.
export async function setKbTopicActive(id, active) {
  return updateKbTopic(id, { active });
}

// Exclui um tópico (definitivo — preferir desativar).
export async function deleteKbTopic(id) {
  const { error } = await supabase.from('ai_kb').delete().eq('id', id);
  if (error) throw error;
}

// Normaliza a chave do tópico: minúsculas, sem acento, underscores.
export function slugifyTopic(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}
