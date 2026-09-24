import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { startDigitalSelf } from "../talk/actions";

export const metadata = { title: "Meet My Still Here" };

export default async function MeetPage() {
  const { supabase, user } = await requireUser();
  const [{ count: memories }, { data: sessions }, { data: avatar }] = await Promise.all([
    supabase.from("memories").select("id", { count: "exact", head: true }).eq("owner_user_id", user.id).in("status", ["confirmed", "corrected"]),
    supabase.from("conversation_sessions").select("id, started_at").eq("user_id", user.id).eq("kind", "meet_self").order("started_at", { ascending: false }).limit(10),
    supabase.from("avatar_profiles").select("status").eq("owner_user_id", user.id).maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Meet My Still Here" title="Talk with your digital self">
        Ask it anything. It answers only from the memories you confirmed ({memories ?? 0} so far), in your style, and tells you when it doesn&apos;t know.
        Correct it whenever it doesn&apos;t sound like you.
      </PageHeader>
      <div className="flex flex-wrap gap-3">
        <form action={startDigitalSelf}>
          <input type="hidden" name="owner_id" value={user.id} />
          <SubmitButton>Start a conversation</SubmitButton>
        </form>
        <Link href="/meet/avatar" className="btn-ghost">
          {avatar?.status === "ready" ? "My avatar & voice" : "Create my avatar & voice"}
        </Link>
      </div>
      {sessions?.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-xl">Previous conversations</h2>
          <ul className="space-y-2 text-sm">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link className="underline" href={`/meet/${s.id}`}>{new Date(s.started_at).toLocaleString()}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
