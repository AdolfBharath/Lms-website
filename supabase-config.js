// ==========================================
// SUPABASE CONFIGURATION
// ==========================================
// Replace these values with the ones from your Supabase Dashboard
// (Go to Project Settings -> API)

window.SUPABASE_URL = 'https://agrzjwnsapbanbvgbwkh.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_jrJRXGYEYpixwOAUS6kIWA_ccT4jZs6';

window.getSupabaseClient = function getSupabaseClient() {
  if (window.supabaseClient) {
    return window.supabaseClient;
  }

  if (!window.supabase?.createClient) {
    return null;
  }

  window.supabaseClient = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storageKey: "jenovate-supabase-auth"
      }
    }
  );

  return window.supabaseClient;
};

window.getSupabaseClient();
