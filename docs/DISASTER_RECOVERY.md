# Plan de reprise (Disaster Recovery)

## Scénarios

| Scénario | Action |
|---|---|
| Erreur applicative / données corrompues récentes | PITR Supabase (si activé) ou restauration du backup Supabase quotidien |
| Projet Supabase supprimé / inaccessible | Restauration depuis le dump externe dans un **nouveau** projet Supabase (procédure ci-dessous) |
| Fournisseur de backup indisponible | Les backups Supabase restent disponibles ; changer de bucket (secrets GitHub) |
| LiveAvatar / OpenAI / Resend indisponible | Dégradation : texte seul / pas d'email. Les mémoires restent intactes et exportables (voir §32 du cahier) |

## Procédure : restaurer dans un nouveau projet Supabase

1. Créer un nouveau projet Supabase (même région), noter l'URL, les clés et la chaîne de connexion.
2. Récupérer le dernier dump et le vérifier :
   ```bash
   aws s3 cp s3://$BUCKET/database/daily/<stamp>.dump.gpg . --endpoint-url $ENDPOINT
   gpg -d -o db.dump <stamp>.dump.gpg
   ```
3. Appliquer les migrations du dépôt sur le nouveau projet (`supabase link` puis `supabase db push`) pour recréer schéma, RLS, buckets.
4. Restaurer les données (utilisateurs `auth` puis `public`) :
   ```bash
   pg_restore --data-only --no-owner --disable-triggers -n auth -d "$NEW_DB_URL" db.dump
   pg_restore --data-only --no-owner --disable-triggers -n public -d "$NEW_DB_URL" db.dump
   ```
5. Restaurer les médias : déchiffrer chaque objet `media/<bucket>/<path>.enc` (format `iv(12) | tag(16) | ciphertext`, clé `scrypt(passphrase, "still-here-media-v1", 32)`, AES-256-GCM) et le réuploader dans le bucket Supabase correspondant au même chemin.
6. Mettre à jour les variables Vercel (URL, clés), redéployer, mettre à jour l'URL du webhook Stripe si le domaine change.
7. Vérifier : connexion d'un compte test, lecture de mémoires, photo, conversation, `npm run` des tests RLS sur le nouveau projet (`supabase test db --linked`).
8. Consigner l'incident (date, cause, RPO effectif, durée).

## Test

Le workflow **Restore test** exécute chaque semaine les étapes 2 et 4 dans une base isolée et compare les volumes restaurés aux comptages pris au moment du dump. Faire un exercice complet (étapes 1 à 7 sur un projet jetable) **au moins une fois avant le lancement**, puis chaque trimestre.
