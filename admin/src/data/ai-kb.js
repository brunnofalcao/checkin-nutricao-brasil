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

// ── Sincronização com o site ────────────────────────────────────────────────
// O kb-site-monitor lê as páginas do site todo dia. Quando algo muda, ele
// reescreve o tópico correspondente e guarda o texto anterior aqui. Antes
// isso só gerava um alerta que ninguém abria — e a Kcal seguia respondendo
// com fato velho.

// Mudanças detectadas: pendentes primeiro, depois as já publicadas.
export async function listKbMudancas(limite = 40) {
  const { data, error } = await supabase
    .from('kb_changelog')
    .select('*')
    .order('detected_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data ?? [];
}

// As páginas monitoradas e o tópico que cada uma alimenta.
export async function listKbFontes() {
  const { data, error } = await supabase
    .from('kb_sources')
    .select('id, url, label, priority, active, kb_topic, sync_auto, last_checked, last_changed')
    .order('priority')
    .order('id');
  if (error) throw error;
  return data ?? [];
}

// Publica uma proposta. O banco regrava old_content com o texto que está no
// ar AGORA, para o caso de alguém ter editado à mão nesse meio-tempo.
export async function aplicaMudanca(id) {
  const { data, error } = await supabase.rpc('kb_aplica_mudanca', { p_id: id });
  if (error) throw error;
  if (data?.erro) throw new Error(ERROS[data.erro] || data.erro);
  return data;
}

// Volta o tópico para o texto anterior à mudança.
export async function desfazMudanca(id) {
  const { data, error } = await supabase.rpc('kb_desfaz_mudanca', { p_id: id });
  if (error) throw error;
  if (data?.erro) throw new Error(ERROS[data.erro] || data.erro);
  return data;
}

// Marca como lida sem publicar (para alerta de página sem tópico).
export async function marcaLida(id) {
  const { data, error } = await supabase.rpc('kb_marca_lida', { p_id: id });
  if (error) throw error;
  if (data?.erro) throw new Error(ERROS[data.erro] || data.erro);
  return data;
}

// Sem argumento, lê o modo. Com argumento, troca: auto | proposta | off.
export async function modoSync(modo) {
  const { data, error } = await supabase.rpc('kb_modo_sync', { p_modo: modo ?? null });
  if (error) throw error;
  if (data?.erro) throw new Error(ERROS[data.erro] || data.erro);
  return data?.modo || 'auto';
}

const ERROS = {
  sem_permissao: 'Só administrador pode mexer aqui.',
  nao_existe: 'Essa mudança não existe mais.',
  ja_aplicada: 'Essa mudança já está no ar.',
  nao_aplicada: 'Essa mudança não chegou a ir ao ar.',
  sem_conteudo: 'Essa linha é só um alerta — não tem texto para publicar.',
  sem_versao_anterior: 'Não há versão anterior guardada para restaurar.',
  topico_sumiu: 'O tópico foi excluído. Recrie antes de restaurar.',
  modo_invalido: 'Modo inválido.'
};

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
