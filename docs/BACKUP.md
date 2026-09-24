# Sauvegardes

Les souvenirs sont potentiellement irremplaçables : une panne ou la suppression du projet Supabase ne doit jamais signifier leur perte.

## Dispositif

| Couche | Fréquence | Où | Chiffrement |
|---|---|---|---|
| Backups Supabase (plan Pro : quotidiens, PITR en option) | continu / quotidien | Supabase | Supabase |
| Dump PostgreSQL complet (`pg_dump -Fc`, PG 17) | quotidien 02:17 UTC | bucket S3-compatible indépendant (R2 / B2 / S3) | GPG AES-256 (passphrase `BACKUP_ENCRYPTION_PASSPHRASE`) |
| Médias (photos, audio, vidéos avatar) | quotidien, incrémental | même bucket, préfixe `media/` | AES-256-GCM côté client, par objet |
| Test de restauration | hebdomadaire (lundi 04:43 UTC) | base PostgreSQL éphémère isolée | — |

Workflows : `.github/workflows/backup.yml`, `.github/workflows/restore-test.yml`. GitHub n'est qu'un exécuteur : **aucune donnée utilisateur n'est stockée dans GitHub** (pas d'artefact, pas de cache).

Chaque exécution écrit une ligne dans `backup_runs` (kind, statut, emplacement, taille, SHA-256). Le cron quotidien alerte `ADMIN_ALERT_EMAIL` (niveau **critique**) si aucun backup base valide depuis **plus de 26 h**. Un test de restauration en échec apparaît dans `backup_runs` (`restore_test` / `failed`) et fait échouer le workflow (notification GitHub).

## RPO / RTO

- RPO MVP : **≤ 24 h** (dump quotidien). Cible : ≤ 1 h → activer le PITR Supabase et/ou passer le dump à toutes les heures.
- RTO visé : < 4 h (voir DISASTER_RECOVERY.md).

## Rétention (à configurer sur le bucket)

| Préfixe | Rétention |
|---|---|
| `database/daily/` | 30 jours |
| `database/weekly/` | 12 semaines |
| `database/monthly/` | 12 mois |
| `media/` | versioning activé, versions non courantes supprimées après 30 jours |

Activer **Object Lock / immutabilité** (mode governance) si le fournisseur le permet (R2 : bucket locks ; B2 : Object Lock ; S3 : Object Lock).

⚠️ Alignement avec la suppression de compte : un compte supprimé disparaît des backups au plus tard à l'expiration de la rétention (12 mois). C'est indiqué dans la politique de confidentialité. **Décision Product Owner requise** avant de modifier cette durée.

## Mise en place

1. Créer un bucket privé chez un fournisseur **différent** de Supabase (ex. Cloudflare R2), avec règles de cycle de vie ci-dessus.
2. Créer une clé API limitée à ce bucket (lecture + écriture, pas de suppression si Object Lock).
3. Générer une passphrase forte et la stocker **hors GitHub** aussi (gestionnaire de mots de passe) : sans elle, les backups sont illisibles.
4. Ajouter les secrets GitHub (Settings → Secrets → Actions) : `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` (chaîne « Session pooler » du dashboard Supabase), `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_ENCRYPTION_PASSPHRASE`.
5. Lancer manuellement **Backup** puis **Restore test** (Actions → Run workflow). Un backup n'est déclaré fonctionnel qu'après un test de restauration vert.
