// Réseau Ocaz : textes et documents partagés par l'appli des garages et l'espace apporteur.
// Contrat d'apporteur d'affaires signé en ligne, conditions acceptées par le garage, et facture de commission
// (émise par l'apporteur, payée directement par le garage : aucun argent ne passe par Ocaz).
const Commission = (() => {
  const VERSION = '2026-10';
  const TAUX_TVA = 8.5;
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const date = d => d ? new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('fr-FR') : '';
  const FORMES = { micro: 'Micro-entrepreneur', societe: 'Société', en_cours: "En cours d'immatriculation" };

  // Règle du garage : montant fixe, ou pourcentage du prix de vente avec un minimum. Un montant propre au véhicule l'emporte.
  function montant(regle, prix, propre) {
    if (propre !== '' && propre != null && !isNaN(propre)) return Math.max(0, Math.round(Number(propre)));
    if (!regle) return 0;
    if (regle.commissionType === 'pourcentage') return Math.max(Number(regle.commissionMin) || 0, Math.round((Number(prix) || 0) * (Number(regle.commissionValeur) || 0) / 100));
    return Math.max(0, Math.round(Number(regle.commissionValeur) || 0));
  }
  const texteRegle = (regle, propre) => (propre !== '' && propre != null) || regle?.commissionType !== 'pourcentage'
    ? 'Montant fixe' : `${regle.commissionValeur} % du prix de vente${Number(regle.commissionMin) ? ', minimum ' + eur(regle.commissionMin).replace(',00', '') : ''}`;

  // ---------- Contrat d'apporteur d'affaires (signé en ligne à l'inscription) ----------
  const CONTRAT = [
    ['Objet', "L'apporteur présente aux garages du réseau Ocaz des personnes intéressées par l'achat d'un véhicule que le garage partage dans le réseau. Il met en relation, rien de plus : il ne vend pas, ne négocie pas au nom du garage, ne signe aucun document et n'encaisse aucune somme pour le compte du garage ou du client."],
    ['Indépendance', "L'apporteur agit en toute indépendance, sans lien de subordination avec les garages ni avec Ocaz. Il organise librement son activité et déclare lui-même ses revenus (URSSAF, impôts). Pour facturer une commission, il doit être immatriculé (micro-entreprise ou société) et renseigner son SIRET."],
    ['Transmission d\'un client (lead)', "L'apporteur transmet le client depuis l'application Ocaz, pour un véhicule précis. Le lead est daté : il ouvre droit à commission si ce client achète ce véhicule dans les 90 jours. Si le client était déjà en contact avec le garage pour ce véhicule, le garage peut clore le lead en l'indiquant."],
    ['Commission', "Le montant est fixé par chaque garage et affiché sur chaque véhicule avant l'envoi du lead. Elle n'est due que si la vente au client présenté est conclue et le véhicule livré. Le garage la verse directement à l'apporteur, par virement, dans les 30 jours suivant la livraison, sur présentation de la facture que l'application prépare. Ocaz ne perçoit et ne reverse aucune somme."],
    ['Ce que l\'apporteur s\'interdit', "Proposer un crédit, une location financière ou une assurance (activités réservées aux intermédiaires immatriculés à l'ORIAS) ; promettre un prix, une remise, une reprise ou un délai que le garage n'a pas confirmés ; démarcher de façon insistante ; transmettre une personne sans son accord."],
    ['Données personnelles', "L'apporteur ne transmet que les coordonnées d'une personne qui a accepté d'être recontactée par le garage au sujet du véhicule. Il n'utilise pas ces données à d'autres fins et ne les conserve pas au-delà du nécessaire. Le garage qui reçoit le lead devient responsable de leur traitement (RGPD)."],
    ['Durée et fin', "Le contrat prend effet à la signature, pour une durée indéterminée. Chacun peut y mettre fin à tout moment ; les commissions des ventes déjà conclues restent dues. Ocaz peut suspendre l'accès d'un apporteur qui ne respecte pas ces règles."],
    ['Litiges', "Les parties cherchent d'abord une solution amiable. À défaut, le litige est porté devant le tribunal compétent du siège du garage concerné. Droit français."],
  ];
  const contratHtml = () => CONTRAT.map(([t, p], i) => `<h4>${i + 1}. ${e(t)}</h4><p>${e(p)}</p>`).join('');

  // Conditions acceptées par le garage quand il rejoint le réseau.
  const CONDITIONS_GARAGE = "Je verse directement à l'apporteur la commission affichée pour toute vente conclue avec un client qu'il m'a transmis (dans les 90 jours, pour le véhicule du lead), par virement dans les 30 jours suivant la livraison. Je rappelle chaque nouveau lead rapidement et je tiens son statut à jour dans Ocaz.";

  // ---------- Fenêtre imprimable ----------
  function fenetre(titre, corps) {
    const w = window.open('', '_blank');
    if (!w) return false;
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${e(titre)}</title>
      <style>body{font:13px/1.5 Inter,Arial,sans-serif;color:#0d0f12;max-width:780px;margin:24px auto;padding:0 18px}
      h1{font-size:20px;margin:0 0 2px}h4{margin:14px 0 2px;font-size:13.5px}p{margin:0 0 6px}.muted{color:#6b6f76;font-size:12px}
      .parties{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}.parties div{border:1px solid #c9cbd0;border-radius:8px;padding:10px}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #c9cbd0;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1f5f9}
      .r{text-align:right}.tot{width:auto;min-width:300px;margin:10px 0 0 auto}.mention{font-size:11.5px;color:#334155;margin-top:14px}
      .alerte{background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:8px 10px}
      @media print{.noprint{display:none}body{margin:0 auto}}</style></head><body>
      ${DocBarre.html(titre)}<div id="doc">${corps}</div></body></html>`);
    w.document.close();
    return true;
  }
  const adresse = (a, cp, v) => [a, [cp, v].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  // Contrat signé, à réimprimer depuis les Paramètres de l'apporteur.
  function imprimerContrat(a) {
    return fenetre("Contrat d'apporteur d'affaires", `<h1>Contrat d'apporteur d'affaires · réseau Ocaz</h1>
      <p class="muted">Version ${e(a.contrat_version || VERSION)} · signé en ligne le ${e(date(a.contrat_signe_le))}</p>
      <div class="parties"><div><b>L'apporteur</b><br>${e([a.prenom, a.nom].join(' '))}${a.raison_sociale ? '<br>' + e(a.raison_sociale) : ''}<br>
        ${e(FORMES[a.forme] || '')}${a.siret ? ' · SIRET ' + e(a.siret) : ''}<br>${e(adresse(a.adresse, a.code_postal, a.ville))}<br>${e([a.telephone, a.email].filter(Boolean).join(' · '))}</div>
        <div><b>Les garages du réseau Ocaz</b><br>Chaque garage qui partage des véhicules dans le réseau accepte ces conditions et fixe sa commission.</div></div>
      ${contratHtml()}
      <p class="mention">Signé électroniquement par « ${e(a.signature)} » le ${e(date(a.contrat_signe_le))}, après lecture du contrat et acceptation des cases correspondantes dans l'application Ocaz.</p>`);
  }

  // ---------- Facture de commission (émise par l'apporteur, adressée au garage) ----------
  // a : fiche de l'apporteur · l : lead vendu · g : infos du garage (nom, adresse, codePostal, ville, siret, tva).
  function manques(a, l) {
    const m = [];
    if (!/^\d{14}$/.test(a.siret || '')) m.push('le SIRET de l\'apporteur');
    if (!a.adresse) m.push("l'adresse de l'apporteur");
    if (!a.iban) m.push("le RIB (IBAN) de l'apporteur");
    if (l.statut !== 'vendu') m.push('la vente (le lead doit être marqué vendu)');
    return m;
  }
  function imprimerFacture(a, l, g = {}) {
    const ttc = Number(l.commission_finale ?? l.commission) || 0;
    const tva = a.forme === 'societe' && a.tva ? Math.round((ttc - ttc / (1 + TAUX_TVA / 100)) * 100) / 100 : 0;
    const m = manques(a, l);
    const client = [l.client_prenom, l.client_nom].filter(Boolean).join(' ');
    return fenetre('Facture ' + l.facture_numero, `${m.length ? `<p class="alerte">⚠ À compléter avant d'envoyer : ${e(m.join(', '))}.</p>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:2px solid #0d0f12;padding-bottom:10px">
        <div><h1>Facture ${e(l.facture_numero)}</h1><span class="muted">Date : ${e(date(l.vendu_le))} · Commission d'apport d'affaires</span></div>
        <div style="text-align:right;font-size:12px"><strong>${e(a.raison_sociale || [a.prenom, a.nom].join(' '))}</strong><br>${e(adresse(a.adresse, a.code_postal, a.ville))}<br>
          ${e([a.telephone, a.email].filter(Boolean).join(' · '))}${a.siret ? '<br>SIRET ' + e(a.siret) : ''}${a.tva ? '<br>TVA ' + e(a.tva) : ''}</div></div>
      <div class="parties"><div><b>Émetteur (apporteur d'affaires)</b><br>${e([a.prenom, a.nom].join(' '))}${a.raison_sociale ? '<br>' + e(a.raison_sociale) : ''}<br>${e(FORMES[a.forme] || '')}</div>
        <div><b>Facturé à</b><br>${e(g.nom || '')}<br>${e(adresse(g.adresse, g.codePostal, g.ville))}${g.siret ? '<br>SIRET ' + e(g.siret) : ''}${g.tva ? '<br>TVA ' + e(g.tva) : ''}</div></div>
      <table><thead><tr><th>Désignation</th><th class="r">Montant</th></tr></thead><tbody>
        <tr><td>Commission d'apport d'affaires : mise en relation de ${e(client)} pour l'achat du véhicule ${e(l.vehicule)}${l.prix_vente ? ' (' + e(eur(l.prix_vente).replace(',00', '')) + ')' : ''},
          vendu le ${e(date(l.vendu_le))}. Lead n° ${e(l.numero)} du ${e(date(l.cree_le))}.</td><td class="r">${e(eur(tva ? ttc - tva : ttc))}</td></tr></tbody></table>
      <table class="tot">${tva ? `<tr><td>Total HT</td><td class="r">${e(eur(ttc - tva))}</td></tr><tr><td>TVA ${TAUX_TVA.toLocaleString('fr-FR')} %</td><td class="r">${e(eur(tva))}</td></tr>` : ''}
        <tr><th>Net à payer</th><th class="r">${e(eur(ttc))}</th></tr></table>
      <p class="mention">${tva ? '' : 'TVA non applicable, article 293 B du CGI.<br>'}
        Paiement par virement sous 30 jours à compter de la livraison du véhicule${a.iban ? ` : IBAN ${e(a.iban.replace(/(.{4})/g, '$1 ').trim())}${a.bic ? ' · BIC ' + e(a.bic) : ''}${a.titulaire ? ' · titulaire ' + e(a.titulaire) : ''}` : ''}.<br>
        En cas de retard de paiement : pénalités au taux de 3 fois le taux d'intérêt légal et indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce). Pas d'escompte pour paiement anticipé.</p>
      <p class="mention muted">Facture établie par l'apporteur d'affaires avec l'application Ocaz, selon le contrat d'apporteur du réseau Ocaz. Ocaz n'intervient pas dans le paiement.</p>`);
  }

  return { VERSION, FORMES, CONTRAT, CONDITIONS_GARAGE, montant, texteRegle, contratHtml, imprimerContrat, imprimerFacture, manques };
})();
