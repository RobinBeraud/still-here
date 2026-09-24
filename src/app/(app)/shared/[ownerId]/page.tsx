import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { AiDisclosure, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { startDigitalSelf } from "../../talk/actions";

export const metadata = { title: "Still Here" };

export default async function SharedOwnerPage({ params }: { params: Promise<{ ownerId: string }> }) {
  const { ownerId } = await params;
  const { supabase, user } = await requireUser();
  const { data } = await supabase.rpc("still_here_card", { p_owner: ownerId });
  const card = (data as { display_name: string }[] | null)?.[0];
  if (!card || ownerId === user.id) notFound();

  const { data: sessions } = await supabase
    .from("conversation_sessions")
    .select("id, started_at")
    .eq("user_id", user.id)
    .eq("subject_user_id", ownerId)
    .eq("kind", "loved_one")
    .order("started_at", { ascending: false })
    .limit(10);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/shared" className="text-sm text-ink-soft hover:text-ink">← Shared with me</Link>
      <div className="mt-6">
        <PageHeader eyebrow="Still Here" title={`${card.display_name}'s Still Here`}>
          <AiDisclosure name={card.display_name} />
        </PageHeader>
      </div>
      <form action={startDigitalSelf}>
        <input type="hidden" name="owner_id" value={ownerId} />
        <SubmitButton>Start a conversation</SubmitButton>
      </form>
      {sessions?.length ? (
        <ul className="mt-8 space-y-2 text-sm">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link className="underline" href={`/shared/${ownerId}/${s.id}`}>{new Date(s.started_at).toLocaleString()}</Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
