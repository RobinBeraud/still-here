import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { providers } from "@/lib/providers";
import { recordUsage } from "@/lib/services/usage";

export const maxDuration = 60;

const Body = z.object({ messageId: z.uuid() });

/**
 * Synthèse vocale d'un message assistant existant — jamais d'un texte arbitraire,
 * pour qu'aucune voix ne puisse être utilisée pour faire dire n'importe quoi.
 * Mode voix = voix de synthèse neutre ; la voix personnelle n'existe qu'en mode avatar (fournisseur avatar).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const body = Body.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // RLS : seuls les messages de l'utilisateur courant sont lisibles
  const { data: message } = await supabase
    .from("conversation_messages")
    .select("content, role, conversation_sessions(subject_user_id)")
    .eq("id", body.data.messageId)
    .single();
  if (!message || message.role !== "assistant") return NextResponse.json({ error: "Not found." }, { status: 404 });

  const session = message.conversation_sessions as unknown as { subject_user_id: string } | null;
  const { audio, contentType } = await providers.voice().synthesize({
    text: message.content,
    instructions: "Speak warmly and calmly, at a natural pace.",
  });
  await recordUsage(session?.subject_user_id ?? user.id, [{ metric: "tts_characters", quantity: message.content.length, provider: providers.voice().name }]);
  return new NextResponse(audio, { headers: { "Content-Type": contentType, "Cache-Control": "private, no-store" } });
}
