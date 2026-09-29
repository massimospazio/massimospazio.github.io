(() => {
  const SUPABASE_URL = 'https://sebqxqwohzhzlejcjxpe.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_6vdsPIgKZ-WNc6_iqvmHhA_prkdNR6Y';

  if (!window.supabase) {
    throw new Error('Supabase JS non disponibile');
  }

  window.appSupabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
})();
