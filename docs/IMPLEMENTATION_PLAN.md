# Plan d'implémentation

Ordre du cahier (§34). Chaque fonctionnalité suit : Database → RLS → Server Logic → UI → Tests → Security Review.

| Sprint | Objectif | État |
|---|---|---|
| 1 | Fondations : repo, env, Supabase, Auth, schéma, migrations, RLS, dashboard | ✅ code livré |
| 2 | Mémoire : interviewer texte, conversations, extraction, review, provenance | ✅ |
| 3 | Digital Self : pgvector, RAG, anti-hallucination, Meet My Still Here, feedback | ✅ |
| 4 | Médias : photos, récits, personnes, relations | ✅ (liens personnes/lieux automatiques ; édition manuelle des relations en V2) |
| 5 | Avatar : LiveAvatar, voix, avatar personnel | ✅ parcours + session temps réel ; création du jumeau numérique = étape manuelle console + `npm run avatar:link` |
| 6 | Partage : proches, Resend, invitations, permissions, expérience proche | ✅ |
| 7 | Confiance : export, suppression, audit, backups, DR | ✅ code ; ⏳ premier backup + test de restauration à exécuter après mise en production |
| 8 | Hardening : tests RLS/E2E, sécurité, UX, monitoring | 🟡 tests unitaires + RLS ; E2E (Playwright), rate limiting, monitoring (Sentry) à ajouter |
| + | Billing (addendum) : pricing, checkout, webhooks, entitlements, quotas, grâce, preservation | ✅ |

## Définition de Done du MVP (§20) — à valider en environnement réel

- [ ] Créer son compte
- [ ] Parler à l'interviewer
- [ ] Générer puis valider/corriger ses souvenirs
- [ ] Importer des photos et raconter leur histoire
- [ ] Construire son modèle de personnalité
- [ ] Créer son avatar
- [ ] Parler à son propre Still Here
- [ ] Corriger les réponses
- [ ] Ajouter un proche, définir les souvenirs accessibles, l'inviter
- [ ] Le proche converse avec le Still Here autorisé
- [ ] Exporter ses données
- [ ] Supprimer son compte
- [ ] Démontrer RLS (CI verte), backups + restauration (workflows verts), audit, secrets

## Décisions Product Owner en attente

1. Durée de rétention des backups vs suppression (proposé : 12 mois max).
2. Délai de rétractation avant suppression (proposé : 7 jours).
3. Durée de la période de grâce (proposé : 30 jours, `BILLING_GRACE_PERIOD_DAYS`).
4. Le propriétaire peut-il lire les conversations de ses proches avec son Still Here ? (implémenté : **non**).
5. Politique de conservation long terme en Preservation Only (aucune suppression automatique implémentée).
6. Renouvellement Legacy après 5 ans (~99 €/an) : produit Stripe à créer.

## Prochaines étapes V2

Timeline, Family Graph, sessions de réminiscence, permissions avancées, capsules temporelles, Legacy Contacts, contributions familiales, Gift Still Here, packs de minutes, Memory Book, i18n de l'interface, MFA.
