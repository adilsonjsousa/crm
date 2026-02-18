import { createClient } from "@supabase/supabase-js";

const fallbackSupabaseUrl = "https://shqsaclzbuzeuynpxdsq.supabase.co";
const fallbackPublishableKey = "sb_publishable_VsEUmlkpsgvSHnVOUyw6vw_BxTb-rcr";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackSupabaseUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackPublishableKey;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export function ensureSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.");
  }
  return supabase;
}
