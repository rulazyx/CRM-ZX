# CRM ZX

CRM pour petits marchands de véhicules d'occasion (La Réunion), utilisable sur téléphone et sur PC.

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

## Technique

Appli web statique (HTML, CSS, JavaScript, sans build), hébergeable gratuitement sur GitHub Pages.
Les données sont pour l'instant stockées dans le navigateur de l'appareil (`localStorage`) ; tout passe par l'objet `db`
dans `app.js` pour pouvoir brancher une base en ligne (Supabase) et synchroniser téléphone et PC.

Pour l'essayer en local : ouvrir `index.html` dans un navigateur.

## Synchronisation PC / téléphone (Supabase)

1. Créer un compte gratuit sur supabase.com puis un projet.
2. Dans SQL Editor, coller le contenu de `supabase.sql` et cliquer sur Run.
3. Dans Authentication > URL Configuration, mettre l'adresse de l'appli dans Site URL et Redirect URLs.
4. Dans Project Settings > API, copier Project URL et la clé publique (anon / publishable), puis les coller dans le menu ⋯ de l'appli
   sur chaque appareil. Se connecter avec son email (lien de connexion reçu par email).

Toutes les données d'un compte sont dans une ligne JSON de la table `crm_data`, protégée par une règle d'accès (RLS).
La modification la plus récente l'emporte.
