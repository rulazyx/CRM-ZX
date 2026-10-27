// Site public du réseau Ocaz (ocaz.re/reseau) : les véhicules que chaque marchand partage au réseau, et la liste des garages.
// Lit la copie publique publiée par l'appli de chaque garage (crm_reseau_lire). Une demande de visiteur part
// au garage qui vend le véhicule (crm_reseau_demande). Aucune connexion, aucune donnée privée.
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euros = n => n ? Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : 'Prix sur demande';
  const km = n => n !== '' && n != null ? Number(n).toLocaleString('fr-FR') + ' km' : '';
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nom = v => [v.marque, v.modele, v.finition].filter(Boolean).join(' ');
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  const ICO = {
    wa: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z"/><path d="M9 8.6c0 3 2.4 5.9 5.6 6.4.6.1 1.3-.4 1.4-1l.1-.6-1.8-.9-.8.9c-1.2-.5-2.2-1.5-2.7-2.7l.9-.8-.9-1.8-.6.1c-.6.1-1.1.8-1.2 1.4z"/></svg>',
    tel: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    lieu: '<svg class="ico" style="width:15px;height:15px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    auto: '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16H3.8a.8.8 0 0 1-.8-.8v-3.1c0-.7.4-1.3 1-1.6l1.3-.6L7 6.9A2 2 0 0 1 8.8 6h6.4a2 2 0 0 1 1.8 1l1.7 2.9 1.3.6c.6.3 1 .9 1 1.6v3.1a.8.8 0 0 1-.8.8H19"/><path d="M9 16h6"/><circle cx="7" cy="16" r="2"/><circle cx="17" cy="16" r="2"/></svg>',
  };

  const cfg = window.CRMZX_CONFIG || {};
  let client = null, garages = [], vehicules = [], urls = new Map(), garageFiltre = '';

  // Numéro WhatsApp : seulement pour un mobile (La Réunion 0692/0693, Mayotte 0639, métropole 06/07).
  function whatsapp(tel) {
    const d = String(tel || '').replace(/[^\d+]/g, '');
    if (/^0(69[23]|639)/.test(d)) return '262' + d.slice(1);
    if (/^0[67]/.test(d)) return '33' + d.slice(1);
    if (/^\+?(262|33)[67]/.test(d) || /^\+?2626/.test(d)) return d.replace('+', '');
    return '';
  }
  const lienWa = (g, msg) => whatsapp(g.telephone) ? `https://wa.me/${whatsapp(g.telephone)}?text=${encodeURIComponent(msg)}` : '';
  const lienTel = g => g.telephone ? `tel:${esc(g.telephone.replace(/\s/g, ''))}` : '';
  const ville = g => [g.codePostal, g.ville].filter(Boolean).join(' ');
  const initiales = g => (g.nom || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0].toUpperCase()).join('');
  const logo = g => `<div class="g-logo">${g.logo ? `<img src="${esc(g.logo)}" alt="">` : esc(initiales(g))}</div>`;
  const cle = v => v.garageId + '/' + v.id;

  function erreur(msg) {
    $('#resume').textContent = msg;
    $('#grille').innerHTML = '';
  }

  async function signer(chemins) {
    const manquants = chemins.filter(p => p && !urls.has(p));
    if (!manquants.length) return;
    const { data } = await client.storage.from('photos').createSignedUrls(manquants, 3600);
    (data || []).forEach(d => { if (d.signedUrl) urls.set(d.path, d.signedUrl); });
  }

  // ---------- Véhicules ----------
  function filtres() {
    const opt = (liste, tous) => `<option value="">${tous}</option>` + liste.map(x => `<option>${esc(x)}</option>`).join('');
    const uniques = f => [...new Set(vehicules.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    $('#f-marque').innerHTML = opt(uniques(v => v.marque), 'Toutes les marques');
    $('#f-carburant').innerHTML = opt(uniques(v => v.carburant), 'Tous carburants');
    $('#f-ville').innerHTML = opt(uniques(v => v.garage.ville), 'Toute l\'île');
    const max = Math.max(0, ...vehicules.map(v => Number(v.prix) || 0));
    const paliers = [5000, 8000, 10000, 12000, 15000, 20000, 25000, 30000, 40000].filter(p => p < max);
    $('#f-prix').innerHTML = '<option value="">Tous les prix</option>' + paliers.map(p => `<option value="${p}">Jusqu'à ${euros(p)}</option>`).join('');
    $('#filtres').hidden = vehicules.length < 2;
  }

  async function grille() {
    const q = norm($('#f-q').value), marque = $('#f-marque').value, prix = Number($('#f-prix').value) || 0,
      carb = $('#f-carburant').value, commune = $('#f-ville').value, tri = $('#f-tri').value;
    const liste = vehicules.filter(v => (!q || norm([nom(v), v.annee, v.couleur, v.type, v.garage.nom].join(' ')).includes(q))
      && (!marque || v.marque === marque) && (!prix || (Number(v.prix) || 0) <= prix) && (!carb || v.carburant === carb)
      && (!commune || v.garage.ville === commune) && (!garageFiltre || v.garageId === garageFiltre));
    const p = v => Number(v.prix) || 0;
    if (tri === 'prix') liste.sort((a, b) => p(a) - p(b));
    if (tri === 'prix-') liste.sort((a, b) => p(b) - p(a));
    if (tri === 'km') liste.sort((a, b) => (Number(a.kilometrage) || 0) - (Number(b.kilometrage) || 0));
    const g = garages.find(x => x.id === garageFiltre);
    $('#filtre-garage').innerHTML = g ? `<span class="filtre-garage">Véhicules de <b>${esc(g.garage.nom)}</b><button type="button" id="sans-garage" aria-label="Voir tous les garages">✕</button></span>` : '';
    $('#compte').textContent = `${pluriel(liste.length, 'véhicule')} disponible${liste.length > 1 ? 's' : ''}`;
    if (!liste.length) {
      $('#grille').innerHTML = `<div class="vide">${vehicules.length ? 'Aucun véhicule ne correspond à ces critères.' : 'Aucun véhicule en ligne pour le moment : revenez bientôt !'}</div>`;
      return;
    }
    await signer(liste.map(v => v.photos[0]));
    $('#grille').innerHTML = liste.map(v => `<button type="button" class="carte" data-cle="${esc(cle(v))}">
      <div class="photo">${v.photos[0] && urls.get(v.photos[0]) ? `<img src="${esc(urls.get(v.photos[0]))}" alt="${esc(nom(v))}" loading="lazy">` : ICO.auto}
        ${v.reserve ? '<span class="reserve">Réservé</span>' : ''}${v.photos.length > 1 ? `<span class="nb">📷 ${v.photos.length}</span>` : ''}</div>
      <div class="corps"><h2>${esc(nom(v))}</h2>
        <span class="infos">${esc([v.annee, km(v.kilometrage), v.carburant, v.boite].filter(Boolean).join(' · '))}</span>
        <span class="prix">${euros(v.prix)}</span>
        <span class="garage">${ICO.lieu} ${esc([v.garage.nom, v.garage.ville].filter(Boolean).join(' · '))}</span></div></button>`).join('');
  }

  async function fiche(k) {
    const v = vehicules.find(x => cle(x) === k);
    if (!v) return;
    const g = v.garage;
    await signer(v.photos);
    const specs = [['Année', v.annee], ['Kilométrage', km(v.kilometrage)], ['Carburant', v.carburant], ['Boîte', v.boite], ['Couleur', v.couleur],
      ['Type', v.type], ['Puissance', [v.puissanceCh && v.puissanceCh + ' ch', v.puissanceFiscale && v.puissanceFiscale + ' CV'].filter(Boolean).join(' · ')],
      ['Portes / places', [v.portes, v.places].filter(Boolean).join(' / ')]].filter(([, x]) => x);
    const wa = lienWa(g, `Bonjour, je suis intéressé(e) par le véhicule ${nom(v)}${v.annee ? ' de ' + v.annee : ''} à ${euros(v.prix)}, vu sur le site Ocaz. Est-il toujours disponible ?`);
    const autres = vehicules.filter(x => x.garageId === v.garageId).length - 1;
    $('#fiche').innerHTML = `<div class="fiche-haut">
        <div class="carrousel" id="carrousel">${v.photos.length ? v.photos.map((p, i) => `<img src="${esc(urls.get(p) || '')}" alt="${esc(nom(v))}, photo ${i + 1}">`).join('') : `<div class="sans">${ICO.auto}</div>`}</div>
        <button type="button" class="fermer" id="fermer" aria-label="Fermer">✕</button>
        ${v.photos.length > 1 ? `<span class="compteur" id="compteur">1 / ${v.photos.length}</span>` : ''}</div>
      <div class="fiche-corps">
        <div><h2>${esc(nom(v))}</h2>${v.reserve ? '<span class="reserve" style="position:static;display:inline-block;margin-top:6px">Réservé</span>' : ''}</div>
        <span class="prix">${euros(v.prix)}</span>
        <div class="specs">${specs.map(([l, x]) => `<div><b>${l}</b>${esc(x)}</div>`).join('')}</div>
        ${v.texte ? `<div class="texte">${esc(v.texte)}</div>` : ''}
        <div class="garage-fiche">${logo(g)}<div><b>Vendu par ${esc(g.nom || 'un garage du réseau')}</b>
          <div class="hint" style="color:var(--muted);font-size:13.5px">${esc([g.adresse, ville(g)].filter(Boolean).join(', '))}</div>
          ${autres > 0 ? `<button type="button" class="lien" id="voir-garage">Voir ses ${pluriel(autres, 'autre')} véhicule${autres > 1 ? 's' : ''}</button>` : ''}</div></div>
        <div class="actions">${wa ? `<a class="btn wa" href="${esc(wa)}" target="_blank" rel="noopener">${ICO.wa} WhatsApp</a>` : ''}
          ${g.telephone ? `<a class="btn" href="${lienTel(g)}">${ICO.tel} Appeler le garage</a>` : ''}</div>
        <form id="demande">
          <h3>Être recontacté par le garage</h3>
          <div class="deux"><input name="nom" placeholder="Votre nom *" required maxlength="80" autocomplete="name">
            <input name="tel" type="tel" placeholder="Téléphone *" required maxlength="30" autocomplete="tel"></div>
          <input name="email" type="email" placeholder="Email (facultatif)" maxlength="120" autocomplete="email">
          <textarea name="message" rows="3" maxlength="1000" placeholder="Votre message (essai, reprise de votre véhicule, financement…)"></textarea>
          <label class="accord"><input type="checkbox" name="accord" required>
            <span>J'accepte que mes coordonnées soient transmises à ${esc(g.nom || 'ce garage')} pour être recontacté(e) au sujet de ce véhicule.</span></label>
          <button type="submit" class="btn primaire">Envoyer ma demande</button>
          <p id="demande-etat" hidden></p>
        </form>
      </div>`;
    const car = $('#carrousel');
    car.addEventListener('scroll', () => { const c = $('#compteur'); if (c) c.textContent = `${Math.round(car.scrollLeft / car.clientWidth) + 1} / ${v.photos.length}`; });
    $('#fermer').addEventListener('click', () => $('#dlg').close());
    $('#voir-garage')?.addEventListener('click', () => { $('#dlg').close(); voirGarage(v.garageId); });
    $('#demande').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target), etat = $('#demande-etat'), btn = e.target.querySelector('button');
      btn.disabled = true; btn.textContent = 'Envoi…';
      const { error } = await client.rpc('crm_reseau_demande', {
        p_garage: v.garageId, p_nom: f.get('nom'), p_tel: f.get('tel'), p_email: f.get('email'), p_message: f.get('message'),
        p_vid: v.id, p_vehicule: [nom(v), v.annee, euros(v.prix)].filter(Boolean).join(' · '), p_accord: f.has('accord'),
      });
      etat.hidden = false;
      if (error) { etat.className = 'erreur'; etat.textContent = "La demande n'a pas pu être envoyée. Appelez le garage ou écrivez-lui sur WhatsApp."; btn.disabled = false; btn.textContent = 'Envoyer ma demande'; return; }
      etat.className = 'merci';
      etat.textContent = `Merci ! ${g.nom || 'Le garage'} vous recontacte très vite.`;
      btn.hidden = true;
      e.target.querySelectorAll('input, textarea').forEach(i => { i.disabled = true; });
    });
    $('#dlg').showModal();
    history.replaceState(null, '', '#v/' + k);
  }

  // ---------- Notre réseau ----------
  function listeGarages() {
    const tries = [...garages].sort((a, b) => b.vehicules.length - a.vehicules.length || (a.garage.nom || '').localeCompare(b.garage.nom || '', 'fr'));
    $('#compte-garages').textContent = `${pluriel(garages.length, 'garage')} partenaire${garages.length > 1 ? 's' : ''} à La Réunion`;
    $('#garages').innerHTML = tries.map(({ id, garage: g, vehicules: vs }) => {
      const wa = lienWa(g, 'Bonjour, je vous contacte depuis le site Ocaz.');
      const site = g.site ? (/^https?:\/\//.test(g.site) ? g.site : 'https://' + g.site) : '';
      return `<article class="g-carte">
        <div class="g-tete">${logo(g)}<div><h2>${esc(g.nom || 'Garage')}</h2>
          <div class="adr">${esc([g.adresse, ville(g)].filter(Boolean).join(', '))}</div></div></div>
        <span class="nbv">${vs.length ? pluriel(vs.length, 'véhicule') + ' en vente' : 'Stock bientôt en ligne'}</span>
        <div class="actions">${vs.length ? `<button type="button" class="btn primaire" data-garage="${esc(id)}">Voir ses véhicules</button>` : ''}
          ${g.telephone ? `<a class="btn" href="${lienTel(g)}">${ICO.tel} ${esc(g.telephone)}</a>` : ''}
          ${wa ? `<a class="btn wa" href="${esc(wa)}" target="_blank" rel="noopener">${ICO.wa}</a>` : ''}
          ${g.slug_vitrine ? `<a class="btn" href="vitrine?g=${encodeURIComponent(g.slug_vitrine)}">Sa vitrine</a>` : site ? `<a class="btn" href="${esc(site)}" target="_blank" rel="noopener">Son site</a>` : ''}</div>
      </article>`;
    }).join('') || '<div class="vide">Les premiers garages arrivent bientôt.</div>';
  }

  // ---------- Navigation ----------
  function page(nomPage) {
    document.querySelectorAll('nav.pages a').forEach(a => a.classList.toggle('actif', a.dataset.page === nomPage));
    $('#page-vehicules').hidden = nomPage !== 'vehicules';
    $('#page-reseau').hidden = nomPage !== 'reseau';
  }
  function voirGarage(id) {
    garageFiltre = id;
    history.replaceState(null, '', '#vehicules');
    page('vehicules');
    grille();
    scrollTo({ top: 0, behavior: 'smooth' });
  }
  function suivreAdresse() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h.startsWith('v/') && $('#dlg').open) $('#dlg').close();
    if (h === 'reseau') { page('reseau'); return; }
    page('vehicules');
    if (h.startsWith('v/')) fiche(h.slice(2));
  }

  async function demarrer() {
    if (!cfg.supabaseUrl || !cfg.supabaseCle || !window.supabase) { erreur('Service momentanément indisponible.'); return; }
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseCle, { auth: { persistSession: false } });
    const { data, error } = await client.rpc('crm_reseau_lire');
    if (error) { erreur('Le site du réseau est momentanément indisponible.'); return; }
    garages = (data || []).map(r => ({ id: r.entreprise_id || r.id, garage: r.garage || {}, vehicules: r.vehicules || [] }));
    vehicules = garages.flatMap(g => g.vehicules.map(v => ({ ...v, photos: v.photos || [], garageId: g.id, garage: g.garage })));
    $('#resume').textContent = `${pluriel(vehicules.length, 'véhicule')} chez ${pluriel(garages.length, 'garage')} partenaire${garages.length > 1 ? 's' : ''}, en contact direct avec le vendeur.`;
    filtres();
    listeGarages();
    await grille();
    suivreAdresse();
  }

  ['#f-q', '#f-marque', '#f-prix', '#f-carburant', '#f-ville', '#f-tri'].forEach(s => $(s).addEventListener('input', grille));
  $('#grille').addEventListener('click', e => { const c = e.target.closest('.carte'); if (c) fiche(c.dataset.cle); });
  $('#filtre-garage').addEventListener('click', e => { if (e.target.id === 'sans-garage') { garageFiltre = ''; grille(); } });
  $('#garages').addEventListener('click', e => { const b = e.target.closest('[data-garage]'); if (b) voirGarage(b.dataset.garage); });
  window.addEventListener('hashchange', suivreAdresse);
  $('#dlg').addEventListener('close', () => { if (location.hash.startsWith('#v/')) history.replaceState(null, '', '#vehicules'); });
  $('#dlg').addEventListener('click', e => { if (e.target.id === 'dlg') $('#dlg').close(); });
  demarrer();
})();
