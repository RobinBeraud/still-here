import "server-only";
import { CONSENTS, type ConsentType } from "@/lib/constants";
import type { ServerSupabase } from "@/lib/supabase/server";

export type ConsentStatus = Record<ConsentType, { accepted: boolean; id: string | null; acceptedAt: string | null }>;

/** Un consentement n'est valable que pour sa version courante et s'il n'est pas révoqué. */
export async function getConsentStatus(supabase: ServerSupabase, userId: string): Promise<ConsentStatus> {
  const { data } = await supabase
    .from("consents")
    .select("id, consent_type, consent_version, accepted_at, revoked_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("accepted_at", { ascending: false });

  const status = Object.fromEntries(
    (Object.keys(CONSENTS) as ConsentType[]).map((t) => [t, { accepted: false, id: null, acceptedAt: null }]),
  ) as ConsentStatus;
  for (const row of data ?? []) {
    const type = row.consent_type as ConsentType;
    if (!(type in CONSENTS) || status[type].accepted) continue;
    if (row.consent_version === CONSENTS[type].version) status[type] = { accepted: true, id: row.id, acceptedAt: row.accepted_at };
  }
  return status;
}

export function missingRequired(status: ConsentStatus): ConsentType[] {
  return (Object.keys(CONSENTS) as ConsentType[]).filter((t) => CONSENTS[t].required && !status[t].accepted);
}

export async function acceptConsents(supabase: ServerSupabase, userId: string, types: ConsentType[]) {
  const status = await getConsentStatus(supabase, userId);
  const rows = types.filter((t) => !status[t].accepted).map((t) => ({ user_id: userId, consent_type: t, consent_version: CONSENTS[t].version }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("consents").insert(rows);
  if (error) throw new Error(error.message);
}

export async function revokeConsent(supabase: ServerSupabase, userId: string, type: ConsentType) {
  const { error } = await supabase
    .from("consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("consent_type", type)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}
