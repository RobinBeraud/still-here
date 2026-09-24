import "server-only";
import JSZip from "jszip";
import { createAdminClient } from "@/lib/supabase/admin";
import { providers } from "@/lib/providers";
import { DELETION_DELAY_DAYS, EXPORT_URL_TTL_SECONDS } from "@/lib/constants";
import { audit } from "./audit";
import { recordUsage } from "./usage";
import { sendSecurityNotice } from "./emails";

// ------------------------------------------------------------------ export

const EXPORT_TABLES: { table: string; ownerColumn: string; file: string }[] = [
  { table: "profiles", ownerColumn: "id", file: "profile.json" },
  { table: "memories", ownerColumn: "owner_user_id", file: "memories.json" },
  { table: "memory_sources", ownerColumn: "owner_user_id", file: "memory_sources.json" },
  { table: "people", ownerColumn: "owner_user_id", file: "people.json" },
  { table: "relationships", ownerColumn: "owner_user_id", file: "relationships.json" },
  { table: "places", ownerColumn: "owner_user_id", file: "places.json" },
  { table: "memory_people", ownerColumn: "owner_user_id", file: "memory_people.json" },
  { table: "memory_places", ownerColumn: "owner_user_id", file: "memory_places.json" },
  { table: "memory_media_links", ownerColumn: "owner_user_id", file: "memory_media_links.json" },
  { table: "personality_traits", ownerColumn: "owner_user_id", file: "personality.json" },
  { table: "media_assets", ownerColumn: "owner_user_id", file: "photos.json" },
  { table: "trusted_people", ownerColumn: "owner_user_id", file: "loved_ones.json" },
  { table: "access_permissions", ownerColumn: "owner_user_id", file: "permissions.json" },
  { table: "consents", ownerColumn: "user_id", file: "consents.json" },
  { table: "avatar_feedback", ownerColumn: "owner_user_id", file: "avatar_feedback.json" },
  { table: "conversation_sessions", ownerColumn: "user_id", file: "conversations/sessions.json" },
  { table: "conversation_messages", ownerColumn: "user_id", file: "conversations/messages.json" },
  { table: "payments", ownerColumn: "user_id", file: "billing/payments.json" },
];

const README = (name: string, date: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Still Here archive</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6;color:#2b2320}code{background:#f3ece4;padding:2px 5px;border-radius:4px}</style></head><body>
<h1>Still Here — archive of ${name}</h1>
<p>Generated on ${date}. This archive is yours. It is readable without Still Here.</p>
<ul>
<li><code>profile.json</code> — your profile</li>
<li><code>memories.json</code> — structured memories (status: candidate / confirmed / corrected / rejected) and <code>memory_sources.json</code> — where each one came from</li>
<li><code>people.json</code>, <code>places.json</code>, <code>relationships.json</code> and link files</li>
<li><code>personality.json</code> — your communication style</li>
<li><code>conversations/</code> — every original conversation, unmodified</li>
<li><code>photos/</code> and <code>photos.json</code> — your photos and the stories behind them</li>
<li><code>audio/</code> — voice recordings</li>
<li><code>loved_ones.json</code>, <code>permissions.json</code>, <code>consents.json</code></li>
</ul>
<p>Dates are ISO 8601 (UTC). Identifiers are UUIDs that link files together.</p>
</body></html>`;

/** « Download everything Still Here knows about me » — ZIP portable, lien signé temporaire. */
export async function createExport(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: job } = await admin.from("data_exports").insert({ user_id: userId }).select("id").single();
  if (!job) throw new Error("Could not start export");

  try {
    const zip = new JSZip();
    let displayName = "you";
    for (const t of EXPORT_TABLES) {
      const { data, error } = await admin.from(t.table).select("*").eq(t.ownerColumn, userId);
      if (error) throw new Error(`${t.table}: ${error.message}`);
      if (t.table === "profiles" && data?.[0]) displayName = data[0].preferred_name || data[0].first_name || displayName;
      zip.file(t.file, JSON.stringify(data ?? [], null, 2));
    }

    const { data: media } = await admin.from("media_assets").select("bucket, path, filename").eq("owner_user_id", userId);
    for (const m of media ?? []) {
      const { data: blob } = await admin.storage.from(m.bucket).download(m.path);
      if (blob) zip.file(`photos/${m.path.split("/").pop()}`, new Uint8Array(await blob.arrayBuffer()));
    }
    const { data: audio } = await admin.storage.from("audio").list(userId, { limit: 1000 });
    for (const a of audio ?? []) {
      const { data: blob } = await admin.storage.from("audio").download(`${userId}/${a.name}`);
      if (blob) zip.file(`audio/${a.name}`, new Uint8Array(await blob.arrayBuffer()));
    }
    zip.file("README.html", README(displayName, new Date().toISOString()));

    const content = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const path = `${userId}/${job.id}.zip`;
    const { error: upErr } = await admin.storage.from("exports").upload(path, content, { contentType: "application/zip", upsert: true });
    if (upErr) throw new Error(upErr.message);

    await admin.from("data_exports").update({ status: "ready", path, completed_at: new Date().toISOString() }).eq("id", job.id);
    await recordUsage(userId, [{ metric: "exports", quantity: 1 }]);
    await audit({ actor: userId, subject: userId, action: "account.export", targetId: job.id });
    await sendSecurityNotice(userId, "Your Still Here export was created", [
      "An export of all your Still Here data was just generated. If this wasn't you, please secure your account.",
    ]).catch(() => undefined);

    const { data: signed } = await admin.storage.from("exports").createSignedUrl(path, EXPORT_URL_TTL_SECONDS, { download: "still-here-archive.zip" });
    if (!signed) throw new Error("Could not sign export URL");
    return signed.signedUrl;
  } catch (err) {
    await admin.from("data_exports").update({ status: "failed", error: err instanceof Error ? err.message : String(err) }).eq("id", job.id);
    throw err;
  }
}

// ------------------------------------------------------------------ suppression

/** Planifie la suppression (délai de rétractation). L'accès des proches est coupé immédiatement. */
export async function requestDeletion(userId: string) {
  const admin = createAdminClient();
  const now = new Date();
  const scheduled = new Date(now.getTime() + DELETION_DELAY_DAYS * 86_400_000);
  await admin.from("profiles").update({ deletion_requested_at: now.toISOString(), deletion_scheduled_for: scheduled.toISOString() }).eq("id", userId);
  await audit({ actor: userId, subject: userId, action: "account.deletion_requested", metadata: { scheduled_for: scheduled.toISOString() } });
  await sendSecurityNotice(userId, "Your Still Here is scheduled for deletion", [
    `Your Still Here and all its data will be permanently deleted on ${scheduled.toUTCString()}.`,
    "Loved ones no longer have access. You can cancel this from your settings until then.",
    "Encrypted backups are purged according to their retention schedule (up to 12 months), as described in our privacy policy.",
  ]).catch(() => undefined);
  return scheduled;
}

export async function cancelDeletion(userId: string) {
  await createAdminClient().from("profiles").update({ deletion_requested_at: null, deletion_scheduled_for: null }).eq("id", userId);
  await audit({ actor: userId, subject: userId, action: "account.deletion_cancelled" });
}

async function removeFolder(bucket: string, userId: string) {
  const admin = createAdminClient();
  for (;;) {
    const { data } = await admin.storage.from(bucket).list(userId, { limit: 100 });
    if (!data || data.length === 0) return;
    await admin.storage.from(bucket).remove(data.map((f) => `${userId}/${f.name}`));
  }
}

/** Exécutée par le cron après le délai. Supprime médias, abonnements actifs, puis l'utilisateur (CASCADE). */
export async function executeDueDeletions(): Promise<number> {
  const admin = createAdminClient();
  const { data: due } = await admin.from("profiles").select("id").lte("deletion_scheduled_for", new Date().toISOString()).not("deletion_requested_at", "is", null);
  let done = 0;
  for (const { id } of due ?? []) {
    try {
      const { data: subs } = await admin.from("subscriptions").select("provider_subscription_id, status").eq("user_id", id);
      for (const s of subs ?? []) {
        if (["active", "trialing", "past_due", "unpaid"].includes(s.status)) await providers.payment().cancelSubscription(s.provider_subscription_id);
      }
      for (const bucket of ["media", "audio", "avatar-training", "exports"]) await removeFolder(bucket, id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error(error.message);
      await audit({ actor: null, subject: id, action: "account.deleted" });
      done++;
    } catch (err) {
      console.error("[deletion] failed for", id, err);
      await audit({ actor: null, subject: id, action: "account.deletion_failed", metadata: { error: String(err).slice(0, 300) } });
    }
  }
  return done;
}
