"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { acceptConsents } from "@/lib/consents";
import { CONSENTS, type ConsentType } from "@/lib/constants";

export async function completeOnboarding(_: { error?: string } | undefined, form: FormData) {
  const { supabase, user } = await requireUser();

  const firstName = String(form.get("first_name") ?? "").trim();
  if (!firstName) return { error: "Please tell us your first name." };

  const accepted = (Object.keys(CONSENTS) as ConsentType[]).filter((t) => form.get(`consent_${t}`) === "on");
  const missing = (Object.keys(CONSENTS) as ConsentType[]).filter((t) => CONSENTS[t].required && !accepted.includes(t));
  if (missing.length) return { error: "The first four agreements are needed for Still Here to work." };

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: String(form.get("last_name") ?? "").trim() || null,
      preferred_name: String(form.get("preferred_name") ?? "").trim() || null,
      language: String(form.get("language") ?? "en"),
      timezone: String(form.get("timezone") ?? "UTC"),
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { error: error.message };

  await acceptConsents(supabase, user.id, accepted);
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}
