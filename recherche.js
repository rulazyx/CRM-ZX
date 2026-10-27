// Recherche de véhicules partagée par l'accueil (index.html) et le site du réseau (reseau.html) :
// critères lus et écrits dans l'adresse (?prixMin=…&lieu=…), et test d'un véhicule publié par un garage.
const Recherche = (() => {
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  // Les 24 communes de La Réunion et leur code postal principal.
  const COMMUNES = [['Bras-Panon', '97412'], ['Cilaos', '97413'], ['Entre-Deux', '97414'], ["L'Étang-Salé", '97427'], ['La Plaine-des-Palmistes', '97431'],
    ['La Possession', '97419'], ['Le Port', '97420'], ['Le Tampon', '97430'], ['Les Avirons', '97425'], ['Les Trois-Bassins', '97426'], ['Petite-Île', '97429'],
    ['Saint-André', '97440'], ['Saint-Benoît', '97470'], ['Saint-Denis', '97400'], ['Saint-Joseph', '97480'], ['Saint-Leu', '97436'], ['Saint-Louis', '97450'],
    ['Saint-Paul', '97460'], ['Saint-Philippe', '97442'], ['Saint-Pierre', '97410'], ['Sainte-Marie', '97438'], ['Sainte-Rose', '97439'], ['Sainte-Suzanne', '97441'],
    ['Salazie', '97433']];
  const CLES = ['prixMin', 'prixMax', 'lieu', 'kmMax', 'anneeMin', 'couleur', 'type', 'energie'];
  const NOMBRES = ['prixMin', 'prixMax', 'kmMax', 'anneeMin'];

  function depuisUrl(search = location.search) {
    const q = new URLSearchParams(search), c = {};
    CLES.forEach(k => { const x = (q.get(k) || '').trim(); if (x) c[k] = NOMBRES.includes(k) ? Number(x) || 0 : x; });
    NOMBRES.forEach(k => { if (!c[k]) delete c[k]; });
    return c;
  }
  function versUrl(c) {
    const q = new URLSearchParams();
    CLES.forEach(k => { if (c[k]) q.set(k, c[k]); });
    return q.toString();
  }

  // Lieu : un code postal, ou un nom de commune (avec ou sans accents ni tirets).
  function memeLieu(g, lieu) {
    const l = norm(lieu).replace(/[-']/g, ' ');
    if (/^\d{5}$/.test(l)) return g.codePostal === l;
    const commune = COMMUNES.find(([n]) => norm(n).replace(/[-']/g, ' ') === l);
    const ville = norm(g.ville).replace(/[-']/g, ' ');
    if (commune && g.codePostal === commune[1]) return true;
    return !!ville && (ville === l || ville.includes(l) || l.includes(ville));
  }

  function correspond(v, c) {
    const prix = Number(v.prix) || 0, kmv = Number(v.kilometrage) || 0, annee = Number(v.annee) || 0;
    return (!c.prixMin || prix >= c.prixMin) && (!c.prixMax || (prix && prix <= c.prixMax))
      && (!c.lieu || memeLieu(v.garage || {}, c.lieu))
      && (!c.kmMax || (v.kilometrage !== '' && v.kilometrage != null && kmv <= c.kmMax))
      && (!c.anneeMin || annee >= c.anneeMin)
      && (!c.couleur || norm(v.couleur) === norm(c.couleur))
      && (!c.type || v.type === c.type)
      && (!c.energie || v.carburant === c.energie);
  }

  // Résumé lisible des critères, pour le bandeau « Votre recherche » du site du réseau.
  function resume(c) {
    const e = n => Number(n).toLocaleString('fr-FR') + ' €';
    return [
      c.prixMin && c.prixMax ? `${e(c.prixMin)} à ${e(c.prixMax)}` : c.prixMin ? `dès ${e(c.prixMin)}` : c.prixMax ? `jusqu'à ${e(c.prixMax)}` : '',
      c.lieu, c.kmMax && `moins de ${Number(c.kmMax).toLocaleString('fr-FR')} km`, c.anneeMin && `${c.anneeMin} ou plus récent`, c.couleur, c.type, c.energie,
    ].filter(Boolean);
  }

  return { COMMUNES, depuisUrl, versUrl, correspond, resume };
})();
