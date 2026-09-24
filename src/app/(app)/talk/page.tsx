import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { startInterview } from "./actions";

export const metadata = { title: "Talk about my life" };

export default async function TalkPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: sessions } = await supabase
    .from("conversation_sessions")
    .select("id, title, kind, started_at, extracted_at")
    .eq("user_id", user.id)
    .in("kind", ["interview", "photo_story"])
    .order("started_at", { ascending: false })
    .limit(50);

  return (
    <>
      <PageHeader eyebrow="Talk about my life" title="Your conversations">
        Every conversation is kept exactly as you said it. When you finish, Still Here suggests memories for you to confirm.
      </PageHeader>
      {error === "preservation" && (
        <div className="mb-6">
          <Notice tone="warn">Your Still Here is in Preservation mode. <Link className="underline" href="/pricing">Reactivate a plan</Link> to add new stories.</Notice>
        </div>
      )}
      <form action={startInterview} className="mb-10">
        <SubmitButton pendingLabel="Preparing your interviewer…">Start a new conversation</SubmitButton>
      </form>
      {sessions?.length ? (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link href={s.extracted_at ? `/talk/${s.id}/review` : `/talk/${s.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-paper-2">
                <div>
                  <p className="font-medium">{s.title || (s.kind === "photo_story" ? "Story behind a photo" : "Conversation")}</p>
                  <p className="text-sm text-muted">{new Date(s.started_at).toLocaleString()}</p>
                </div>
                <span className="chip">{s.extracted_at ? "Reviewed" : "In progress"}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No conversation yet">Start with anything: a place, a person, a smell from your childhood.</EmptyState>
      )}
    </>
  );
}
