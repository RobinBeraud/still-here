import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { handle, HttpError } from "@/lib/http";
import { startLiveAvatar } from "@/lib/services/avatar";

const Start = z.object({ conversationSessionId: z.uuid() });

export async function POST(request: Request) {
  return handle(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new HttpError(401, "Please sign in.");
    const body = Start.safeParse(await request.json());
    if (!body.success) throw new HttpError(400, "Invalid request.");
    return startLiveAvatar(supabase, user.id, body.data.conversationSessionId);
  });
}
