# Politique de Sécurité & Contrôle d'Accès — Plume Studio Pro

## Accès et Contributions Autorisées

Ce dépôt est configuré pour le travail collaboratif entre l'auteur du projet et les collaborateurs explicitement autorisés sur GitHub (`Settings > Collaborators and teams`).

- **Branches protégées** : La branche `main` est destinée au code validé par la suite de tests automatisés (`npm test` et `npm run verify:webview2`).
- **Pull Requests** : Toute contribution externe ou d'un membre autorisé doit passer par une Pull Request vérifiée par le workflow GitHub Actions CI.
- **Exécution 100 % locale** : L'application Plume Studio Pro traite tous les cahiers, traits vectoriels et fichiers PDF **100 % en local et hors-ligne** (via IndexedDB, `pdfjs-dist` local et `pdf-lib`). Aucune note ni aucun document PDF n'est envoyé vers un serveur externe.

## Signaler une vulnérabilité

Si vous identifiez un problème de sécurité (dans l'application Web, la configuration CSP Tauri v2 ou un script), veuillez ouvrir une issue privée ou contacter directement le propriétaire du dépôt.
