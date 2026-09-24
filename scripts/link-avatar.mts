/**
 * Relie un avatar créé dans la console LiveAvatar à un utilisateur (étape "processing" → "ready").
 * Usage : npm run avatar:link -- <user_id> <avatar_id> [voice_id]
 * Vérifie que le consentement avatar est toujours actif avant d'activer.
 */
import { createClient } from "@supabase/supabase-js";

const [userId, avatarId, voiceId] = process.argv.slice(2);
if (!userId || !avatarId) {
  console.error("Usage: npm run avatar:link -- <user_id> <avatar_id> [voice_id]");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: consent } = await db
  .from("consents")
  .select("id")
  .eq("user_id", userId)
  .eq("consent_type", "avatar")
  .is("revoked_at", null)
  .limit(1)
  .maybeSingle();
if (!consent) {
  console.error("✖ No active avatar consent for this user. Aborting.");
  process.exit(1);
}

const { error } = await db
  .from("avatar_profiles")
  .update({ provider: "liveavatar", provider_avatar_id: avatarId, provider_voice_id: voiceId ?? null, status: "ready" })
  .eq("owner_user_id", userId);
if (error) throw error;

await db.from("audit_logs").insert({ actor_user_id: null, subject_user_id: userId, action: "avatar.ready", metadata: { avatar_id: avatarId } });
console.log(`✔ Avatar ${avatarId} linked to ${userId}. Remember to email the user that their avatar is ready.`);
