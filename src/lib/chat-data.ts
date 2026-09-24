import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { ChatMessage } from "@/components/conversation";

export async function loadMessages(supabase: ServerSupabase, sessionId: string): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("conversation_messages")
    .select("id, role, content, answer_basis, used_memory_ids")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return (data ?? []) as ChatMessage[];
}
