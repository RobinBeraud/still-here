/**
 * Enregistre le résultat d'une étape de backup (utilisé par les workflows GitHub Actions).
 * Usage : node scripts/record-backup.mts <kind> <status> [location] [size_bytes] [checksum] [error]
 */
import { createClient } from "@supabase/supabase-js";

const [kind, status, location, size, checksum, error] = process.argv.slice(2);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { error: err } = await db.from("backup_runs").insert({
  kind,
  status,
  location: location || null,
  size_bytes: size ? Number(size) : null,
  checksum: checksum || null,
  error: error || null,
  finished_at: new Date().toISOString(),
});
if (err) {
  console.error(err);
  process.exit(1);
}
console.log(`recorded ${kind} ${status}`);
