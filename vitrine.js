// Vitrine publique d'un garage (vitrine.html?g=adresse) : lit la copie publiée par l'appli, affiche les véhicules
// disponibles et envoie les demandes des visiteurs au garage. Aucune connexion, aucune donnée privée.
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euros = n => n ? Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : 'Prix sur demande';
  const km = n => n !== '' && n != null ? Number(n).toLocaleString('fr-FR') + ' km' : '';
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nom = v => [v.marque, v.modele, v.finition].filter(Boolean).join(' ');
  const ICO = {
    wa: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z"/><path d="M9 8.6c0 3 2.4 5.9 5.6 6.4.6.1 1.3-.4 1.4-1l.1-.6-1.8-.9-.8.9c-1.2-.5-2.2-1.5-2.7-2.7l.9-.8-.9-1.8-.6.1c-.6.1-1.1.8-1.2 1.4z"/></svg>',
    tel: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    auto: '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16H3.8a.8.8 0 0 1-.8-.8v-3.1c0-.7.4-1.3 1-1.6l1.3-.6L7 6.9A2 2 0 0 1 8.8 6h6.4a2 2 0 0 1 1.8 1l1.7 2.9 1.3.6c.6.3 1 .9 1 1.6v3.1a.8.8 0 0 1-.8.8H19"/><path d="M9 16h6"/><circle cx="7" cy="16" r="2"/><circle cx="17" cy="16" r="2"/></svg>',
  };

  const params = new URLSearchParams(location.search);
  const slug = params.get('g') || '';
  const integre = params.has('integre') && window.parent !== window;
  const adresse = () => `?g=${encodeURIComponent(slug)}${integre ? '&integre=1' : ''}`;
  const cfg = window.CRMZX_CONFIG || {};
  let client = null, garage = {}, vehicules = [], urls = new Map();

  // Numéro WhatsApp : seulement pour un mobile (La Réunion 0692/0693, Mayotte 0639, métropole 06/07).
  function whatsapp(tel) {
    const d = String(tel || '').replace(/[^\d+]/g, '');
    if (/^0(69[23]|639)/.test(d)) return '262' + d.slice(1);
    if (/^0[67]/.test(d)) return '33' + d.slice(1);
    if (/^\+?(262|33)[67]/.test(d) || /^\+?2626/.test(d)) return d.replace('+', '');
    return '';
  }
  const lienWa = msg => whatsapp(garage.telephone) ? `https://wa.me/${whatsapp(garage.telephone)}?text=${encodeURIComponent(msg)}` : '';

  function erreur(msg) {
    $('#tete').innerHTML = `<div><h1>Vitrine indisponible</h1><p>${esc(msg)}</p></div>`;
    $('#grille').innerHTML = '';
  }

  async function signer(chemins) {
    const manquants = chemins.filter(p => p && !urls.has(p));
    if (!manquants.length) return;
    const { data } = await client.storage.from('photos').createSignedUrls(manquants, 3600);
    (data || []).forEach(d => { if (d.signedUrl) urls.set(d.path, d.signedUrl); });
  }

  function entete() {
    const ville = [garage.codePostal, garage.ville].filter(Boolean).join(' ');
    document.title = `${garage.nom || 'Garage'} · véhicules d'occasion${garage.ville ? ' à ' + garage.ville : ''}`;
    const wa = lienWa(`Bonjour, je vous contacte depuis votre vitrine en ligne.`);
    $('#tete').innerHTML = `${garage.logo ? `<img src="${esc(garage.logo)}" alt="">` : ''}
      <div><h1>${esc(garage.nom || 'Véhicules d\'occasion')}</h1><p>${esc([garage.adresse, ville].filter(Boolean).join(', '))}</p></div>
      <div class="contact">${wa ? `<a class="btn wa" href="${esc(wa)}" target="_blank" rel="noopener">${ICO.wa} WhatsApp</a>` : ''}
        ${garage.telephone ? `<a class="btn tel" href="tel:${esc(garage.telephone.replace(/\s/g, ''))}">${ICO.tel} ${esc(garage.telephone)}</a>` : ''}</div>`;
  }

  function filtres() {
    const opt = (liste, tous) => `<option value="">${tous}</option>` + liste.map(x => `<option>${esc(x)}</option>`).join('');
    $('#f-marque').innerHTML = opt([...new Set(vehicules.map(v => v.marque).filter(Boolean))].sort(), 'Toutes les marques');
    $('#f-carburant').innerHTML = opt([...new Set(vehicules.map(v => v.carburant).filter(Boolean))].sort(), 'Tous carburants');
    const max = Math.max(0, ...vehicules.map(v => Number(v.prix) || 0));
    const paliers = [5000, 8000, 10000, 12000, 15000, 20000, 25000, 30000, 40000].filter(p => p < max);
    $('#f-prix').innerHTML = '<option value="">Tous les prix</option>' + paliers.map(p => `<option value="${p}">Jusqu'à ${euros(p)}</option>`).join('');
    $('#filtres').hidden = vehicules.length < 2;
  }

  async function grille() {
    const q = norm($('#f-q').value), marque = $('#f-marque').value, prix = Number($('#f-prix').value) || 0, carb = $('#f-carburant').value, tri = $('#f-tri').value;
    const liste = vehicules.filter(v => (!q || norm([nom(v), v.annee, v.couleur, v.type].join(' ')).includes(q))
      && (!marque || v.marque === marque) && (!prix || (Number(v.prix) || 0) <= prix) && (!carb || v.carburant === carb));
    const p = v => Number(v.prix) || 0;
    if (tri === 'prix') liste.sort((a, b) => p(a) - p(b));
    if (tri === 'prix-') liste.sort((a, b) => p(b) - p(a));
    if (tri === 'km') liste.sort((a, b) => (Number(a.kilometrage) || 0) - (Number(b.kilometrage) || 0));
    $('#compte').textContent = `${liste.length} véhicule${liste.length > 1 ? 's' : ''} disponible${liste.length > 1 ? 's' : ''}`;
    if (!liste.length) {
      $('#grille').innerHTML = `<div class="vide">${vehicules.length ? 'Aucun véhicule ne correspond à ces critères.' : 'Aucun véhicule en ligne pour le moment : revenez bientôt !'}</div>`;
      return;
    }
    await signer(liste.map(v => v.photos[0]));
    $('#grille').innerHTML = liste.map(v => `<button type="button" class="carte" data-id="${esc(v.id)}">
      <div class="photo">${v.photos[0] && urls.get(v.photos[0]) ? `<img src="${esc(urls.get(v.photos[0]))}" alt="${esc(nom(v))}" loading="lazy">` : ICO.auto}
        ${v.reserve ? '<span class="reserve">Réservé</span>' : ''}${v.photos.length > 1 ? `<span class="nb">📷 ${v.photos.length}</span>` : ''}</div>
      <div class="corps"><h2>${esc(nom(v))}</h2>
        <span class="infos">${esc([v.annee, km(v.kilometrage), v.carburant, v.boite].filter(Boolean).join(' · '))}</span>
        <span class="prix">${euros(v.prix)}</span></div></button>`).join('');
  }

  async function fiche(id, depuis = 0) {
    const v = vehicules.find(x => x.id === id);
    if (!v) return;
    await signer(v.photos);
    const specs = [['Année', v.annee], ['Kilométrage', km(v.kilometrage)], ['Carburant', v.carburant], ['Boîte', v.boite], ['Couleur', v.couleur],
      ['Type', v.type], ['Puissance', [v.puissanceCh && v.puissanceCh + ' ch', v.puissanceFiscale && v.puissanceFiscale + ' CV'].filter(Boolean).join(' · ')],
      ['Portes / places', [v.portes, v.places].filter(Boolean).join(' / ')]].filter(([, x]) => x);
    const wa = lienWa(`Bonjour, je suis intéressé(e) par le véhicule ${nom(v)}${v.annee ? ' de ' + v.annee : ''} à ${euros(v.prix)}, vu sur votre vitrine. Est-il toujours disponible ?`);
    $('#fiche').innerHTML = `<div class="fiche-haut">
        <div class="carrousel" id="carrousel">${v.photos.length ? v.photos.map((p, i) => `<img src="${esc(urls.get(p) || '')}" alt="${esc(nom(v))}, photo ${i + 1}">`).join('') : `<div class="sans">${ICO.auto}</div>`}</div>
        <button type="button" class="fermer" id="fermer" aria-label="Fermer">✕</button>
        ${v.photos.length > 1 ? `<span class="compteur" id="compteur">1 / ${v.photos.length}</span>` : ''}</div>
      <div class="fiche-corps">
        <div><h2>${esc(nom(v))}</h2>${v.reserve ? '<span class="reserve" style="position:static;display:inline-block;margin-top:6px">Réservé</span>' : ''}</div>
        <span class="prix">${euros(v.prix)}</span>
        <div class="specs">${specs.map(([l, x]) => `<div><b>${l}</b>${esc(x)}</div>`).join('')}</div>
        ${v.texte ? `<div class="texte">${esc(v.texte)}</div>` : ''}
        <div class="actions">${wa ? `<a class="btn wa" href="${esc(wa)}" target="_blank" rel="noopener">${ICO.wa} WhatsApp</a>` : ''}
          ${garage.telephone ? `<a class="btn" href="tel:${esc(garage.telephone.replace(/\s/g, ''))}">${ICO.tel} Appeler</a>` : ''}</div>
        <form id="demande">
          <h3>Être recontacté au sujet de ce véhicule</h3>
          <div class="deux"><input name="nom" placeholder="Votre nom *" required maxlength="80" autocomplete="name">
            <input name="tel" type="tel" placeholder="Téléphone *" required maxlength="30" autocomplete="tel"></div>
          <input name="email" type="email" placeholder="Email (facultatif)" maxlength="120" autocomplete="email">
          <textarea name="message" rows="3" maxlength="1000" placeholder="Votre message (essai, reprise de votre véhicule, financement…)"></textarea>
          <button type="submit" class="btn primaire">Envoyer ma demande</button>
          <p id="demande-etat" hidden></p>
        </form>
      </div>`;
    const car = $('#carrousel');
    car.addEventListener('scroll', () => { const c = $('#compteur'); if (c) c.textContent = `${Math.round(car.scrollLeft / car.clientWidth) + 1} / ${v.photos.length}`; });
    $('#fermer').addEventListener('click', () => $('#dlg').close());
    $('#demande').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target), etat = $('#demande-etat'), btn = e.target.querySelector('button');
      btn.disabled = true; btn.textContent = 'Envoi…';
      const { error } = await client.rpc('crm_vitrine_demande', {
        p_slug: slug, p_nom: f.get('nom'), p_tel: f.get('tel'), p_email: f.get('email'), p_message: f.get('message'),
        p_vid: v.id, p_vehicule: [nom(v), v.annee, euros(v.prix)].filter(Boolean).join(' · '),
      });
      etat.hidden = false;
      if (error) { etat.className = 'erreur'; etat.textContent = "La demande n'a pas pu être envoyée. Appelez-nous ou écrivez-nous sur WhatsApp."; btn.disabled = false; btn.textContent = 'Envoyer ma demande'; return; }
      etat.className = 'merci';
      etat.textContent = `Merci ! ${garage.nom || 'Le garage'} vous recontacte très vite.`;
      btn.hidden = true;
      e.target.querySelectorAll('input, textarea').forEach(i => { i.disabled = true; });
    });
    if (auto) {
      // La fiche s'ouvre à hauteur de la carte touchée, et le site parent fait défiler jusqu'à elle.
      const y = Math.max(0, Math.round(depuis - 8));
      document.documentElement.style.setProperty('--y', y + 'px');
      parent.postMessage({ zx: 'fiche', y }, '*');
    }
    $('#dlg').showModal();
    hauteur();
    history.replaceState(null, '', `${adresse()}#${encodeURIComponent(v.id)}`);
  }

  async function demarrer() {
    if (!slug) { erreur('Adresse de vitrine manquante.'); return; }
    if (!cfg.supabaseUrl || !cfg.supabaseCle || !window.supabase) { erreur('Service momentanément indisponible.'); return; }
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseCle, { auth: { persistSession: false } });
    const { data, error } = await client.rpc('crm_vitrine_lire', { p_slug: slug });
    if (error || !data) { erreur("Cette vitrine n'existe pas ou n'est plus en ligne."); return; }
    garage = data.data.garage || {};
    vehicules = (data.data.vehicules || []).map(v => ({ ...v, photos: v.photos || [] }));
    entete();
    filtres();
    await grille();
    const ouvert = decodeURIComponent(location.hash.slice(1));
    if (ouvert) fiche(ouvert);
  }

  ['#f-q', '#f-marque', '#f-prix', '#f-carburant', '#f-tri'].forEach(s => $(s).addEventListener('input', grille));
  $('#grille').addEventListener('click', e => { const c = e.target.closest('.carte'); if (c) fiche(c.dataset.id, c.getBoundingClientRect().top + scrollY); });
  $('#dlg').addEventListener('close', () => { history.replaceState(null, '', adresse()); hauteur(); });
  $('#dlg').addEventListener('click', e => { if (e.target.id === 'dlg') $('#dlg').close(); });
  // Intégration : on donne au site parent la hauteur du contenu (fiche ouverte comprise) pour éviter une double barre de défilement.
  let auto = false;
  function hauteur() {
    if (!integre) return;
    const dlg = $('#dlg');
    const fiche = dlg.open ? dlg.getBoundingClientRect().bottom + scrollY + 16 : 0;
    parent.postMessage({ zx: 'hauteur', h: Math.max(document.querySelector('main').offsetHeight + $('#pied').offsetHeight, fiche) }, '*');
  }
  if (integre) {
    document.documentElement.classList.add('integre');
    $('#pied').innerHTML = 'Vitrine propulsée par <a href="./" target="_blank" rel="noopener">ZX CRM</a>';
    window.addEventListener('message', e => {
      if (e.source !== parent || e.data?.zx !== 'ecran') return;
      auto = true;
      document.documentElement.classList.add('auto');
      document.documentElement.style.setProperty('--ecran', Math.max(320, e.data.h) + 'px');
      hauteur();
    });
    new ResizeObserver(hauteur).observe(document.querySelector('main'));
  }
  demarrer();
})();
