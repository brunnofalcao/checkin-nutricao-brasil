import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON } = window.__ENV;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
