// Import du stock existant depuis un tableau Excel (.xlsx, .xls) ou CSV : un marchand démarre en une soirée.
// Les colonnes sont reconnues d'après leur titre ; on peut corriger la correspondance avant d'importer.
const Import = (() => {
  // Lecteur Excel (SheetJS 0.18.5, licence Apache 2.0, copié dans vendor/) chargé seulement quand on importe.
  const SHEETJS = 'vendor/xlsx.full.min.js';
  const CHAMPS = [
    ['', '— ignorer —'], ['marque', 'Marque'], ['modele', 'Modèle'], ['finition', 'Version / finition'], ['annee', 'Année'],
    ['miseEnCirculation', '1re mise en circulation'], ['kilometrage', 'Kilométrage'], ['carburant', 'Carburant'], ['boite', 'Boîte'],
    ['couleur', 'Couleur'], ['type', 'Type'], ['immatriculation', 'Plaque'], ['vin', 'VIN'], ['puissanceFiscale', 'Puissance fiscale (CV)'],
    ['puissanceCh', 'Puissance (ch)'], ['prixAchat', "Prix d'achat"], ['fraisEstimes', 'Frais'], ['prixVente', 'Prix de vente'],
    ['dateEntree', "Date d'entrée"], ['statut', 'Statut'], ['notes', 'Notes'],
  ];
  // Mots reconnus dans les titres de colonnes (sans accents, en minuscules).
  const MOTS = {
    marque: ['marque', 'constructeur', 'make', 'brand'], modele: ['modele', 'model'], finition: ['finition', 'version', 'motorisation'],
    annee: ['annee', 'millesime', 'year'], miseEnCirculation: ['mise en circulation', 'mec', '1re immat', 'premiere immat', 'date immat'],
    kilometrage: ['kilometrage', 'km', 'kms', 'compteur'], carburant: ['carburant', 'energie', 'fuel'], boite: ['boite', 'transmission'],
    couleur: ['couleur', 'teinte', 'color'], type: ['type', 'carrosserie', 'categorie'], immatriculation: ['immatriculation', 'immat', 'plaque'],
    vin: ['vin', 'chassis', 'n de serie', 'numero de serie'], puissanceFiscale: ['cv', 'puissance fiscale', 'chevaux fiscaux'],
    puissanceCh: ['ch', 'puissance', 'din'], prixAchat: ['prix d achat', 'prix achat', 'achat', 'pa'], fraisEstimes: ['frais', 'reconditionnement', 'remise en etat'],
    prixVente: ['prix de vente', 'prix vente', 'prix', 'pv', 'tarif'], dateEntree: ['date d entree', 'entree', 'date achat', 'date d achat', 'arrivee'],
    statut: ['statut', 'etat', 'status'], notes: ['notes', 'commentaire', 'remarque', 'observations'],
  };
  const NOMBRES = ['annee', 'kilometrage', 'puissanceFiscale', 'puissanceCh', 'prixAchat', 'fraisEstimes', 'prixVente'];
  const DATES = ['miseEnCirculation', 'dateEntree'];
  let lignes = [], entetes = [], choix = [], statutDefaut = 'En stock';

  const cle = s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
  function deviner(titre) {
    const t = cle(titre);
    if (!t) return '';
    // Titre exact d'abord, puis titre qui contient le mot (les mots les plus longs gagnent).
    const exact = Object.keys(MOTS).find(k => MOTS[k].includes(t));
    if (exact) return exact;
    let meilleur = '', long = 0;
    Object.entries(MOTS).forEach(([k, mots]) => mots.forEach(m => {
      if (m.length > 2 && (' ' + t + ' ').includes(' ' + m + ' ') && m.length > long) { meilleur = k; long = m.length; }
    }));
    return meilleur;
  }

  function charger() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = SHEETJS;
      s.onload = ok;
      s.onerror = () => ko(new Error('Lecteur Excel indisponible : recharge la page et réessaie.'));
      document.head.appendChild(s);
    });
  }

  const nombre = x => {
    if (typeof x === 'number') return x;
    const t = String(x ?? '').replace(/\s|€|km|cv|ch/gi, '').replace(',', '.');
    return t && !isNaN(t) ? Number(t) : '';
  };
  function dateIso(x) {
    if (x instanceof Date && !isNaN(x)) return isoLocal(x);
    const t = String(x ?? '').trim();
    let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : '';
  }
  // Valeurs ramenées à celles des listes de l'appli (carburant, boîte, statut).
  function normaliser(k, x) {
    const t = norm(x);
    if (k === 'carburant') return /elec/.test(t) ? 'Électrique' : /rechar|plug/.test(t) ? 'Hybride rechargeable' : /hyb/.test(t) ? 'Hybride'
      : /dies|gazole|gasoil|dci|hdi|tdi/.test(t) ? 'Diesel' : /gpl/.test(t) ? 'GPL' : /ess|sp|benz|petrol/.test(t) ? 'Essence' : String(x).trim();
    if (k === 'boite') return /auto|bva|dsg|edc|eat/.test(t) ? 'Automatique' : /man|bvm/.test(t) ? 'Manuelle' : String(x).trim();
    if (k === 'statut') return /vend/.test(t) ? 'Vendu' : /reserv/.test(t) ? 'Réservé' : /prep|atelier|repar/.test(t) ? 'En préparation' : 'En stock';
    if (k === 'immatriculation') return formatPlaque(String(x));
    if (k === 'vin') return VIN.clean(String(x));
    return String(x).trim();
  }

  async function lireFichier(f) {
    await charger();
    let wb;
    if (/\.(csv|txt)$/i.test(f.name) || f.type === 'text/csv') {
      // CSV : texte en UTF-8 (sinon Windows-1252, celui d'Excel), valeurs gardées telles quelles (dates à la française).
      const buf = await f.arrayBuffer();
      let texte = new TextDecoder('utf-8').decode(buf);
      if (texte.includes('\uFFFD')) texte = new TextDecoder('windows-1252').decode(buf);
      wb = XLSX.read(texte.replace(/^\uFEFF/, ''), { type: 'string', raw: true });
    } else {
      wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
    }
    const feuille = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(feuille, { header: 1, defval: '', raw: true }).filter(r => r.some(c => String(c).trim() !== ''));
    if (rows.length < 2) throw new Error('Le fichier doit avoir une ligne de titres puis au moins un véhicule.');
    entetes = rows[0].map(String);
    lignes = rows.slice(1);
    choix = entetes.map(deviner);
    // Une même rubrique ne peut venir que d'une colonne : on garde la première.
    choix = choix.map((c, i) => c && choix.indexOf(c) !== i ? '' : c);
  }

  function vehicules() {
    return lignes.map(r => {
      const v = {};
      choix.forEach((k, i) => {
        if (!k) return;
        const x = r[i];
        if (x === '' || x == null) return;
        v[k] = NOMBRES.includes(k) ? nombre(x) : DATES.includes(k) ? dateIso(x) : normaliser(k, x);
      });
      if (!v.annee && v.miseEnCirculation) v.annee = Number(v.miseEnCirculation.slice(0, 4));
      return v;
    }).filter(v => v.marque || v.modele || v.immatriculation);
  }

  function rendre() {
    const vs = vehicules();
    const existants = new Set(db.all('vehicules').map(v => v.immatriculation).filter(Boolean));
    const doublons = vs.filter(v => v.immatriculation && existants.has(v.immatriculation)).length;
    const opt = c => CHAMPS.map(([k, l]) => `<option value="${k}"${k === c ? ' selected' : ''}>${l}</option>`).join('');
    $('#import-body').innerHTML = `
      <p><strong>${vs.length} véhicule(s)</strong> trouvé(s) dans le fichier${doublons ? `, dont ${doublons} déjà dans Ocaz (même plaque) : ils seront ignorés` : ''}.</p>
      <h3 class="section">Colonnes reconnues</h3>
      <p class="hint">Vérifie la correspondance : chaque colonne du fichier va dans la rubrique choisie.</p>
      <div class="imp-colonnes">${entetes.map((e, i) => `<label class="imp-col"><span>${esc(e) || '(sans titre)'}<small>${esc(String(lignes[0]?.[i] ?? '').slice(0, 30))}</small></span>
        <select data-col="${i}">${opt(choix[i])}</select></label>`).join('')}</div>
      <div class="field"><label for="imp-statut">Statut si la colonne est absente</label>
        <select id="imp-statut">${['En stock', 'En préparation'].map(s => `<option${s === statutDefaut ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
      <h3 class="section">Aperçu</h3>
      <div class="police-table"><table><thead><tr><th>Véhicule</th><th>Plaque</th><th>Km</th><th>Achat</th><th>Vente</th></tr></thead><tbody>
        ${vs.slice(0, 6).map(v => `<tr><td>${esc(vehiculeNom(v))}<small>${esc([v.annee, v.carburant, v.boite].filter(Boolean).join(' · '))}</small></td>
          <td>${esc(v.immatriculation || '')}</td><td>${km(v.kilometrage)}</td><td>${euros(v.prixAchat)}</td><td>${euros(v.prixVente)}</td></tr>`).join('')}
      </tbody></table></div>${vs.length > 6 ? `<p class="hint">… et ${vs.length - 6} autre(s).</p>` : ''}`;
    $('#import-ok').hidden = !vs.length;
    $('#import-ok').textContent = `Importer ${vs.length - doublons} véhicule(s)`;
  }

  function accueil() {
    $('#import-body').innerHTML = `
      <p>Choisis le fichier de ton stock : Excel (.xlsx, .xls) ou CSV. La première ligne doit contenir les titres des colonnes.</p>
      <label class="button primary imp-fichier">Choisir le fichier<input type="file" id="import-fichier" accept=".xlsx,.xls,.csv,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" hidden></label>
      <p class="hint">Pas de fichier ? Télécharge le modèle depuis Paramètres, remplis-le, puis reviens ici.</p>`;
    $('#import-ok').hidden = true;
  }

  function ouvrir() { lignes = []; accueil(); $('#dlg-import').showModal(); }

  function importer() {
    const existants = new Set(db.all('vehicules').map(v => v.immatriculation).filter(Boolean));
    const vs = vehicules().filter(v => !v.immatriculation || !existants.has(v.immatriculation));
    vs.forEach(v => db.upsert('vehicules', { statut: statutDefaut, dateEntree: today(), ...v, importe: true }));
    Papiers.numeroter();
    $('#dlg-import').close();
    toast(`${vs.length} véhicule(s) importé(s)`);
    switchTab('stock');
  }

  function modele() {
    const csv = 'Marque;Modèle;Version;Année;Kilométrage;Carburant;Boîte;Couleur;Plaque;VIN;Prix d\'achat;Frais;Prix de vente;Date d\'entrée\r\n'
      + 'Renault;Clio;V TCe 90 Evolution;2021;32000;Essence;Manuelle;Blanc;AB-123-CD;;11800;400;15900;' + dateFr(today()) + '\r\n';
    Papiers.telecharger('﻿' + csv, 'modele-stock-ocaz.csv', 'text/csv');
  }

  function init() {
    $('#btn-import-stock').addEventListener('click', ouvrir);
    $('#btn-import-modele').addEventListener('click', modele);
    $('#import-fermer').addEventListener('click', () => $('#dlg-import').close());
    $('#import-ok').addEventListener('click', importer);
    $('#import-body').addEventListener('change', async e => {
      if (e.target.id === 'import-fichier') {
        const f = e.target.files[0];
        if (!f) return;
        $('#import-body').innerHTML = '<p class="hint">Lecture du fichier…</p>';
        try { await lireFichier(f); rendre(); } catch (err) { accueil(); toast(err.message || 'Fichier illisible.'); }
        return;
      }
      if (e.target.dataset.col != null) {
        const i = Number(e.target.dataset.col), k = e.target.value;
        // La rubrique choisie quitte l'autre colonne qui l'avait.
        choix = choix.map((c, j) => (j === i ? k : c === k ? '' : c));
        rendre();
        return;
      }
      if (e.target.id === 'imp-statut') statutDefaut = e.target.value;
    });
  }

  return { init, ouvrir, deviner };
})();
