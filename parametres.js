// Onglet Paramètres : infos du garage, documents (RIB…), packs livraison, barème carte grise et calcul des reprises.
// Ces réglages font partie des données du garage : ils sont partagés par toute l'équipe via la synchro.
const Param = (() => {
  const DEFAUTS = {
    garage: { nom: '', adresse: '', codePostal: '', ville: '', telephone: '', email: '', siret: '', tva: '', site: '', logo: '' },
    packs: [
      { id: 'demarches', nom: 'Démarches administratives', montant: 150, coche: true },
      { id: 'protection', nom: 'Protection de peinture', montant: 250, coche: false },
    ],
    // Barème carte grise de La Réunion 2026 : 60 €/CV, taxe fixe 11 €, acheminement 2,76 €.
    carteGrise: { prixCV: 60, taxeFixe: 11, acheminement: 2.76 },
    reprise: { hausseReunion: 10, margeMin: 10, margeMax: 20 },
    // Facturation : TVA sur la marge par défaut (véhicules achetés à des particuliers).
    facture: { regime: 'marge', conditions: '' },
    // Activité : achat-revente ou dépôt-vente par défaut (chaque véhicule garde son propre mode), et commission du dépôt.
    activite: { mode: 'achat', commissionType: 'pourcentage', commissionValeur: 8, commissionMin: 500, dureeMandat: 90 },
    documents: [],
  };
  const TYPES_DOC = ['RIB', 'Kbis', 'Assurance', 'Conditions de vente', 'Autre'];
  const CHAMPS_GARAGE = [
    ['nom', "Nom de l'entreprise *", 'full'], ['adresse', 'Adresse', 'full'], ['codePostal', 'Code postal'], ['ville', 'Ville'],
    ['telephone', 'Téléphone', '', 'tel'], ['email', 'Email', '', 'email'], ['siret', 'SIRET'], ['tva', 'N° TVA intracom.'], ['site', 'Site web', 'full'],
  ];

  // Anciens réglages gardés sur l'appareil (avant l'onglet Paramètres) : repris une fois.
  function anciens() {
    const lire = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
    const o = lire('crmzx-offre'), r = lire('crmzx-reprise');
    const p = JSON.parse(JSON.stringify(DEFAUTS));
    ['prixCV', 'taxeFixe', 'acheminement'].forEach(k => { if (o[k] != null) p.carteGrise[k] = o[k]; });
    if (o.demarches != null) p.packs[0].montant = o.demarches;
    if (o.protection != null) p.packs[1].montant = o.protection;
    ['hausseReunion', 'margeMin', 'margeMax'].forEach(k => { if (r[k] != null) p.reprise[k] = r[k]; });
    return p;
  }

  function get() {
    const p = db.data.parametres || anciens();
    return {
      ...DEFAUTS, ...p,
      garage: { ...DEFAUTS.garage, ...(p.garage || {}) },
      carteGrise: { ...DEFAUTS.carteGrise, ...(p.carteGrise || {}) },
      reprise: { ...DEFAUTS.reprise, ...(p.reprise || {}) },
      facture: { ...DEFAUTS.facture, ...(p.facture || {}) },
      activite: { ...DEFAUTS.activite, ...(p.activite || {}) },
      packs: p.packs || DEFAUTS.packs,
      documents: p.documents || [],
    };
  }
  function save(patch) {
    db.data.parametres = { ...get(), ...patch, majLe: new Date().toISOString() };
    db.save();
  }

  const nouvelId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Logo réduit à 256 px et gardé dans les paramètres (il apparaît sur l'accueil et sur les offres).
  async function lireLogo(fichier) {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(fichier); });
    const e = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * e); c.height = Math.round(img.naturalHeight * e);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    return c.toDataURL('image/png');
  }

  function rendre() {
    const p = get();
    const g = p.garage;
    $('#p-garage').innerHTML = CHAMPS_GARAGE.map(([k, l, cls, type]) => `<div class="field ${cls || ''}"><label for="g-${k}">${l}</label>
      <input id="g-${k}" data-g="${k}" type="${type || 'text'}" value="${esc(g[k])}"${k === 'nom' ? ' required' : ''}></div>`).join('');
    $('#p-logo').innerHTML = g.logo ? `<img src="${esc(g.logo)}" alt="Logo du garage">` : '<span class="hint">Pas de logo</span>';
    $('#btn-logo-suppr').hidden = !g.logo;
    $('#p-packs').innerHTML = p.packs.map(k => `<div class="pack-ligne" data-pack-id="${esc(k.id)}">
      <input data-pk="nom" value="${esc(k.nom)}" placeholder="Nom du pack" aria-label="Nom du pack">
      <span class="inline pk-montant"><input data-pk="montant" type="number" inputmode="decimal" value="${esc(k.montant)}" aria-label="Montant"><b>€</b></span>
      <label class="check pk-coche" title="Coché d'office dans une nouvelle offre"><input type="checkbox" data-pk="coche"${k.coche ? ' checked' : ''}><span>Par défaut</span></label>
      <button type="button" class="chip" data-pk-suppr aria-label="Supprimer ce pack">✕</button></div>`).join('')
      || '<span class="hint">Aucun pack : ajoute-en un.</span>';
    ['prixCV', 'taxeFixe', 'acheminement'].forEach(k => { $('#cg-' + k).value = p.carteGrise[k]; });
    $('#set-hausse').value = p.reprise.hausseReunion;
    $('#set-marge-min').value = p.reprise.margeMin;
    $('#set-marge-max').value = p.reprise.margeMax;
    $('#fac-regime').innerHTML = Object.entries(Facture.REGIMES).map(([k, l]) => `<option value="${k}"${k === p.facture.regime ? ' selected' : ''}>${l}</option>`).join('');
    $('#fac-conditions').value = p.facture.conditions;
    $('#act-mode').value = p.activite.mode;
    $('#act-type').innerHTML = Object.entries(Depot.TYPES).map(([k, l]) => `<option value="${k}"${k === p.activite.commissionType ? ' selected' : ''}>${l}</option>`).join('');
    ['commissionValeur', 'commissionMin', 'dureeMandat'].forEach(k => { $('#act-' + k).value = p.activite[k]; });
    $('#doc-type').innerHTML = TYPES_DOC.map(t => `<option>${t}</option>`).join('');
    rendreDocuments(p.documents);
  }

  function rendreDocuments(docs) {
    $('#p-docs').innerHTML = docs.length ? docs.map(d => `<div class="doc-ligne"><span class="badge b-blue">${esc(d.type)}</span>
      <span class="doc-nom">${esc(d.nom)}<small>${dateFr(d.date)}</small></span>
      <button type="button" class="chip" data-doc-ouvrir="${esc(d.id)}">Ouvrir</button>
      <button type="button" class="chip" data-doc-suppr="${esc(d.id)}" aria-label="Supprimer">✕</button></div>`).join('')
      : '<span class="hint">Aucun document pour l\'instant.</span>';
    $('#doc-ajout').classList.toggle('desactive', !Sync.role);
    $('#doc-info').textContent = Sync.role ? 'PDF ou image, 10 Mo maximum. Visible uniquement par ton équipe.'
      : 'Les documents sont rangés en ligne : connecte-toi (section Compte) pour en ajouter.';
  }

  // Lecture des packs tels qu'ils sont à l'écran.
  function packsEcran() {
    return [...document.querySelectorAll('#p-packs .pack-ligne')].map(l => ({
      id: l.dataset.packId,
      nom: l.querySelector('[data-pk=nom]').value.trim(),
      montant: num(l.querySelector('[data-pk=montant]').value),
      coche: l.querySelector('[data-pk=coche]').checked,
    }));
  }

  function init() {
    $('#btn-save-garage').addEventListener('click', () => {
      const garage = { ...get().garage };
      document.querySelectorAll('#p-garage [data-g]').forEach(i => { garage[i.dataset.g] = i.value.trim(); });
      if (!garage.nom) { toast("Le nom de l'entreprise est obligatoire."); $('#g-nom').focus(); return; }
      save({ garage });
      Sync.renommer(garage.nom);
      toast('Infos du garage enregistrées');
    });
    $('#logo-input').addEventListener('change', async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try { save({ garage: { ...get().garage, logo: await lireLogo(f) } }); rendre(); toast('Logo enregistré'); }
      catch (err) { toast("Cette image ne peut pas être lue."); }
    });
    $('#btn-logo-suppr').addEventListener('click', () => { save({ garage: { ...get().garage, logo: '' } }); rendre(); });

    $('#btn-pack-ajouter').addEventListener('click', () => {
      const packs = packsEcran();
      packs.push({ id: nouvelId(), nom: '', montant: '', coche: false });
      save({ packs });
      rendre();
      const lignes = document.querySelectorAll('#p-packs .pack-ligne');
      lignes[lignes.length - 1].querySelector('[data-pk=nom]').focus();
    });
    $('#p-packs').addEventListener('click', e => {
      if (!e.target.closest('[data-pk-suppr]')) return;
      const id = e.target.closest('.pack-ligne').dataset.packId;
      save({ packs: packsEcran().filter(k => k.id !== id) });
      rendre();
    });
    $('#btn-save-packs').addEventListener('click', () => {
      const packs = packsEcran();
      if (packs.some(k => !k.nom)) { toast('Donne un nom à chaque pack.'); return; }
      save({ packs });
      toast('Packs enregistrés : ils apparaissent dans les nouvelles offres');
    });

    $('#btn-save-cg').addEventListener('click', () => {
      save({ carteGrise: { prixCV: num($('#cg-prixCV').value) || 60, taxeFixe: num($('#cg-taxeFixe').value), acheminement: num($('#cg-acheminement').value) } });
      toast('Barème carte grise enregistré');
    });
    $('#btn-save-reprise').addEventListener('click', () => {
      const min = num($('#set-marge-min').value), max = num($('#set-marge-max').value);
      save({ reprise: { hausseReunion: num($('#set-hausse').value), margeMin: Math.min(min, max), margeMax: Math.max(min, max) } });
      toast('Réglages de reprise enregistrés');
    });

    $('#btn-save-facture').addEventListener('click', () => {
      save({ facture: { regime: $('#fac-regime').value, conditions: $('#fac-conditions').value.trim() } });
      toast('Réglages de facturation enregistrés');
    });
    $('#btn-export-factures').addEventListener('click', () => Facture.exporter());
    $('#btn-save-activite').addEventListener('click', () => {
      save({ activite: { mode: $('#act-mode').value, commissionType: $('#act-type').value, commissionValeur: num($('#act-commissionValeur').value),
        commissionMin: num($('#act-commissionMin').value), dureeMandat: num($('#act-dureeMandat').value) || 90 } });
      toast('Activité enregistrée : elle sert de choix par défaut pour chaque nouveau véhicule');
    });

    // Documents : rangés dans le dossier privé de l'entreprise.
    $('#doc-input').addEventListener('change', async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f || !Sync.role) return;
      if (f.size > 10 * 1024 * 1024) { toast('Fichier trop lourd (10 Mo maximum).'); return; }
      const id = nouvelId();
      const ext = (f.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
      const chemin = `${Sync.entreprise.id}/${id}${ext}`;
      $('#doc-info').textContent = 'Envoi…';
      const { error } = await Sync.client.storage.from('documents').upload(chemin, f, { contentType: f.type });
      if (error) { toast('Document non envoyé : ' + error.message); rendre(); return; }
      const docs = get().documents.concat({ id, type: $('#doc-type').value, nom: f.name, chemin, date: today() });
      save({ documents: docs });
      rendreDocuments(docs);
      toast('Document ajouté');
    });
    $('#p-docs').addEventListener('click', async e => {
      const ouvrir = e.target.dataset.docOuvrir, suppr = e.target.dataset.docSuppr;
      const doc = get().documents.find(d => d.id === (ouvrir || suppr));
      if (!doc) return;
      if (!Sync.role) { toast("Connecte-toi pour ouvrir les documents."); return; }
      if (ouvrir) {
        const w = window.open('', '_blank');
        const { data, error } = await Sync.client.storage.from('documents').createSignedUrl(doc.chemin, 300);
        if (error || !data) { w?.close(); toast('Document introuvable.'); return; }
        if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
        return;
      }
      if (!confirm(`Supprimer « ${doc.nom} » ?`)) return;
      await Sync.client.storage.from('documents').remove([doc.chemin]);
      const docs = get().documents.filter(d => d.id !== doc.id);
      save({ documents: docs });
      rendreDocuments(docs);
    });
  }

  return { get, save, rendre, rendreDocuments, init };
})();
