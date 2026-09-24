# Sécurité

## Règles appliquées dans le code

| Règle (cahier §18, §35) | Implémentation |
|---|---|
| RLS partout, DEFAULT DENY | Migration `…03` active RLS sur les 32 tables ; `revoke all … from anon` ; seules les policies explicites ouvrent l'accès |
| Tests User A vs User B | `supabase/tests/rls.test.sql` (24 assertions : mémoires, conversations, messages, photos, embeddings, RAG, permissions, révocation) exécutés en CI |
| service_role serveur uniquement | `SUPABASE_SERVICE_ROLE_KEY` n'a pas de préfixe `NEXT_PUBLIC_` ; `src/lib/env.ts` et `supabase/admin.ts` importent `server-only` |
| Aucun retrieval cross-user | `match_memories` est `SECURITY INVOKER` + filtre `owner_user_id` ; appelé avec le client du viewer |
| Buckets privés, URLs signées temporaires | 4 buckets `public = false` ; URLs signées 10 min (médias), 1 h (export) |
| Données RAG = données, jamais instructions | Blocs `<memories>`, `<traits>`, `<photo>`, `<data>` ; `sanitizeForPrompt` neutralise les balises ; tests d'injection |
| Le modèle ne peut pas modifier permissions/consentements | Aucun outil n'est exposé au LLM ; ces changements ne passent que par des Server Actions authentifiées |
| Invitation : token aléatoire à usage unique, hash seul stocké | 256 bits, SHA-256, expiration 14 j, acceptation atomique, email du compte = email invité |
| Paiement : aucun droit sur redirect client | Seul le webhook signé active un plan |
| Webhooks signés, idempotents | `constructEvent` + `billing_events.provider_event_id` unique |
| Synthèse vocale non détournable | `/api/voice/speak` ne synthétise qu'un message assistant existant de l'utilisateur |
| Suppression : réauthentification + confirmation | Mot de passe (ou connexion < 10 min) + saisie « DELETE » + délai de 7 jours |
| Colonnes sensibles non modifiables par le client | `GRANT UPDATE (colonnes…)` sur profiles, consents, sessions, invitations |
| Audit sans secrets ni conversations | `audit_logs` : action, cible, métadonnées minimales |
| En-têtes | HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy (micro/caméra self) |
| Redirections ouvertes | `next` limité aux chemins internes |

## Threat model (résumé)

| Menace | Mitigation |
|---|---|
| Un utilisateur lit les souvenirs d'un autre | RLS + tests A/B en CI |
| Un proche révoqué garde l'accès | `active_trusted_person_id` vérifie `status = 'active'` à chaque requête ; test de révocation |
| Prompt injection via un souvenir, une photo ou un proche | Données encadrées, balises neutralisées, aucune capacité d'action du LLM |
| Hallucination présentée comme un souvenir | Réponse JSON avec `basis` ; ids de sources validés ; KNOWN → INFERRED si aucune source réelle |
| Usurpation de voix / avatar | Consentement explicite versionné, avatar lié manuellement après vérification du consentement, TTS limité aux réponses existantes |
| Fraude au quota avatar | Durée max imposée au fournisseur, durée facturée côté serveur, clôture des sessions orphelines |
| Webhook forgé / rejoué | Signature Stripe, idempotence, relecture de l'état chez Stripe |
| Fuite de secrets | `.env*` ignorés, `.env.example` vide, secret scanning GitHub |
| Perte de données | Backups externes chiffrés + test de restauration réel (voir BACKUP.md) |

## À activer sur GitHub (dépôt privé)

- Settings → Code security : **Secret scanning**, **Push protection**, **Dependabot alerts**, **Code scanning (CodeQL)**
- Branch protection sur `main` : PR obligatoire, CI verte (`app`, `RLS & schema tests`)

## Limites connues (à traiter avant lancement public)

- Pas de rate limiting applicatif sur `/api/chat` et `/api/voice/*` (ajouter Upstash/Vercel Firewall).
- MFA prévue en V2 (Supabase Auth la supporte).
- Revue juridique des textes légaux (`/legal/*` sont des brouillons).
