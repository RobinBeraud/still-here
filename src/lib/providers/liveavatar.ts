import "server-only";
import { serverEnv } from "@/lib/env";
import type { AvatarProvider } from "./types";

const API = "https://api.liveavatar.com";

/**
 * LiveAvatar (HeyGen) — premier fournisseur d'avatar.
 * Mode PUSH_TO_TALK, micro coupé côté SDK : l'avatar ne converse pas seul,
 * il prononce uniquement les réponses produites par le pipeline Still Here (RAG grounded).
 * La création d'un avatar personnel (digital twin) se fait dans la console LiveAvatar
 * puis est reliée via `npm run avatar:link` (aucune API publique de création à date).
 */
export class LiveAvatarProvider implements AvatarProvider {
  readonly name = "liveavatar";

  isConfigured() {
    return Boolean(serverEnv.liveAvatarApiKey);
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { "X-API-KEY": serverEnv.liveAvatarApiKey, "Content-Type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`LiveAvatar ${path} failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
    return body as T;
  }

  async createLiveSession(opts: { avatarId: string; voiceId?: string | null; language?: string; maxSessionSeconds: number }) {
    const body = {
      mode: "FULL",
      avatar_id: opts.avatarId,
      is_sandbox: serverEnv.liveAvatarSandbox,
      interactivity_type: "PUSH_TO_TALK",
      max_session_duration: Math.max(60, Math.floor(opts.maxSessionSeconds)),
      avatar_persona: {
        ...(opts.voiceId ? { voice_id: opts.voiceId } : {}),
        ...(opts.language ? { language: opts.language } : {}),
      },
    };
    const res = await this.call<{ data: { session_id: string; session_token: string } }>("/v1/sessions/token", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { sessionId: res.data.session_id, sessionToken: res.data.session_token };
  }

  async stopSession(sessionId: string) {
    await this.call(`/v1/sessions/${encodeURIComponent(sessionId)}/stop`, { method: "POST", body: "{}" }).catch(() => undefined);
  }
}
