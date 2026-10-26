// CRM ZX — V1. Données stockées dans le navigateur (localStorage).
// Toute la lecture/écriture passe par `db`, pour pouvoir brancher
// une vraie base (Supabase) plus tard sans toucher aux écrans.

const STORAGE_KEY = 'crmzx-v1';

const db = {
  data: { clients: [], vehicules: [], commandes: [], seq: 0 },
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) this.data = Object.assign(this.data, saved);
    } catch (e) { /* stockage indisponible : on démarre vide */ }
  },
  save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); }
    catch (e) { toast("Impossible d'enregistrer sur cet appareil."); }
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
const today = () => new Date().toISOString().slice(0, 10);
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

const STATUT_VEHICULE = { 'En stock': 'b-green', 'Réservé': 'b-orange', 'Vendu': 'b-grey', 'En préparation': 'b-blue' };
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
    ],
    search: c => [c.prenom, c.nom, c.telephone, c.email, c.ville, c.societe],
    sort: (a, b) => norm(a.nom).localeCompare(norm(b.nom)),
    card: c => {
      const nb = db.all('commandes').filter(o => o.clientId === c.id).length;
      return `<div class="top"><span class="title">${esc(clientNom(c))}</span>
        ${nb ? `<span class="badge b-blue">${nb} commande${nb > 1 ? 's' : ''}</span>` : ''}</div>
        <div class="sub">${esc([c.telephone, c.email].filter(Boolean).join(' · '))}</div>
        <div class="sub">${esc([c.ville, c.societe].filter(Boolean).join(' · '))}</div>`;
    },
    canDelete: c => {
      const nb = db.all('commandes').filter(o => o.clientId === c.id).length;
      return nb ? `Ce client a ${nb} commande(s). Supprime d'abord ses commandes.` : true;
    },
  },

  vehicules: {
    titre: 'véhicule', titreNouveau: 'Nouveau véhicule',
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
      { k: 'prixAchat', l: "Prix d'achat (€)", type: 'number' },
      { k: 'prixVente', l: 'Prix de vente (€)', type: 'number' },
      { k: 'statut', l: 'Statut', type: 'select', options: Object.keys(STATUT_VEHICULE), def: 'En stock' },
      { k: 'dateEntree', l: "Date d'entrée en stock", type: 'date', def: today },
      { k: 'notes', l: 'Notes', type: 'textarea', full: true },
    ],
    search: v => [v.immatriculation, v.vin, v.marque, v.modele, v.finition, v.couleur, v.statut, v.annee],
    sort: (a, b) => (b.creeLe || '').localeCompare(a.creeLe || ''),
    card: v => `<div class="top"><span class="title">${esc(vehiculeNom(v))}</span>
        <span class="badge ${STATUT_VEHICULE[v.statut] || 'b-grey'}">${esc(v.statut || '')}</span></div>
        <div class="sub">${esc([v.annee, km(v.kilometrage), v.carburant, v.boite].filter(Boolean).join(' · '))}</div>
        <div class="top"><span>${v.immatriculation ? `<span class="plate">${esc(v.immatriculation)}</span>` : ''}</span>
        <span class="price">${euros(v.prixVente)}</span></div>`,
    canDelete: v => {
      const nb = db.all('commandes').filter(o => o.vehiculeId === v.id).length;
      return nb ? `Ce véhicule est dans ${nb} commande(s). Supprime d'abord la commande.` : true;
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
};

// ---------- Liste ----------
let current = 'clients';
let editing = null;

function render() {
  const tab = TABS[current];
  const q = norm($('#search').value.trim());
  const rows = db.all(current)
    .filter(r => !q || norm(tab.search(r).join(' ')).includes(q))
    .sort(tab.sort);
  const total = db.all(current).length;
  $('#count').textContent = q ? `${rows.length} sur ${total}` : `${total} ${tab.titre}${total > 1 ? 's' : ''}`;
  $('#list').innerHTML = rows.length
    ? rows.map(r => `<div class="card" data-id="${r.id}">${tab.card(r)}</div>`).join('')
    : `<div class="empty">${total ? 'Aucun résultat.' : `Aucun ${tab.titre} pour l'instant.<br>Appuie sur « + Ajouter ».`}</div>`;
}

function switchTab(name) {
  current = name;
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $('#search').value = '';
  $('#search').placeholder = { clients: 'Nom, téléphone, ville…', commandes: 'N°, client, véhicule…', vehicules: 'Plaque, marque, modèle…' }[name];
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
    case 'textarea': return `<div class="${cls}">${label}<textarea id="${id}" name="${f.k}">${esc(val)}</textarea></div>`;
    case 'select': return `<div class="${cls}">${label}<select id="${id}" name="${f.k}">${f.options.map(o => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
    case 'ref': {
      let opts = db.all(f.table).slice();
      if (f.table === 'vehicules') {
        // Proposer les véhicules disponibles, plus celui déjà lié à la commande.
        opts = opts.filter(v => v.statut !== 'Vendu' || v.id === val);
        opts.sort((a, b) => norm(vehiculeNom(a)).localeCompare(norm(vehiculeNom(b))));
      } else {
        opts.sort((a, b) => norm(clientNom(a)).localeCompare(norm(clientNom(b))));
      }
      const name = f.table === 'clients' ? clientNom : v => vehiculeNom(v) + (v.immatriculation ? ' — ' + v.immatriculation : '') + (v.statut === 'Réservé' && v.id !== val ? ' (réservé)' : '');
      const empty = opts.length ? 'Choisir…' : (f.table === 'clients' ? "Aucun client : ajoute-le d'abord" : 'Aucun véhicule disponible');
      return `<div class="${cls}">${label}<select id="${id}" name="${f.k}"${req}><option value="">${empty}</option>${opts.map(o => `<option value="${o.id}"${o.id === val ? ' selected' : ''}>${esc(name(o))}</option>`).join('')}</select></div>`;
    }
    default: return `<div class="${cls}">${label}<input id="${id}" name="${f.k}" type="${f.type || 'text'}" value="${esc(val)}"${req}${f.type === 'number' ? ' inputmode="decimal" step="any"' : ''}></div>`;
  }
}

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

function openForm(id) {
  const tab = TABS[current];
  const row = id ? db.get(current, id) : {};
  editing = { table: current, id };
  $('#form-title').textContent = id ? (current === 'commandes' ? 'Commande ' + row.numero : 'Modifier le ' + tab.titre) : tab.titreNouveau;
  $('#form-body').innerHTML = `<div class="grid">${tab.fields.map(f => fieldHtml(f, row)).join('')}</div>`;
  $('#btn-delete').style.display = id ? '' : 'none';
  if (current === 'vehicules') wireVehicule();
  if (current === 'commandes') wireCommande();
  $('#dlg').showModal();
}

function wireVehicule() {
  const plate = $('#f-immatriculation');
  plate.addEventListener('blur', () => { plate.value = formatPlaque(plate.value); });
  $('#btn-plaque').addEventListener('click', async () => {
    plate.value = formatPlaque(plate.value);
    const btn = $('#btn-plaque');
    btn.disabled = true;
    btn.textContent = 'Recherche…';
    try {
      const r = await Plaque.rechercher(plate.value);
      // Le résultat de la plaque remplace l'identité du véhicule, et complète le reste.
      ['marque', 'modele', 'finition'].forEach(k => { if (r[k]) $('#f-' + k).value = r[k]; });
      ['annee', 'miseEnCirculation', 'carburant', 'vin'].forEach(k => { if (r[k] && !$('#f-' + k).value) $('#f-' + k).value = r[k]; });
      $('#vin-hint').textContent = r.description ? 'Trouvé : ' + r.description : 'Véhicule trouvé.';
      toast(`Véhicule trouvé (${Plaque.usageCeMois()} recherche(s) ce mois-ci)`);
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
  new FormData(e.target).forEach((v, k) => { row[k] = typeof v === 'string' ? v.trim() : v; });
  if (row.immatriculation) row.immatriculation = formatPlaque(row.immatriculation);
  if (row.vin) row.vin = VIN.clean(row.vin);
  if (editing.table === 'vehicules' && row.immatriculation) {
    const dup = db.all('vehicules').find(v => v.immatriculation === row.immatriculation && v.id !== editing.id);
    if (dup && !confirm(`La plaque ${row.immatriculation} existe déjà (${vehiculeNom(dup)}). Enregistrer quand même ?`)) return;
  }
  const saved = db.upsert(editing.table, row);
  tab.afterSave?.(saved);
  $('#dlg').close();
  toast(editing.id ? 'Modifications enregistrées' : (editing.table === 'commandes' ? 'Commande ' + saved.numero + ' créée' : 'Ajouté'));
  render();
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

// ---------- Sauvegarde ----------
$('#btn-menu').addEventListener('click', () => {
  const s = Plaque.settings();
  $('#set-cle').value = s.cle;
  $('#set-host').value = s.host;
  $('#set-usage').textContent = `${Plaque.usageCeMois()} recherche(s) par plaque ce mois-ci sur cet appareil (10 gratuites par mois avec l'offre Basic).`;
  $('#dlg-menu').showModal();
});

$('#btn-save-plaque').addEventListener('click', () => {
  Plaque.saveSettings({ cle: $('#set-cle').value.trim(), host: $('#set-host').value.trim() || Plaque.DEFAULT_HOST });
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
$('#btn-add').addEventListener('click', () => openForm(null));
$('#list').addEventListener('click', e => {
  const card = e.target.closest('.card');
  if (card) openForm(card.dataset.id);
});

db.load();
switchTab('clients');
