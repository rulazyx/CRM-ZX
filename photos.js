// Photos des véhicules pour la mise en ligne : prises depuis le téléphone (3 minimum, 10 maximum),
// réduites avant l'envoi puis rangées dans le dossier privé « photos » de Supabase.
// La fiche du véhicule garde la liste des fichiers ; l'ordinateur les affiche à son tour.
const Photos = (() => {
  const MIN = 3, MAX = 10;
  const BUCKET = 'photos';
  const liens = new Map(); // chemin → lien temporaire signé
  let vehiculeId = null;
  let envois = 0;

  // Prise de vue réservée au téléphone (écran tactile sans souris).
  const estTelephone = () => matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
  const deblocable = v => !!v && ['En préparation', 'En stock'].includes(v.statut);
  const liste = v => (v && v.photos) || [];

  // Réduit la photo (1600 px de large au plus, JPEG) : environ 300 Ko au lieu de plusieurs Mo.
  async function reduire(fichier) {
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("Cette image ne peut pas être lue."));
      i.src = URL.createObjectURL(fichier);
    });
    const echelle = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * echelle);
    c.height = Math.round(img.naturalHeight * echelle);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    return new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82));
  }

  async function signer(chemins) {
    const manquants = chemins.filter(p => !liens.has(p));
    if (manquants.length && Sync.client && Sync.role) {
      const { data } = await Sync.client.storage.from(BUCKET).createSignedUrls(manquants, 3600);
      (data || []).forEach(d => { if (d.signedUrl) liens.set(d.path, d.signedUrl); });
    }
    return chemins.map(p => liens.get(p) || '');
  }

  // Galerie affichée sur la fiche du véhicule (téléphone et ordinateur).
  async function galerie(el, v) {
    const ph = liste(v);
    if (!ph.length) { el.innerHTML = '<span class="hint">Pas encore de photos. Elles se prennent depuis le téléphone, une fois le véhicule en préparation.</span>'; return; }
    el.innerHTML = `<div class="ph-grille">${ph.map(() => '<div class="ph"></div>').join('')}</div>`;
    const urls = await signer(ph);
    el.querySelectorAll('.ph').forEach((d, i) => {
      d.innerHTML = urls[i] ? `<a href="${esc(urls[i])}" target="_blank" rel="noopener"><img src="${esc(urls[i])}" alt="Photo ${i + 1}" loading="lazy"></a>` : '<span class="hint">Connecte-toi pour voir</span>';
    });
  }

  // Écran de prise de vue.
  async function rendre() {
    const v = db.get('vehicules', vehiculeId);
    const ph = liste(v);
    $('#photos-titre').textContent = 'Photos · ' + vehiculeNom(v);
    const reste = MIN - ph.length;
    $('#photos-compteur').innerHTML = `<strong>${ph.length} / ${MAX}</strong> ${reste > 0 ? `· encore ${reste} minimum` : '· minimum atteint'}${envois ? ` · envoi de ${envois} photo(s)…` : ''}`;
    $('#photos-compteur').className = 'ph-compteur' + (reste > 0 ? ' manque' : ' ok');
    const urls = await signer(ph);
    $('#photos-grille').innerHTML = ph.map((p, i) => `<div class="ph"><img src="${esc(urls[i])}" alt="Photo ${i + 1}">
      <button type="button" class="ph-suppr" data-suppr="${esc(p)}" aria-label="Supprimer la photo">✕</button></div>`).join('')
      + Array.from({ length: envois }, () => '<div class="ph envoi"><span class="spin"></span></div>').join('');
    const plein = ph.length + envois >= MAX;
    $('#photos-prendre').classList.toggle('desactive', plein);
    $('#photos-galerie').classList.toggle('desactive', plein);
    $('#photos-terminer').disabled = ph.length < MIN || envois > 0;
  }

  function ouvrir(id) {
    if (!Sync.role) { toast("Les photos sont envoyées en ligne : connecte-toi d'abord (⚙️ > Compte)."); return; }
    vehiculeId = id;
    rendre();
    $('#dlg-photos').showModal();
  }

  async function ajouter(fichiers) {
    const v = db.get('vehicules', vehiculeId);
    const place = MAX - liste(v).length - envois;
    const lot = [...fichiers].slice(0, Math.max(0, place));
    if (fichiers.length > lot.length) toast(`${MAX} photos maximum : ${fichiers.length - lot.length} photo(s) ignorée(s).`);
    envois += lot.length;
    rendre();
    for (const f of lot) {
      try {
        const blob = await reduire(f);
        const chemin = `${Sync.entreprise.id}/${vehiculeId}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
        const { error } = await Sync.client.storage.from(BUCKET).upload(chemin, blob, { contentType: 'image/jpeg' });
        if (error) throw new Error(error.message);
        const actuel = db.get('vehicules', vehiculeId);
        db.upsert('vehicules', { id: vehiculeId, photos: liste(actuel).concat(chemin) });
      } catch (err) {
        toast("Photo non envoyée : " + err.message);
      } finally {
        envois--;
        rendre();
      }
    }
  }

  async function supprimer(chemin) {
    if (!confirm('Supprimer cette photo ?')) return;
    await Sync.client.storage.from(BUCKET).remove([chemin]);
    const v = db.get('vehicules', vehiculeId);
    db.upsert('vehicules', { id: vehiculeId, photos: liste(v).filter(p => p !== chemin) });
    rendre();
  }

  function init() {
    ['#photos-input', '#photos-input-galerie'].forEach(s => $(s).addEventListener('change', e => {
      if (e.target.files.length) ajouter(e.target.files);
      e.target.value = '';
    }));
    $('#photos-grille').addEventListener('click', e => { const p = e.target.dataset.suppr; if (p) supprimer(p); });
    const fermer = () => { $('#dlg-photos').close(); render(); };
    $('#photos-terminer').addEventListener('click', () => { toast('Photos enregistrées sur la fiche du véhicule'); fermer(); });
    $('#photos-fermer').addEventListener('click', () => {
      const n = liste(db.get('vehicules', vehiculeId)).length;
      if (n < MIN && !confirm(`Il faut au moins ${MIN} photos pour la mise en ligne (${n} pour l'instant). Fermer quand même ?`)) return;
      fermer();
    });
  }

  return { estTelephone, deblocable, galerie, ouvrir, init, MIN, MAX };
})();
