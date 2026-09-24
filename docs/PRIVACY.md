# Confidentialité & données personnelles

## Principes

- Les souvenirs appartiennent à l'utilisateur : privés par défaut (`OWNER_ONLY`), exportables à tout moment, jamais vendus, jamais utilisés pour entraîner un modèle externe.
- Minimisation : les fournisseurs ne reçoivent que ce qui est nécessaire à leur fonction.
- Consentements granulaires, versionnés, datés et révocables (`consents`).

## Consentements

| Type | Requis | Effet de la révocation |
|---|---|---|
| terms, privacy, ai_processing, memory_storage | oui | Révocation = suppression du compte |
| media | non | Plus d'upload photo ni de conservation audio |
| avatar, voice | non | Avatar désactivé immédiatement (`avatar_profiles.status = disabled`) |

Changer une version dans `src/lib/constants.ts` (`CONSENTS`) force une nouvelle acceptation à la prochaine visite.

## Données biométriques (avatar & voix)

Vidéo d'entraînement et voix = données sensibles. Consentement explicite dédié, usage limité au Still Here de la personne, jamais publicitaire, vidéo source supprimable (« Disable my avatar and delete my video »). **Toute évolution de ce traitement nécessite une validation Product Owner + juridique.**

## Sous-traitants

| Fournisseur | Données | Rôle |
|---|---|---|
| Supabase (région EU à choisir) | tout | base, auth, stockage |
| OpenAI | messages, questions, images (URL signée 10 min), audio | conversation, extraction, embeddings, transcription, TTS — vérifier l'option zero-retention / DPA |
| LiveAvatar (HeyGen) | texte des réponses, vidéo d'entraînement (création manuelle) | avatar vidéo |
| Resend | email, prénom | emails transactionnels |
| Stripe | email, paiement | facturation (Still Here ne voit jamais les numéros de carte) |
| Stockage de backup | dumps chiffrés | reprise après sinistre |

## Droits des personnes

- Accès / portabilité : « Download everything Still Here knows about me » (ZIP : JSON + photos + audio + README.html).
- Effacement : « Delete my Still Here » → délai de rétractation de 7 jours → suppression des fichiers, annulation des abonnements, suppression de l'utilisateur (cascade). Les paiements sont conservés sans lien utilisateur (obligation comptable). Les backups chiffrés expirent selon leur rétention (≤ 12 mois).
- Les proches perdent l'accès dès la demande de suppression.

## Proches

Un proche n'accède qu'après authentification avec l'adresse invitée, uniquement aux mémoires confirmées partagées avec lui, et toujours avec la mention « représentation IA ». Ses propres conversations ne sont pas visibles par le propriétaire.

## Points à valider avant lancement

- DPA avec chaque sous-traitant, registre des traitements, AIPD (données biométriques + personnes âgées).
- Textes légaux définitifs (`/legal/privacy`, `/legal/terms`).
- Politique de conservation long terme et accès post-mortem (V2) : **décision Product Owner**.
