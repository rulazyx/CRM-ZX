// Comptes et synchronisation entre appareils via Supabase (base en ligne gratuite).
// Toutes les données du garage tiennent dans une seule ligne JSON (table crm_garage), partagée par l'équipe.
// Seuls les emails ajoutés par l'admin (table crm_membres) y ont accès. Chaque fiche garde sa date de
// modification : quand deux appareils modifient en même temps, on fusionne fiche par fiche.
// L'adresse et la clé publique se saisissent dans les réglages (ou via le QR code d'installation) :
// rien n'est écrit dans le dépôt.
const Sync = (() => {
  const KEY = 'crmzx-sync';
  const TABLES = ['clients', 'vehicules', 'commandes', 'planning'];
  let client = null;
  let user = null;
  let role = null;
  let timer = null;
  let enCours = null;
  let onChange = () => {};
  let status = 'off'; // off | connexion | ok | envoi | erreur | refuse

  function settings() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function saveSettings(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* stockage indisponible */ }
  }
  const configure = () => { const s = settings(); return !!(s.url && s.cle); };
  function setStatus(s) { status = s; onChange(s, user, role); }

  // Lien d'installation : https://…/#config=… règle l'adresse et la clé publique d'un nouvel appareil.
  function lireLienConfig() {
    const m = location.hash.match(/config=([^&]+)/);
    if (!m) return;
    try {
      const c = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      if (c.url && c.cle) saveSettings({ url: c.url, cle: c.cle });
    } catch (e) { /* lien abîmé : on l'ignore */ }
    history.replaceState(null, '', location.pathname + location.search);
  }
  function lienConfig() {
    const s = settings();
    const base = location.origin + location.pathname;
    if (!s.url || !s.cle) return base;
    return base + '#config=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({ url: s.url, cle: s.cle })))));
  }

  function init(cb) {
    onChange = cb || onChange;
    lireLienConfig();
    const s = settings();
    if (!s.url || !s.cle || !window.supabase) { setStatus('off'); return; }
    client = window.supabase.createClient(s.url, s.cle, { auth: { persistSession: true, detectSessionInUrl: true } });
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { user = session?.user || null; setStatus('nouveau-mdp'); return; }
      const avant = user;
      user = session?.user || null;
      if (user && (!avant || avant.id !== user.id)) setTimeout(demarrer);
      if (!user) { role = null; setStatus('off'); }
    });
    client.auth.getSession().then(({ data }) => {
      user = data.session?.user || null;
      if (user) demarrer(); else setStatus('off');
    });
    window.addEventListener('focus', () => { if (role) pull(); });
  }

  // Connexion réussie : on vérifie que le compte est autorisé, puis on récupère les données.
  async function demarrer() {
    setStatus('connexion');
    const { data, error } = await client.rpc('crm_moi');
    if (error) { console.error(error); setStatus('erreur'); return; }
    role = data;
    if (!role) { setStatus('refuse'); return; }
    await pull();
    client.channel('garage')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_garage' }, () => pull())
      .subscribe();
  }

  async function connecter(email, motDePasse) {
    if (!client) throw new Error("Enregistre d'abord l'adresse et la clé Supabase.");
    const { error } = await client.auth.signInWithPassword({ email, password: motDePasse });
    if (error) throw new Error(/invalid login/i.test(error.message) ? 'Email ou mot de passe incorrect.'
      : /not confirmed/i.test(error.message) ? "Confirme d'abord ton email avec le lien reçu." : error.message);
  }
  async function creerCompte(email, motDePasse) {
    if (!client) throw new Error("Enregistre d'abord l'adresse et la clé Supabase.");
    if ((motDePasse || '').length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.');
    const { data, error } = await client.auth.signUp({ email, password: motDePasse, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw new Error(/already registered/i.test(error.message) ? 'Ce compte existe déjà : connecte-toi.' : error.message);
    return !data.session; // true : un email de confirmation a été envoyé
  }
  async function motDePasseOublie(email) {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) throw new Error(error.message);
  }
  async function nouveauMotDePasse(motDePasse) {
    if ((motDePasse || '').length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.');
    const { error } = await client.auth.updateUser({ password: motDePasse });
    if (error) throw new Error(error.message);
    await demarrer();
  }

  async function deconnecter() {
    if (client) await client.auth.signOut();
    user = null; role = null;
    setStatus('off');
  }

  // Fusion fiche par fiche : la version modifiée en dernier gagne, les suppressions sont gardées.
  function fusion(local, distant) {
    const supprimes = { ...(distant.supprimes || {}) };
    Object.entries(local.supprimes || {}).forEach(([id, d]) => { if (!supprimes[id] || d > supprimes[id]) supprimes[id] = d; });
    const out = { ...distant, ...local, supprimes, seq: Math.max(num(local.seq), num(distant.seq)) };
    const date = r => r.majLe || r.creeLe || '';
    TABLES.forEach(t => {
      const m = new Map((distant[t] || []).map(r => [r.id, r]));
      (local[t] || []).forEach(r => { const d = m.get(r.id); if (!d || date(r) > date(d)) m.set(r.id, r); });
      out[t] = [...m.values()].filter(r => !supprimes[r.id] || date(r) > supprimes[r.id]);
    });
    return out;
  }
  const memes = (a, b) => TABLES.every(t => JSON.stringify(a[t] || []) === JSON.stringify(b[t] || []));

  // Récupère la version en ligne, la fusionne avec celle de l'appareil, renvoie le résultat si besoin.
  function pull() {
    if (!client || !role) return Promise.resolve();
    if (enCours) return enCours;
    enCours = (async () => {
      const { data, error } = await client.from('crm_garage').select('data, updated_at').eq('id', 'garage').maybeSingle();
      if (error) { console.error(error); setStatus('erreur'); return; }
      const distant = data?.data || {};
      const fusionne = fusion(db.data, distant);
      if (!memes(fusionne, db.data)) {
        db.data = Object.assign({ clients: [], vehicules: [], commandes: [], planning: [], seq: 0 }, fusionne);
        db.save(true);
        render();
      }
      if (!data || !memes(fusionne, distant)) await envoyer(fusionne);
      else setStatus('ok');
    })().finally(() => { enCours = null; });
    return enCours;
  }

  async function envoyer(donnees) {
    setStatus('envoi');
    const { error } = await client.from('crm_garage').upsert({ id: 'garage', data: donnees, updated_at: new Date().toISOString() });
    if (error) { console.error(error); setStatus('erreur'); return; }
    setStatus('ok');
  }

  // Appelé à chaque modification : envoi groupé après une courte pause (la fusion évite d'écraser les autres).
  function changed() {
    if (!role) return;
    clearTimeout(timer);
    timer = setTimeout(pull, 1200);
  }

  // Gestion de l'équipe (réservée à l'admin).
  async function membres() {
    const { data, error } = await client.from('crm_membres').select('email, role, ajoute_le').order('ajoute_le');
    if (error) throw new Error(error.message);
    return data;
  }
  async function ajouterMembre(email, r) {
    const { error } = await client.from('crm_membres').upsert({ email: email.trim().toLowerCase(), role: r });
    if (error) throw new Error(error.message);
  }
  async function retirerMembre(email) {
    const { error } = await client.from('crm_membres').delete().eq('email', email);
    if (error) throw new Error(error.message);
  }

  return {
    init, settings, saveSettings, configure, lienConfig, connecter, creerCompte, motDePasseOublie, nouveauMotDePasse,
    deconnecter, changed, pull, membres, ajouterMembre, retirerMembre,
    get client() { return client; }, get user() { return user; }, get role() { return role; }, get status() { return status; },
  };
})();
