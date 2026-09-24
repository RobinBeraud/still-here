import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type UsageMetric =
  | "avatar_seconds"
  | "tts_characters"
  | "stt_seconds"
  | "llm_input_tokens"
  | "llm_output_tokens"
  | "embedding_tokens"
  | "storage_bytes"
  | "backup_bytes"
  | "emails"
  | "exports";

/**
 * Coûts unitaires estimés (USD) pour le suivi de marge — à ajuster selon les contrats fournisseurs.
 * Ce sont des estimations internes, pas une facturation.
 */
const UNIT_COST_USD: Partial<Record<UsageMetric, number>> = {
  avatar_seconds: 0.1 / 60,
  tts_characters: 15 / 1_000_000,
  stt_seconds: 0.006 / 60,
  llm_input_tokens: 0.25 / 1_000_000,
  llm_output_tokens: 2 / 1_000_000,
  embedding_tokens: 0.02 / 1_000_000,
  emails: 0.0009,
};

type UsageEntry = { metric: UsageMetric; quantity: number; provider?: string; metadata?: Record<string, unknown> };

/** UsageService : journalise la consommation réelle (jamais bloquant pour l'utilisateur). */
export async function recordUsage(userId: string | null, entries: UsageEntry[]) {
  const rows = entries
    .filter((e) => e.quantity > 0)
    .map((e) => ({
      user_id: userId,
      metric: e.metric,
      quantity: e.quantity,
      provider: e.provider ?? null,
      cost_estimate_usd: UNIT_COST_USD[e.metric] !== undefined ? Number((e.quantity * UNIT_COST_USD[e.metric]!).toFixed(6)) : null,
      metadata: e.metadata ?? {},
    }));
  if (rows.length === 0) return;
  const { error } = await createAdminClient().from("usage_records").insert(rows);
  if (error) console.error("[usage] failed to record usage", error.message);
}

export function llmUsage(usage: { inputTokens: number; outputTokens: number }, provider = "openai"): UsageEntry[] {
  return [
    { metric: "llm_input_tokens", quantity: usage.inputTokens, provider },
    { metric: "llm_output_tokens", quantity: usage.outputTokens, provider },
  ];
}
