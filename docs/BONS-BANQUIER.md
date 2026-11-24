# Bons du banquier (jetons fictifs, page Détente)

Le banquier envoie des jetons sans serveur : il publie un bon signé dans
`credits/bons.json` sur `main`. L'application lit ce fichier sur GitHub (au
démarrage, toutes les 10 minutes et à l'ouverture de Détente). Pour chaque bon
valide, elle affiche le bouton « Récupérer N jetons » en haut de la page Détente
et une pastille sur le bouton Détente de la barre latérale. Au clic, le solde est
crédité et le bouton disparaît avec une animation.

## Sécurité

- Signature ECDSA P-256 / SHA-256. La clé privée reste sur le PC du banquier :
  `Documents\InkFlow-banquier\cle-privee-bons.pem`. Elle n'est jamais commitée
  et doit être sauvegardée.
- `app.js` contient seulement la clé publique (bloc `<bons-cle-publique>`). Elle
  permet de vérifier un bon, jamais d'en créer un. Le dépôt est public, mais
  personne ne peut forger un bon sans la clé privée.
- Un bon modifié à la main (montant, message, date), inventé ou signé avec une
  autre clé est ignoré.
- Sans serveur, la récupération est mémorisée sur l'appareil
  (`localStorage`, clé `inkflow.detente.bonsRecus.v1`). Si les données locales
  sont effacées, un bon encore publié peut être récupéré de nouveau : la date
  d'expiration (60 jours par défaut) et `retirer`/`purger` limitent ce risque.
- Tous les appareils qui ont l'application voient le même bon : un bon vaut
  une fois par appareil.

## Commandes (depuis la racine du dépôt)

```powershell
node scripts/bons-banquier.js emettre 500 --message "Bravo pour ta semaine !"
node scripts/bons-banquier.js emettre 2000 --pret --jours 30
node scripts/bons-banquier.js liste
node scripts/bons-banquier.js retirer <id>
node scripts/bons-banquier.js purger
```

`emettre`, `retirer` et `purger` publient directement sur `main` par l'API GitHub
(`gh api`), avec l'identité Git du dépôt, sans toucher à la copie de travail ni
à sa branche. `--essai` affiche le résultat sans rien publier. `--local` écrit le
fichier dans le dossier courant, à committer soi-même.

L'application voit un nouveau bon en quelques minutes : au plus 10 minutes si
elle reste ouverte, immédiatement à l'ouverture de Détente.

`init --force` remplace la clé : tous les bons déjà émis deviennent invalides et
l'application doit être republiée avec la nouvelle clé publique.
