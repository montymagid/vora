// ============================================================
// VORA — Supabase client (classic script, not an ES module)
// Loaded via the Supabase UMD bundle so the site also works when
// opened directly from disk (file://) and not only from a web server.
// ============================================================
window.VORA = window.VORA || {};

(function () {
  var SUPABASE_URL = 'https://moqrwmutnwqlwjsbybqo.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cgsirf9wPxMf0f1PGL9F9Q_b_YWka3h';

  if (typeof supabase === 'undefined') {
    console.error('VORA: Supabase library did not load. Check your internet connection.');
    return;
  }
  window.VORA.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
})();
