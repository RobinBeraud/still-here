# Mise en production — pas à pas

Durée estimée : ~1 h 30. Faire tout d'abord avec les **clés de test** Stripe et `LIVEAVATAR_SANDBOX=true`.

## 1. Supabase

1. Créer un projet (région **EU**, plan Pro recommandé pour les backups quotidiens / PITR).
2. En local, avec le [CLI Supabase](https://supabase.com/docs/guides/local-development) :
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
3. Auth → URL Configuration : Site URL `https://<domaine>` ; Redirect URLs `https://<domaine>/auth/callback` (+ `http://localhost:3000/auth/callback`).
4. Auth → SMTP : brancher Resend (smtp.resend.com) pour que les emails de confirmation partent de votre domaine.
5. Storage → Settings : limite globale de taille de fichier ≥ 500 MB (vidéos avatar) si votre plan le permet.
6. Récupérer : Project URL, `anon` key, `service_role` key, chaîne de connexion « Session pooler ».

## 2. Fournisseurs

| Service | À faire | Variables |
|---|---|---|
| OpenAI | Clé API projet, limite de dépenses, vérifier la politique de rétention | `OPENAI_API_KEY` |
| LiveAvatar | Compte, clé API, choisir un avatar public pour l'interviewer | `LIVEAVATAR_API_KEY`, `LIVEAVATAR_DEFAULT_AVATAR_ID` |
| Resend | Vérifier le domaine d'envoi | `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_ALERT_EMAIL` |
| Stripe | Voir [BILLING.md](BILLING.md) → `npm run stripe:setup`, webhook, portail | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Backup | Voir [BACKUP.md](BACKUP.md) | secrets GitHub |

## 3. Vercel

1. Importer le dépôt GitHub `still-here` (framework Next.js détecté).
2. Renseigner **toutes** les variables de `.env.example` (Production + Preview), dont `NEXT_PUBLIC_APP_URL=https://<domaine>` et un `CRON_SECRET` aléatoire (`openssl rand -hex 32`).
3. Déployer. Le cron quotidien (`vercel.json`) appelle `/api/cron/daily` avec `Authorization: Bearer $CRON_SECRET`.
4. Ajouter le domaine, puis mettre à jour Supabase (Site URL) et Stripe (webhook) avec ce domaine.

## 4. GitHub

- Secrets Actions pour les backups (liste dans BACKUP.md).
- Settings → Code security : Secret scanning + Push protection, Dependabot alerts, CodeQL.
- Branch protection sur `main` : checks `app` et `RLS & schema tests` obligatoires.
- Lancer **Backup** puis **Restore test** manuellement et vérifier qu'ils sont verts.

## 5. Recette (Definition of Done)

Dérouler la checklist de [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) avec deux comptes (propriétaire + proche), puis :

- `stripe trigger` / paiement test 4242… → plan actif uniquement après webhook
- carte `4000 0000 0000 0341` (échec) → PAST_DUE, emails, puis grâce
- export ZIP lisible, suppression planifiée puis annulée

## 6. Passage en live

Clés Stripe live + nouveau `npm run stripe:setup` sur la base de prod, nouveau webhook live, `LIVEAVATAR_SANDBOX=false`, textes légaux validés.
