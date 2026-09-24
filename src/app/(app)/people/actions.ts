"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { inviteLovedOne } from "@/lib/services/sharing";
import { audit } from "@/lib/services/audit";

const Invite = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  relationship: z.string().trim().max(80).optional(),
});

export async function invite(_: unknown, form: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = Invite.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false as const, error: "Please enter a name and a valid email." };
  if (parsed.data.email.toLowerCase() === user.email?.toLowerCase()) return { ok: false as const, error: "You can't invite yourself." };
  try {
    await inviteLovedOne(supabase, user.id, { ...parsed.data, relationship: parsed.data.relationship || null });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not send the invitation." };
  }
  revalidatePath("/people");
  return { ok: true as const };
}

export async function resendInvite(personId: string) {
  const { supabase, user } = await requireUser();
  const { data: p } = await supabase.from("trusted_people").select("name, email, relationship").eq("id", personId).eq("owner_user_id", user.id).single();
  if (!p) return;
  await inviteLovedOne(supabase, user.id, { name: p.name, email: p.email, relationship: p.relationship });
  revalidatePath("/people");
}

/** Révocation immédiate : l'accès est coupé côté base (RLS) dès cette mise à jour. */
export async function revokeAccess(personId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("trusted_people").update({ status: "revoked" }).eq("id", personId).eq("owner_user_id", user.id);
  await supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("trusted_person_id", personId).is("accepted_at", null).is("revoked_at", null);
  await audit({ actor: user.id, subject: user.id, action: "sharing.revoked", targetType: "trusted_person", targetId: personId });
  revalidatePath("/people");
}

export async function removePerson(personId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("trusted_people").delete().eq("id", personId).eq("owner_user_id", user.id);
  await audit({ actor: user.id, subject: user.id, action: "sharing.removed", targetType: "trusted_person", targetId: personId });
  revalidatePath("/people");
}
