import { supabase } from './supabase.js';

let cachedProfile = null;

// Faz login com email/senha.
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });
  if (error) throw error;
  cachedProfile = null;
  return data.session;
}

// Faz logout.
export async function signOut() {
  cachedProfile = null;
  await supabase.auth.signOut();
}

// Retorna a sessão atual (ou null).
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

// Retorna o profile do usuário logado (com role).
export async function getProfile() {
  if (cachedProfile) return cachedProfile;
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) {
    console.warn('Erro ao buscar profile:', error);
    return null;
  }
  cachedProfile = { ...data, email: session.user.email };
  return cachedProfile;
}

// Escuta mudanças de auth (login/logout).
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    cachedProfile = null;
    callback(event, session);
  });
}
