// Données d'exemple du compte démo (identifiant « test ») : un petit garage de La Réunion fictif.
// Les dates sont calculées à partir d'aujourd'hui pour que l'accueil et le planning restent vivants.
const Demo = (() => {
  const jour = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d); };
  const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function remplir(remettreAZero) {
    const maintenant = new Date().toISOString();
    if (remettreAZero) {
      // Les anciennes fiches sont marquées supprimées pour que la synchro ne les ramène pas.
      const supprimes = db.data.supprimes || {};
      ['clients', 'vehicules', 'commandes', 'planning'].forEach(t => db.all(t).forEach(r => { supprimes[r.id] = maintenant; }));
      db.data.supprimes = supprimes;
    }
    const fiche = r => ({ id: id(), creeLe: maintenant, majLe: maintenant, ...r });

    const clients = [
      ['Payet', 'Jean-Marc', '0692 41 22 18', 'Saint-Pierre'], ['Hoarau', 'Sandrine', '0693 12 54 90', 'Le Tampon'],
      ['Grondin', 'Luc', '0692 77 03 61', 'Saint-Louis'], ['Técher', 'Nathalie', '0692 30 48 12', 'Saint-Paul'],
      ['Fontaine', 'David', '0693 88 21 07', 'Saint-Denis'], ['Rivière', 'Émilie', '0692 15 66 39', 'Saint-André'],
      ['Boyer', 'Kévin', '0693 02 97 45', 'Saint-Joseph'], ['Maillot', 'Audrey', '0692 59 13 80', 'Sainte-Marie'],
    ].map(([nom, prenom, telephone, ville]) => fiche({ nom, prenom, telephone, ville, email: `${prenom}.${nom}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '@exemple.re' }));
    const sources = ['Leboncoin', 'Facebook', 'Passage au garage', 'Leboncoin', 'Bouche-à-oreille', 'La Centrale', 'Leboncoin', 'Facebook'];
    clients.forEach((c, i) => { c.source = sources[i]; c.civilite = i % 2 ? 'Mme' : 'M.'; c.adresse = (12 + i * 7) + ' rue de la République'; });
    const C = Object.fromEntries(clients.map(c => [c.nom, c.id]));

    const v = (marque, modele, finition, annee, km, carburant, boite, type, couleur, statut, entree, achat, vente, frais, extra = {}) => fiche({
      marque, modele, finition, annee, kilometrage: km, carburant, boite, type, couleur, statut, puissanceFiscale: 5,
      dateEntree: entree == null ? '' : jour(-entree), prixAchat: achat, prixVente: vente, fraisEstimes: frais, ...extra,
    });
    const vehicules = [
      v('Renault', 'Clio', 'V TCe 90 Evolution', 2021, 32000, 'Essence', 'Manuelle', 'Citadine', 'Blanc', 'En stock', 45, 11800, 15900, 400,
        { vendeurId: C['Grondin'], immatriculation: 'GH-204-RE', vin: 'VF1RJA00X67123456', achatPaiement: 'Virement', vendeurPieceType: "Carte d'identité", vendeurPieceNumero: 'X4RT82KL9', vendeurPieceDate: jour(-2000), vendeurPieceAutorite: 'Préfecture de La Réunion' }),
      v('Peugeot', '208', 'PureTech 100 Allure', 2020, 48000, 'Essence', 'Manuelle', 'Citadine', 'Gris', 'En stock', 95, 10500, 14500, 600),
      v('Dacia', 'Duster', 'Blue dCi 115 Prestige', 2019, 61000, 'Diesel', 'Manuelle', 'SUV / 4x4', 'Orange', 'En stock', 20, 12000, 15900, 300),
      v('Toyota', 'Yaris', 'Hybride 116h Design', 2022, 25000, 'Hybride', 'Automatique', 'Citadine', 'Rouge', 'En stock', 12, 15800, 19900, 200),
      v('Kia', 'Picanto', '1.0 Active', 2018, 52000, 'Essence', 'Manuelle', 'Citadine', 'Bleu', 'En stock', 130, 6200, 8900, 350),
      v('Hyundai', 'i20', '1.2 Intuitive', 2019, 58000, 'Essence', 'Manuelle', 'Citadine', 'Noir', 'En préparation', 6, 7900, 11500, 900),
      v('Volkswagen', 'Polo', '1.0 TSI Confortline', 2017, 74000, 'Essence', 'Manuelle', 'Citadine', 'Gris', 'En préparation', 3, 7200, 10900, 1200),
      v('Nissan', 'Qashqai', '1.3 DIG-T N-Connecta', 2020, 41000, 'Essence', 'Automatique', 'SUV / 4x4', 'Blanc', 'Réservé', 38, 16500, 21900, 500),
      v('Citroën', 'C3', '1.2 PureTech Feel', 2016, 98000, 'Essence', 'Manuelle', 'Citadine', 'Blanc', 'Reprise à étudier', null, '', '', '',
        { vendeurId: C['Técher'], coteLaCentrale: 7600, coteLeboncoin: 8200, fraisMecanique: 400, fraisCarrosserie: 300, fraisSupposes: 150, immatriculation: 'FA-512-RE' }),
    ];
    // Ventes livrées sur les 5 derniers mois.
    const ventes = [
      ['Renault', 'Captur', 2019, 'SUV / 4x4', 12, 40, 13200, 17900, 'Payet'], ['Toyota', 'Aygo', 2020, 'Citadine', 25, 30, 7400, 10500, 'Fontaine'],
      ['Peugeot', '3008', 2018, 'SUV / 4x4', 48, 55, 15500, 20900, 'Boyer'], ['Suzuki', 'Swift', 2019, 'Citadine', 70, 28, 8800, 12400, 'Maillot'],
      ['Dacia', 'Sandero', 2021, 'Citadine', 95, 22, 8600, 11900, 'Rivière'], ['Ford', 'Fiesta', 2018, 'Citadine', 128, 60, 6900, 9900, 'Grondin'],
      ['Renault', 'Kangoo', 2017, 'Utilitaire', 150, 75, 8200, 12500, 'Hoarau'],
    ].map(([marque, modele, annee, type, il, sejour, achat, vente, client]) => ({
      v: v(marque, modele, '', annee, 50000 + annee % 7 * 9000, 'Essence', 'Manuelle', type, 'Gris', 'Vendu', il + sejour, achat, vente, 400, { dateVente: jour(-il) }),
      il, vente, client,
    }));
    vehicules.push(...ventes.map(x => x.v));
    // Un véhicule en dépôt-vente, confié par un client.
    vehicules.push(v('Peugeot', '2008', '1.2 PureTech 130 GT Line', 2020, 46000, 'Essence', 'Automatique', 'SUV / 4x4', 'Gris', 'En stock', 25, '', 18900, 0,
      { mode: 'depot', vendeurId: C['Fontaine'], commissionType: 'pourcentage', commissionValeur: 8, commissionMin: 500, mandatDebut: jour(-25), mandatFin: jour(65) }));
    // Livre de police de la démo : chaque véhicule acheté a son vendeur et sa pièce d'identité.
    const pieces = ["Carte d'identité", 'Permis de conduire', 'Passeport'];
    vehicules.filter(x => x.statut !== 'Reprise à étudier').forEach((x, i) => {
      if (!x.vendeurId) Object.assign(x, { vendeurId: clients[(i + 3) % clients.length].id, achatPaiement: i % 3 ? 'Virement' : 'Chèque',
        vendeurPieceType: pieces[i % 3], vendeurPieceNumero: (i * 7919 + 104729).toString(36).toUpperCase().padStart(9, 'X'),
        vendeurPieceDate: jour(-1500 - i * 90), vendeurPieceAutorite: 'Préfecture de La Réunion' });
      if (!x.immatriculation) x.immatriculation = `${'FGHJKL'[i % 6]}${'ABCDEF'[(i * 5) % 6]}-${String(100 + i * 37).slice(0, 3)}-RE`;
    });

    let seq = 0;
    const numero = () => 'CMD-' + String(++seq).padStart(4, '0');
    const packs = Param.get().packs.map(k => ({ id: k.id, nom: k.nom, montant: k.montant, coche: !!k.coche }));
    const montantPack = packs.filter(k => k.coche).reduce((s, k) => s + num(k.montant), 0);
    const commande = (vehicule, client, statut, date, extra = {}) => fiche({
      numero: numero(), vehiculeId: vehicule.id, clientId: C[client], statut, date,
      prixVente: vehicule.prixVente, remise: 300, montantPack, carteGrise: 313.76, prix: num(vehicule.prixVente) - 300 + montantPack + 313.76,
      pack: { items: packs, frais: false }, ...extra,
    });
    const commandes = [
      ...ventes.map(x => commande(x.v, x.client, 'Livrée', jour(-x.il - 6), { dateLivree: jour(-x.il) })),
      commande(vehicules[7], 'Hoarau', 'Commande', jour(-4), { dateLivraison: jour(3) }),
      commande(vehicules[0], 'Rivière', 'Offre', jour(-10)),
      commande(vehicules[3], 'Fontaine', 'Offre', jour(-1)),
    ];
    const offreAncienne = commandes[commandes.length - 2];
    const planning = [
      fiche({ type: 'Relance client', date: jour(-2), heure: '10:00', clientId: C['Rivière'], commandeId: offreAncienne.id, notes: 'Relancer pour la Clio', fait: false }),
      fiche({ type: 'Essai', date: jour(1), heure: '14:30', clientId: C['Boyer'], vehiculeId: vehicules[2].id, fait: false }),
      fiche({ type: 'Vente / livraison', date: jour(3), heure: '09:30', clientId: C['Hoarau'], vehiculeId: vehicules[7].id, fait: false }),
      fiche({ type: 'Expertise reprise', date: jour(2), heure: '11:00', clientId: C['Técher'], vehiculeId: vehicules[8].id, fait: false }),
      fiche({ type: 'Relance client', date: jour(1), heure: '16:00', clientId: C['Fontaine'], commandeId: commandes[commandes.length - 1].id, fait: false }),
    ];
    // Recherches de clients : l'une correspond au Duster en stock, l'autre attend une Clio.
    Object.assign(clients[0], { rechMarque: 'Dacia', rechBudget: 17000, rechKmMax: 80000 });
    Object.assign(clients[6], { rechMarque: 'Citroën', rechModele: 'C3', rechBudget: 11000 });
    // Préparation en cours sur la Polo.
    vehicules[6].prepa = [['Vidange et filtres', true, 180], ['Pneus', true, 360], ['Freins', false, 240], ['Contrôle technique', false, 78],
      ['Carrosserie', false, 300], ['Nettoyage intérieur', true, 60]].map(([nom, fait, montant], i) => ({ id: 'p' + i, nom, fait, montant }));
    vehicules[6].fraisReels = 600;
    clients[3].interets = [vehicules[2].id];
    clients[1].interets = [vehicules[7].id];

    db.data.clients = clients;
    db.data.vehicules = vehicules;
    db.data.commandes = commandes;
    db.data.planning = planning;
    db.data.seq = seq;
    Param.save({ garage: { ...Param.get().garage, nom: 'Garage Démo', ville: 'Saint-Pierre', telephone: '0262 00 00 00' },
      reseau: { ...Param.get().reseau, actif: true, accepteLe: maintenant } });
  }

  return { remplir };
})();
