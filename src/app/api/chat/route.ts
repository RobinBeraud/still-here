import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { handle, HttpError } from "@/lib/http";
import { digitalSelfTurn, interviewTurn, loadSession } from "@/lib/services/conversation";
import { getEntitlements } from "@/lib/services/entitlements-repo";

export const maxDuration = 60;

const Body = z.object({
  sessionId: z.uuid(),
  text: z.string().trim().min(1).max(8000),
  audioPath: z.string().max(200).nullish(),
});

export async function POST(request: Request) {
  return handle(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new HttpError(401, "Please sign in.");
    const body = Body.safeParse(await request.json());
    if (!body.success) throw new HttpError(400, "Invalid message.");

    const session = await loadSession(supabase, user.id, body.data.sessionId);

    if (session.kind === "interview" || session.kind === "photo_story") {
      const ent = await getEntitlements(user.id);
      if (!ent.can_add_content) throw new HttpError(402, "Your Still Here is in Preservation mode. Reactivate a plan to add new stories.");
      // Un enregistrement ne peut être rattaché que s'il appartient au dossier de l'utilisateur
      const audioPath = body.data.audioPath?.startsWith(`${user.id}/`) ? body.data.audioPath : null;
      const { userMessage, assistant } = await interviewTurn(supabase, user.id, session, body.data.text, audioPath);
      return { userMessage, assistant };
    }
    const result = await digitalSelfTurn(supabase, user.id, session, body.data.text);
    return result;
  });
}
