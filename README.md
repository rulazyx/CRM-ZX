# Ocaz : site public (ocaz.re)

Ce dépôt est le site public d'Ocaz, à l'adresse `ocaz.re`. L'appli des garages et des apporteurs d'affaires est à part,
dans le dépôt `ocaz-pro`, à l'adresse `pro.ocaz.re` : elle n'est pas référencée et aucun lien du site n'y mène
(Anthony envoie lui-même l'adresse aux pros).

## Pages

- `/` : accueil, « Particulier · Je cherche une voiture » vers le site du réseau.
- `/reseau` : les véhicules partagés par les garages du réseau, sans compte.
- `/vitrine?g=adresse` : la vitrine d'un garage ; `integrer.js` la met dans le site du garage (code donné dans l'appli pro).
- `/rejoindre`, `/outils`, `/mentions-legales`, `/confidentialite`, `/cgu`.
- Couleurs : noirs et gris foncés avec le jaune `#f59e0b` ; le bleu ne reste que dans les graphiques.

## Anciens liens de l'appli

- `/apporteur` (et `?inscription`) renvoie vers `https://pro.ocaz.re/apporteur`.
- `/?espace=…`, `/#pro` et l'appli déjà installée sur un téléphone (ouverte en plein écran) renvoient vers `https://pro.ocaz.re/`.
- `sw.js` retire l'ancien service worker de l'appli des téléphones qui l'avaient installée.

La base Supabase (`config.js`, clé publique) est la même que celle de l'appli ; le script `supabase.sql` est dans `ocaz-pro`.

## Adresse ocaz.re

Le fichier `CNAME` (contenu : `ocaz.re`) relie le site au domaine. Il ne doit arriver sur `main` qu'une fois les DNS en place,
sinon GitHub Pages redirige vers une adresse qui ne répond pas encore.

Chez le registrar, zone DNS de `ocaz.re` :
- 4 enregistrements `A` sur `@` : 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
- (facultatif) 4 `AAAA` sur `@` : 2606:50c0:8000::153, 2606:50c0:8001::153, 2606:50c0:8002::153, 2606:50c0:8003::153
- 1 `CNAME` sur `www` vers `rulazyx.github.io.`
- supprimer les anciens `A`/`AAAA`/`CNAME` posés par défaut par le registrar (page de parking)

Ensuite : GitHub > Settings > Pages > Custom domain = `ocaz.re`, puis cocher Enforce HTTPS quand le certificat est prêt.
Les anciennes adresses `rulazyx.github.io/CRM-ZX/...` sont redirigées automatiquement (`/CRM-ZX/vitrine.html` → `ocaz.re/vitrine.html`),
y compris les codes d'intégration `integrer.js` déjà collés sur des sites de garages.
Dans Supabase > Authentication > URL Configuration : Site URL = `https://ocaz.re`, ajouter `https://ocaz.re/**` aux Redirect URLs.
Les données gardées dans le navigateur dépendent de l'adresse : sur ocaz.re il faut se reconnecter, la synchronisation recharge le compte.

## Pages d'information et référencement

- `rejoindre` : pourquoi rejoindre le réseau (garages, apporteurs), avec contact par mail. Lien en bas du site du réseau (« Vous voulez faire partie du réseau ? »).
- `mentions-legales`, `confidentialite`, `cgu` : textes légaux. Les mentions surlignées `[…]` (nom, SIREN, adresse, téléphone, région Supabase, ville du tribunal) sont à compléter dans le générateur ou directement dans les fichiers. À faire relire par un professionnel avant le lancement.
- Pied de page commun (liens légaux) sur l'accueil, le site du réseau, les vitrines, les outils et ces pages (styles dans `marque.css`, pages dans `pages.css`).
- Référencement : `robots.txt`, `sitemap.xml`, titres, descriptions, adresses canoniques et aperçus de partage (Open Graph). Déclarer `https://ocaz.re/sitemap.xml` dans Google Search Console.
