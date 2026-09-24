"use server";
import { revalidatePath } from "next/cache";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { acceptConsents, revokeConsent } from "@/lib/consents";
import { CONSENTS, LANGUAGES, type ConsentType } from "@/lib/constants";
import { publicEnv } from "@/lib/env";
import { audit } from "@/lib/services/audit";
import { cancelDeletion, createExport, requestDeletion } from "@/lib/services/account";

export async function updateProfile(_: unknown, form: FormData) {
  const { supabase, user } = await requireUser();
  const language = String(form.get("language") ?? "en");
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: String(form.get("first_name") ?? "").trim() || null,
      last_name: String(form.get("last_name") ?? "").trim() || null,
      preferred_name: String(form.get("preferred_name") ?? "").trim() || null,
      language: LANGUAGES.some(([c]) => c === language) ? language : "en",
    })
    .eq("id", user.id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function setConsent(type: ConsentType, accepted: boolean) {
  const { supabase, user } = await requireUser();
  if (!(type in CONSENTS)) return;
  if (accepted) {
    await acceptConsents(supabase, user.id, [type]);
  } else {
    if (CONSENTS[type].required) return; // révoquer un consentement requis = supprimer son compte
    await revokeConsent(supabase, user.id, type);
    if (type === "avatar" || type === "voice") {
      await createAdminClient().from("avatar_profiles").update({ status: "disabled" }).eq("owner_user_id", user.id);
    }
  }
  await audit({ actor: user.id, subject: user.id, action: accepted ? "consent.accepted" : "consent.revoked", metadata: { type } });
  revalidatePath("/settings");
}

export async function exportData() {
  const { user } = await requireUser();
  try {
    return { ok: true as const, url: await createExport(user.id) };
  } catch (e) {
    console.error("[export]", e);
    return { ok: false as const, error: "The export failed. Please try again or contact us." };
  }
}

/** Suppression : réauthentification (mot de passe) + confirmation explicite. */
export async function deleteAccount(_: unknown, form: FormData) {
  const { user } = await requireUser();
  if (String(form.get("confirm") ?? "") !== "DELETE") return { ok: false as const, error: 'Please type DELETE to confirm.' };

  const password = String(form.get("password") ?? "");
  const recentSignIn = user.last_sign_in_at && Date.now() - new Date(user.last_sign_in_at).getTime() < 10 * 60_000;
  if (password) {
    const probe = createPlainClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, { auth: { persistSession: false } });
    const { error } = await probe.auth.signInWithPassword({ email: user.email!, password });
    if (error) return { ok: false as const, error: "Incorrect password." };
    await probe.auth.signOut();
  } else if (!recentSignIn) {
    return { ok: false as const, error: "Please enter your password (or sign in again with a link, then retry within 10 minutes)." };
  }

  await requestDeletion(user.id);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function undoDeletion() {
  const { user } = await requireUser();
  await cancelDeletion(user.id);
  revalidatePath("/", "layout");
}
