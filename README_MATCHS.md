# UE Clubiste — Module Matchs

## Fichiers ajoutés
- matchs.html : espace abonné / choix de place
- js/matchs.js : calendrier + choix de zone
- admin-matchs.html : gestion admin des matchs + statistiques
- js/admin-matchs.js : CRUD matchs + statistiques
- supabase/matchs.sql : tables, zones, RLS et règle Femme/Virages

## Fichiers mis à jour
- subscribers.html
- js/subscribers.js
- subscriber.html
- js/subscriber.js
- dashboard.html
- css/style.css
- supabase/functions/admin-create-user/index.ts

## Installation
1. Ouvrir Supabase > SQL Editor.
2. Exécuter `supabase/matchs.sql`.
3. Remplacer les fichiers du projet par ceux du ZIP.
4. Vérifier `js/config.js` avec l'URL et la clé publishable/anon du projet.
5. Pour chaque abonné, Admin doit choisir Sexe = Homme ou Femme.
6. Les femmes ne voient jamais Virage 1 et Virage 2 dans `matchs.html`.
7. La base de données bloque aussi un choix Femme -> VIRAGE_1/VIRAGE_2.
8. Pour la création d'abonné, redéployer l'Edge Function `admin-create-user` avec le fichier fourni.

## Navigation
Admin : Dashboard > Matchs
Abonné : Mon profil > Matchs

Aucun paiement, prix ou checkout n'est utilisé.
