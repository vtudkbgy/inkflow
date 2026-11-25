# Bons du banquier (jetons fictifs, page Détente)

Le banquier envoie ou reprend des jetons sans serveur : il publie un bon signé
dans `credits/bons.json` sur `main`. L'application lit ce fichier sur GitHub (au
démarrage, toutes les 10 minutes et à l'ouverture de Détente).

## Code client

Chaque appareil a un code client (10 caractères, par exemple `ABCDE-FGH23`),
affiché dans Détente › Banque › Ton compte, avec un bouton Copier. Le banquier
l'utilise pour adresser un bon à ce seul appareil. Le fichier public ne contient
qu'une empreinte du code (SHA-256 tronquée), jamais le code lui-même.

Le banquier peut noter les codes dans un carnet local
(`Documents\InkFlow-banquier\clients.json`, à côté de la clé privée, hors
dépôt) pour écrire `--pour Alex` au lieu du code.

## Types de bons

- **cadeau** : bouton « Récupérer N jetons » en haut de Détente et pastille sur
  le bouton Détente ; le clic crédite le solde.
- **prêt** (`--pret`) : comme un cadeau, et la même somme s'ajoute à la dette.
- **retrait** (`--retrait`) : débité sans clic, avec une notification. Le solde
  ne descend pas sous zéro : le manque s'ajoute à la dette.
- **annulation** (`annuler <id>`) : appliquée sans clic. Si le bon visé n'a pas
  encore été récupéré, il disparaît sans rien coûter. S'il l'a été, l'opération
  est inversée : cadeau repris, prêt repris avec la dette effacée d'autant,
  retrait rendu. C'est la bonne façon de corriger un envoi : ne pas émettre un
  retrait du même montant, qui toucherait aussi un appareil n'ayant pas encore
  récupéré le cadeau.

Chaque opération apparaît dans le relevé de compte (Détente › Banque).

## Sécurité

- Signature ECDSA P-256 / SHA-256. La clé privée reste sur le PC du banquier :
  `Documents\InkFlow-banquier\cle-privee-bons.pem`. Elle n'est jamais commitée
  et doit être sauvegardée.
- `app.js` contient seulement la clé publique (bloc `<bons-cle-publique>`). Elle
  permet de vérifier un bon, jamais d'en créer un. Le dépôt est public, mais
  personne ne peut forger un bon sans la clé privée.
- Le destinataire, la date d'émission, le montant et le message font partie de
  la signature : un bon modifié à la main, recopié pour un autre compte,
  inventé ou signé avec une autre clé est ignoré.
- Un bon adressé (`--pour`) ne vaut que pour l'appareil qui a ce code client. Un
  bon pour tous (`--tous`) ne vaut que pour les comptes ouverts avant son
  émission : une installation neuve ne récupère pas les anciens cadeaux et ne
  subit pas les anciens retraits.
- Les bons de l'ancien format (sans destinataire, avant les codes clients) ne
  sont acceptés que par les appareils déjà en service à ce moment-là.
- Sans serveur, ce qui a été appliqué est mémorisé sur l'appareil
  (`localStorage`, clé `inkflow.detente.bonsRecus.v1`). Si les données locales
  sont effacées, l'appareil reçoit un nouveau code client : les bons adressés à
  l'ancien code ne s'appliquent plus.
- Limite connue : le solde vit dans les données locales de l'appareil. Une
  personne qui modifie ces données à la main peut changer son solde ; seul un
  serveur l'empêcherait. Les bons, eux, ne peuvent pas être falsifiés.
- Le fichier est public : le message d'un bon est lisible par tous.

## Commandes (depuis la racine du dépôt)

```powershell
node scripts/bons-banquier.js client ajouter Alex ABCDE-FGH23
node scripts/bons-banquier.js client liste
node scripts/bons-banquier.js emettre 500 --pour Alex --message "Bravo pour ta semaine !"
node scripts/bons-banquier.js emettre 2000 --pour Alex --pret --jours 30
node scripts/bons-banquier.js emettre 300 --pour ABCDE-FGH23 --retrait --message "Remboursement"
node scripts/bons-banquier.js emettre 100 --tous --message "Cadeau pour tout le monde"
node scripts/bons-banquier.js annuler <id> --message "Erreur de montant"
node scripts/bons-banquier.js liste
node scripts/bons-banquier.js retirer <id>
node scripts/bons-banquier.js purger
```

`emettre` exige `--pour <nom ou code>` ou `--tous`. `emettre`, `annuler`,
`retirer` et `purger` publient directement sur `main` par l'API GitHub
(`gh api`), avec l'identité Git du dépôt, sans toucher à la copie de travail ni
à sa branche. `--essai` affiche le résultat sans rien publier. `--local` écrit le
fichier dans le dossier courant, à committer soi-même.

`retirer` enlève un bon du fichier : un bon déjà récupéré reste acquis. Pour
reprendre des jetons, utiliser `annuler`.

L'application voit un nouveau bon en quelques minutes : au plus 10 minutes si
elle reste ouverte, immédiatement à l'ouverture de Détente.

`init --force` remplace la clé : tous les bons déjà émis deviennent invalides et
l'application doit être republiée avec la nouvelle clé publique.
