# Architecture

## Vue d'ensemble

```
Navigateur ──► Next.js 16 (App Router, Vercel)
                 ├─ proxy.ts ............ rafraîchit la session Supabase, protège les routes
                 ├─ Server Components ... lecture via client Supabase de l'utilisateur (RLS)
                 ├─ Server Actions ...... mutations (mémoires, photos, proches, réglages)
                 ├─ API routes .......... chat, voix, avatar, extraction, billing, webhook, cron
                 └─ src/lib
                     ├─ providers/ ...... LLMProvider, VoiceProvider, AvatarProvider, EmailProvider, PaymentProvider
                     ├─ services/ ....... Memory Engine, conversation/RAG, entitlements, usage, billing, sharing, account
                     └─ supabase/ ....... clients user (RLS) / admin (service_role, serveur uniquement)
Supabase (EU) : Auth · PostgreSQL + pgvector + RLS · Storage privé
Externes : OpenAI · LiveAvatar (HeyGen) · Resend · Stripe · stockage S3-compatible de backup
GitHub Actions : CI, tests RLS, backup quotidien, test de restauration hebdomadaire
```

Le cœur du produit est **Memory Engine + Identity Model + Access Control**. Les fournisseurs sont remplaçables : aucun code spécifique OpenAI / LiveAvatar / Resend / Stripe hors de `src/lib/providers/`. Changer de fournisseur = nouvelle implémentation de l'interface + une ligne dans `providers/index.ts`.

## Flux principal

```
Utilisateur → Conversation (messages immuables) → Extraction (candidats + sources)
→ Validation utilisateur → Mémoire confirmée → Embedding (pgvector)
→ Question → identité du propriétaire → permissions (RLS) → match_memories()
→ contexte grounded → LLM (JSON : answer, basis, used_memory_ids) → texte / voix / avatar
```

## Clients Supabase

| Client | Clé | Usage |
|---|---|---|
| `createClient()` (server) | anon + cookie de session | **Toutes** les lectures utilisateur, y compris le RAG : RLS s'applique |
| `createClient()` (browser) | anon | Upload direct vers les buckets privés (policies par dossier `<uid>/`) |
| `createAdminClient()` | service_role | Webhooks, cron, écritures contrôlées (embeddings, avatar_profiles, audit, usage, export). Jamais pour lire au nom d'un viewer |

## Avatar temps réel

LiveAvatar en mode `FULL` + `PUSH_TO_TALK`, micro SDK coupé. L'avatar **ne converse pas seul** : l'app transcrit l'utilisateur (OpenAI), produit la réponse grounded (RAG), puis appelle `session.repeat(text)`. Ainsi les règles anti-hallucination s'appliquent aussi à la vidéo. La durée maximale de session est fixée côté serveur à partir du quota restant ; la durée facturée est calculée par horodatage serveur (`avatar_live_sessions`).

## Arborescence

```
src/
  proxy.ts
  app/
    (auth)/ login, signup, forgot-password, reset-password
    (app)/  dashboard, talk, memories, photos, meet, people, shared, settings
    api/    chat, sessions/[id]/extract, voice/*, avatar/session*, billing/*, webhooks/stripe, cron/daily
    auth/   callback, signout
    invite/[token], onboarding, pricing, legal/[doc]
  components/  conversation, memory-card, ui…
  lib/
    providers/  types, openai, liveavatar, resend, stripe, index
    services/   memory, conversation, prompts, progress, entitlements(+repo), usage, billing(+repo), sharing, account, avatar, emails, audit
supabase/
  migrations/  schéma, billing, RLS & accès, plans, sessions avatar
  tests/       rls.test.sql (pgTAP)
scripts/       stripe-setup, link-avatar, backup-media, record-backup, compare-counts
tests/         vitest (billing, entitlements, prompts)
```
