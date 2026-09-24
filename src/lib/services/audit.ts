import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Journal d'audit des accès et actions sensibles.
 * Ne jamais y enregistrer de secrets, de données de carte ni de conversations complètes.
 */
export async function audit(entry: {
  actor: string | null;
  subject: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await createAdminClient().from("audit_logs").insert({
    actor_user_id: entry.actor,
    subject_user_id: entry.subject,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  });
  if (error) console.error("[audit] failed", entry.action, error.message);
}
