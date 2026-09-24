# Facturation

Code : `src/lib/services/{billing,billing-repo,entitlements,entitlements-repo,usage}.ts`, `src/lib/providers/stripe.ts`, `src/app/api/{billing,webhooks}`.

## Principes (addendum §3, §6, §8, §9, §10)

- `PaymentProvider` abstrait ; Stripe n'apparaît que dans `providers/stripe.ts`.
- Les droits sont des **entitlements** (lignes clé/valeur par source), jamais `if (plan === 'legacy')`.
- Un plan n'est activé **que** par un webhook signé. Le retour sur `success_url` affiche seulement « paiement en cours de confirmation ».
- Stripe = source de vérité des événements de paiement ; l'application = source de vérité des droits et usages.
- **Aucune donnée mémorielle n'est jamais supprimée par un événement de paiement.**

## Parcours

`/pricing` → compte → `POST /api/billing/checkout` → Stripe Checkout (CB, Apple Pay / Google Pay, codes promo) → webhook → entitlements → `/settings/billing`.

| Plan | Modèle | Checkout |
|---|---|---|
| Discover | gratuit | — |
| Still Here | 299 € + 79 €/an | `subscription` avec 2 lignes : prix unique `setup` + prix annuel `annual` |
| Legacy | 699 €, 5 ans inclus | `payment` ; entitlements `expires_at = +5 ans`, puis Preservation (renouvellement ~99 €/an à brancher) |
| Forever | sur devis | contact |

## Webhooks

`POST /api/webhooks/stripe` — événements à activer dans Stripe :
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`.

- **Signature** vérifiée (`STRIPE_WEBHOOK_SECRET`, distinct de `STRIPE_SECRET_KEY`).
- **Idempotence** : `billing_events.provider_event_id` unique ; doublon → `skipped` ; paiement enregistré une seule fois (`payments.provider_payment_id` unique).
- **Ordre indifférent** : l'état d'abonnement est toujours relu chez Stripe (`getSubscription`) ; un vieux `payment_failed` ne dégrade pas un compte régularisé.
- **Retry** : échec → HTTP 500 → Stripe rejoue ; `failed` → réconciliation par le cron quotidien (relecture de l'événement) ; alerte admin après 5 échecs ; événement bloqué en `processing` > 10 min → repris.
- Journalisation sans données de carte.

## Machine à états

```
ACTIVE ──payment_failed──► PAST_DUE ──(Stripe abandonne : unpaid/canceled)──► GRACE_PERIOD (30 j)
  ▲                          │                                                   │
  └───── invoice.paid ◄──────┴───────────────────────────────────────────────────┤
                                                                                 ▼ (cron)
                         annulation volontaire / remboursement total ──► PRESERVATION_ONLY
```

Preservation Only : lecture et export conservés ; Live Avatar, création d'avatar et nouveaux contenus suspendus. `CLOSED` n'est jamais posé automatiquement. Emails Resend à chaque transition.

## Quotas et usages

`UsageService.recordUsage` journalise : secondes avatar, caractères TTS, secondes STT, tokens LLM entrée/sortie, tokens embeddings, octets stockés, emails, exports — avec un coût estimé (`UNIT_COST_USD`, à ajuster). Les quotas sont calculés côté serveur (`getEntitlements`) : minutes avatar sur 365 jours glissants, nombre de proches, nombre de mémoires (gratuit), stockage.

Unit economics : requêtes SQL sur `usage_records` (coût) et `payments` (revenu) par plan et par utilisateur. Un tableau de bord interne est à construire (V2) ; exemple :

```sql
select b.plan_code, count(distinct b.user_id) users,
       sum(p.amount)/100.0 revenue_eur,
       sum(u.cost_estimate_usd) variable_cost_usd
from billing_accounts b
left join payments p on p.user_id = b.user_id
left join usage_records u on u.user_id = b.user_id
group by 1;
```

## Mise en place Stripe

1. `npm run stripe:setup` (clé test d'abord) : crée produits/prix (lookup keys) et remplit `plans.provider_price_ids`.
2. Dashboard → Developers → Webhooks : endpoint `https://<domaine>/api/webhooks/stripe`, événements ci-dessus → copier le secret dans `STRIPE_WEBHOOK_SECRET`.
3. Dashboard → Settings → Billing → **Customer portal** : activer mise à jour du moyen de paiement, factures, annulation (en fin de période).
4. Activer Apple Pay / Google Pay (Payment methods) et **Smart Retries** + emails de relance.
5. Tester avec la Stripe CLI : `stripe listen --forward-to localhost:3000/api/webhooks/stripe` puis `stripe trigger checkout.session.completed`.
