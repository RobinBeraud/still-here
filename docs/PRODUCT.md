# Produit — Still Here

> Your stories. Your voice. Still here.

Référence : [cahier des charges MVP + V2](specs/Cahier_des_Charges_MVP_V2.txt) et [addendum business](specs/Addendum_Business_Pricing_Payments.txt).

## Principe fondamental

L'avatar n'est pas la personne. Still Here se présente toujours comme une **représentation IA** construite à partir des contenus et des choix du propriétaire.

## Les trois actifs (jamais confondus)

| Actif | Où | Règle |
|---|---|---|
| Vérité historique | `conversation_messages`, `media_assets.owner_story`, audio (bucket `audio`) | Jamais modifiée ni remplacée par un résumé |
| Mémoire structurée | `memories` (+ `memory_sources`) | Extraite par l'IA en `candidate`, validée par l'utilisateur |
| Personnage conversationnel | prompt construit à la volée (`src/lib/services/prompts.ts`) | N'utilise que les mémoires confirmées et autorisées |

## Parcours MVP (tous implémentés)

| Étape | Écran / route |
|---|---|
| Compte + vérification email, magic link, reset | `/signup`, `/login`, `/forgot-password`, `/auth/callback` |
| Consentements versionnés + onboarding | `/onboarding` |
| Dashboard « Good morning, Robin. Your Still Here is 37% complete. » + question du jour | `/dashboard` |
| Interviewer IA texte / voix / vidéo | `/talk`, `/talk/[id]` |
| Extraction → « I learned 7 things about you » | `/talk/[id]/review` |
| Confirmer / corriger / rejeter / rendre privé | cartes mémoire, `/memories/[id]` |
| Provenance « Why does Still Here know this? » | `/memories/[id]` |
| Photos + « Tell me the story behind this photo » | `/photos`, `/photos/[id]` |
| Modèle de personnalité (style uniquement) | `/memories/personality` |
| Avatar + voix (consentement → vidéo → traitement → prêt) | `/meet/avatar` |
| Meet My Still Here + 👍 / 👎 / ✏️ | `/meet`, `/meet/[id]` |
| Proches : invitation sécurisée, permissions, révocation | `/people`, `/invite/[token]` |
| Proche authentifié converse avec le Still Here | `/shared`, `/shared/[owner]/[id]` |
| Export complet (ZIP) + suppression | `/settings/privacy` |
| Pricing, Checkout, portail, états de facturation | `/pricing`, `/settings/billing` |

## Langue

L'interface est en anglais (formulations du cahier des charges). L'interviewer et le Still Here répondent dans la langue du profil (`profiles.language`). L'i18n de l'interface est prévue en V2.

## Hors périmètre MVP (V2)

Timeline, Memory/Family Graph, sessions de réminiscence, permissions avancées (FAMILY, PARTNER…), capsules temporelles, Legacy Contacts, contributions familiales, contradictions, Memory Book, Gift Still Here (table `gift_purchases` déjà prête), packs de minutes (clé `avatar_minutes_extra` déjà gérée).
