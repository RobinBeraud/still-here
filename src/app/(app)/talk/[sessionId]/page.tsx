import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { loadMessages } from "@/lib/chat-data";
import { getEntitlements } from "@/lib/services/entitlements-repo";
import { getConsentStatus } from "@/lib/consents";
import { Conversation } from "@/components/conversation";
import { SIGNED_MEDIA_TTL_SECONDS } from "@/lib/constants";

export const metadata = { title: "Conversation" };

export default async function TalkSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { supabase, user } = await requireUser();
  const { data: session } = await supabase
    .from("conversation_sessions")
    .select("id, kind, title, media_id, extracted_at, media_assets(path, bucket)")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .in("kind", ["interview", "photo_story"])
    .maybeSingle();
  if (!session) notFound();

  const [messages, ent, consents] = await Promise.all([loadMessages(supabase, sessionId), getEntitlements(user.id), getConsentStatus(supabase, user.id)]);
  const media = session.media_assets as unknown as { path: string; bucket: string } | null;
  const photoUrl = media ? (await supabase.storage.from(media.bucket).createSignedUrl(media.path, SIGNED_MEDIA_TTL_SECONDS)).data?.signedUrl : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/talk" className="text-sm text-ink-soft hover:text-ink">← All conversations</Link>
        {session.extracted_at && <Link href={`/talk/${sessionId}/review`} className="text-sm underline">Review memories</Link>}
      </div>
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="mb-6 max-h-80 w-full rounded-2xl object-cover" />
      )}
      <Conversation
        sessionId={sessionId}
        mode="interview"
        initialMessages={messages}
        ownerName="you"
        avatarAllowed={ent.can_use_live_avatar && ent.avatar_minutes_remaining > 0}
        keepAudio={consents.media.accepted}
      />
    </div>
  );
}
