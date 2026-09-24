/**
 * EntitlementService — les droits ne sont JAMAIS déduits du nom du plan.
 * Ils résultent de lignes `entitlements` (source plan / pack / admin) + de l'état de facturation.
 * Ce module est pur (testable) ; le chargement DB est dans entitlements-repo.ts.
 */

export type BillingState = "ACTIVE" | "PAST_DUE" | "GRACE_PERIOD" | "PRESERVATION_ONLY" | "CLOSED";

export type Entitlements = {
  can_create_avatar: boolean;
  can_use_live_avatar: boolean;
  can_add_content: boolean;
  max_loved_ones: number;
  max_memories: number | null; // null = illimité
  avatar_minutes_included: number;
  avatar_minutes_extra: number;
  storage_limit_bytes: number;
  future_messages_enabled: boolean;
  legacy_mode_enabled: boolean;
  advanced_backup_enabled: boolean;
  memory_book_enabled: boolean;
};

export type EntitlementRow = {
  key: string;
  value: unknown;
  source: string;
  starts_at: string;
  expires_at: string | null;
};

/** Valeurs du plan gratuit (surchargées par la ligne `plans.discover` quand elle existe). */
export const BASE_ENTITLEMENTS: Entitlements = {
  can_create_avatar: false,
  can_use_live_avatar: false,
  can_add_content: true,
  max_loved_ones: 0,
  max_memories: 10,
  avatar_minutes_included: 0,
  avatar_minutes_extra: 0,
  storage_limit_bytes: 500 * 1024 * 1024,
  future_messages_enabled: false,
  legacy_mode_enabled: false,
  advanced_backup_enabled: false,
  memory_book_enabled: false,
};

const ADDITIVE_KEYS = new Set<keyof Entitlements>(["avatar_minutes_extra"]);

export function isActive(row: Pick<EntitlementRow, "starts_at" | "expires_at">, now: Date): boolean {
  if (new Date(row.starts_at) > now) return false;
  return row.expires_at === null || new Date(row.expires_at) > now;
}

export function resolveEntitlements(
  rows: EntitlementRow[],
  billingState: BillingState,
  now: Date = new Date(),
  base: Partial<Entitlements> = {},
): Entitlements {
  const result: Entitlements = { ...BASE_ENTITLEMENTS, ...base };

  for (const row of rows) {
    if (!isActive(row, now)) continue;
    const key = row.key as keyof Entitlements;
    if (!(key in result)) continue;
    const current = result[key];
    const value = row.value;

    if (typeof current === "boolean" || typeof value === "boolean") {
      (result[key] as boolean) = Boolean(current) || value === true;
    } else if (key === "max_memories") {
      // null = illimité : l'emporte toujours
      result.max_memories = value === null || result.max_memories === null ? null : Math.max(result.max_memories, Number(value));
    } else if (ADDITIVE_KEYS.has(key)) {
      (result[key] as number) = Number(current) + Number(value);
    } else if (typeof value === "number") {
      (result[key] as number) = Math.max(Number(current), value);
    }
  }

  // Mode conservation : les données restent, les fonctions coûteuses sont suspendues.
  if (billingState === "PRESERVATION_ONLY" || billingState === "CLOSED") {
    result.can_use_live_avatar = false;
    result.can_create_avatar = false;
    result.can_add_content = false;
  }
  return result;
}

/** Minutes Live Avatar restantes sur la fenêtre glissante de 365 jours. */
export function avatarMinutesRemaining(ent: Entitlements, secondsUsedLast365Days: number): number {
  const total = ent.avatar_minutes_included + ent.avatar_minutes_extra;
  return Math.max(0, Math.floor(total - secondsUsedLast365Days / 60));
}

/** Convertit l'objet `plans.entitlements` en lignes pour une source donnée. */
export function planToRows(
  planEntitlements: Record<string, unknown>,
  source: string,
  startsAt: Date,
  expiresAt: Date | null,
): EntitlementRow[] {
  return Object.entries(planEntitlements).map(([key, value]) => ({
    key,
    value,
    source,
    starts_at: startsAt.toISOString(),
    expires_at: expiresAt ? expiresAt.toISOString() : null,
  }));
}
