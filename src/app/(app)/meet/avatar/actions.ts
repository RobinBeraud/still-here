"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { acceptConsents, getConsentStatus } from "@/lib/consents";
import { getEntitlements } from "@/lib/services/entitlements-repo";
import { audit } from "@/lib/services/audit";
import { sendEmail } from "@/lib/services/emails";
import { serverEnv } from "@/lib/env";

/**
 * Workflow avatar : consentement → instructions → vidéo → traitement fournisseur → preview → confirmation.
 * Les écritures sur avatar_profiles passent par le serveur (service_role) après vérifications.
 */
export async function giveAvatarConsent() {
  const { supabase, user } = await requireUser();
  const ent = await getEntitlements(user.id);
  if (!ent.can_create_avatar) return { ok: false as const, error: "Personal avatars are part of paid plans." };
  await acceptConsents(supabase, user.id, ["avatar", "voice"]);
  const consents = await getConsentStatus(supabase, user.id);
  await createAdminClient()
    .from("avatar_profiles")
    .upsert({ owner_user_id: user.id, status: "consented", consent_id: consents.avatar.id }, { onConflict: "owner_user_id" });
  await audit({ actor: user.id, subject: user.id, action: "avatar.consent_given" });
  revalidatePath("/meet/avatar");
  return { ok: true as const };
}

export async function registerTrainingVideo(path: string) {
  const { supabase, user } = await requireUser();
  if (!path.startsWith(`${user.id}/`)) return { ok: false as const, error: "Invalid file." };
  const consents = await getConsentStatus(supabase, user.id);
  if (!consents.avatar.accepted) return { ok: false as const, error: "Please give your consent first." };
  const ent = await getEntitlements(user.id);
  if (!ent.can_create_avatar) return { ok: false as const, error: "Personal avatars are part of paid plans." };

  await createAdminClient()
    .from("avatar_profiles")
    .update({ status: "processing", training_video_path: path })
    .eq("owner_user_id", user.id);
  await audit({ actor: user.id, subject: user.id, action: "avatar.video_uploaded" });
  if (serverEnv.adminAlertEmail) {
    await sendEmail(serverEnv.adminAlertEmail, "New avatar to create", [
      `User ${user.id} uploaded a training video (${path}) with avatar and voice consent.`,
      "Create the avatar in the LiveAvatar console, then run: npm run avatar:link -- <user_id> <avatar_id> [voice_id]",
    ]).catch(() => undefined);
  }
  revalidatePath("/meet/avatar");
  return { ok: true as const };
}

/** Désactivation : l'avatar n'est plus utilisé, la vidéo source est supprimée. */
export async function disableAvatar() {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { data: profile } = await admin.from("avatar_profiles").select("training_video_path").eq("owner_user_id", user.id).maybeSingle();
  if (profile?.training_video_path) await admin.storage.from("avatar-training").remove([profile.training_video_path]);
  await admin.from("avatar_profiles").update({ status: "disabled", training_video_path: null }).eq("owner_user_id", user.id);
  await audit({ actor: user.id, subject: user.id, action: "avatar.disabled" });
  revalidatePath("/meet/avatar");
}
