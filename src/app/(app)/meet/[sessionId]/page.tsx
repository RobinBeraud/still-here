import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { loadMessages } from "@/lib/chat-data";
import { getEntitlements } from "@/lib/services/entitlements-repo";
import { Conversation } from "@/components/conversation";
import { AiDisclosure } from "@/components/ui";

export const metadata = { title: "Meet My Still Here" };

export default async function MeetSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { supabase, user } = await requireUser();
  const { data: session } = await supabase.from("conversation_sessions").select("id").eq("id", sessionId).eq("user_id", user.id).eq("kind", "meet_self").maybeSingle();
  if (!session) notFound();
  const [messages, ent] = await Promise.all([loadMessages(supabase, sessionId), getEntitlements(user.id)]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/meet" className="text-sm text-ink-soft hover:text-ink">← Meet My Still Here</Link>
      </div>
      <div className="mb-4">
        <AiDisclosure name="you" />
      </div>
      <Conversation
        sessionId={sessionId}
        mode="self"
        initialMessages={messages}
        ownerName="your"
        avatarAllowed={ent.can_use_live_avatar && ent.avatar_minutes_remaining > 0}
      />
    </div>
  );
}
