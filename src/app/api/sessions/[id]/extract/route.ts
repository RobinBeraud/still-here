import { createClient } from "@/lib/supabase/server";
import { handle, HttpError } from "@/lib/http";
import { extractSession } from "@/lib/services/memory";

export const maxDuration = 120;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new HttpError(401, "Please sign in.");
    const created = await extractSession(supabase, user.id, id);
    return { created };
  });
}
