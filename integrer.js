// Vitrine Ocaz intégrée au site du garage. À coller dans le site :
// <script src="https://…/integrer.js" data-garage="adresse-de-la-vitrine" async></script>
// Le script ajoute la vitrine à cet endroit (ou dans l'élément id="zx-vitrine" s'il existe) et ajuste sa hauteur.
(function () {
  var s = document.currentScript;
  if (!s) return;
  var slug = s.getAttribute('data-garage') || '';
  var base = s.src.replace(/[^/]*$/, '');
  var f = document.createElement('iframe');
  f.src = base + 'vitrine.html?g=' + encodeURIComponent(slug) + '&integre=1';
  f.title = 'Nos véhicules d\'occasion';
  f.loading = 'lazy';
  f.setAttribute('allow', 'clipboard-write; web-share');
  f.style.cssText = 'display:block;width:100%;height:700px;border:0;background:transparent;color-scheme:normal';
  var cible = document.getElementById(s.getAttribute('data-cible') || 'zx-vitrine');
  if (cible) cible.appendChild(f); else s.parentNode.insertBefore(f, s);

  var ecran = function () { f.contentWindow && f.contentWindow.postMessage({ zx: 'ecran', h: window.innerHeight }, '*'); };
  f.addEventListener('load', ecran);
  window.addEventListener('resize', ecran);
  window.addEventListener('message', function (e) {
    if (e.source !== f.contentWindow || !e.data || typeof e.data !== 'object') return;
    if (e.data.zx === 'hauteur') f.style.height = Math.max(300, Math.ceil(e.data.h)) + 'px';
    if (e.data.zx === 'fiche') {
      var haut = f.getBoundingClientRect().top + window.pageYOffset + (e.data.y || 0) - 12;
      window.scrollTo({ top: haut, behavior: 'smooth' });
    }
  });
})();
