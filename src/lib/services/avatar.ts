import "server-only";
import { providers } from "@/lib/providers";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServerSupabase } from "@/lib/supabase/server";
import { HttpError } from "@/lib/http";
import { getEntitlements } from "./entitlements-repo";
import { loadSession } from "./conversation";
import { recordUsage } from "./usage";

const MAX_SINGLE_SESSION_SECONDS = 30 * 60;

/**
 * Démarre une session Live Avatar. Le quota débité est celui du propriétaire du Still Here.
 * La durée maximale est imposée au fournisseur à partir du quota restant (contrôle serveur).
 */
export async function startLiveAvatar(supabase: ServerSupabase, userId: string, conversationSessionId: string) {
  const avatar = providers.avatar();
  if (!avatar.isConfigured()) throw new HttpError(503, "Video conversations are not available yet.");

  const session = await loadSession(supabase, userId, conversationSessionId);
  const quotaUserId = session.subject_user_id;
  const ent = await getEntitlements(quotaUserId);
  if (!ent.can_use_live_avatar) throw new HttpError(402, "Video conversations are part of paid plans.");
  if (ent.avatar_minutes_remaining <= 0) throw new HttpError(402, "The video conversation time for this year has been used. Text and voice are still available.");

  let avatarId = serverEnv.liveAvatarDefaultAvatarId;
  let voiceId: string | null = null;
  let language: string | undefined;
  if (session.kind === "meet_self" || session.kind === "loved_one") {
    const { data: cards } = await supabase.rpc("still_here_card", { p_owner: quotaUserId });
    const card = (cards as { avatar_ready: boolean; provider_avatar_id: string | null; provider_voice_id: string | null; language: string }[] | null)?.[0];
    if (!card) throw new HttpError(403, "You don't have access to this Still Here.");
    if (card.avatar_ready && card.provider_avatar_id) {
      avatarId = card.provider_avatar_id;
      voiceId = card.provider_voice_id;
    }
    language = card.language;
  }
  if (!avatarId) throw new HttpError(503, "No avatar is configured yet.");

  const admin = createAdminClient();
  await closeOpenSessions(admin, userId);

  const maxSeconds = Math.min(MAX_SINGLE_SESSION_SECONDS, ent.avatar_minutes_remaining * 60);
  const { sessionId: providerSessionId, sessionToken } = await avatar.createLiveSession({ avatarId, voiceId, language, maxSessionSeconds: maxSeconds });

  const { data: row, error } = await admin
    .from("avatar_live_sessions")
    .insert({
      user_id: userId,
      quota_user_id: quotaUserId,
      conversation_session_id: session.id,
      provider: avatar.name,
      provider_session_id: providerSessionId,
      max_seconds: maxSeconds,
    })
    .select("id")
    .single();
  if (error || !row) {
    await avatar.stopSession(providerSessionId);
    throw new Error("Could not start the video conversation.");
  }
  return { liveSessionId: row.id as string, sessionToken, maxSeconds };
}

type LiveRow = { id: string; quota_user_id: string; provider_session_id: string; started_at: string; max_seconds: number };

async function finalize(admin: ReturnType<typeof createAdminClient>, row: LiveRow, now = new Date()) {
  const elapsed = Math.ceil((now.getTime() - new Date(row.started_at).getTime()) / 1000);
  const billed = Math.max(1, Math.min(elapsed, row.max_seconds));
  const { data: updated } = await admin
    .from("avatar_live_sessions")
    .update({ ended_at: now.toISOString(), billed_seconds: billed })
    .eq("id", row.id)
    .is("ended_at", null)
    .select("id");
  if (!updated?.length) return; // déjà clôturée (idempotent)
  await recordUsage(row.quota_user_id, [{ metric: "avatar_seconds", quantity: billed, provider: providers.avatar().name, metadata: { live_session: row.id } }]);
  await providers.avatar().stopSession(row.provider_session_id);
}

export async function endLiveAvatar(userId: string, liveSessionId: string) {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("avatar_live_sessions")
    .select("id, quota_user_id, provider_session_id, started_at, max_seconds")
    .eq("id", liveSessionId)
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();
  if (row) await finalize(admin, row as LiveRow);
}

async function closeOpenSessions(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin
    .from("avatar_live_sessions")
    .select("id, quota_user_id, provider_session_id, started_at, max_seconds")
    .eq("user_id", userId)
    .is("ended_at", null);
  for (const row of data ?? []) await finalize(admin, row as LiveRow);
}

/** Cron : clôture les sessions jamais terminées (onglet fermé…), facturées au plus à leur durée max. */
export async function closeStaleLiveSessions() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("avatar_live_sessions")
    .select("id, quota_user_id, provider_session_id, started_at, max_seconds")
    .is("ended_at", null)
    .lt("started_at", new Date(Date.now() - (MAX_SINGLE_SESSION_SECONDS + 300) * 1000).toISOString());
  for (const row of data ?? []) await finalize(admin, row as LiveRow);
  return data?.length ?? 0;
}
