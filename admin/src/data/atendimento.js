// =====================================================================
// FILA DE ATENDIMENTO
//
// Quando a Kcal não resolve, ela marca a conversa como humana e para de
// responder. Isso funcionava — só que ninguém via a fila. Em 05/08 havia
// 20 conversas paradas, a mais antiga esperando 13 dias, incluindo uma
// pessoa que escreveu "ninguém me respondeu sobre isso".
//
// Silêncio não é atendimento. Esta camada existe para a fila ter dono.
// =====================================================================
import { supabase } from './supabase.js';

export const MOTIVOS = {
  pagamento:     { rot: 'Pagamento',      urgente: true },
  reembolso:     { rot: 'Reembolso',      urgente: true },
  titularidade:  { rot: 'Titularidade',   urgente: true },
  reclamacao:    { rot: 'Reclamação',     urgente: true },
  juridico:      { rot: 'Jurídico',       urgente: true },
  imprensa:      { rot: 'Imprensa',       urgente: false },
  patrocinio:    { rot: 'Patrocínio',     urgente: false },
  dados:         { rot: 'Dados da inscrição', urgente: false },
  falha_tecnica: { rot: 'Falha técnica',  urgente: false },
  outro:         { rot: 'Outro',          urgente: false }
};

export function motivoRot(m) {
  return MOTIVOS[m]?.rot || (m ? m.replace(/_/g, ' ') : 'Sem motivo');
}

export function ehUrgente(c) {
  return !!MOTIVOS[c.escal_motivo]?.urgente || (c.horas_esperando || 0) >= 24;
}

export async function listaFila() {
  const { data, error } = await supabase
    .from('fila_atendimento')
    .select('*')
    .order('escalated_at', { ascending: true });   // quem espera há mais tempo primeiro
  if (error) throw error;
  return data ?? [];
}

// As últimas mensagens, para quem for responder saber do que se trata sem
// abrir o WhatsApp e sem perguntar de novo o que a pessoa já contou.
export async function conversa(id, limite = 20) {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('role, content, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).reverse();
}

export async function resolve(id, voltaBot = true) {
  const { data, error } = await supabase.rpc('atendimento_resolve', { p_id: id, p_volta_bot: voltaBot });
  if (error) throw error;
  if (data?.erro) throw new Error(ERROS[data.erro] || data.erro);
  return data;
}

export async function reabre(id) {
  const { data, error } = await supabase.rpc('atendimento_reabre', { p_id: id });
  if (error) throw error;
  if (data?.erro) throw new Error(ERROS[data.erro] || data.erro);
  return data;
}

const ERROS = {
  sem_permissao: 'Só administrador pode mexer na fila.',
  nao_existe: 'Essa conversa não existe mais.'
};

// "há 3 dias", "há 5 h", "há 20 min"
export function esperaRot(horas) {
  const h = Number(horas) || 0;
  if (h < 1) return `há ${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `há ${Math.round(h)} h`;
  return `há ${Math.floor(h / 24)} dias`;
}

export function telRot(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : phone;
}

// null quando não há número: a página usa isso para desabilitar o botão em
// vez de oferecer um "Abrir WhatsApp" que abre uma aba em branco.
export function linkWa(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 10 ? 'https://wa.me/' + d : null;
}
