# Ocaz

Ocaz, le logiciel des petits marchands de véhicules d'occasion (La Réunion), utilisable sur téléphone et sur PC.

## Version 1

- **Clients** : lister, rechercher, ajouter, modifier, supprimer.
- **Véhicules** : parcours Reprise à étudier → validée (En préparation / En stock) ou refusée → Réservé → Vendu.
  Fiche reprise : vendeur, état, cote estimée, frais, prix proposé, avec des liens vers les cotes gratuites (La Centrale, L'argus, Leboncoin).
  Idem pour lister et modifier, avec plaque, VIN, prix d'achat/vente, statut (En stock, Réservé, Vendu…).
  Le VIN remplit gratuitement la marque et l'année. La plaque remplit marque, modèle et finition via api-plaque.com (RapidAPI) :
  la clé se saisit dans le menu ⋯ de l'appli et reste sur l'appareil, elle n'est jamais dans ce dépôt.
- **Commandes** : relie un client et un véhicule, prix, acompte, statut. Le statut du véhicule suit la commande
  (En cours → Réservé, Livrée → Vendu, Annulée → En stock).
- Sauvegarde : export / import d'un fichier `.json` (menu ⋯).

## Une seule appli, trois profils

`ocaz.re` s'ouvre sur un accueil : « Particulier, je cherche une voiture » au centre, et un bouton « VERSION PRO » en haut à gauche qui ouvre la connexion unique (`./#pro` l'ouvre directement).
Couleurs : noirs et gris foncés avec le jaune de l'écran de chargement (jaune = couleur d'action en mode sombre) ; le bleu ne reste que dans les graphiques.
- **Particulier** : les véhicules du réseau (`/reseau`), sans compte.
- **Revendeur** et **Apporteur** : le même écran de connexion (Version pro), sans choix de profil ; l'appli ouvre l'espace qui correspond
  aux identifiants (garage ou apporteur). Déjà connecté : l'accueil est sauté.
- Un compte qui est à la fois garage et apporteur passe d'un espace à l'autre avec le bouton ⇄ de l'en-tête.
  Un garage ouvre son espace apporteur depuis Paramètres > Réseau Ocaz (`/apporteur?inscription`, contrat signé, même compte).
- `/apporteur` reste valable : sans connexion, il renvoie vers la connexion unique ; `/apporteur?inscription` ouvre l'inscription.

## Réseau Ocaz (apporteurs d'affaires et leads)

- **Garage** : Paramètres > Réseau Ocaz (rejoindre, commission fixe ou en %, partage d'office ou véhicule par véhicule).
  Chaque fiche véhicule a une case « Partager au réseau » et une commission propre si besoin. Onglet **Leads** : clients
  transmis par les apporteurs, prise en charge (fiche client, reprise à étudier, relance), vendu ou clos, commission versée,
  facture de l'apporteur. Le garage verse la commission lui-même : rien ne passe par Ocaz.
- **Apporteur** (`apporteur.html`, gratuit, inscription sur `/apporteur?inscription`) : inscription avec statut d'apporteur d'affaires et contrat signé en ligne,
  Suivi leads (en cours, clos, terminés), Données (commissions, ventes, leads en souffrance, taux de transformation),
  Réseau (choisir un véhicule et envoyer un client, avec son accord RGPD et une reprise éventuelle), Paramètres (infos, RIB,
  factures de commission, contrat). Démo : identifiant `apporteur`, mot de passe `test`.

## Technique

Appli web statique (HTML, CSS, JavaScript, sans build), hébergeable gratuitement sur GitHub Pages.
Les données sont pour l'instant stockées dans le navigateur de l'appareil (`localStorage`) ; tout passe par l'objet `db`
dans `app.js` pour pouvoir brancher une base en ligne (Supabase) et synchroniser téléphone et PC.

Pour l'essayer en local : ouvrir `index.html` dans un navigateur.

## Adresse ocaz.re

Le fichier `CNAME` (contenu : `ocaz.re`) relie l'appli au domaine. Il ne doit arriver sur `main` qu'une fois les DNS en place,
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

## Synchronisation PC / téléphone (Supabase)

1. Créer un compte gratuit sur supabase.com puis un projet.
2. Dans SQL Editor, coller le contenu de `supabase.sql` et cliquer sur Run.
3. Dans Authentication > URL Configuration, mettre l'adresse de l'appli dans Site URL et Redirect URLs.
4. Dans Project Settings > API, copier Project URL et la clé publique (anon / publishable), puis les coller dans le menu ⋯ de l'appli
   sur chaque appareil. Se connecter avec son email (lien de connexion reçu par email).

Toutes les données d'un compte sont dans une ligne JSON de la table `crm_data`, protégée par une règle d'accès (RLS).
La modification la plus récente l'emporte.

## Pages d'information et référencement

- `rejoindre` : pourquoi rejoindre le réseau (garages, apporteurs). Lien en bas du site du réseau (« Vous voulez faire partie du réseau ? »).
- `mentions-legales`, `confidentialite`, `cgu` : textes légaux. Les mentions surlignées `[…]` (nom, SIREN, adresse, téléphone, région Supabase, ville du tribunal) sont à compléter dans le générateur ou directement dans les fichiers. À faire relire par un professionnel avant le lancement.
- Pied de page commun (liens légaux) sur l'accueil, le site du réseau, les vitrines, les outils et ces pages (styles dans `marque.css`, pages dans `pages.css`).
- Référencement : `robots.txt`, `sitemap.xml`, titres, descriptions, adresses canoniques et aperçus de partage (Open Graph). Déclarer `https://ocaz.re/sitemap.xml` dans Google Search Console.
