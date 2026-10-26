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
    const mec = (d.AWN_date_mise_en_circulation || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
    return {
      marque: titre(d.AWN_marque),
      modele: titre(d.AWN_modele),
      finition: d.AWN_version || d.AWN_label_moteur || '',
      annee: mec ? mec[3] : '',
      miseEnCirculation: mec ? `${mec[3]}-${mec[2]}-${mec[1]}` : '',
      carburant: carburant(d.AWN_energie),
      vin: d.AWN_VIN || '',
      description: d.AWN_selector_modele_label || d.AWN_label || '',
    };
  }

  return { settings, saveSettings, usageCeMois, rechercher, DEFAULT_HOST };
})();
