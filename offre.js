// Page « Offre » : choix du véhicule, de la reprise et du client, puis calcul du prix.
// Prix = prix de vente − reprise + pack livraison − remise + carte grise.
const Offre = (() => {
  const KEY = 'crmzx-offre';
  // Barème carte grise de La Réunion (véhicule d'occasion déjà immatriculé en France).
  // Sources : service-public.gouv.fr (taxe fixe 11 €, acheminement 2,76 €) ; tarif régional 2026 de 60 €/CV,
  // abattement de 50 % au-delà de 10 ans (calcul-carte-grise.fr). Seul le montant ANTS fait foi : modifiable dans les réglages.
  const DEFAUTS = { prixCV: 60, taxeFixe: 11, acheminement: 2.76, demarches: 150, protection: 250 };

  function reglages() {
    try { return { ...DEFAUTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (e) { return { ...DEFAUTS }; }
  }
  function saveReglages(r) {
    try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) { /* stockage indisponible */ }
  }

  // Âge en années à partir de la 1re mise en circulation (ou de l'année).
  function age(v) {
    const d = v.miseEnCirculation ? new Date(v.miseEnCirculation) : v.annee ? new Date(Number(v.annee), 6, 1) : null;
    return d ? (Date.now() - d) / (365.25 * 864e5) : null;
  }

  function carteGrise(v, cv) {
    const r = reglages();
    if (!v || !num(cv)) return { total: 0, detail: 'Puissance fiscale inconnue' };
    const plusDe10 = (age(v) ?? 0) > 10;
    const regionale = num(cv) * r.prixCV * (plusDe10 ? 0.5 : 1);
    const total = Math.round((regionale + r.taxeFixe + r.acheminement) * 100) / 100;
    return {
      total,
      detail: `${cv} CV × ${r.prixCV} €${plusDe10 ? ' × 50 % (plus de 10 ans)' : ''} + taxe fixe ${r.taxeFixe} € + acheminement ${String(r.acheminement).replace('.', ',')} €`,
    };
  }

  let etat = null; // offre en cours d'édition

  const stock = () => db.all('vehicules').filter(v => DISPONIBLE.includes(v.statut) || v.id === etat?.vehiculeId);
  const reprisesDispo = () => db.all('vehicules').filter(v => REPRISE.includes(v.statut) || v.id === etat?.repriseId);
  const libelleV = v => vehiculeNom(v) + (v.immatriculation ? ' — ' + v.immatriculation : '');

  function calcul() {
    const v = db.get('vehicules', etat.vehiculeId);
    const rep = db.get('vehicules', etat.repriseId);
    const prixVente = num(v?.prixVente);
    const reprise = num(rep?.prixAchat || rep?.prixPropose);
    const pack = (etat.pack.demarches ? num(etat.pack.montantDemarches) : 0)
      + (etat.pack.protection ? num(etat.pack.montantProtection) : 0)
      + (etat.pack.frais ? num(etat.pack.montantFrais) : 0);
    const cg = carteGrise(v, etat.cv || v?.puissanceFiscale);
    const total = prixVente - reprise + pack - num(etat.remise) + cg.total;
    return { v, rep, prixVente, reprise, pack, cg, total };
  }

  // Sélecteur avec recherche (plaque, modèle, nom).
  function selecteur(id, titre, liste, choisi, libelle, vide, optionnel) {
    const sel = choisi ? liste.find(x => x.id === choisi) || db.get('vehicules', choisi) || db.get('clients', choisi) : null;
    return `<section class="o-bloc">
      <h3 class="section">${titre}${optionnel ? ' <span class="hint">(facultatif)</span>' : ''}</h3>
      ${sel ? `<div class="o-choix">${sel.image ? `<img src="${esc(sel.image)}" alt="" onerror="this.remove()">` : ''}
          <div><strong>${esc(libelle(sel))}</strong>${sel.annee || sel.kilometrage ? `<span class="sub">${esc([sel.annee, km(sel.kilometrage), sel.carburant].filter(Boolean).join(' · '))}</span>` : ''}${sel.telephone ? `<span class="sub">${esc(sel.telephone)}</span>` : ''}</div>
          <button type="button" class="chip" data-vider="${id}">Changer</button></div>`
        : `<input type="search" class="o-recherche" data-recherche="${id}" placeholder="Rechercher par plaque, modèle ou nom…" autocomplete="off">
          <div class="o-liste" id="liste-${id}">${liste.length ? liste.map(x => `<button type="button" class="o-item" data-choisir="${id}" data-id="${x.id}">${esc(libelle(x))}</button>`).join('') : `<span class="hint">${vide}</span>`}</div>`}
    </section>`;
  }

  function rendre() {
    const c = calcul();
    const r = etat.pack;
    const ligne = (l, m, cls = '') => `<div class="o-ligne ${cls}"><span>${l}</span><strong>${m}</strong></div>`;
    $('#offre-body').innerHTML = `
      ${selecteur('vehiculeId', 'Véhicule souhaité', stock(), etat.vehiculeId, libelleV, 'Aucun véhicule disponible en stock.')}
      ${selecteur('repriseId', 'Véhicule repris', reprisesDispo(), etat.repriseId, libelleV, 'Aucune reprise en cours.', true)}
      ${selecteur('clientId', 'Client', db.all('clients').slice().sort((a, b) => norm(clientNom(a)).localeCompare(norm(clientNom(b)))), etat.clientId, clientNom, "Aucun client : ajoute-le d'abord dans Clients.")}
      <section class="o-bloc">
        <h3 class="section">Pack livraison</h3>
        <label class="check"><input type="checkbox" data-pack="demarches"${r.demarches ? ' checked' : ''}><span>Démarches administratives</span><span class="o-montant">${euros(r.montantDemarches)}</span></label>
        <label class="check"><input type="checkbox" data-pack="protection"${r.protection ? ' checked' : ''}><span>Protection de peinture</span><span class="o-montant">${euros(r.montantProtection)}</span></label>
        <label class="check"><input type="checkbox" data-pack="frais"${r.frais ? ' checked' : ''}><span>Frais supplémentaires</span></label>
        ${r.frais ? `<div class="inline o-frais"><input data-champ="libelleFrais" placeholder="Précisez (ex. jantes, attelage…)" value="${esc(r.libelleFrais || '')}">
          <input data-champ="montantFrais" type="number" inputmode="decimal" placeholder="Montant €" value="${esc(r.montantFrais || '')}"></div>` : ''}
      </section>
      <section class="o-bloc">
        <h3 class="section">Détail du prix</h3>
        ${ligne('Prix de vente', c.v ? euros(c.prixVente) : '—')}
        ${c.rep ? ligne('Reprise ' + esc(vehiculeNom(c.rep)), '− ' + euros(c.reprise), 'moins') : ''}
        ${c.pack ? ligne('Pack livraison', '+ ' + euros(c.pack)) : ''}
        <div class="o-ligne"><span>Remise</span><span class="inline o-remise"><span>−</span><input data-champ="remise" type="number" inputmode="decimal" value="${esc(etat.remise || '')}" placeholder="0"><span>€</span></span></div>
        <div class="o-ligne"><span>Carte grise<span class="sub">${esc(c.cg.detail)}</span></span><strong>+ ${euros(c.cg.total)}</strong></div>
        ${c.v && !c.v.puissanceFiscale ? `<div class="inline o-cv"><span class="hint">Puissance fiscale du véhicule :</span><input data-champ="cv" type="number" inputmode="numeric" value="${esc(etat.cv || '')}" placeholder="CV"></div>` : ''}
        <div class="o-total"><span>Total à payer</span><strong>${euros(c.total)}</strong></div>
      </section>`;
  }

  function ouvrir(id) {
    const o = id ? db.get('commandes', id) : null;
    const r = reglages();
    etat = o ? JSON.parse(JSON.stringify(o)) : {
      vehiculeId: '', repriseId: '', clientId: '', remise: '', cv: '',
      pack: { demarches: true, protection: false, frais: false, montantDemarches: r.demarches, montantProtection: r.protection, libelleFrais: '', montantFrais: '' },
    };
    etat.pack = etat.pack || { montantDemarches: r.demarches, montantProtection: r.protection };
    $('#offre-titre').textContent = o ? 'Offre ' + o.numero : 'Nouvelle offre';
    $('#btn-offre-imprimer').hidden = !o;
    $('#btn-offre-accepter').hidden = !o || o.statut !== 'Offre';
    $('#btn-offre-supprimer').hidden = !o;
    rendre();
    $('#dlg-offre').showModal();
  }

  function enregistrer() {
    const c = calcul();
    if (!etat.vehiculeId || !etat.clientId) { toast('Choisis au moins le véhicule et le client.'); return null; }
    const row = {
      ...etat, statut: etat.statut || 'Offre', date: etat.date || today(),
      prixVente: c.prixVente, valeurReprise: c.reprise, montantPack: c.pack, carteGrise: c.cg.total, prix: c.total,
    };
    const avant = etat.id ? { ...db.get('commandes', etat.id) } : null;
    const saved = db.upsert('commandes', row);
    etat = JSON.parse(JSON.stringify(saved));
    TABS.commandes.afterSave(saved, avant);
    return saved;
  }

  // Document imprimable (ou à enregistrer en PDF depuis le navigateur).
  function imprimer() {
    const saved = enregistrer();
    if (!saved) return;
    const c = calcul();
    const cl = db.get('clients', saved.clientId);
    const p = saved.pack;
    const lignes = [
      ['Prix de vente ' + vehiculeNom(c.v), euros(c.prixVente)],
      c.rep && ['Reprise ' + libelleV(c.rep), '− ' + euros(c.reprise)],
      p.demarches && ['Démarches administratives', euros(p.montantDemarches)],
      p.protection && ['Protection de peinture', euros(p.montantProtection)],
      p.frais && [p.libelleFrais || 'Frais supplémentaires', euros(p.montantFrais)],
      num(saved.remise) && ['Remise', '− ' + euros(saved.remise)],
      ['Carte grise (estimation)', euros(c.cg.total)],
    ].filter(Boolean);
    const w = window.open('', '_blank');
    if (!w) { toast("Autorise l'ouverture de fenêtres pour imprimer l'offre."); return; }
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Offre ${esc(saved.numero)}</title>
      <style>body{font:14px/1.5 Inter,Arial,sans-serif;color:#0f172a;max-width:720px;margin:32px auto;padding:0 20px}
      header{display:flex;align-items:center;gap:12px;border-bottom:2px solid #0f172a;padding-bottom:12px}
      header img{width:48px;height:48px;border-radius:10px}h1{margin:0;font-size:22px}.muted{color:#64748b}
      .bloc{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0}.bloc div{border:1px solid #e2e8f0;border-radius:10px;padding:12px}
      table{width:100%;border-collapse:collapse;margin-top:10px}td{padding:8px 0;border-bottom:1px solid #e2e8f0}td:last-child{text-align:right;white-space:nowrap}
      .total td{font-size:18px;font-weight:700;border-bottom:0;border-top:2px solid #0f172a}footer{margin-top:28px;font-size:12px;color:#64748b}
      @media print{button{display:none}}</style></head><body>
      <header><img src="${location.href.replace(/[^/]*$/, '')}logo.svg" alt=""><div><h1>Offre ${esc(saved.numero)}</h1><span class="muted">du ${dateFr(saved.date)} · valable 15 jours</span></div></header>
      <div class="bloc"><div><strong>Client</strong><br>${esc(clientNom(cl))}<br>${esc([cl?.telephone, cl?.email].filter(Boolean).join(' · '))}<br>${esc([cl?.adresse, cl?.codePostal, cl?.ville].filter(Boolean).join(' '))}</div>
      <div><strong>Véhicule</strong><br>${esc(libelleV(c.v))}<br>${esc([c.v.annee, km(c.v.kilometrage), c.v.carburant, c.v.boite].filter(Boolean).join(' · '))}</div></div>
      <table>${lignes.map(([l, m]) => `<tr><td>${esc(l)}</td><td>${m}</td></tr>`).join('')}
      <tr class="total"><td>Total à payer</td><td>${euros(c.total)}</td></tr></table>
      <footer>Montant de la carte grise estimé selon le barème de La Réunion ; seul le montant ANTS fait foi.</footer>
      <p><button onclick="print()">Imprimer / enregistrer en PDF</button></p></body></html>`);
    w.document.close();
  }

  function init() {
    const body = $('#offre-body');
    body.addEventListener('click', e => {
      const ch = e.target.closest('[data-choisir]');
      if (ch) {
        etat[ch.dataset.choisir] = ch.dataset.id;
        // Une reprise rattachée à un client sélectionne ce client.
        if (ch.dataset.choisir === 'repriseId' && !etat.clientId) etat.clientId = db.get('vehicules', ch.dataset.id)?.vendeurId || '';
        rendre();
        return;
      }
      const vd = e.target.closest('[data-vider]');
      if (vd) { etat[vd.dataset.vider] = ''; rendre(); }
    });
    body.addEventListener('change', e => {
      const k = e.target.dataset.pack;
      if (k) { etat.pack[k] = e.target.checked; rendre(); }
    });
    body.addEventListener('input', e => {
      const q = e.target.dataset.recherche;
      if (q) {
        const t = norm(e.target.value);
        document.querySelectorAll(`#liste-${q} .o-item`).forEach(b => { b.hidden = !norm(b.textContent).includes(t); });
        return;
      }
      const k = e.target.dataset.champ;
      if (!k) return;
      if (k === 'libelleFrais' || k === 'montantFrais') etat.pack[k] = e.target.value; else etat[k] = e.target.value;
      if (k === 'libelleFrais') return;
      // Recalcul sans reconstruire le champ en cours de saisie.
      const pos = e.target.selectionStart;
      rendre();
      const el = body.querySelector(`[data-champ="${k}"]`);
      el.focus();
      try { el.setSelectionRange(pos, pos); } catch (err) { /* champ numérique */ }
    });
    $('#btn-offre-annuler').addEventListener('click', () => $('#dlg-offre').close());
    $('#btn-offre-enregistrer').addEventListener('click', () => {
      const saved = enregistrer();
      if (!saved) return;
      $('#dlg-offre').close();
      render();
    });
    $('#btn-offre-imprimer').addEventListener('click', imprimer);
    $('#btn-offre-accepter').addEventListener('click', () => {
      etat.statut = 'Commande';
      const saved = enregistrer();
      if (!saved) return;
      $('#dlg-offre').close();
      render();
      const next = apresEnregistrement;
      apresEnregistrement = null;
      next?.(saved);
    });
    $('#btn-offre-supprimer').addEventListener('click', () => {
      if (!confirm('Supprimer définitivement cette offre ?')) return;
      const o = db.get('commandes', etat.id);
      db.remove('commandes', etat.id);
      TABS.commandes.afterDelete(o);
      relances(o).forEach(r => db.remove('planning', r.id));
      $('#dlg-offre').close();
      render();
    });
  }

  return { ouvrir, init, reglages, saveReglages, carteGrise };
})();
