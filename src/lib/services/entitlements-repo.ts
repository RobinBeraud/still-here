import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { avatarMinutesRemaining, resolveEntitlements, type BillingState, type EntitlementRow, type Entitlements } from "./entitlements";

export type UserEntitlements = Entitlements & {
  billing_state: BillingState;
  plan_code: string;
  avatar_minutes_remaining: number;
  grace_period_ends_at: string | null;
};

/**
 * Charge les droits effectifs d'un utilisateur (calcul serveur uniquement).
 * Utilise le client admin : ne renvoie que des données de facturation de l'utilisateur ciblé.
 */
export async function getEntitlements(userId: string): Promise<UserEntitlements> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();

  const [{ data: account }, { data: rows }, { data: base }, { data: usage }] = await Promise.all([
    admin.from("billing_accounts").select("plan_code, billing_state, grace_period_ends_at").eq("user_id", userId).maybeSingle(),
    admin.from("entitlements").select("key, value, source, starts_at, expires_at").eq("user_id", userId),
    admin.from("plans").select("entitlements").eq("code", "discover").maybeSingle(),
    admin.from("usage_records").select("quantity").eq("user_id", userId).eq("metric", "avatar_seconds").gte("occurred_at", since),
  ]);

  const state = (account?.billing_state ?? "ACTIVE") as BillingState;
  const ent = resolveEntitlements((rows ?? []) as EntitlementRow[], state, new Date(), (base?.entitlements ?? {}) as Partial<Entitlements>);
  const usedSeconds = (usage ?? []).reduce((sum, r) => sum + Number(r.quantity), 0);

  return {
    ...ent,
    billing_state: state,
    plan_code: account?.plan_code ?? "discover",
    avatar_minutes_remaining: avatarMinutesRemaining(ent, usedSeconds),
    grace_period_ends_at: account?.grace_period_ends_at ?? null,
  };
}
