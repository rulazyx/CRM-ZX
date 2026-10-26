// Checklist de préparation (pensée pour le téléphone, à l'atelier) : chaque point coché ajoute ses frais
// à la fiche du véhicule. Les frais réels remplacent alors l'estimation de la reprise dans la marge.
const Prepa = (() => {
  const POINTS = ['Vidange et filtres', 'Pneus', 'Freins', 'Contrôle technique', 'Carrosserie', 'Nettoyage intérieur', 'Lustrage extérieur',
    'Double des clés', "Carnet d'entretien"];
  let vid = null;
  const nouvelId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const liste = v => v.prepa || POINTS.map(nom => ({ id: nouvelId(), nom, fait: false, montant: '' }));
  // Frais réels : somme des points cochés (null tant que la checklist n'a pas été commencée).
  const fraisReels = v => v.prepa ? v.prepa.filter(p => p.fait).reduce((s, p) => s + num(p.montant), 0) : null;
  const frais = v => fraisReels(v) ?? num(v.fraisEstimes);
  const avancement = v => v.prepa ? `${v.prepa.filter(p => p.fait).length}/${v.prepa.length}` : '';

  function rendre() {
    const v = db.get('vehicules', vid);
    const pts = liste(v);
    const total = pts.filter(p => p.fait).reduce((s, p) => s + num(p.montant), 0);
    const faits = pts.filter(p => p.fait).length;
    $('#prepa-titre').textContent = 'Préparation · ' + vehiculeNom(v);
    $('#prepa-body').innerHTML = `
      <div class="prepa-tete"><div><strong>${faits} / ${pts.length}</strong><span>points faits</span></div>
        <div><strong>${euros(total) || '0 €'}</strong><span>frais réels${num(v.fraisEstimes) ? ` · estimés ${euros(v.fraisEstimes)}` : ''}</span></div></div>
      <div class="prepa-barre"><span style="width:${pts.length ? faits / pts.length * 100 : 0}%"></span></div>
      <div class="prepa-liste">${pts.map(p => `<div class="prepa-point${p.fait ? ' fait' : ''}" data-pid="${p.id}">
        <label class="check"><input type="checkbox" data-p="fait"${p.fait ? ' checked' : ''}><span>${esc(p.nom)}</span></label>
        <span class="inline pk-montant"><input data-p="montant" type="number" inputmode="decimal" placeholder="0" value="${esc(p.montant)}" aria-label="Frais ${esc(p.nom)}"><b>€</b></span>
        <button type="button" class="chip" data-p-suppr aria-label="Retirer ce point">✕</button></div>`).join('')}</div>
      <div class="inline"><input id="prepa-nouveau" placeholder="Ajouter un point (ex. pare-brise)"><button type="button" id="prepa-ajouter">Ajouter</button></div>
      <p class="hint">Saisis le coût de chaque intervention puis coche-la quand elle est faite : le total devient les frais réels du véhicule (marge et tableau de bord).</p>`;
  }

  function sauver(pts) {
    db.upsert('vehicules', { id: vid, prepa: pts, fraisReels: pts.filter(p => p.fait).reduce((s, p) => s + num(p.montant), 0) });
  }
  const ecran = () => [...document.querySelectorAll('#prepa-body .prepa-point')].map(l => ({
    id: l.dataset.pid,
    nom: l.querySelector('.check span').textContent,
    fait: l.querySelector('[data-p=fait]').checked,
    montant: l.querySelector('[data-p=montant]').value,
  }));

  function ouvrir(id) { vid = id; rendre(); $('#dlg-prepa').showModal(); }

  function init() {
    const body = $('#prepa-body');
    body.addEventListener('change', e => { if (e.target.dataset.p) { sauver(ecran()); rendre(); } });
    body.addEventListener('click', e => {
      if (e.target.closest('[data-p-suppr]')) {
        const id = e.target.closest('.prepa-point').dataset.pid;
        sauver(ecran().filter(p => p.id !== id));
        rendre();
        return;
      }
      if (e.target.id === 'prepa-ajouter') {
        const nom = $('#prepa-nouveau').value.trim();
        if (!nom) return;
        sauver(ecran().concat({ id: nouvelId(), nom, fait: false, montant: '' }));
        rendre();
        $('#prepa-nouveau').focus();
      }
    });
    body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'prepa-nouveau') { e.preventDefault(); $('#prepa-ajouter').click(); } });
    $('#prepa-fermer').addEventListener('click', () => $('#dlg-prepa').close());
    $('#prepa-pret').addEventListener('click', () => {
      const v = db.get('vehicules', vid);
      const reste = liste(v).filter(p => !p.fait).length;
      if (reste && !confirm(`${reste} point(s) non cochés. Passer quand même le véhicule en stock ?`)) return;
      db.upsert('vehicules', { id: vid, statut: 'En stock', dateEntree: v.dateEntree || today() });
      $('#dlg-prepa').close();
      if ($('#dlg').open) $('#dlg').close();
      toast('Véhicule prêt : il passe en stock');
      render();
    });
    $('#dlg-prepa').addEventListener('close', () => { if ($('#dlg').open && editing?.id === vid) majFiche(); render(); });
  }
  // Fiche véhicule ouverte derrière : on met à jour le champ des frais affiché.
  function majFiche() {
    const v = db.get('vehicules', vid);
    const el = $('#prepa-resume');
    if (el) el.textContent = resume(v);
  }
  const resume = v => v.prepa ? `${avancement(v)} points faits · frais réels ${euros(fraisReels(v)) || '0 €'}` : 'Pas encore commencée';

  return { init, ouvrir, frais, fraisReels, avancement, resume };
})();
