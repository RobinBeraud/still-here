# Base de données

Migrations versionnées dans `supabase/migrations/` (appliquées dans l'ordre). Toute modification passe par une nouvelle migration.

| Migration | Contenu |
|---|---|
| `…01_core_schema` | profils, consentements, conversations, entités, mémoires, sources, médias, embeddings, personnalité, avatar, proches, invitations, audit, backups, exports |
| `…02_billing` | plans, billing_accounts, subscriptions, payments, entitlements, usage_records, billing_events, gift_purchases |
| `…03_rls_and_access` | RLS partout, fonctions d'accès, `match_memories`, buckets et policies Storage |
| `…04_plans_seed` | 4 plans (hypothèses de prix) |
| `…05_avatar_sessions` | sessions Live Avatar (durée facturée côté serveur) |

## Choix de modélisation

- **`memories` typée** : les types EVENT, VALUE, PREFERENCE, OPINION, ADVICE, QUOTE, LIFE_PERIOD vivent dans une seule table (`type` + `details jsonb`) plutôt que 7 tables. Cela garde un seul cycle de validation, un seul index vectoriel et une seule règle d'accès. `people`, `places`, `relationships` restent des entités distinctes, reliées par `memory_people` / `memory_places`.
- **Provenance** : `memory_sources` pointe vers `conversation_messages`, `media_assets` ou une saisie utilisateur. `memories.ai_original_content` conserve la première formulation IA.
- **Immuabilité** : `conversation_messages` n'a ni UPDATE ni DELETE pour `authenticated`.
- **Conversations des proches** : `conversation_sessions.user_id` (qui parle) ≠ `subject_user_id` (quel Still Here). Le propriétaire ne lit pas les conversations de ses proches.
- **Paiements** : `payments.user_id ON DELETE SET NULL` (obligations comptables) ; tout le reste cascade à la suppression du compte.
- **Embeddings** : `vector(1536)` (text-embedding-3-small), index HNSW cosinus, uniquement pour les mémoires `confirmed`/`corrected`.

## Statuts et niveaux

- `memories.status` : `candidate` → `confirmed` | `corrected` | `rejected`
- `privacy_level` : `OWNER_ONLY` (défaut), `ALL_AUTHORIZED_LOVED_ONES`, `SPECIFIC_PEOPLE` (+ `access_permissions`)
- `billing_accounts.billing_state` : `ACTIVE` → `PAST_DUE` → `GRACE_PERIOD` → `PRESERVATION_ONLY` (→ `CLOSED`, jamais automatique)

## Fonctions

| Fonction | Sécurité | Rôle |
|---|---|---|
| `active_trusted_person_id(owner)` | definer | Le viewer est-il un proche actif (et le compte non en suppression) ? |
| `can_view_item(owner, privacy, memory, media)` | definer | Règle unique de visibilité |
| `still_here_card(owner)` | definer | Nom, langue, état avatar : propriétaire ou proche actif uniquement |
| `match_memories(owner, vector, k)` | **invoker** | Recherche sémantique ; RLS appliqué, filtre explicite par propriétaire |

## Commandes

```bash
supabase db push            # appliquer les migrations au projet lié
supabase test db            # tests RLS pgTAP (base locale)
```
