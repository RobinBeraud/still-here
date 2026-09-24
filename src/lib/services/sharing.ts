import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServerSupabase } from "@/lib/supabase/server";
import { generateToken, hashToken } from "@/lib/crypto";
import { INVITATION_TTL_DAYS } from "@/lib/constants";
import { publicEnv } from "@/lib/env";
import { getEntitlements } from "./entitlements-repo";
import { sendInvitationEmail, sendSecurityNotice } from "./emails";
import { audit } from "./audit";

export async function inviteLovedOne(
  supabase: ServerSupabase,
  ownerId: string,
  input: { name: string; email: string; relationship: string | null },
) {
  const email = input.email.trim().toLowerCase();
  const { data: existing } = await supabase.from("trusted_people").select("status").eq("owner_user_id", ownerId).eq("email", email).maybeSingle();
  if (existing?.status === "active") throw new Error("This person already has access to your Still Here.");
  const ent = await getEntitlements(ownerId);
  const { count } = await supabase
    .from("trusted_people")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", ownerId)
    .in("status", ["pending", "invited", "active"])
    .neq("email", email);
  if ((count ?? 0) >= ent.max_loved_ones) {
    throw new Error(
      ent.max_loved_ones === 0
        ? "Sharing with loved ones is available on paid plans."
        : `Your plan allows ${ent.max_loved_ones} loved one${ent.max_loved_ones > 1 ? "s" : ""}.`,
    );
  }

  const { data: person, error } = await supabase
    .from("trusted_people")
    .upsert(
      { owner_user_id: ownerId, name: input.name.trim(), email, relationship: input.relationship, status: "invited" },
      { onConflict: "owner_user_id,email" },
    )
    .select("id, name")
    .single();
  if (error || !person) throw new Error(error?.message ?? "Could not save loved one");

  // Invalide les invitations précédentes non utilisées
  await supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("trusted_person_id", person.id).is("accepted_at", null).is("revoked_at", null);

  const token = generateToken();
  const { error: invErr } = await supabase.from("invitations").insert({
    owner_user_id: ownerId,
    trusted_person_id: person.id,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000).toISOString(),
  });
  if (invErr) throw new Error(invErr.message);

  const { data: profile } = await supabase.from("profiles").select("first_name, preferred_name").eq("id", ownerId).single();
  const ownerName = profile?.preferred_name || profile?.first_name || "Someone who loves you";
  await sendInvitationEmail({ to: email, inviteeName: person.name, ownerName, url: `${publicEnv.appUrl}/invite/${token}`, ownerId });
  await audit({ actor: ownerId, subject: ownerId, action: "sharing.invited", targetType: "trusted_person", targetId: person.id });
}

export type InvitationCheck =
  | { ok: true; invitationId: string; ownerId: string; ownerName: string; inviteeName: string; email: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

export async function checkInvitation(token: string): Promise<InvitationCheck> {
  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("invitations")
    .select("id, owner_user_id, expires_at, accepted_at, revoked_at, trusted_people(name, email, status)")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!inv || inv.revoked_at) return { ok: false, reason: "invalid" };
  if (inv.accepted_at) return { ok: false, reason: "used" };
  if (new Date(inv.expires_at) < new Date()) return { ok: false, reason: "expired" };
  const tp = inv.trusted_people as unknown as { name: string; email: string; status: string } | null;
  if (!tp || tp.status === "revoked") return { ok: false, reason: "invalid" };
  const { data: profile } = await admin.from("profiles").select("first_name, preferred_name, deletion_requested_at").eq("id", inv.owner_user_id).single();
  if (!profile || profile.deletion_requested_at) return { ok: false, reason: "invalid" };
  return {
    ok: true,
    invitationId: inv.id,
    ownerId: inv.owner_user_id,
    ownerName: profile.preferred_name || profile.first_name || "Your loved one",
    inviteeName: tp.name,
    email: tp.email,
  };
}

/** Le proche doit être authentifié avec l'adresse invitée ; le token est à usage unique. */
export async function acceptInvitation(token: string, user: { id: string; email: string | undefined }) {
  const check = await checkInvitation(token);
  if (!check.ok) throw new Error("This invitation is no longer valid.");
  if (!user.email || user.email.toLowerCase() !== check.email.toLowerCase()) {
    throw new Error(`This invitation was sent to ${check.email}. Please sign in with that address.`);
  }
  if (user.id === check.ownerId) throw new Error("You cannot accept your own invitation.");

  const admin = createAdminClient();
  const { data: claimed } = await admin
    .from("invitations")
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq("id", check.invitationId)
    .is("accepted_at", null)
    .select("trusted_person_id")
    .single();
  if (!claimed) throw new Error("This invitation was already used.");

  await admin.from("trusted_people").update({ status: "active", linked_user_id: user.id }).eq("id", claimed.trusted_person_id);
  await audit({ actor: user.id, subject: check.ownerId, action: "sharing.invitation_accepted", targetType: "trusted_person", targetId: claimed.trusted_person_id });
  await sendSecurityNotice(check.ownerId, "A loved one joined your Still Here", [
    `${check.inviteeName} accepted your invitation and can now talk with your Still Here, within the permissions you set.`,
    "You can change what they can see, or revoke their access, at any time.",
  ]).catch(() => undefined);
  return check.ownerId;
}
