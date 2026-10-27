// Barre des documents imprimables (offre, bon de commande, facture, contrat…) : retour à l'appli,
// envoi par mail ou enregistrement du PDF. Le PDF est fabriqué dans la fenêtre du document (html2pdf, dans vendor/).
const DocBarre = (() => {
  const dossier = () => location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  const nomFichier = titre => (titre || 'document').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '.pdf';

  const STYLE = `.barre-doc{position:sticky;top:8px;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 18px;padding:10px 12px;background:#141619;border-radius:12px}
    .barre-doc button{font:600 14px/1 Inter,Arial,sans-serif;padding:10px 14px;border-radius:10px;border:1px solid #3a3e45;background:#22252a;color:#fff;cursor:pointer}
    .barre-doc button.principal{background:#f5c518;border-color:#f5c518;color:#141619}.barre-doc .espace{flex:1}
    .barre-doc .etat{width:100%;font:12.5px/1.3 Inter,Arial,sans-serif;color:#c9cbd0}.barre-doc .etat:empty{display:none}
    @media print{.barre-doc{display:none}}`;

  // Code exécuté dans la fenêtre du document (aucune dépendance vers l'appli).
  function script(cfg) {
    const $ = s => document.querySelector(s);
    const etat = t => { $('#barre-etat').textContent = t || ''; };
    let blob = null;
    let enCours = null;
    const charger = () => new Promise((ok, ko) => {
      if (window.html2pdf) return ok();
      const s = document.createElement('script');
      s.src = cfg.lib;
      s.onload = ok;
      s.onerror = () => ko(new Error('lib'));
      document.head.appendChild(s);
    });
    const options = { margin: [8, 8, 10, 8], filename: cfg.fichier, image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.signatures', '.fiche-grille', 'header', '.bloc'] } };
    const preparer = () => blob ? Promise.resolve(blob) : enCours || (enCours = charger()
      .then(() => window.html2pdf().set(options).from($('#doc')).outputPdf('blob'))
      .then(b => (blob = b))
      .finally(() => { enCours = null; }));
    const fichier = () => new File([blob], cfg.fichier, { type: 'application/pdf' });
    const partageable = () => { try { return !!navigator.canShare?.({ files: [fichier()] }); } catch (e) { return false; } };
    function telecharger() {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = cfg.fichier;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }
    async function pret() {
      if (blob) return true;
      etat('Préparation du PDF…');
      try { await preparer(); etat(''); return true; } catch (e) { etat("Le PDF n'a pas pu être créé : utilise « Imprimer » puis « Enregistrer en PDF »."); return false; }
    }

    $('#b-retour').onclick = () => {
      try { window.opener?.focus(); } catch (e) { /* fenêtre d'origine fermée */ }
      window.close();
      // Fenêtre non fermable (ouverte dans un onglet) : on revient à l'appli dans cet onglet.
      setTimeout(() => { location.href = cfg.app; }, 300);
    };
    $('#b-pdf').onclick = async () => { if (await pret()) { telecharger(); etat('PDF enregistré dans tes téléchargements.'); } };
    $('#b-print').onclick = () => print();
    $('#b-mail').onclick = async () => {
      const dejaPret = !!blob;
      if (!await pret()) return;
      if (partageable()) {
        try { await navigator.share({ files: [fichier()], title: cfg.sujet, text: cfg.texte }); etat(''); return; } catch (e) {
          if (e.name === 'AbortError') return;
          // Le navigateur veut un nouvel appui une fois le PDF prêt.
          if (!dejaPret && e.name === 'NotAllowedError') { etat('PDF prêt : appuie de nouveau sur « Envoyer par mail ».'); return; }
        }
      }
      telecharger();
      const a = document.createElement('a');
      a.href = `mailto:${encodeURIComponent(cfg.email)}?subject=${encodeURIComponent(cfg.sujet)}&body=${encodeURIComponent(cfg.texte)}`;
      a.click();
      etat('Le PDF est téléchargé : ajoute-le en pièce jointe du mail qui vient de s’ouvrir.');
    };
    // Le PDF se prépare dès l'ouverture : les boutons répondent ensuite tout de suite.
    addEventListener('load', () => { preparer().catch(() => {}); if (cfg.envoyer) etat('Appuie sur « Envoyer par mail » pour l’envoyer.'); });
  }

  // Barre + script à placer en tête du <body> ; le contenu du document doit être dans <div id="doc">.
  function html(titre, { email = '', sujet = '', texte = '', envoyer = false } = {}) {
    const g = typeof Param !== 'undefined' ? Param.get().garage || {} : {};
    const cfg = { lib: dossier() + 'vendor/html2pdf.bundle.min.js', app: location.href, fichier: nomFichier(titre), email, sujet: sujet || titre, envoyer,
      texte: texte || `Bonjour,\n\nVous trouverez ci-joint : ${titre}.\n\nCordialement,\n${g.nom || ''}`.trim() };
    return `<style>${STYLE}</style><div class="barre-doc">
      <button type="button" id="b-retour">← Retour à l'appli</button><span class="espace"></span>
      <button type="button" id="b-mail"${envoyer ? ' class="principal"' : ''}>Envoyer par mail</button>
      <button type="button" id="b-pdf"${envoyer ? '' : ' class="principal"'}>Enregistrer le PDF</button>
      <button type="button" id="b-print">Imprimer</button><div class="etat" id="barre-etat"></div></div>
      <script>(${script.toString()})(${JSON.stringify(cfg).replace(/</g, '\\u003c')})<\/script>`;
  }

  return { html, nomFichier };
})();
