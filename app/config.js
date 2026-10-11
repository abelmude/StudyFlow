/* StudyFlow — runtime configuration.
 *
 * This file is REGENERATED ON EVERY DEPLOY by scripts/write-config.js, which
 * reads the values out of Netlify's environment variables. The copy in the
 * repository is deliberately blank, which is what makes StudyFlow work with no
 * backend at all: with no Supabase project configured the app runs exactly as
 * it always has — everything in localStorage, no account, no network.
 *
 * To turn on real email + password accounts, set these in Netlify under
 * Site configuration → Environment variables, then redeploy:
 *
 *   SUPABASE_URL        https://xxxxxxxx.supabase.co
 *   SUPABASE_ANON_KEY   eyJhbGciOi…
 *
 * The anon key is designed to be public — it is in every visitor's browser by
 * design. What actually protects one student's data from another's is Row
 * Level Security in Postgres, which supabase/schema.sql sets up. Never put the
 * service_role key here; that one bypasses RLS entirely.
 *
 * SETUP.md walks through the whole thing.
 */
window.SF_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',

  /* Stamped with the deployed commit so the running build can identify
     itself — see Settings → About. Blank locally. */
  commit: '',
  builtAt: ''
};
