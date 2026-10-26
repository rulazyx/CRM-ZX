// Recherche par plaque via api-plaque.com (passerelle RapidAPI).
// La clé est saisie dans les réglages de l'appli et reste sur l'appareil :
// elle n'est jamais écrite dans le code du dépôt.
const Plaque = (() => {
  const KEY = 'crmzx-plaque';
  const DEFAULT_HOST = 'api-plaque-immatriculation-france-donnees-vehicule-siv.p.rapidapi.com';

  function settings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* vide */ }
    return { cle: s.cle || '', host: s.host || DEFAULT_HOST, usage: s.usage || {} };
  }
  function saveSettings(patch) {
    const s = Object.assign(settings(), patch);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* stockage indisponible */ }
  }
  const mois = () => new Date().toISOString().slice(0, 7);
  const usageCeMois = () => settings().usage[mois()] || 0;

  const CARBURANTS = { GAZOLE: 'Diesel', DIESEL: 'Diesel', ESSENCE: 'Essence', ELECTRIC: 'Électrique', ELECTRIQUE: 'Électrique', GPL: 'GPL' };
  const titre = s => (s || '').toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase());

  function carburant(energie) {
    const e = (energie || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (e.includes('RECHARGEABLE')) return 'Hybride rechargeable';
    if (e.includes('HYBRID')) return 'Hybride';
    for (const k in CARBURANTS) if (e.includes(k)) return CARBURANTS[k];
    return energie ? 'Autre' : '';
  }

  async function rechercher(plaque) {
    const s = settings();
    if (!s.cle) throw new Error("Ajoute d'abord ta clé api-plaque dans le menu ⋯ > Recherche par plaque.");
    const p = (plaque || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (p.length < 5) throw new Error("Saisis la plaque d'abord.");
    const host = s.host.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    let res;
    try {
      res = await fetch(`https://${host}/fr?plaque=${encodeURIComponent(p)}`, {
        headers: { 'x-rapidapi-key': s.cle, 'x-rapidapi-host': host },
      });
    } catch (e) {
      throw new Error("Pas de réponse du service. Vérifie ta connexion ou l'adresse du service dans les réglages.");
    }
    saveSettings({ usage: Object.assign(s.usage, { [mois()]: usageCeMois() + 1 }) });
    let json = {};
    try { json = await res.json(); } catch (e) { /* réponse non JSON */ }
    if (res.status === 401 || res.status === 403) throw new Error("Clé refusée. Vérifie ta clé et que tu es bien abonné à l'API (offre Basic gratuite) sur RapidAPI.");
    if (res.status === 429) throw new Error('Quota atteint pour ce mois.');
    if (!res.ok || json.error || !json.data) throw new Error(json.message || `Véhicule introuvable (erreur ${res.status}).`);
    const d = json.data;
    // Le service renvoie plus de 80 champs dont les noms varient : on cherche par mot-clé.
    const pick = (...motifs) => {
      for (const m of motifs) {
        const k = Object.keys(d).find(key => m.test(key) && d[key] !== '' && d[key] != null && typeof d[key] !== 'object');
        if (k) return String(d[k]).trim();
      }
      return '';
    };
    const mec = pick(/date_mise_en_circulation/i, /date1erCir_fr/i, /mise.*circulation/i).match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    const carrosserie = pick(/carrosserie(?!.*code)/i, /body/i);
    const genre = pick(/^AWN_genre$/i, /genre(?!.*code)/i);
    const boite = pick(/boite/i, /transmission(?!.*code)/i, /gearbox/i);
    return {
      marque: titre(pick(/^AWN_marque$/i, /marque(?!.*(image|logo|id))/i)),
      modele: titre(pick(/^AWN_modele$/i, /modele(?!.*(image|photo|id|etude|prf|label))/i)),
      finition: pick(/^AWN_version$/i, /version/i, /label_moteur/i),
      annee: mec ? mec[3] : pick(/annee(?!.*(debut|fin))/i),
      miseEnCirculation: mec ? `${mec[3]}-${mec[2]}-${mec[1]}` : '',
      carburant: carburant(pick(/energie(?!.*code)/i, /carburant/i, /fuel/i)),
      boite: /auto|robot|cvt|dsg|edc|eat/i.test(boite) ? 'Automatique' : /manu|meca/i.test(boite) ? 'Manuelle' : '',
      couleur: titre(pick(/couleur/i, /colou?r/i)),
      type: typeVehicule(carrosserie, genre),
      puissanceCh: pick(/puissance_chevaux/i, /puisFiscReelCH/i, /puissance_din/i),
      puissanceFiscale: pick(/puissance_fiscale/i, /^puisFisc$/i),
      cylindree: pick(/cylindre_capacite/i, /^ccm$/i, /cylindree(?!_liters)/i),
      co2: pick(/co_?2/i),
      portes: pick(/portes/i),
      places: pick(/places|passagers|seats/i),
      vin: pick(/_VIN$/i, /^vin$/i),
      description: pick(/selector_modele_label/i, /tecdoc_modele_description/i, /label$/i),
      // Tout ce que renvoie le service, gardé dans la fiche du véhicule.
      ficheTechnique: Object.fromEntries(Object.entries(d)
        .filter(([k, v]) => v !== '' && v != null && typeof v !== 'object' && !/image|photo|logo/i.test(k))
        .map(([k, v]) => [k.replace(/^AWN_/, '').replace(/_/g, ' '), String(v)])),
    };
  }

  // Type de véhicule déduit de la carrosserie et du genre de la carte grise.
  function typeVehicule(carrosserie, genre) {
    const c = norm(carrosserie + ' ' + genre);
    if (/ctte|camionnette|utilitaire|fourgon|\bvu\b|deriv/.test(c)) return 'Utilitaire';
    if (/pick/.test(c)) return 'Pick-up';
    if (/break|sw|estate|touring/.test(c)) return 'Break';
    if (/monospace|mpv/.test(c)) return 'Monospace';
    if (/suv|4x4|tout.?terrain|crossover/.test(c)) return 'SUV / 4x4';
    if (/coupe|cabrio|roadster/.test(c)) return 'Coupé / Cabriolet';
    if (/berline|sedan|4 portes/.test(c)) return 'Berline';
    return '';
  }
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  return { settings, saveSettings, usageCeMois, rechercher, DEFAULT_HOST };
})();
