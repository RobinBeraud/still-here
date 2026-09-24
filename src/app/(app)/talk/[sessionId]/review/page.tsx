import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { MemoryCard, type MemoryCardData } from "@/components/memory-card";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "What I learned" };

export default async function ReviewPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { supabase, user } = await requireUser();
  const { data: session } = await supabase.from("conversation_sessions").select("id").eq("id", sessionId).eq("user_id", user.id).maybeSingle();
  if (!session) notFound();

  const { data: msgs } = await supabase.from("conversation_messages").select("id").eq("session_id", sessionId);
  const messageIds = (msgs ?? []).map((m) => m.id);
  const { data: sources } = messageIds.length
    ? await supabase.from("memory_sources").select("memory_id, excerpt").in("message_id", messageIds)
    : { data: [] as { memory_id: string; excerpt: string | null }[] };
  const excerpts = new Map((sources ?? []).map((s) => [s.memory_id, s.excerpt]));
  const ids = [...excerpts.keys()];

  const { data: memories } = ids.length
    ? await supabase
        .from("memories")
        .select("id, type, title, content, occurred_on, status, privacy_level")
        .in("id", ids)
        .neq("origin", "feedback")
        .order("importance", { ascending: false })
    : { data: [] };
  const cards: MemoryCardData[] = (memories ?? []).map((m) => ({ ...m, excerpt: excerpts.get(m.id) ?? null }));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/talk/${sessionId}`} className="text-sm text-ink-soft hover:text-ink">← Back to the conversation</Link>
      <div className="mt-6">
        <PageHeader eyebrow="Memory review" title={cards.length ? `I learned ${cards.length} thing${cards.length > 1 ? "s" : ""} about you` : "Nothing new this time"}>
          Nothing is kept as true until you say so. Confirm what is right, edit what is almost right, reject what is wrong.
        </PageHeader>
      </div>
      {cards.length ? (
        <div className="space-y-4">
          {cards.map((m) => (
            <MemoryCard key={m.id} memory={m} />
          ))}
        </div>
      ) : (
        <EmptyState title="No memory suggested">Keep talking: details about people, places and moments help most.</EmptyState>
      )}
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/talk/new" className="btn-primary">Continue my story</Link>
        <Link href="/memories" className="btn-ghost">All my memories</Link>
      </div>
    </div>
  );
}
