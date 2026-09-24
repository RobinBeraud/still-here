# Still Here

> Your stories. Your voice. Still here.

Double numérique mémoriel : l'utilisateur raconte sa vie à un interviewer IA, valide les souvenirs extraits, crée son avatar et sa voix, puis partage son Still Here avec les proches qu'il choisit. L'avatar se présente toujours comme une représentation IA et n'invente jamais de souvenirs.

**Stack** : Next.js 16 · React 19 · TypeScript · Tailwind 4 · Supabase (Auth, Postgres, pgvector, Storage, RLS) · OpenAI · LiveAvatar (HeyGen) · Resend · Stripe · Vercel · GitHub Actions

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs
supabase start               # base locale (Docker) — ou lier un projet distant
supabase db push
npm run dev
```

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | TypeScript |
| `npm test` | tests unitaires (billing, droits, anti-hallucination, injection) |
| `supabase test db` | tests RLS User A vs User B (pgTAP) |
| `npm run stripe:setup` | crée les produits/prix Stripe et les relie aux plans |
| `npm run avatar:link -- <user> <avatar> [voice]` | active un avatar personnel créé dans LiveAvatar |

## Documentation

| Doc | Contenu |
|---|---|
| [PRODUCT](docs/PRODUCT.md) | vision, parcours, écrans |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | composants, flux, fournisseurs |
| [DATABASE](docs/DATABASE.md) | schéma, choix, fonctions |
| [SECURITY](docs/SECURITY.md) | règles, threat model |
| [AI_MEMORY](docs/AI_MEMORY.md) | interview, extraction, RAG, anti-hallucination |
| [BACKUP](docs/BACKUP.md) · [DISASTER_RECOVERY](docs/DISASTER_RECOVERY.md) | sauvegardes, restauration |
| [PRIVACY](docs/PRIVACY.md) | consentements, sous-traitants, droits |
| [BILLING](docs/BILLING.md) · [PRICING_EXPERIMENTS](docs/PRICING_EXPERIMENTS.md) | paiement, droits, quotas, tests de prix |
| [IMPLEMENTATION_PLAN](docs/IMPLEMENTATION_PLAN.md) | avancement, Definition of Done, décisions PO |
| [DEPLOY](docs/DEPLOY.md) | mise en production pas à pas |

Specs d'origine : [cahier des charges](docs/specs/Cahier_des_Charges_MVP_V2.txt) · [addendum business](docs/specs/Addendum_Business_Pricing_Payments.txt).
