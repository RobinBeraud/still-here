/**
 * Sauvegarde des médias (photos, audio, vidéos avatar) vers un stockage S3-compatible indépendant
 * (Cloudflare R2 / Backblaze B2 / S3). Incrémental : un objet déjà sauvegardé n'est pas recopié.
 * Chaque objet est chiffré côté client (AES-256-GCM) avant envoi : le fournisseur de backup ne voit jamais le contenu.
 * Exécuté par .github/workflows/backup.yml. Enregistre le résultat dans backup_runs.
 */
import { createCipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}`);
  return v;
};

const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const s3 = new S3Client({
  endpoint: env("BACKUP_S3_ENDPOINT"),
  region: process.env.BACKUP_S3_REGION || "auto",
  credentials: { accessKeyId: env("BACKUP_S3_ACCESS_KEY_ID"), secretAccessKey: env("BACKUP_S3_SECRET_ACCESS_KEY") },
});
const bucket = env("BACKUP_S3_BUCKET");
const key = scryptSync(env("BACKUP_ENCRYPTION_PASSPHRASE"), "still-here-media-v1", 32);

function encrypt(data: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  // Format : [iv(12)][tag(16)][ciphertext]
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

async function exists(objectKey: string) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    return true;
  } catch {
    return false;
  }
}

async function listAll(bucketName: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  const { data } = await db.storage.from(bucketName).list(prefix, { limit: 1000 });
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) out.push(...(await listAll(bucketName, path))); // dossier
    else out.push(path);
  }
  return out;
}

const { data: run } = await db.from("backup_runs").insert({ kind: "media", status: "running" }).select("id").single();
let copied = 0;
let bytes = 0;
let total = 0;
try {
  for (const b of ["media", "audio", "avatar-training"]) {
    const paths = await listAll(b);
    total += paths.length;
    for (const path of paths) {
      const objectKey = `media/${b}/${path}.enc`;
      if (await exists(objectKey)) continue;
      const { data: blob, error } = await db.storage.from(b).download(path);
      if (error || !blob) throw new Error(`download ${b}/${path}: ${error?.message}`);
      const raw = Buffer.from(await blob.arrayBuffer());
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: encrypt(raw),
          Metadata: { sha256: createHash("sha256").update(raw).digest("hex"), "content-type": blob.type },
        }),
      );
      copied++;
      bytes += raw.length;
    }
  }
  await db
    .from("backup_runs")
    .update({ status: "succeeded", finished_at: new Date().toISOString(), size_bytes: bytes, location: `s3://${bucket}/media/`, details: { copied, total } })
    .eq("id", run!.id);
  console.log(`✔ media backup: ${copied} new objects (${bytes} bytes), ${total} total`);
} catch (err) {
  await db.from("backup_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: String(err).slice(0, 1000) }).eq("id", run!.id);
  console.error(err);
  process.exit(1);
}
