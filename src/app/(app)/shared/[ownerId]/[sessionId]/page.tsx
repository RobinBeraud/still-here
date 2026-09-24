import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { loadMessages } from "@/lib/chat-data";
import { getEntitlements } from "@/lib/services/entitlements-repo";
import { Conversation } from "@/components/conversation";
import { AiDisclosure } from "@/components/ui";

export const metadata = { title: "Still Here" };

export default async function LovedOneChatPage({ params }: { params: Promise<{ ownerId: string; sessionId: string }> }) {
  const { ownerId, sessionId } = await params;
  const { supabase, user } = await requireUser();
  const [{ data: session }, { data: cards }] = await Promise.all([
    supabase.from("conversation_sessions").select("id").eq("id", sessionId).eq("user_id", user.id).eq("subject_user_id", ownerId).eq("kind", "loved_one").maybeSingle(),
    supabase.rpc("still_here_card", { p_owner: ownerId }),
  ]);
  const card = (cards as { display_name: string }[] | null)?.[0];
  if (!session || !card) notFound();

  const [messages, ownerEnt] = await Promise.all([loadMessages(supabase, sessionId), getEntitlements(ownerId)]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/shared/${ownerId}`} className="text-sm text-ink-soft hover:text-ink">← {card.display_name}&apos;s Still Here</Link>
      <div className="my-4">
        <AiDisclosure name={card.display_name} />
      </div>
      <Conversation
        sessionId={sessionId}
        mode="loved_one"
        initialMessages={messages}
        ownerName={card.display_name}
        avatarAllowed={ownerEnt.can_use_live_avatar && ownerEnt.avatar_minutes_remaining > 0}
      />
    </div>
  );
}
