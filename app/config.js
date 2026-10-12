/* StudyFlow — runtime configuration.
 *
 * This file is REGENERATED ON EVERY DEPLOY by scripts/write-config.js. The copy
 * in the repository is deliberately blank, which is what makes StudyFlow work
 * from a bare folder: with nothing configured it runs exactly as it always
 * has — everything in localStorage, no account, no network.
 *
 * `accounts` is decided by the build, because only the build knows what is
 * behind it:
 *
 *   'builtin'   The default once deployed to Netlify. The accounts server is
 *               netlify/functions/api.mjs, right here in this repository — no
 *               signup, no key, no configuration. It sends no email, so an
 *               address is a username rather than a verified identity, and a
 *               forgotten password is recovered with a one-time code issued at
 *               sign-up.
 *
 *   'supabase'  Set SUPABASE_URL and SUPABASE_ANON_KEY in the hosting
 *               environment to use a hosted identity service instead. More
 *               work to set up, and in exchange you get verified email
 *               addresses and emailed password resets. SETUP.md has the steps.
 *
 *   ''          No server — local only.
 *
 * The Supabase anon key is public by design; it identifies the project, not
 * the person, and Row Level Security is what separates one student's data from
 * another's. Never put the service_role key here: it bypasses those rules
 * entirely, and the build refuses it.
 */
window.SF_CONFIG = {
  accounts: '',
  supabaseUrl: '',
  supabaseAnonKey: '',

  /* Stamped with the deployed commit so the running build can identify
     itself — see Settings → About. Blank locally. */
  commit: '',
  builtAt: ''
};
