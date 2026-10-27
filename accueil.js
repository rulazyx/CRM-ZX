// Accueil ocaz.re : recherche (prix, localisation, plus de filtres) qui compte en direct les véhicules du réseau
// et mène à reseau avec les critères, et carrousel des dernières annonces. Lit la même copie publique que reseau.html.
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euros = n => n ? Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : 'Prix sur demande';
  const km = n => n !== '' && n != null ? Number(n).toLocaleString('fr-FR') + ' km' : '';
  const nom = v => [v.marque, v.modele, v.finition].filter(Boolean).join(' ');
  const AUTO = '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16H3.8a.8.8 0 0 1-.8-.8v-3.1c0-.7.4-1.3 1-1.6l1.3-.6L7 6.9A2 2 0 0 1 8.8 6h6.4a2 2 0 0 1 1.8 1l1.7 2.9 1.3.6c.6.3 1 .9 1 1.6v3.1a.8.8 0 0 1-.8.8H19"/><path d="M9 16h6"/><circle cx="7" cy="16" r="2"/><circle cx="17" cy="16" r="2"/></svg>';
  // Valeurs proposées même quand le réseau n'a encore aucun véhicule de ce genre.
  const ENERGIES = ['Essence', 'Diesel', 'Hybride', 'Hybride rechargeable', 'Électrique', 'GPL'];
  const TYPES = ['Citadine', 'Berline', 'Break', 'SUV', '4x4', 'Monospace', 'Coupé', 'Cabriolet', 'Utilitaire', 'Pick-up'];
  const COULEURS = ['Blanc', 'Noir', 'Gris', 'Argent', 'Bleu', 'Rouge', 'Vert', 'Beige', 'Marron', 'Jaune', 'Orange'];

  const cfg = window.CRMZX_CONFIG || {};
  const apercu = new URLSearchParams(location.search).has('demo');
  let client = null, vehicules = [], urls = new Map(), plafond = 50000, diapo = 0, minuterie = null;

  // ---------- Recherche ----------
  function critere() {
    const c = {};
    const min = Number($('#r-min').value) || 0, max = Number($('#r-max').value) || 0;
    if (min) c.prixMin = min;
    if (max && max < plafond) c.prixMax = max;
    if ($('#r-lieu').value.trim()) c.lieu = $('#r-lieu').value.trim();
    [['kmMax', '#r-km'], ['anneeMin', '#r-annee'], ['couleur', '#r-couleur'], ['type', '#r-type'], ['energie', '#r-energie']]
      .forEach(([k, s]) => { if ($(s).value) c[k] = k === 'kmMax' || k === 'anneeMin' ? Number($(s).value) : $(s).value; });
    return c;
  }
  function lienResultats(hash = '') {
    const q = Recherche.versUrl(critere());
    return 'reseau' + ((q || apercu) ? '?' + [q, apercu ? 'demo=1' : ''].filter(Boolean).join('&') : '') + hash;
  }
  function majCompte() {
    const n = vehicules.filter(v => Recherche.correspond(v, critere())).length;
    $('#cta-texte').textContent = `${n.toLocaleString('fr-FR')} voiture${n > 1 ? 's' : ''} d'occasion`;
    $('#cta').href = lienResultats();
  }

  // Curseur à deux poignées, relié aux champs Minimum et Maximum.
  function majPlage() {
    const a = Number($('#c-min').value), b = Number($('#c-max').value);
    $('#plage').style.left = (a / plafond * 100) + '%';
    $('#plage').style.right = (100 - b / plafond * 100) + '%';
  }
  function depuisCurseur(e) {
    let a = Number($('#c-min').value), b = Number($('#c-max').value);
    if (a > b) { if (e.target.id === 'c-min') a = b; else b = a; $('#c-min').value = a; $('#c-max').value = b; }
    $('#r-min').value = a || '';
    $('#r-max').value = b < plafond ? b : '';
    majPlage(); majCompte();
  }
  function depuisChamps() {
    const a = Math.min(Number($('#r-min').value) || 0, plafond), b = Math.min(Number($('#r-max').value) || plafond, plafond);
    $('#c-min').value = a; $('#c-max').value = Math.max(a, b);
    majPlage(); majCompte();
  }

  function remplirFiltres() {
    const uniques = (f, base) => [...new Set([...base, ...vehicules.map(f).filter(Boolean)])];
    const opt = (sel, tous, liste) => { $(sel).innerHTML = `<option value="">${tous}</option>` + liste.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''); };
    opt('#r-km', 'Peu importe', [10000, 30000, 50000, 75000, 100000, 150000].map(k => [k, `Moins de ${k.toLocaleString('fr-FR')} km`]));
    const an = new Date().getFullYear();
    opt('#r-annee', 'Peu importe', [0, 1, 2, 3, 5, 8, 10, 15].map(d => [an - d, `${an - d} ou plus récent`]));
    opt('#r-couleur', 'Toutes', uniques(v => v.couleur, COULEURS).map(x => [x, x]));
    opt('#r-type', 'Tous', uniques(v => v.type, TYPES).map(x => [x, x]));
    opt('#r-energie', 'Toutes', uniques(v => v.carburant, ENERGIES).map(x => [x, x]));
    $('#communes').innerHTML = Recherche.COMMUNES.map(([n, cp]) => `<option value="${esc(n)}">${cp}</option>`).join('');
    const max = Math.max(0, ...vehicules.map(v => Number(v.prix) || 0));
    plafond = Math.max(10000, Math.ceil(max / 5000) * 5000 || 50000);
    ['#c-min', '#c-max'].forEach(s => { $(s).max = plafond; });
    $('#c-max').value = plafond;
    $('#r-max').placeholder = euros(plafond).replace(/\s?€/, '') + ' et +';
    majPlage();
  }

  // ---------- Dernières annonces ----------
  async function signer(chemins) {
    const manquants = chemins.filter(p => p && !urls.has(p));
    if (!manquants.length || !client) return;
    const { data } = await client.storage.from('photos').createSignedUrls(manquants, 3600);
    (data || []).forEach(d => { if (d.signedUrl) urls.set(d.path, d.signedUrl); });
  }
  // Les plus récentes de chaque garage, en alternant les garages (le dernier mis à jour d'abord).
  function dernieres(garages, n = 8) {
    const files = garages.map(g => g.vehicules.slice()), liste = [];
    while (liste.length < n && files.some(f => f.length)) files.forEach(f => { if (f.length && liste.length < n) liste.push(f.shift()); });
    return liste;
  }
  async function carrousel(liste) {
    if (!liste.length) {
      $('#diapos').innerHTML = '<div class="a-vide">Les premières annonces des garages du réseau arrivent bientôt.</div>';
      $('#points').innerHTML = ''; $('#prec').disabled = $('#suiv').disabled = true;
      return;
    }
    await signer(liste.map(v => v.photos[0]));
    $('#diapos').innerHTML = liste.map((v, i) => `<a class="a-diapo" href="${esc(lienAnnonce(v))}">
      <div class="a-photo">${v.photos[0] && urls.get(v.photos[0]) ? `<img src="${esc(urls.get(v.photos[0]))}" alt="${esc(nom(v))}"${i ? ' loading="lazy"' : ''}>` : AUTO}
        <span class="nouveau">Nouveau</span>${v.demo ? '<span class="badge-demo">Démo</span>' : ''}</div>
      <div class="a-infos"><b>${esc(nom(v))}</b><span class="sub">${esc([v.annee, km(v.kilometrage), v.carburant].filter(Boolean).join(' · '))}</span>
        <span class="prix">${euros(v.prix)}</span><span class="sub">${esc([v.garage.nom, v.garage.ville].filter(Boolean).join(' · '))}</span></div></a>`).join('');
    $('#points').innerHTML = liste.map((_, i) => `<button type="button" data-i="${i}" aria-label="Annonce ${i + 1}"></button>`).join('');
    aller(0);
    lancer();
  }
  const lienAnnonce = v => 'reseau' + (apercu ? '?demo=1' : '') + '#v/' + encodeURIComponent(v.garageId + '/' + v.id);
  function aller(i) {
    const n = $('#diapos').children.length;
    diapo = (i + n) % n;
    $('#diapos').scrollTo({ left: diapo * ($('#diapos').clientWidth + 12), behavior: 'smooth' });
    marquer();
  }
  function marquer() { [...$('#points').children].forEach((b, i) => b.classList.toggle('actif', i === diapo)); }
  function lancer() { clearInterval(minuterie); minuterie = setInterval(() => aller(diapo + 1), 5000); }

  async function demarrer() {
    remplirFiltres(); majCompte();
    if (!cfg.supabaseUrl || !cfg.supabaseCle || !window.supabase) { carrousel([]); return; }
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseCle, { auth: { persistSession: false } });
    const { data, error } = await client.rpc('crm_reseau_lire');
    let demo = [];
    if (apercu) demo = ((await client.rpc('crm_reseau_demo')).data || []).map(x => ({ ...x, demo: true }));
    const garages = [...demo, ...(error ? [] : data || [])].map(r => {
      const id = r.entreprise_id || r.id, garage = r.garage || {};
      return { id, vehicules: (r.vehicules || []).map(v => ({ ...v, photos: v.photos || [], garageId: id, garage, demo: !!r.demo })) };
    });
    vehicules = garages.flatMap(g => g.vehicules);
    remplirFiltres(); depuisChamps();
    carrousel(dernieres(garages));
  }

  ['#c-min', '#c-max'].forEach(s => $(s).addEventListener('input', depuisCurseur));
  ['#r-min', '#r-max'].forEach(s => $(s).addEventListener('input', depuisChamps));
  ['#r-lieu', '#r-km', '#r-annee', '#r-couleur', '#r-type', '#r-energie'].forEach(s => $(s).addEventListener('input', majCompte));
  $('#btn-plus').addEventListener('click', () => {
    const ouvert = $('#plus').hidden;
    $('#plus').hidden = !ouvert;
    $('#btn-plus').textContent = ouvert ? 'Moins de filtres' : 'Plus de filtres';
    $('#btn-plus').setAttribute('aria-expanded', ouvert);
  });
  $('#recherche').addEventListener('submit', e => { e.preventDefault(); location.href = lienResultats(); });
  $('#prec').addEventListener('click', () => { aller(diapo - 1); lancer(); });
  $('#suiv').addEventListener('click', () => { aller(diapo + 1); lancer(); });
  $('#points').addEventListener('click', e => { if (e.target.dataset.i) { aller(Number(e.target.dataset.i)); lancer(); } });
  $('#diapos').addEventListener('scroll', () => {
    const w = $('#diapos').clientWidth + 12;
    const i = Math.round($('#diapos').scrollLeft / w);
    if (i !== diapo) { diapo = i; marquer(); }
  }, { passive: true });
  $('#diapos').addEventListener('pointerenter', () => clearInterval(minuterie));
  $('#diapos').addEventListener('pointerleave', lancer);
  // Aperçu démo : le lien garde ?demo=1 vers le site du réseau.
  if (apercu) document.querySelectorAll('[data-lien]').forEach(a => { a.href = a.getAttribute('href').replace(/^reseau/, 'reseau?demo=1'); });
  demarrer();
})();
