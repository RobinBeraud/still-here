import { createClient } from "@/lib/supabase/server";
import { handle, HttpError } from "@/lib/http";
import { providers } from "@/lib/providers";
import { recordUsage } from "@/lib/services/usage";

export const maxDuration = 60;
const MAX_BYTES = 25 * 1024 * 1024;

/** Transcription d'un enregistrement vocal. L'audio original est conservé (source historique). */
export async function POST(request: Request) {
  return handle(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new HttpError(401, "Please sign in.");

    const form = await request.formData();
    const audio = form.get("audio");
    const seconds = Number(form.get("seconds") ?? 0);
    const keep = form.get("keep") === "true";
    if (!(audio instanceof File) || audio.size === 0) throw new HttpError(400, "No audio received.");
    if (audio.size > MAX_BYTES) throw new HttpError(413, "Recording is too long.");

    const { data: profile } = await supabase.from("profiles").select("language").eq("id", user.id).single();
    const { text } = await providers.llm().transcribe(audio, profile?.language);
    await recordUsage(user.id, [{ metric: "stt_seconds", quantity: Math.max(1, Math.round(seconds)), provider: providers.llm().name }]);

    let audioPath: string | null = null;
    if (keep) {
      const ext = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
      audioPath = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("audio").upload(audioPath, audio, { contentType: audio.type.split(";")[0] || "audio/webm" });
      if (error) audioPath = null;
    }
    return { text, audioPath };
  });
}
