import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { handle, HttpError } from "@/lib/http";
import { endLiveAvatar } from "@/lib/services/avatar";

const End = z.object({ liveSessionId: z.uuid() });

/** Variante POST pour navigator.sendBeacon (qui n'envoie que des POST). */
export async function POST(request: Request) {
  return handle(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new HttpError(401, "Please sign in.");
    const body = End.safeParse(JSON.parse(await request.text()));
    if (!body.success) throw new HttpError(400, "Invalid request.");
    await endLiveAvatar(user.id, body.data.liveSessionId);
    return { ok: true };
  });
}
