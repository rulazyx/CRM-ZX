// Synchronisation entre appareils via Supabase (base en ligne gratuite).
// Toutes les données d'un compte sont gardées dans une seule ligne JSON (table crm_data),
// protégée pour que chaque utilisateur ne voie que la sienne. La dernière modification gagne.
// L'adresse et la clé publique se saisissent dans les réglages : rien n'est écrit dans le dépôt.
const Sync = (() => {
  const KEY = 'crmzx-sync';
  let client = null;
  let user = null;
  let timer = null;
  let onChange = () => {};
  let status = 'off'; // off | connexion | ok | envoi | erreur

  function settings() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function saveSettings(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* stockage indisponible */ }
  }
  function setStatus(s) { status = s; onChange(s, user); }

  function init(cb) {
    onChange = cb || onChange;
    const s = settings();
    if (!s.url || !s.cle || !window.supabase) { setStatus('off'); return; }
    client = window.supabase.createClient(s.url, s.cle, { auth: { persistSession: true, detectSessionInUrl: true } });
    client.auth.onAuthStateChange((event, session) => {
      const avant = user;
      user = session?.user || null;
      if (user && !avant) pull();
      if (!user) setStatus('off');
    });
    client.auth.getSession().then(({ data }) => {
      user = data.session?.user || null;
      if (user) pull(); else setStatus('off');
    });
    window.addEventListener('focus', () => { if (user) pull(); });
  }

  async function connecter(email) {
    if (!client) throw new Error("Enregistre d'abord l'adresse et la clé Supabase.");
    const { error } = await client.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw new Error(error.message);
  }

  async function deconnecter() {
    if (client) await client.auth.signOut();
    user = null;
    setStatus('off');
  }

  // Récupère la version en ligne si elle est plus récente que celle de l'appareil.
  async function pull() {
    setStatus('connexion');
    const { data, error } = await client.from('crm_data').select('data, updated_at').eq('user_id', user.id).maybeSingle();
    if (error) { console.error(error); setStatus('erreur'); return; }
    const local = db.data.majLe || '';
    if (data && data.updated_at > local) {
      db.data = Object.assign({ clients: [], vehicules: [], commandes: [], planning: [], seq: 0 }, data.data, { majLe: data.updated_at });
      db.save(true);
      render();
      setStatus('ok');
    } else if (!data || local > data.updated_at) {
      await push();
    } else {
      setStatus('ok');
    }
  }

  async function push() {
    if (!client || !user) return;
    setStatus('envoi');
    const updated_at = db.data.majLe || new Date().toISOString();
    const { error } = await client.from('crm_data').upsert({ user_id: user.id, data: db.data, updated_at });
    if (error) { console.error(error); setStatus('erreur'); return; }
    setStatus('ok');
  }

  // Appelé à chaque modification : envoi groupé après une courte pause.
  function changed() {
    if (!user) return;
    clearTimeout(timer);
    timer = setTimeout(push, 1200);
  }

  return { init, settings, saveSettings, connecter, deconnecter, changed, pull, get user() { return user; }, get status() { return status; } };
})();
