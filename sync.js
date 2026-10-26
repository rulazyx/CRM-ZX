// Comptes et synchronisation entre appareils via Supabase (base en ligne gratuite).
// Chaque garage est une entreprise : toutes ses données tiennent dans sa ligne JSON (table crm_entreprises),
// partagée par son équipe et invisible des autres garages. Les comptes de l'équipe sont dans crm_membres. Chaque fiche garde sa date de
// modification : quand deux appareils modifient en même temps, on fusionne fiche par fiche.
// L'adresse et la clé publique viennent de config.js (clé publique, faite pour être visible : ce sont les
// règles de la base qui protègent les données), ou des réglages de l'appareil, ou du QR code d'installation.
// Les comptes sont créés par le super-admin, sans email : mot de passe de départ 12345678, à changer à la 1re connexion.
const Sync = (() => {
  const KEY = 'crmzx-sync';
  const TABLES = ['clients', 'vehicules', 'commandes', 'planning'];
  let client = null;
  let user = null;
  let role = null;
  let entreprise = null; // { id, nom, demo }
  let profil = {}; // { superadmin, doit_changer_mdp }
  let timer = null;
  let enCours = null;
  let onChange = () => {};
  let status = 'off'; // off | connexion | ok | envoi | erreur | refuse

  function settings() {
    const c = window.CRMZX_CONFIG || {};
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* rien */ }
    return { url: s.url || c.supabaseUrl || '', cle: s.cle || c.supabaseCle || '' };
  }
  function saveSettings(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* stockage indisponible */ }
  }
  const configure = () => { const s = settings(); return !!(s.url && s.cle); };
  function setStatus(s) { status = s; onChange(s, user, role); }
  const ligne = () => client.from('crm_entreprises');

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
    client = window.supabase.createClient(s.url, s.cle, { auth: { persistSession: true, detectSessionInUrl: false, storage: stockage } });
    client.auth.onAuthStateChange((event, session) => {
      const avant = user;
      user = session?.user || null;
      if (user && (!avant || avant.id !== user.id)) setTimeout(demarrer);
      if (!user) { role = null; entreprise = null; profil = {}; setStatus('off'); }
    });
    client.auth.getSession().then(({ data }) => {
      user = data.session?.user || null;
      if (user) demarrer(); else setStatus('off');
    });
    window.addEventListener('focus', () => { if (role) pull(); });
  }

  // « Rester connecté » : session gardée sur l'appareil ; sinon elle s'efface à la fermeture du navigateur.
  const rester = () => { try { return localStorage.getItem('crmzx-rester') !== '0'; } catch (e) { return true; } };
  const stockage = {
    getItem: k => { try { return (rester() ? localStorage : sessionStorage).getItem(k); } catch (e) { return null; } },
    setItem: (k, v) => { try { (rester() ? localStorage : sessionStorage).setItem(k, v); } catch (e) { /* rien */ } },
    removeItem: k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { /* rien */ } },
  };

  // Connexion réussie : on vérifie que le compte est autorisé, puis on récupère les données.
  async function demarrer() {
    setStatus('connexion');
    const { data, error } = await client.rpc('crm_moi');
    if (error) { console.error(error); setStatus('erreur'); return; }
    if (!data || !data.role) { role = null; setStatus('refuse'); return; }
    role = data.role;
    entreprise = { id: data.entreprise_id, nom: data.nom, demo: !!data.demo };
    profil = { superadmin: !!data.superadmin, doit_changer_mdp: !!data.doit_changer_mdp && !data.demo };
    await pull();
    if (profil.doit_changer_mdp) setStatus('nouveau-mdp');
    client.channel('entreprise')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crm_entreprises', filter: 'id=eq.' + entreprise.id }, () => pull())
      .subscribe();
  }

  // Identifiant sans @ (ex. « test » pour la démo) : compte interne de l'appli.
  const versEmail = id => { const x = (id || '').trim().toLowerCase(); return x.includes('@') ? x : x + '@demo.crmzx.re'; };
  async function connecter(identifiant, motDePasse, garder = true) {
    if (!client) throw new Error("L'appli n'est pas encore reliée à sa base (voir Réglages techniques).");
    try { localStorage.setItem('crmzx-rester', garder ? '1' : '0'); } catch (e) { /* rien */ }
    const { error } = await client.auth.signInWithPassword({ email: versEmail(identifiant), password: motDePasse });
    if (error) throw new Error(/invalid login/i.test(error.message) ? 'Identifiant ou mot de passe incorrect.' : error.message);
  }
  async function nouveauMotDePasse(motDePasse) {
    if ((motDePasse || '').length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.');
    if (motDePasse === '12345678') throw new Error('Choisis un mot de passe différent de celui de départ.');
    const { error } = await client.auth.updateUser({ password: motDePasse });
    if (error) throw new Error(/different from the old/i.test(error.message) ? 'Choisis un mot de passe différent de l\'ancien.' : error.message);
    await client.rpc('crm_mdp_change');
    profil.doit_changer_mdp = false;
    setStatus('ok');
  }
  // Appels réservés (vérifiés par la base) : super-admin et admin de garage.
  async function rpc(nom, args) {
    const { data, error } = await client.rpc(nom, args);
    if (error) throw new Error(error.message);
    return data;
  }
  const creerGarage = (nom, email) => rpc('crm_creer_garage', { p_nom: nom, p_email: email });
  const garages = () => rpc('crm_garages');
  const reinitMdp = email => rpc('crm_reinit_mdp', { p_email: email });

  async function deconnecter() {
    if (client) await client.auth.signOut();
    user = null; role = null; entreprise = null; profil = {};
    setStatus('off');
  }

  // Fusion fiche par fiche : la version modifiée en dernier gagne, les suppressions sont gardées.
  function fusion(local, distant) {
    const supprimes = { ...(distant.supprimes || {}) };
    Object.entries(local.supprimes || {}).forEach(([id, d]) => { if (!supprimes[id] || d > supprimes[id]) supprimes[id] = d; });
    const out = { ...distant, ...local, supprimes, seq: Math.max(num(local.seq), num(distant.seq)) };
    const date = r => r.majLe || r.creeLe || '';
    // Paramètres du garage : la version modifiée en dernier gagne.
    out.parametres = date(local.parametres || {}) >= date(distant.parametres || {}) ? local.parametres : distant.parametres;
    if (!out.parametres) delete out.parametres;
    TABLES.forEach(t => {
      const m = new Map((distant[t] || []).map(r => [r.id, r]));
      (local[t] || []).forEach(r => { const d = m.get(r.id); if (!d || date(r) > date(d)) m.set(r.id, r); });
      out[t] = [...m.values()].filter(r => !supprimes[r.id] || date(r) > supprimes[r.id]);
    });
    return out;
  }
  const memes = (a, b) => TABLES.every(t => JSON.stringify(a[t] || []) === JSON.stringify(b[t] || []))
    && JSON.stringify(a.parametres || null) === JSON.stringify(b.parametres || null);

  // Récupère la version en ligne, la fusionne avec celle de l'appareil, renvoie le résultat si besoin.
  function pull() {
    if (!client || !role) return Promise.resolve();
    if (enCours) return enCours;
    enCours = (async () => {
      const { data, error } = await ligne().select('data, updated_at').eq('id', entreprise.id).maybeSingle();
      if (error) { console.error(error); setStatus('erreur'); return; }
      const distant = data?.data || {};
      const fusionne = fusion(db.data, distant);
      if (!memes(fusionne, db.data)) {
        db.data = Object.assign({ clients: [], vehicules: [], commandes: [], planning: [], seq: 0 }, fusionne);
        db.save(true);
        render();
      }
      if (!memes(fusionne, distant)) await envoyer(fusionne);
      else setStatus('ok');
    })().finally(() => { enCours = null; });
    return enCours;
  }

  async function envoyer(donnees) {
    setStatus('envoi');
    const { error } = await ligne().update({ data: donnees, updated_at: new Date().toISOString() }).eq('id', entreprise.id);
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
    const { data, error } = await client.from('crm_membres').select('email, role, ajoute_le, doit_changer_mdp').order('ajoute_le');
    if (error) throw new Error(error.message);
    return data;
  }
  const ajouterMembre = (email, r) => rpc('crm_ajouter_membre', { p_email: email, p_role: r });
  // Nom affiché de l'entreprise (modifiable dans Paramètres).
  async function renommer(nom) {
    if (!entreprise || !nom) return;
    entreprise.nom = nom;
    await ligne().update({ nom }).eq('id', entreprise.id);
  }
  async function retirerMembre(email) {
    const { error } = await client.from('crm_membres').delete().eq('email', email);
    if (error) throw new Error(error.message);
  }

  return {
    init, settings, saveSettings, configure, lienConfig, connecter, nouveauMotDePasse, creerGarage, garages, reinitMdp,
    deconnecter, changed, pull, membres, ajouterMembre, retirerMembre, renommer,
    get entreprise() { return entreprise; }, get profil() { return profil; }, get client() { return client; }, get user() { return user; }, get role() { return role; }, get status() { return status; },
  };
})();
