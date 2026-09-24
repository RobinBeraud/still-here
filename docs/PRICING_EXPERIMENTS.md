# Expérimentations de prix

Les prix de l'addendum sont des **hypothèses**. L'architecture permet de les tester sans migration lourde :

| Levier | Où | Changement de code ? |
|---|---|---|
| Prix affichés, textes, puces | `plans.display_*`, `features`, `tagline` | non (SQL) |
| Droits / quotas d'un plan | `plans.entitlements` (appliqués aux nouveaux achats) | non |
| Prix facturés | nouveau `lookup_key` dans `scripts/stripe-setup.mts` puis `npm run stripe:setup` | script uniquement |
| Nouveau plan | ligne `plans` + prix Stripe | non |
| Droits individuels (geste commercial, test) | ligne `entitlements` avec `source = 'admin:<raison>'` | non |
| Codes promo | Stripe (Checkout accepte les codes) | non |

## Hypothèses à tester

| # | Hypothèse | Métrique | Seuil de décision |
|---|---|---|---|
| H1 | 299 € + 79 €/an est acceptable pour un individuel | conversion pricing → paid | à définir avec le PO |
| H2 | 699 € avec 5 ans inclus séduit les familles | part de Legacy dans les ventes | |
| H3 | Le cadeau (enfant → parent) est le premier canal | part des achats Gift (V2) | |
| H4 | 5 h/an de vidéo suffisent | % d'utilisateurs à court de minutes | < 10 % |
| H5 | La marge brute reste positive | revenu − coûts variables (`usage_records`) par plan | > 70 % |

## Mesures MVP (addendum §17)

Toutes calculables en SQL à partir des tables existantes :

- visite → compte (analytics web à brancher) ; compte → première interview (`conversation_sessions` kind interview) ; interview → première mémoire confirmée (`memories.confirmed_at`)
- souvenirs à J7 / J30 ; taux Meet My Still Here (`kind = meet_self`) ; free → paid (`billing_accounts.plan_code`)
- ARPU (`payments`) ; coût variable (`usage_records.cost_estimate_usd`) ; minutes avatar (`metric = avatar_seconds`)
- invitation d'un proche (`trusted_people`) ; activation (`status = active`) ; renouvellement (`subscriptions`)

## Journal des expériences

| Date | Changement | Résultat | Décision |
|---|---|---|---|
| | | | |
