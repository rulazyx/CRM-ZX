// CRM ZX — V1. Données stockées dans le navigateur (localStorage).
// Toute la lecture/écriture passe par `db`, pour pouvoir brancher
// une vraie base (Supabase) plus tard sans toucher aux écrans.

const STORAGE_KEY = 'crmzx-v1';

const db = {
  data: { clients: [], vehicules: [], commandes: [], planning: [], seq: 0 },
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) this.data = Object.assign(this.data, saved);
      (this.data.planning || []).forEach(r => { if (r.type === 'Rappel client') r.type = 'Relance client'; });
    } catch (e) { /* stockage indisponible : on démarre vide */ }
  },
  // `distant` : données reçues de la synchro, à ne pas renvoyer.
  save(distant) {
    if (!distant) this.data.majLe = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); }
    catch (e) { toast("Impossible d'enregistrer sur cet appareil."); }
    if (!distant) Sync.changed();
  },
  all(table) { return this.data[table]; },
  get(table, id) { return this.data[table].find(r => r.id === id); },
  upsert(table, row) {
    const now = new Date().toISOString();
    if (row.id) {
      const i = this.data[table].findIndex(r => r.id === row.id);
      this.data[table][i] = Object.assign({}, this.data[table][i], row, { majLe: now });
    } else {
      row.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      row.creeLe = now;
      if (table === 'commandes') row.numero = 'CMD-' + String(++this.data.seq).padStart(4, '0');
      this.data[table].push(row);
    }
    this.save();
    return row;
  },
  remove(table, id) {
    this.data[table] = this.data[table].filter(r => r.id !== id);
    this.save();
  },
};

// ---------- Utilitaires ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euros = n => (n === '' || n == null || isNaN(n)) ? '' : Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const km = n => (n === '' || n == null) ? '' : Number(n).toLocaleString('fr-FR') + ' km';
const dateFr = d => d ? new Date(d).toLocaleDateString('fr-FR') : '';
// Date du jour à l'heure locale (La Réunion est en UTC+4 : toISOString donnerait parfois la veille).
const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => isoLocal(new Date());
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function toast(msg) {
  const t = $('#toast');
  // Une fenêtre ouverte passe au-dessus de tout : le message doit être dedans pour rester visible.
  const open = [...document.querySelectorAll('dialog[open]')].pop();
  (open || document.body).appendChild(t);
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

const clientNom = c => c ? [c.prenom, c.nom].filter(Boolean).join(' ') || c.societe || '(sans nom)' : '(client supprimé)';
const vehiculeNom = v => v ? [v.marque, v.modele, v.finition].filter(Boolean).join(' ') || '(véhicule sans nom)' : '(véhicule supprimé)';

// Parcours : Reprise à étudier → (validée) En préparation / En stock → Réservé → Vendu, ou Reprise refusée.
const STATUT_VEHICULE = {
  'Reprise à étudier': 'b-purple', 'Reprise refusée': 'b-red', 'En préparation': 'b-blue',
  'En stock': 'b-green', 'Réservé': 'b-orange', 'Vendu': 'b-grey',
};
const REPRISE = ['Reprise à étudier', 'Reprise refusée'];
const DISPONIBLE = ['En préparation', 'En stock'];
const TYPES = ['', 'Citadine', 'Berline', 'Break', 'SUV / 4x4', 'Monospace', 'Coupé / Cabriolet', 'Utilitaire', 'Pick-up'];
// Véhicules : deux vues. « Stock » (pas d'ajout direct, on y entre par une reprise validée) et « Reprises ».
let vueVehicule = 'stock';
const filtresStock = { statut: 'Disponibles', couleur: '', type: '', anneeMin: '', anneeMax: '', kmMax: '' };
const STATUTS_STOCK = {
  'Disponibles': v => DISPONIBLE.includes(v.statut),
  'Réservés': v => v.statut === 'Réservé',
  'Vendus': v => v.statut === 'Vendu',
  'Tout le stock': v => !REPRISE.includes(v.statut),
};
const STATUTS_REPRISE = {
  'À étudier': v => v.statut === 'Reprise à étudier',
  'Refusées': v => v.statut === 'Reprise refusée',
};
let filtreReprise = 'À étudier';
const interessesPar = v => db.all('clients').filter(c => (c.interets || []).includes(v.id));
const num = x => Number(x) || 0;
const TYPES_RDV = { 'Essai': 'b-blue', 'Expertise reprise': 'b-purple', 'Livraison': 'b-green', 'Relance client': 'b-orange', 'Rendez-vous': 'b-blue', 'Autre': 'b-grey' };
const FILTRES_RDV = {
  'Semaine': () => true,
  'À venir': r => !r.fait && r.date >= today(),
  'En retard': r => !r.fait && r.date < today(),
  'Faits': r => !!r.fait,
  'Tous': () => true,
};
let filtreRdv = 'Semaine';
// Lundi de la semaine affichée dans le calendrier.
let semaine = (() => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; })();
const ajouterJours = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const STATUT_COMMANDE = { 'Devis': 'b-blue', 'En cours': 'b-orange', 'Livrée': 'b-green', 'Annulée': 'b-red' };

// ---------- Définition des onglets ----------
const TABS = {
  clients: {
    titre: 'client', titreNouveau: 'Nouveau client',
    fields: [
      { k: 'prenom', l: 'Prénom' },
      { k: 'nom', l: 'Nom', required: true },
      { k: 'telephone', l: 'Téléphone', type: 'tel' },
      { k: 'email', l: 'Email', type: 'email' },
      { k: 'adresse', l: 'Adresse', full: true },
      { k: 'codePostal', l: 'Code postal' },
      { k: 'ville', l: 'Ville' },
      { k: 'societe', l: 'Société (si pro)', full: true },
      { k: 'notes', l: 'Notes', type: 'textarea', full: true },
      { k: '_projet', l: 'Projet du client', type: 'section' },
      { k: 'interets', l: 'Véhicules en stock qui l\'intéressent', type: 'interets', full: true },
      { k: 'repriseId', l: 'Sa reprise', type: 'reprise', full: true },
    ],
    search: c => [c.prenom, c.nom, c.telephone, c.email, c.ville, c.societe],
    sort: (a, b) => norm(a.nom).localeCompare(norm(b.nom)),
    card: c => {
      const nb = db.all('commandes').filter(o => o.clientId === c.id).length;
      const interets = (c.interets || []).map(id => db.get('vehicules', id)).filter(Boolean);
      const reprise = db.all('vehicules').find(v => v.vendeurId === c.id && REPRISE.includes(v.statut));
      const initiales = ((c.prenom || '')[0] || '') + ((c.nom || c.societe || '')[0] || '');
      return `<div class="top"><span class="who"><span class="avatar">${esc(initiales.toUpperCase())}</span><span class="title">${esc(clientNom(c))}</span></span>
        ${nb ? `<span class="badge b-blue">${nb} commande${nb > 1 ? 's' : ''}</span>` : ''}</div>
        <div class="sub">${esc([c.telephone, c.email].filter(Boolean).join(' · '))}</div>
        <div class="sub">${esc([c.ville, c.societe].filter(Boolean).join(' · '))}</div>
        ${interets.length ? `<div class="sub">★ Intéressé par : ${esc(interets.map(vehiculeNom).join(', '))}</div>` : ''}
        ${reprise ? `<div class="sub">↺ Reprise : ${esc(vehiculeNom(reprise))}</div>` : ''}`;
    },
    canDelete: c => {
      const nb = db.all('commandes').filter(o => o.clientId === c.id).length;
      return nb ? `Ce client a ${nb} commande(s). Supprime d'abord ses commandes.` : true;
    },
    // La reprise est rattachée au véhicule (vendeurId) : on met à jour le lien depuis la fiche client.
    beforeSave: c => {
      c.interets = c.interets || [];
      const repriseId = c.repriseId;
      delete c.repriseId;
      return saved => {
        db.all('vehicules').filter(v => v.vendeurId === saved.id && REPRISE.includes(v.statut) && v.id !== repriseId)
          .forEach(v => db.upsert('vehicules', { id: v.id, vendeurId: '' }));
        if (repriseId) db.upsert('vehicules', { id: repriseId, vendeurId: saved.id });
      };
    },
  },

  vehicules: {
    titre: 'véhicule', titreNouveau: 'Nouvelle reprise / nouveau véhicule',
    fields: [
      { k: '_lookup', type: 'lookup' },
      { k: 'marque', l: 'Marque', required: true },
      { k: 'modele', l: 'Modèle' },
      { k: 'finition', l: 'Finition / version', full: true },
      { k: 'annee', l: 'Année', type: 'number' },
      { k: 'miseEnCirculation', l: '1re mise en circulation', type: 'date' },
      { k: 'kilometrage', l: 'Kilométrage', type: 'number' },
      { k: 'carburant', l: 'Carburant', type: 'select', options: ['', 'Essence', 'Diesel', 'Hybride', 'Hybride rechargeable', 'Électrique', 'GPL', 'Autre'] },
      { k: 'boite', l: 'Boîte', type: 'select', options: ['', 'Manuelle', 'Automatique'] },
      { k: 'couleur', l: 'Couleur' },
      { k: 'type', l: 'Type', type: 'select', options: TYPES },
      { k: 'puissanceCh', l: 'Puissance (ch)', type: 'number' },
      { k: 'puissanceFiscale', l: 'Puissance fiscale (CV)', type: 'number' },
      { k: 'cylindree', l: 'Cylindrée (cm³)', type: 'number' },
      { k: 'co2', l: 'CO₂ (g/km)', type: 'number' },
      { k: 'portes', l: 'Portes', type: 'number' },
      { k: 'places', l: 'Places', type: 'number' },
      { k: '_fiche', type: 'fiche' },
      { k: 'statut', l: 'Statut', type: 'select', options: Object.keys(STATUT_VEHICULE), def: 'Reprise à étudier' },
      { k: '_reprise', l: 'Reprise', type: 'section' },
      { k: 'vendeurId', l: 'Vendeur (client qui cède le véhicule)', type: 'ref', table: 'clients', full: true },
      { k: 'etat', l: 'État général', type: 'select', options: ['', 'Très bon', 'Bon', 'Moyen', 'À rénover'] },
      { k: 'coteEstimee', l: 'Cote estimée (€)', type: 'number' },
      { k: '_cote', type: 'cote' },
      { k: 'fraisEstimes', l: 'Frais de remise en état (€)', type: 'number' },
      { k: 'prixPropose', l: 'Prix de reprise proposé (€)', type: 'number' },
      { k: 'defauts', l: 'Défauts constatés', type: 'textarea', full: true },
      { k: '_stock', l: 'Stock et vente', type: 'section' },
      { k: 'prixAchat', l: "Prix d'achat final (€)", type: 'number' },
      { k: 'prixVente', l: 'Prix de vente (€)', type: 'number' },
      { k: 'dateEntree', l: "Date d'entrée en stock", type: 'date' },
      { k: '_interesses', type: 'interesses' },
      { k: 'notes', l: 'Notes', type: 'textarea', full: true },
    ],
    search: v => [v.immatriculation, v.vin, v.marque, v.modele, v.finition, v.vendeurId ? clientNom(db.get('clients', v.vendeurId)) : ''],
    sort: (a, b) => (b.creeLe || '').localeCompare(a.creeLe || ''),
    filter: v => {
      if (vueVehicule === 'reprises') return STATUTS_REPRISE[filtreReprise](v);
      const f = filtresStock;
      return STATUTS_STOCK[f.statut](v)
        && (!f.couleur || norm(v.couleur) === norm(f.couleur))
        && (!f.type || v.type === f.type)
        && (!f.anneeMin || num(v.annee) >= num(f.anneeMin))
        && (!f.anneeMax || (v.annee && num(v.annee) <= num(f.anneeMax)))
        && (!f.kmMax || (v.kilometrage !== '' && v.kilometrage != null && num(v.kilometrage) <= num(f.kmMax)));
    },
    card: v => {
      const reprise = REPRISE.includes(v.statut);
      const prix = reprise ? (v.prixPropose ? 'Proposé ' + euros(v.prixPropose) : '') : euros(v.prixVente);
      const marge = !reprise && v.prixVente && v.prixAchat ? num(v.prixVente) - num(v.prixAchat) - num(v.fraisEstimes) : null;
      return `<div class="top"><span class="title">${esc(vehiculeNom(v))}</span>
        <span class="badge ${STATUT_VEHICULE[v.statut] || 'b-grey'}">${esc(v.statut || '')}</span></div>
        <div class="sub">${esc([v.annee, km(v.kilometrage), v.carburant, v.boite, v.type, v.couleur].filter(Boolean).join(' · '))}</div>
        ${!reprise && interessesPar(v).length ? `<div class="sub">★ ${interessesPar(v).length} client(s) intéressé(s)</div>` : ''}
        ${reprise && v.vendeurId ? `<div class="sub">Vendeur : ${esc(clientNom(db.get('clients', v.vendeurId)))}</div>` : ''}
        <div class="top"><span>${v.immatriculation ? `<span class="plate">${esc(v.immatriculation)}</span>` : ''}</span>
        <span class="price">${prix}${marge !== null ? `<span class="sub"> · marge ${euros(marge)}</span>` : ''}</span></div>`;
    },
    canDelete: v => {
      const nb = db.all('commandes').filter(o => o.vehiculeId === v.id).length;
      return nb ? `Ce véhicule est dans ${nb} commande(s). Supprime d'abord la commande.` : true;
    },
    afterDelete: v => {
      interessesPar(v).forEach(c => db.upsert('clients', { id: c.id, interets: c.interets.filter(id => id !== v.id) }));
    },
  },

  commandes: {
    titre: 'commande', titreNouveau: 'Nouvelle commande',
    fields: [
      { k: 'clientId', l: 'Client', type: 'ref', table: 'clients', required: true, full: true },
      { k: 'vehiculeId', l: 'Véhicule', type: 'ref', table: 'vehicules', required: true, full: true },
      { k: 'date', l: 'Date', type: 'date', def: today },
      { k: 'statut', l: 'Statut', type: 'select', options: Object.keys(STATUT_COMMANDE), def: 'En cours' },
      { k: 'prix', l: 'Prix de vente (€)', type: 'number' },
      { k: 'acompte', l: 'Acompte versé (€)', type: 'number' },
      { k: 'paiement', l: 'Mode de paiement', type: 'select', options: ['', 'Comptant', 'Virement', 'Chèque', 'Financement / crédit', 'Reprise + soulte'] },
      { k: 'dateLivraison', l: 'Livraison prévue', type: 'date' },
      { k: 'notes', l: 'Notes', type: 'textarea', full: true },
    ],
    search: o => [o.numero, clientNom(db.get('clients', o.clientId)), vehiculeNom(db.get('vehicules', o.vehiculeId)),
      db.get('vehicules', o.vehiculeId)?.immatriculation, o.statut],
    sort: (a, b) => (b.date || '').localeCompare(a.date || '') || (b.numero || '').localeCompare(a.numero || ''),
    card: o => {
      const c = db.get('clients', o.clientId), v = db.get('vehicules', o.vehiculeId);
      const reste = (Number(o.prix) || 0) - (Number(o.acompte) || 0);
      return `<div class="top"><span class="title">${esc(o.numero)} · ${esc(clientNom(c))}</span>
        <span class="badge ${STATUT_COMMANDE[o.statut] || 'b-grey'}">${esc(o.statut)}</span></div>
        <div class="sub">${esc(vehiculeNom(v))}${v?.immatriculation ? ' · ' + esc(v.immatriculation) : ''}</div>
        <div class="top"><span class="sub">${dateFr(o.date)}${o.prix && o.statut !== 'Livrée' && o.statut !== 'Annulée' && reste > 0 ? ' · reste ' + euros(reste) : ''}</span>
        <span class="price">${euros(o.prix)}</span></div>`;
    },
    canDelete: () => true,
    // Le statut du véhicule suit la commande.
    afterSave: o => {
      const v = db.get('vehicules', o.vehiculeId);
      if (!v) return;
      const statut = o.statut === 'Livrée' ? 'Vendu' : o.statut === 'Annulée' ? 'En stock' : 'Réservé';
      if (v.statut !== statut) db.upsert('vehicules', { id: v.id, statut });
    },
    afterDelete: o => {
      const v = db.get('vehicules', o.vehiculeId);
      if (v && v.statut === 'Réservé') db.upsert('vehicules', { id: v.id, statut: 'En stock' });
    },
  },

  planning: {
    titre: 'rendez-vous', titreNouveau: 'Nouveau rendez-vous',
    fields: [
      { k: 'type', l: 'Type', type: 'select', options: Object.keys(TYPES_RDV), def: 'Essai' },
      { k: 'date', l: 'Date', type: 'date', def: today, required: true },
      { k: 'heure', l: 'Heure', type: 'time' },
      { k: 'duree', l: 'Durée', type: 'select', options: ['', '15 min', '30 min', '45 min', '1 h', '1 h 30', '2 h', 'Demi-journée'] },
      { k: 'clientId', l: 'Client', type: 'ref', table: 'clients', full: true },
      { k: 'vehiculeId', l: 'Véhicule (stock ou reprise)', type: 'ref', table: 'vehicules', tous: true, full: true },
      { k: 'lieu', l: 'Lieu', full: true },
      { k: 'notes', l: 'Notes', type: 'textarea', full: true },
      { k: 'fait', l: 'Fait', type: 'check' },
    ],
    search: r => [r.type, r.lieu, r.notes, clientNom(db.get('clients', r.clientId)), vehiculeNom(db.get('vehicules', r.vehiculeId))],
    filter: r => FILTRES_RDV[filtreRdv](r),
    sort: (a, b) => {
      const k = r => (r.date || '') + (r.heure || '99');
      return filtreRdv === 'Faits' || filtreRdv === 'Tous' ? k(b).localeCompare(k(a)) : k(a).localeCompare(k(b));
    },
    card: r => {
      const c = db.get('clients', r.clientId), v = db.get('vehicules', r.vehiculeId);
      const retard = !r.fait && r.date < today();
      const d = r.date ? new Date(r.date + 'T12:00') : null;
      return `<div class="rdv${r.fait ? ' fait' : ''}">
        <div class="rdv-date${r.date === today() ? ' today' : ''}${retard ? ' late' : ''}">
          <span>${d ? d.toLocaleDateString('fr-FR', { weekday: 'short' }) : ''}</span>
          <strong>${d ? d.getDate() : '?'}</strong>
          <span>${d ? d.toLocaleDateString('fr-FR', { month: 'short' }) : ''}</span></div>
        <div class="rdv-body"><div class="top"><span class="title">${esc(r.type)}${r.heure ? ' · ' + esc(r.heure) : ''}</span>
          <span class="badge ${r.fait ? 'b-grey' : retard ? 'b-red' : TYPES_RDV[r.type] || 'b-blue'}">${r.fait ? 'Fait' : retard ? 'En retard' : esc(r.duree || 'À venir')}</span></div>
          ${c ? `<div class="sub">${icon('clients', 14)} ${esc(clientNom(c))}${c.telephone ? ' · ' + esc(c.telephone) : ''}</div>` : ''}
          ${v ? `<div class="sub">${icon('vehicules', 14)} ${esc(vehiculeNom(v))}${v.immatriculation ? ' · ' + esc(v.immatriculation) : ''}</div>` : ''}
          ${r.lieu ? `<div class="sub">${esc(r.lieu)}</div>` : ''}</div></div>`;
    },
    canDelete: () => true,
  },
};

// Onglets affichés : Stock et Reprise sont deux vues de la même liste de véhicules.
const ONGLETS = {
  clients: { table: 'clients', icon: 'clients', label: 'Clients', placeholder: 'Nom, téléphone, ville…' },
  commandes: { table: 'commandes', icon: 'commandes', label: 'Commandes', placeholder: 'N°, client, véhicule…' },
  stock: { table: 'vehicules', icon: 'stock', label: 'Stock', placeholder: 'Rechercher un modèle, une marque, une plaque…' },
  reprises: { table: 'vehicules', icon: 'reprise', label: 'Reprise', placeholder: 'Modèle, plaque, vendeur…' },
  planning: { table: 'planning', icon: 'planning', label: 'Planning', placeholder: 'Client, véhicule, type…' },
};
let onglet = 'clients';

// ---------- Liste ----------
let current = 'clients';
let editing = null;

function render() {
  const tab = TABS[current];
  const q = norm($('#search').value.trim());
  renderFiltres();
  const rows = db.all(current)
    .filter(r => !tab.filter || tab.filter(r))
    .filter(r => !q || norm(tab.search(r).join(' ')).includes(q))
    .sort(tab.sort);
  if (onglet === 'planning' && filtreRdv === 'Semaine') { renderSemaine(rows); return; }
  const total = db.all(current).length;
  const n = rows.length;
  const titre = { stock: 'véhicule', reprises: 'reprise', planning: 'rendez-vous' }[onglet] || tab.titre;
  $('#count').textContent = (tab.filter || n !== total) ? `${n} ${titre}${n > 1 && titre !== 'rendez-vous' ? 's' : ''}` : `${total} ${titre}${total > 1 ? 's' : ''}`;
  const q2 = $('#search').value.trim();
  const vide = {
    clients: ["Aucun client pour l'instant", 'Ajoute ton premier client avec « + Ajouter ».'],
    commandes: ['Aucune commande', 'Une commande relie un client à un véhicule du stock.'],
    stock: ['Aucun véhicule ici', 'Les véhicules entrent en stock quand tu valides une reprise.'],
    reprises: ['Aucune reprise ici', 'Tape la plaque dans « + Nouvelle reprise » : la fiche se remplit toute seule.'],
    planning: ['Rien de prévu', 'Ajoute un essai, une expertise, une livraison ou une relance.'],
  }[onglet];
  const [t1, t2] = total && (q2 || tab.filter) ? ['Aucun résultat', 'Essaie une autre recherche ou d\'autres filtres.'] : vide;
  $('#list').innerHTML = n
    ? rows.map(r => `<div class="card" data-id="${r.id}">${tab.card(r)}</div>`).join('')
    : `<div class="empty">${ILLUS[ONGLETS[onglet].icon]}<strong>${t1}</strong><span>${t2}</span></div>`;
}

const sigFiltres = () => onglet + JSON.stringify(filtresStock) + filtreReprise + filtreRdv
  + db.all('vehicules').map(v => v.statut + v.couleur).join() + db.all('planning').map(r => r.date + r.fait).join();

// Calendrier de la semaine : un clic sur un jour ajoute un évènement à cette date.
function renderSemaine(rows) {
  const jours = [...Array(7)].map((_, i) => ajouterJours(semaine, i));
  const fin = jours[6];
  const fmt = (d, o) => d.toLocaleDateString('fr-FR', o);
  const titre = semaine.getMonth() === fin.getMonth()
    ? `${semaine.getDate()} – ${fmt(fin, { day: 'numeric', month: 'long', year: 'numeric' })}`
    : `${fmt(semaine, { day: 'numeric', month: 'short' })} – ${fmt(fin, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const auj = today();
  const nb = rows.filter(r => r.date >= isoLocal(semaine) && r.date <= isoLocal(fin)).length;
  $('#count').textContent = `${nb} évènement${nb > 1 ? 's' : ''} cette semaine`;
  $('#list').innerHTML = `<div class="semaine">
    <div class="semaine-nav">
      <button type="button" class="chip" data-sem="-1" aria-label="Semaine précédente">‹</button>
      <strong>${titre}</strong>
      <button type="button" class="chip" data-sem="1" aria-label="Semaine suivante">›</button>
      <button type="button" class="chip" data-sem="0">Aujourd'hui</button>
    </div>
    <div class="jours">${jours.map(d => {
      const iso = isoLocal(d);
      const evts = rows.filter(r => r.date === iso).sort((a, b) => (a.heure || '99').localeCompare(b.heure || '99'));
      return `<div class="jour${iso === auj ? ' today' : ''}${iso < auj ? ' passe' : ''}" data-jour="${iso}">
        <div class="jour-tete"><span>${fmt(d, { weekday: 'short' })}</span><strong>${d.getDate()}</strong></div>
        <div class="jour-evts">${evts.map(r => {
          const c = db.get('clients', r.clientId), v = db.get('vehicules', r.vehiculeId);
          return `<div class="evt ${TYPES_RDV[r.type] || 'b-grey'}${r.fait ? ' fait' : ''}" data-id="${r.id}">
            <span class="evt-h">${esc(r.heure || '')}</span> <span class="evt-t">${esc(r.type)}</span>
            <span class="evt-s">${esc([c && clientNom(c), v && vehiculeNom(v)].filter(Boolean).join(' · '))}</span></div>`;
        }).join('')}<span class="jour-add">+ Ajouter</span></div></div>`;
    }).join('')}</div></div>`;
}

// Sous-onglets et filtres de l'onglet Véhicules (reconstruits seulement quand nécessaire, pour garder le focus).
function renderFiltres() {
  const box = $('#filters');
  const add = $('#btn-add');
  add.style.display = onglet === 'stock' ? 'none' : '';
  add.innerHTML = icon('plus', 18) + '<span>' + (onglet === 'reprises' ? 'Nouvelle reprise' : onglet === 'planning' ? 'Nouveau RDV' : 'Ajouter') + '</span>';
  if (!['stock', 'reprises', 'planning'].includes(onglet)) { box.innerHTML = ''; box.dataset.vue = ''; return; }
  const all = db.all('vehicules');
  const opt = (list, val) => list.map(o => `<option value="${esc(o)}"${o === val ? ' selected' : ''}>${esc(o || 'Tous')}</option>`).join('');
  const sig = sigFiltres();
  if (box.dataset.vue === sig) return;
  box.dataset.vue = sig;
  let html = '';
  if (onglet === 'planning') {
    html = `<div class="chips">${Object.keys(FILTRES_RDV).map(f =>
      `<button type="button" data-rdv="${f}" class="chip${f === filtreRdv ? ' active' : ''}">${f}${f === 'Semaine' ? '' : ` (${db.all('planning').filter(FILTRES_RDV[f]).length})`}</button>`).join('')}</div>`;
  } else if (vueVehicule === 'reprises') {
    html += `<div class="chips">${Object.keys(STATUTS_REPRISE).map(f =>
      `<button type="button" data-reprise="${f}" class="chip${f === filtreReprise ? ' active' : ''}">${f} (${all.filter(STATUTS_REPRISE[f]).length})</button>`).join('')}</div>`;
  } else {
    const f = filtresStock;
    const couleurs = [''].concat([...new Set(all.filter(v => !REPRISE.includes(v.statut) && v.couleur).map(v => v.couleur.trim()))].sort());
    html += `<div class="filtres">
      <label>Statut<select data-f="statut">${opt(Object.keys(STATUTS_STOCK), f.statut)}</select></label>
      <label>Type<select data-f="type">${opt(TYPES, f.type)}</select></label>
      <label>Couleur<select data-f="couleur">${opt(couleurs, f.couleur)}</select></label>
      <label>Année min<input data-f="anneeMin" type="number" inputmode="numeric" value="${esc(f.anneeMin)}" placeholder="ex. 2015"></label>
      <label>Année max<input data-f="anneeMax" type="number" inputmode="numeric" value="${esc(f.anneeMax)}" placeholder="ex. 2022"></label>
      <label>Km max<input data-f="kmMax" type="number" inputmode="numeric" step="10000" value="${esc(f.kmMax)}" placeholder="ex. 100000"></label>
      <button type="button" id="btn-reset-filtres" class="chip">Effacer</button></div>`;
  }
  box.innerHTML = html;
}

function switchTab(name) {
  onglet = name;
  current = ONGLETS[name].table;
  if (current === 'vehicules') vueVehicule = name;
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $('#search').value = '';
  $('#search').placeholder = ONGLETS[name].placeholder;
  render();
}

// ---------- Formulaire ----------
function fieldHtml(f, row) {
  let val = row[f.k] ?? (row.id ? '' : (typeof f.def === 'function' ? f.def() : f.def ?? ''));
  const id = 'f-' + f.k;
  const req = f.required ? ' required' : '';
  const label = `<label for="${id}">${esc(f.l)}${f.required ? ' *' : ''}</label>`;
  const cls = 'field' + (f.full ? ' full' : '');
  switch (f.type) {
    case 'lookup': return lookupHtml(row);
    case 'section': return `<h3 class="section">${esc(f.l)}</h3>`;
    case 'interets': {
      const sel = row.interets || [];
      const opts = db.all('vehicules').filter(v => DISPONIBLE.includes(v.statut) || v.statut === 'Réservé' || sel.includes(v.id))
        .sort((a, b) => norm(vehiculeNom(a)).localeCompare(norm(vehiculeNom(b))));
      return `<div class="${cls}"><label>${esc(f.l)}</label>${opts.length
        ? `<input type="search" class="mini-search" placeholder="Filtrer les véhicules…" data-filtre-liste="interets">
           <div class="checklist" id="liste-interets">${opts.map(v => `<label class="check"><input type="checkbox" name="interets" value="${v.id}"${sel.includes(v.id) ? ' checked' : ''}>
           <span>${esc(vehiculeNom(v))}<span class="sub"> ${esc([v.annee, km(v.kilometrage), v.couleur, euros(v.prixVente)].filter(Boolean).join(' · '))}${v.statut !== 'En stock' ? ' · ' + esc(v.statut) : ''}</span></span></label>`).join('')}</div>`
        : '<span class="hint">Aucun véhicule en stock pour le moment.</span>'}</div>`;
    }
    case 'reprise': {
      const cur = row.id ? db.all('vehicules').find(v => v.vendeurId === row.id && REPRISE.includes(v.statut)) : null;
      const opts = db.all('vehicules').filter(v => REPRISE.includes(v.statut) && (!v.vendeurId || v.vendeurId === row.id || !db.get('clients', v.vendeurId)));
      return `<div class="${cls}"><label for="${id}">${esc(f.l)}</label>
        <div class="inline"><select id="${id}" name="repriseId"><option value="">Aucune</option>${opts.map(v =>
          `<option value="${v.id}"${cur && cur.id === v.id ? ' selected' : ''}>${esc(vehiculeNom(v) + (v.immatriculation ? ' — ' + v.immatriculation : '') + (v.statut === 'Reprise refusée' ? ' (refusée)' : ''))}</option>`).join('')}</select>
        <button type="button" id="btn-nouvelle-reprise">+ Nouvelle</button></div>
        <span class="hint">« + Nouvelle » enregistre le client puis ouvre une fiche de reprise à son nom.</span></div>`;
    }
    case 'fiche': {
      const fiche = row.ficheTechnique || {};
      const n = Object.keys(fiche).length;
      return `<details class="fiche full" id="fiche"${n ? '' : ' hidden'}><summary>Fiche technique complète (<span id="fiche-n">${n}</span> infos)</summary>
        <dl id="fiche-dl">${ficheHtml(fiche)}</dl></details>`;
    }
    case 'interesses': {
      const cs = row.id ? interessesPar(row) : [];
      return cs.length ? `<div class="field full"><label>Clients intéressés</label><span>${esc(cs.map(clientNom).join(', '))}</span></div>` : '';
    }
    case 'cote': return `<div class="field full cote"><span class="hint">Trouver une cote (gratuit, ouvre un nouvel onglet) :</span>
      <div class="chips"><button type="button" class="chip" data-cote="lacentrale">La Centrale</button>
      <button type="button" class="chip" data-cote="argus">L'argus</button>
      <button type="button" class="chip" data-cote="leboncoin">Annonces Leboncoin</button></div></div>`;
    case 'check': return `<label class="field check-field"><input type="checkbox" id="${id}" name="${f.k}"${val === true ? ' checked' : ''}> ${esc(f.l)}</label>`;
    case 'textarea': return `<div class="${cls}">${label}<textarea id="${id}" name="${f.k}">${esc(val)}</textarea></div>`;
    case 'select': return `<div class="${cls}">${label}<select id="${id}" name="${f.k}">${f.options.map(o => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
    case 'ref': {
      let opts = db.all(f.table).slice();
      if (f.table === 'vehicules') {
        // Proposer les véhicules disponibles, plus celui déjà lié à la commande.
        if (!f.tous) opts = opts.filter(v => (v.statut !== 'Vendu' && !REPRISE.includes(v.statut)) || v.id === val);
        opts.sort((a, b) => norm(vehiculeNom(a)).localeCompare(norm(vehiculeNom(b))));
      } else {
        opts.sort((a, b) => norm(clientNom(a)).localeCompare(norm(clientNom(b))));
      }
      const name = f.table === 'clients' ? clientNom : v => vehiculeNom(v) + (v.immatriculation ? ' — ' + v.immatriculation : '')
        + (f.tous && REPRISE.includes(v.statut) ? ' (reprise)' : v.statut === 'Réservé' && v.id !== val ? ' (réservé)' : '');
      const empty = opts.length ? 'Choisir…' : (f.table === 'clients' ? "Aucun client : ajoute-le d'abord" : 'Aucun véhicule disponible');
      return `<div class="${cls}">${label}<select id="${id}" name="${f.k}"${req}><option value="">${empty}</option>${opts.map(o => `<option value="${o.id}"${o.id === val ? ' selected' : ''}>${esc(name(o))}</option>`).join('')}</select></div>`;
    }
    default: return `<div class="${cls}">${label}<input id="${id}" name="${f.k}" type="${f.type || 'text'}" value="${esc(val)}"${req}${f.type === 'number' ? ' inputmode="decimal" step="any"' : ''}></div>`;
  }
}

const ficheHtml = fiche => Object.entries(fiche).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
let ficheEnCours = null;

function lookupHtml(row) {
  return `<div class="lookup">
    <div class="field"><label for="f-immatriculation">Plaque d'immatriculation</label>
      <div class="inline"><input id="f-immatriculation" name="immatriculation" value="${esc(row.immatriculation || '')}" placeholder="AB-123-CD" autocapitalize="characters">
      <button type="button" id="btn-plaque">Rechercher</button></div></div>
    <div class="field"><label for="f-vin">N° de série (VIN)</label>
      <div class="inline"><input id="f-vin" name="vin" value="${esc(row.vin || '')}" placeholder="17 caractères, case E de la carte grise" autocapitalize="characters" maxlength="20">
      <button type="button" id="btn-vin">Décoder</button></div>
      <span class="hint" id="vin-hint">La plaque remplit marque, modèle et finition. Le VIN remplit seulement la marque et l'année, gratuitement.</span></div>
  </div>`;
}

function openForm(id, preset = {}) {
  const tab = TABS[current];
  const row = id ? db.get(current, id) : { ...preset };
  editing = { table: current, id };
  $('#form-title').textContent = id
    ? (current === 'commandes' ? 'Commande ' + row.numero : current === 'vehicules' ? vehiculeNom(row) : current === 'planning' ? 'Rendez-vous' : clientNom(row))
    : (onglet === 'reprises' ? 'Nouvelle reprise' : tab.titreNouveau);
  $('#form-body').innerHTML = `<div class="grid">${tab.fields.map(f => fieldHtml(f, row)).join('')}</div>`;
  $('#btn-delete').style.display = id ? '' : 'none';
  $('#form-extra').innerHTML = current === 'vehicules' && (!id || row.statut === 'Reprise à étudier')
    ? `<button type="button" id="btn-refuser" class="danger">Refuser la reprise</button>
       <button type="button" id="btn-valider" class="success">Valider → entrer en stock</button>`
    : '';
  if (current === 'vehicules') wireVehicule();
  if (current === 'commandes') wireCommande();
  if (current === 'clients') wireClient();
  $('#dlg').showModal();
}

function wireVehicule() {
  $('#btn-valider')?.addEventListener('click', () => {
    // Reprise validée : le prix proposé devient le prix d'achat, le véhicule entre en stock.
    if (!$('#f-prixAchat').value) $('#f-prixAchat').value = $('#f-prixPropose').value;
    if (!$('#f-dateEntree').value) $('#f-dateEntree').value = today();
    $('#f-statut').value = num($('#f-fraisEstimes').value) > 0 ? 'En préparation' : 'En stock';
    $('#form').requestSubmit();
  });
  $('#btn-refuser')?.addEventListener('click', () => {
    $('#f-statut').value = 'Reprise refusée';
    $('#form').requestSubmit();
  });
  document.querySelectorAll('[data-cote]').forEach(b => b.addEventListener('click', () => {
    const modele = ['marque', 'modele', 'finition', 'annee'].map(k => $('#f-' + k).value.trim()).filter(Boolean).join(' ');
    if (!modele) { toast("Remplis d'abord la marque et le modèle (ou cherche la plaque)."); return; }
    const plaque = $('#f-immatriculation').value.trim();
    if (plaque) navigator.clipboard?.writeText(plaque).catch(() => {});
    const url = {
      lacentrale: 'https://www.google.com/search?q=' + encodeURIComponent('cote La Centrale ' + modele),
      argus: 'https://www.google.com/search?q=' + encodeURIComponent("cote L'argus " + modele),
      leboncoin: 'https://www.leboncoin.fr/recherche?category=2&text=' + encodeURIComponent(modele),
    }[b.dataset.cote];
    window.open(url, '_blank', 'noopener');
    if (plaque) toast('Plaque copiée : colle-la sur le site si elle est demandée.');
  }));
  const plate = $('#f-immatriculation');
  plate.addEventListener('blur', () => { plate.value = formatPlaque(plate.value); });
  $('#btn-plaque').addEventListener('click', async () => {
    plate.value = formatPlaque(plate.value);
    const btn = $('#btn-plaque');
    btn.disabled = true;
    btn.textContent = 'Recherche…';
    try {
      const r = await Plaque.rechercher(plate.value);
      // Le résultat de la plaque remplace l'identité du véhicule, et complète tous les champs vides.
      let n = 0;
      ['marque', 'modele', 'finition'].forEach(k => { if (r[k]) { $('#f-' + k).value = r[k]; n++; } });
      ['annee', 'miseEnCirculation', 'carburant', 'boite', 'couleur', 'type', 'puissanceCh', 'puissanceFiscale',
        'cylindree', 'co2', 'portes', 'places', 'vin'].forEach(k => {
        const el = $('#f-' + k);
        if (!r[k] || !el || el.value) return;
        if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === r[k])) return;
        el.value = r[k];
        el.classList.add('auto');
        n++;
      });
      ficheEnCours = r.ficheTechnique;
      $('#fiche-dl').innerHTML = ficheHtml(r.ficheTechnique);
      $('#fiche-n').textContent = Object.keys(r.ficheTechnique).length;
      $('#fiche').hidden = false;
      $('#vin-hint').textContent = r.description ? 'Trouvé : ' + r.description : 'Véhicule trouvé.';
      toast(`${n} champs remplis automatiquement (${Plaque.usageCeMois()} recherche(s) ce mois-ci)`);
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Rechercher';
    }
  });
  const decode = () => {
    const r = VIN.decode($('#f-vin').value);
    const hint = $('#vin-hint');
    if (!r.ok) { hint.textContent = r.error; return; }
    $('#f-vin').value = r.vin;
    const m = $('#f-marque'), a = $('#f-annee');
    if (r.marque && !m.value) m.value = r.marque;
    if (r.annee && !a.value) a.value = r.annee;
    hint.textContent = r.marque
      ? `Trouvé : ${r.marque}${r.annee ? ', année ' + r.annee + ' (indicative)' : ''}. Complète le modèle et la finition.`
      : 'Constructeur non reconnu. Saisis la marque à la main.';
  };
  $('#btn-vin').addEventListener('click', decode);
}

function wireClient() {
  $('[data-filtre-liste]')?.addEventListener('input', e => {
    const q = norm(e.target.value);
    document.querySelectorAll('#liste-interets .check').forEach(l => { l.style.display = norm(l.textContent).includes(q) ? '' : 'none'; });
  });
  $('#btn-nouvelle-reprise').addEventListener('click', () => {
    if (!$('#form').reportValidity()) return;
    apresEnregistrement = saved => {
      filtreReprise = 'À étudier';
      switchTab('reprises');
      openForm(null, { vendeurId: saved.id });
    };
    $('#form').requestSubmit();
  });
}

let apresEnregistrement = null;

function wireCommande() {
  // Pré-remplir le prix avec le prix de vente du véhicule choisi.
  $('#f-vehiculeId').addEventListener('change', e => {
    const v = db.get('vehicules', e.target.value);
    if (v && v.prixVente && !$('#f-prix').value) $('#f-prix').value = v.prixVente;
  });
}

$('#form').addEventListener('submit', e => {
  e.preventDefault();
  const tab = TABS[editing.table];
  const row = { id: editing.id };
  const fd = new FormData(e.target);
  fd.forEach((v, k) => { row[k] = typeof v === 'string' ? v.trim() : v; });
  if (editing.table === 'clients') row.interets = fd.getAll('interets');
  TABS[editing.table].fields.filter(f => f.type === 'check').forEach(f => { row[f.k] = fd.has(f.k); });
  if (editing.table === 'vehicules' && ficheEnCours) row.ficheTechnique = ficheEnCours;
  if (row.immatriculation) row.immatriculation = formatPlaque(row.immatriculation);
  if (row.vin) row.vin = VIN.clean(row.vin);
  if (editing.table === 'vehicules' && row.immatriculation) {
    const dup = db.all('vehicules').find(v => v.immatriculation === row.immatriculation && v.id !== editing.id);
    if (dup && !confirm(`La plaque ${row.immatriculation} existe déjà (${vehiculeNom(dup)}). Enregistrer quand même ?`)) return;
  }
  const after = tab.beforeSave?.(row);
  const saved = db.upsert(editing.table, row);
  after?.(saved);
  tab.afterSave?.(saved);
  $('#dlg').close();
  toast(editing.id ? 'Modifications enregistrées' : (editing.table === 'commandes' ? 'Commande ' + saved.numero + ' créée' : 'Ajouté'));
  render();
  const next = apresEnregistrement;
  apresEnregistrement = null;
  next?.(saved);
});

$('#btn-delete').addEventListener('click', () => {
  const tab = TABS[editing.table];
  const row = db.get(editing.table, editing.id);
  const ok = tab.canDelete(row);
  if (ok !== true) { toast(ok); return; }
  if (!confirm('Supprimer définitivement ce ' + tab.titre + ' ?')) return;
  db.remove(editing.table, editing.id);
  tab.afterDelete?.(row);
  $('#dlg').close();
  toast('Supprimé');
  render();
});

$('#btn-cancel').addEventListener('click', () => $('#dlg').close());
$('#dlg').addEventListener('close', () => { apresEnregistrement = null; ficheEnCours = null; });

// ---------- Sauvegarde ----------
$('#btn-menu').addEventListener('click', () => {
  const s = Plaque.settings();
  $('#set-cle').value = s.cle;
  $('#set-host').value = s.host;
  $('#set-token').value = s.token;
  const sb = Sync.settings();
  $('#set-sb-url').value = sb.url || '';
  $('#set-sb-cle').value = sb.cle || '';
  afficherSync(Sync.status, Sync.user);
  $('#set-usage').textContent = `${Plaque.usageCeMois()} recherche(s) par plaque ce mois-ci sur cet appareil (10 gratuites par mois avec l'offre Basic).`;
  $('#dlg-menu').showModal();
});

// ---------- Synchronisation ----------
const SYNC_TEXTE = { off: 'Non connecté', connexion: 'Connexion…', ok: 'Synchronisé', envoi: 'Envoi…', erreur: 'Erreur de synchro' };
function afficherSync(status, user) {
  const pill = $('#sync-pill');
  pill.hidden = !Sync.settings().url;
  pill.className = 'sync-pill s-' + status;
  pill.innerHTML = icon('nuage', 16) + '<span>' + SYNC_TEXTE[status] + '</span>';
  $('#sync-etat').textContent = user ? `Connecté : ${user.email} · ${SYNC_TEXTE[status]}` : 'Non connecté.';
  $('#sync-connexion').hidden = !!user;
  $('#btn-deconnexion').hidden = !user;
}

$('#btn-save-sync').addEventListener('click', () => {
  const url = $('#set-sb-url').value.trim(), cle = $('#set-sb-cle').value.trim();
  if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) { toast("L'adresse doit ressembler à https://xxxx.supabase.co"); return; }
  Sync.saveSettings({ url: url.replace(/\/$/, ''), cle });
  toast('Réglages enregistrés, rechargement…');
  setTimeout(() => location.reload(), 800);
});
$('#btn-connexion').addEventListener('click', async () => {
  const email = $('#set-email').value.trim();
  if (!email) { toast('Saisis ton email.'); return; }
  try {
    await Sync.connecter(email);
    $('#sync-etat').textContent = `Lien envoyé à ${email}. Ouvre-le sur cet appareil pour te connecter.`;
  } catch (err) { toast(err.message); }
});
$('#btn-deconnexion').addEventListener('click', () => Sync.deconnecter());
$('#sync-pill').addEventListener('click', () => $('#btn-menu').click());

$('#btn-save-plaque').addEventListener('click', () => {
  Plaque.saveSettings({ cle: $('#set-cle').value.trim(), host: $('#set-host').value.trim() || Plaque.DEFAULT_HOST, token: $('#set-token').value.trim() });
  $('#set-usage').textContent = 'Clé enregistrée sur cet appareil.';
  toast('Clé enregistrée sur cet appareil');
});

$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(db.data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'crm-zx-sauvegarde-' + today() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#file-import').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.clients) || !Array.isArray(data.vehicules) || !Array.isArray(data.commandes)) throw new Error();
    if (!confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return;
    db.data = Object.assign({ seq: 0 }, data);
    db.save();
    $('#dlg-menu').close();
    render();
    toast('Sauvegarde importée');
  } catch (err) {
    toast("Ce fichier n'est pas une sauvegarde CRM ZX valide.");
  } finally {
    e.target.value = '';
  }
});

// ---------- Démarrage ----------
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$('#search').addEventListener('input', render);
$('#filters').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.rdv) filtreRdv = b.dataset.rdv;
  else if (b.dataset.reprise) filtreReprise = b.dataset.reprise;
  else if (b.id === 'btn-reset-filtres') Object.assign(filtresStock, { statut: 'Disponibles', couleur: '', type: '', anneeMin: '', anneeMax: '', kmMax: '' });
  else return;
  render();
});
$('#filters').addEventListener('input', e => {
  const k = e.target.dataset.f;
  if (!k) return;
  filtresStock[k] = e.target.value;
  // Les champs texte gardent le focus : on ne reconstruit pas la barre de filtres.
  $('#filters').dataset.vue = sigFiltres();
  render();
});
$('#btn-add').addEventListener('click', () => openForm(null));
$('#list').addEventListener('click', e => {
  const sem = e.target.closest('[data-sem]');
  if (sem) {
    const n = Number(sem.dataset.sem);
    if (n) semaine = ajouterJours(semaine, 7 * n);
    else { const d = new Date(); d.setHours(12, 0, 0, 0); semaine = ajouterJours(d, -((d.getDay() + 6) % 7)); }
    render();
    return;
  }
  const evt = e.target.closest('.evt');
  if (evt) { openForm(evt.dataset.id); return; }
  const jour = e.target.closest('[data-jour]');
  if (jour) { openForm(null, { date: jour.dataset.jour }); return; }
  const card = e.target.closest('.card');
  if (card) openForm(card.dataset.id);
});

db.load();
// Icônes des onglets et des boutons.
document.querySelectorAll('[data-tab]').forEach(b => {
  const o = ONGLETS[b.dataset.tab];
  b.innerHTML = icon(o.icon, b.closest('#bottom-tabs') ? 22 : 18) + '<span>' + o.label + '</span>';
});
$('#btn-menu').innerHTML = icon('reglages', 20);
$('#search-ico').innerHTML = icon('recherche', 18);
switchTab('clients');
// iOS ignore parfois user-scalable=no : on bloque aussi le geste de pincement.
document.addEventListener('gesturestart', e => e.preventDefault());
Sync.init(afficherSync);
afficherSync(Sync.status, Sync.user);
