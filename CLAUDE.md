# Still Here — règles pour Claude Code

Specs : `docs/specs/`. Docs de référence : `docs/`. Lire `docs/ARCHITECTURE.md` avant de modifier du code.

## Règles impératives (cahier §35, addendum §18)

- Pour chaque fonctionnalité : Database (migration) → RLS → Server Logic → UI → Tests → Security Review.
- Toute modification DB = nouvelle migration dans `supabase/migrations/` ; ajouter les tests RLS correspondants dans `supabase/tests/`.
- Ne jamais désactiver RLS, ne jamais exposer `service_role` au navigateur, ne jamais rendre public un bucket, ne jamais committer de secret.
- Le RAG utilise toujours le client Supabase **du viewer** (`createClient`), jamais `createAdminClient`.
- Une extraction LLM n'est jamais confirmée sans validation utilisateur ; la source originale n'est jamais supprimée ni modifiée.
- Code fournisseur (OpenAI, LiveAvatar, Resend, Stripe) uniquement dans `src/lib/providers/`.
- Droits = entitlements, jamais `if (plan === '…')`. Aucun droit sur redirect client : webhook vérifié uniquement.
- Aucun événement de paiement ne supprime de données mémorielles.
- Ne pas commencer la V2 avant que le MVP soit stable.
- **Stopper et demander au Product Owner** avant toute décision irréversible : confidentialité, sécurité, consentement, accès post-mortem, biométrie/avatar, suppression ou rétention des backups.

## Conventions

- UI en anglais, docs et commentaires en français.
- Next.js 16 : `src/proxy.ts` (pas de middleware.ts), `params`/`searchParams`/`cookies()` sont asynchrones.
- Vérifier avant de pousser : `npm run typecheck && npm test && npm run build`.
