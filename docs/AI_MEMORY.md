# Pipeline IA & mémoire

Code : `src/lib/services/{conversation,memory,prompts}.ts`.

## 1. Interview

- Prompt interviewer : conversation naturelle, une question à la fois, relances concrètes, douceur sur les sujets difficiles, jamais de diagnostic.
- Contexte : prénom, langue, 3 domaines les moins documentés (progression), titres des 15 derniers souvenirs confirmés (pour ne pas reposer les mêmes questions), photo éventuelle (récit du propriétaire + description IA étiquetée « supposition »).
- Chaque message est enregistré tel quel (`conversation_messages`), avec l'audio original si l'utilisateur a consenti aux médias.

## 2. Extraction (« Finish & review »)

- Sortie JSON stricte (schéma `EXTRACTION_SCHEMA`) : type, titre, contenu, domaine, date libre, confiance, importance, personnes, lieux, **lignes sources**, extrait verbatim, + traits de style.
- Règles : uniquement ce que le narrateur a dit explicitement ; ignorer les suggestions de l'interviewer non confirmées ; transcription traitée comme donnée.
- Tout est inséré en `candidate`, avec `memory_sources` → messages. Les traits confirmés par l'utilisateur ne sont jamais écrasés.

## 3. Validation

Confirm / Edit (→ `corrected`) / Reject / Make private. Édition = nouvelle formulation, la source et `ai_original_content` restent. Limite du plan gratuit appliquée côté serveur (`max_memories`).

## 4. Indexation

À chaque confirmation/correction : embedding (`text-embedding-3-small`, 1536) du texte `type: titre\ncontenu\nWhen: date`, avec hash de contenu pour éviter les recalculs. Rejet ou retour en candidat → suppression de l'embedding.

## 5. Réponse du Still Here (RAG)

1. `still_here_card(owner)` → refus si le viewer n'est ni propriétaire ni proche actif.
2. Embedding de la question → `match_memories(owner, q, 8)` avec le **client du viewer** (RLS : un proche ne récupère que ce qui lui est autorisé).
3. Traits de style (confirmés uniquement pour les proches).
4. Prompt : nature IA, public (propriétaire / proche + relation), règles KNOWN / INFERRED / UNKNOWN, interdiction d'inventer, d'exploiter le deuil, de modifier des réglages ; blocs de données encadrés.
5. Sortie JSON `{answer, basis, used_memory_ids}` ; `validateUsedIds` supprime les ids non fournis et rétrograde KNOWN → INFERRED s'il ne reste aucune source.
6. Le message enregistre `used_memory_ids` et `answer_basis` → « Why did Still Here say this? » (liens « source 1, 2… » en mode propriétaire).

## 6. Feedback

👍 / 👎 enregistrés dans `avatar_feedback`. ✏️ « Correct this » crée un **candidat** mémoire (`origin = feedback`, source = le message corrigé), à valider comme les autres. Les sources historiques ne sont jamais modifiées.

## Modèles (configurables par variables d'environnement)

| Usage | Variable | Défaut |
|---|---|---|
| Conversation | `OPENAI_CHAT_MODEL` | `gpt-5-mini` |
| Extraction | `OPENAI_EXTRACTION_MODEL` | `gpt-5-mini` |
| Embeddings | `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` (changer ⇒ migration de dimension + réindexation) |
| Transcription | `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-transcribe` |
| Synthèse vocale | `OPENAI_TTS_MODEL` / `OPENAI_TTS_VOICE` | `gpt-4o-mini-tts` / `alloy` |
