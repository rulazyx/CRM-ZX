// Bon de commande et facture VO, avec la TVA de La Réunion (8,5 %) : sur la marge (cas courant d'un véhicule
// acheté à un particulier), normale, ou non applicable (micro-entreprise). Export des factures pour le comptable.
const Facture = (() => {
  const TAUX = 8.5;
  const TAUX_TXT = '8,5 %';
  const REGIMES = {
    marge: 'TVA sur la marge (biens d\'occasion)',
    normal: 'TVA normale (8,5 %)',
    franchise: 'TVA non applicable (micro-entreprise)',
  };
  const MENTION = {
    marge: "Régime particulier – Biens d'occasion (articles 297 A et suivants du CGI) : TVA sur la marge, non récupérable par l'acheteur.",
    normal: '',
    franchise: 'TVA non applicable, article 293 B du CGI.',
  };
  const arr = x => Math.round(x * 100) / 100;
  const eur2 = n => Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const regimeDefaut = () => Param.get().facture.regime;

  // Lignes de la vente : véhicule, packs (prestations, toujours à TVA normale sauf franchise), remise, carte grise (débours, hors TVA).
  function lignes(o) {
    const v = db.get('vehicules', o.vehiculeId) || {};
    const regime = o.regimeTva || regimeDefaut();
    const prixV = num(o.prixVente || v.prixVente) - num(o.remise);
    const packs = (o.pack?.items || []).filter(k => k.coche).map(k => [k.nom, num(k.montant)]);
    if (o.pack?.frais && num(o.pack.montantFrais)) packs.push([o.pack.libelleFrais || 'Frais supplémentaires', num(o.pack.montantFrais)]);
    if (!o.pack && num(o.montantPack)) packs.push(['Pack livraison', num(o.montantPack)]);
    const tva = (ttc, soumis) => soumis ? arr(ttc - ttc / (1 + TAUX / 100)) : 0;
    const L = [];
    const proprio = v.mode === 'depot' ? db.get('clients', v.vendeurId) : null;
    L.push({ libelle: `${vehiculeNom(v)}${num(o.remise) ? ` (remise de ${euros(o.remise)} déduite)` : ''}${v.mode === 'depot' ? ` · vendu en dépôt-vente pour le compte de ${proprio ? clientNom(proprio) : 'son propriétaire'}` : ''}`, ttc: prixV,
      tva: tva(prixV, regime === 'normal'), regime: regime === 'marge' ? 'marge' : regime === 'normal' ? TAUX_TXT : '—', vehicule: true });
    packs.forEach(([l, m]) => L.push({ libelle: l, ttc: m, tva: tva(m, regime !== 'franchise'), regime: regime === 'franchise' ? '—' : TAUX_TXT }));
    if (num(o.carteGrise)) L.push({ libelle: "Certificat d'immatriculation (débours, reversé à l'ANTS)", ttc: num(o.carteGrise), tva: 0, regime: 'débours' });
    const ttc = arr(L.reduce((s, l) => s + l.ttc, 0));
    const tvaTot = arr(L.reduce((s, l) => s + l.tva, 0));
    return { v, regime, L, ttc, tva: tvaTot, ht: arr(ttc - tvaTot), reprise: num(o.valeurReprise) };
  }

  const entete = (titre, sous) => {
    const g = Param.get().garage;
    return `<header style="display:flex;gap:12px;align-items:center;border-bottom:2px solid #0f172a;padding-bottom:10px">
      ${g.logo ? `<img src="${esc(g.logo)}" alt="" style="width:52px;height:52px;object-fit:contain;border-radius:8px">` : ''}
      <div><h1>${esc(titre)}</h1><span class="muted">${sous}</span></div>
      <div style="margin-left:auto;text-align:right;font-size:12px;color:#334155"><strong>${esc(g.nom || '')}</strong><br>
        ${esc([g.adresse, [g.codePostal, g.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '))}<br>${esc([g.telephone, g.email].filter(Boolean).join(' · '))}
        ${g.siret ? '<br>SIRET ' + esc(g.siret) : ''}${g.tva ? '<br>TVA ' + esc(g.tva) : ''}</div></header>`;
  };
  const blocs = (o, v) => {
    const c = db.get('clients', o.clientId) || {};
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0">
      <div style="border:1px solid #cbd5e1;border-radius:8px;padding:10px"><b>Client</b><br>${esc(clientNom(c))}${c.societe && c.nom ? '<br>' + esc(c.societe) : ''}<br>
        ${esc([c.adresse, [c.codePostal, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '))}<br>${esc([c.telephone, c.email].filter(Boolean).join(' · '))}</div>
      <div style="border:1px solid #cbd5e1;border-radius:8px;padding:10px"><b>Véhicule</b><br>${esc(vehiculeNom(v))}<br>
        ${esc([v.immatriculation, v.vin && 'VIN ' + v.vin].filter(Boolean).join(' · '))}<br>
        ${esc([v.miseEnCirculation && '1re mise en circulation ' + dateFr(v.miseEnCirculation), v.annee && !v.miseEnCirculation && 'Année ' + v.annee, v.kilometrage && km(v.kilometrage) + ' au compteur', v.carburant].filter(Boolean).join(' · '))}</div></div>`;
  };
  const tableau = (f, avecTva) => `<table><thead><tr><th>Désignation</th>${avecTva ? '<th>TVA</th><th style="text-align:right">Dont TVA</th>' : ''}<th style="text-align:right">Montant TTC</th></tr></thead>
    <tbody>${f.L.map(l => `<tr><td>${esc(l.libelle)}</td>${avecTva ? `<td>${esc(l.regime)}</td><td style="text-align:right">${l.tva ? eur2(l.tva) : ''}</td>` : ''}<td style="text-align:right">${eur2(l.ttc)}</td></tr>`).join('')}</tbody></table>`;
  const totaux = (f, o, avecTva) => `<table style="width:auto;margin-left:auto;margin-top:10px;min-width:280px">
    ${avecTva && f.regime === 'normal' ? `<tr><td>Total HT</td><td style="text-align:right">${eur2(f.ht)}</td></tr>
    <tr><td>TVA ${TAUX_TXT}</td><td style="text-align:right">${eur2(f.tva)}</td></tr>` : ''}
    <tr><th>Total TTC</th><th style="text-align:right">${eur2(f.ttc)}</th></tr>
    ${avecTva && f.regime === 'marge' && f.tva ? `<tr><td>dont TVA ${TAUX_TXT} sur les prestations</td><td style="text-align:right">${eur2(f.tva)}</td></tr>` : ''}
    ${f.reprise ? `<tr><td>Reprise de votre véhicule</td><td style="text-align:right">− ${eur2(f.reprise)}</td></tr>` : ''}
    ${num(o.acompte) ? `<tr><td>Acompte versé</td><td style="text-align:right">− ${eur2(o.acompte)}</td></tr>` : ''}
    ${f.reprise || num(o.acompte) ? `<tr><th>Reste à payer</th><th style="text-align:right">${eur2(f.ttc - f.reprise - num(o.acompte))}</th></tr>` : ''}</table>`;

  // Bon de commande : engagement du client, à signer.
  function bonDeCommande(o) {
    const f = lignes(o);
    Papiers.fenetre(`Bon de commande ${o.numero}`, `${entete('Bon de commande', `n° ${esc(o.numero)} du ${dateFr(o.date)}`)}
      ${blocs(o, f.v)}${tableau(f, false)}${totaux(f, o, false)}
      <div class="cases" style="margin-top:14px">${'<div class="case"><b>Mode de paiement</b>' + (esc(o.paiement) || '&nbsp;') + '</div>'}
        <div class="case"><b>Livraison prévue</b>${o.dateLivraison ? dateFr(o.dateLivraison) : '&nbsp;'}</div></div>
      <p class="muted" style="margin-top:12px">Véhicule d'occasion vendu en l'état, tel que vu et essayé par l'acheteur. Garantie légale de conformité (articles L217-3 et suivants du Code de la consommation) et garantie des vices cachés (articles 1641 et suivants du Code civil).
        ${Param.get().facture.conditions ? '<br>' + esc(Param.get().facture.conditions) : ''}</p>
      <div class="signatures"><div>Le vendeur (cachet et signature)</div><div>L'acheteur : « Bon pour commande », date et signature</div></div>`);
  }

  // Facture : numérotée à la première édition (FAC-année-0001), sans trou ni doublon dans l'année.
  function numeroter(o) {
    if (o.factureNumero) return o;
    const an = String(new Date().getFullYear());
    const max = Math.max(0, ...db.all('commandes').filter(x => (x.factureNumero || '').startsWith('FAC-' + an)).map(x => num(x.factureNumero.split('-')[2])));
    db.upsert('commandes', { id: o.id, factureNumero: `FAC-${an}-${String(max + 1).padStart(4, '0')}`, factureDate: today(), regimeTva: o.regimeTva || regimeDefaut() });
    return db.get('commandes', o.id);
  }
  function facture(o) {
    if (!o.factureNumero && !confirm('Éditer la facture ? Elle recevra le prochain numéro de facture, qui ne pourra plus changer.')) return;
    o = numeroter(o);
    const f = lignes(o);
    const p = Param.get().facture;
    Papiers.fenetre(`Facture ${o.factureNumero}`, `${entete('Facture', `n° ${esc(o.factureNumero)} du ${dateFr(o.factureDate)} · commande ${esc(o.numero)}`)}
      ${blocs(o, f.v)}${tableau(f, true)}${totaux(f, o, true)}
      ${MENTION[f.regime] ? `<p style="margin-top:12px"><b>${esc(MENTION[f.regime])}</b></p>` : ''}
      <p class="muted">Date de livraison : ${dateFr(o.dateLivree || o.dateLivraison || o.factureDate)} · Paiement : ${esc(o.paiement || 'comptant')}${num(o.acompte) ? ` · acompte de ${euros(o.acompte)} reçu` : ''}.
        Pas d'escompte pour paiement anticipé. Clients professionnels : pénalités de retard au taux légal majoré et indemnité forfaitaire de 40 € pour frais de recouvrement.
        ${p.conditions ? '<br>' + esc(p.conditions) : ''}</p>`);
  }

  // Export pour le comptable : une ligne par facture (CSV lisible dans Excel).
  function exporter() {
    const fs = db.all('commandes').filter(o => o.factureNumero).sort((a, b) => a.factureNumero.localeCompare(b.factureNumero));
    if (!fs.length) { toast('Aucune facture éditée pour le moment.'); return; }
    const cel = x => '"' + String(x ?? '').replace(/"/g, '""') + '"';
    const n2 = x => String(arr(x)).replace('.', ',');
    // Régime de la marge : TVA due = marge TTC du véhicule × 8,5 / 108,5 (calculée ici pour aider le comptable).
    const rows = [['Numéro', 'Date', 'Client', 'Véhicule', 'Immatriculation', 'Régime TVA', 'Total TTC', 'TVA facturée (prestations / normale)',
      'Dont carte grise (débours)', 'Prix de vente du véhicule', "Prix d'achat du véhicule", 'Marge TTC du véhicule', 'TVA sur la marge', 'Paiement']];
    fs.forEach(o => {
      const f = lignes(o);
      const vente = f.L[0].ttc, achat = num(f.v.prixAchat);
      const marge = f.regime === 'marge' ? vente - achat : '';
      rows.push([o.factureNumero, dateFr(o.factureDate), clientNom(db.get('clients', o.clientId)), vehiculeNom(f.v), f.v.immatriculation || '',
        REGIMES[f.regime], n2(f.ttc), n2(f.tva), n2(num(o.carteGrise)), n2(vente), n2(achat),
        marge === '' ? '' : n2(marge), marge === '' ? '' : n2(Math.max(0, marge) * TAUX / (100 + TAUX)), o.paiement || '']);
    });
    Papiers.telecharger('﻿' + rows.map(r => r.map(cel).join(';')).join('\r\n'), `factures-${today()}.csv`, 'text/csv');
  }

  // Rubrique « Documents de vente » de la fiche commande.
  function section(o) {
    if (!o?.id || o.statut === 'Offre') return '';
    const livree = ['Livraison', 'Livrée'].includes(o.statut);
    return `<h3 class="section">Documents de vente</h3>
      <div class="field full"><div class="chips papiers">
        <button type="button" class="chip" data-vente="bon" data-cid="${o.id}">Bon de commande</button>
        ${livree ? `<button type="button" class="chip" data-vente="facture" data-cid="${o.id}">${o.factureNumero ? 'Facture ' + esc(o.factureNumero) : 'Éditer la facture'}</button>` : ''}
        ${livree && o.vehiculeId ? `<button type="button" class="chip" data-papier="cession-vente" data-vid="${o.vehiculeId}">Certificat de cession</button>` : ''}
      </div>
      ${livree && !o.factureNumero ? `<label class="hint">Régime de TVA <select data-regime="${o.id}">${Object.entries(REGIMES).map(([k, l]) => `<option value="${k}"${k === (o.regimeTva || regimeDefaut()) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      ${o.factureNumero ? `<span class="hint">${esc(REGIMES[o.regimeTva || regimeDefaut()])} · éditée le ${dateFr(o.factureDate)}</span>` : ''}</div>`;
  }

  function init() {
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-vente]');
      if (!b) return;
      const o = db.get('commandes', b.dataset.cid);
      if (!o) return;
      if (b.dataset.vente === 'bon') bonDeCommande(o);
      else { facture(o); const nv = db.get('commandes', o.id); if (nv.factureNumero) b.textContent = 'Facture ' + nv.factureNumero; }
    });
    document.addEventListener('change', e => {
      const id = e.target.dataset.regime;
      if (id) db.upsert('commandes', { id, regimeTva: e.target.value });
    });
  }

  return { init, section, exporter, lignes, REGIMES };
})();
