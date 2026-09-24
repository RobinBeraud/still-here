import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Shared with me" };

export default async function SharedPage() {
  const { supabase, user } = await requireUser();
  const { data: links } = await supabase.from("trusted_people").select("owner_user_id").eq("linked_user_id", user.id).eq("status", "active");
  const cards = (
    await Promise.all(
      (links ?? []).map(async (l) => {
        const { data } = await supabase.rpc("still_here_card", { p_owner: l.owner_user_id });
        return (data as { owner_id: string; display_name: string }[] | null)?.[0] ?? null;
      }),
    )
  ).filter((c): c is { owner_id: string; display_name: string } => c !== null);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Shared with me" title="Still Heres you can visit">
        These people chose to share their stories with you. You will be talking with an AI representation built only from what they shared.
      </PageHeader>
      {cards.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <Link key={c.owner_id} href={`/shared/${c.owner_id}`} className="card transition hover:border-glow">
              <p className="font-serif text-2xl">{c.display_name}</p>
              <p className="mt-1 text-sm text-ink-soft">Talk with {c.display_name}&apos;s Still Here</p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="Nothing shared with you yet" />
      )}
    </div>
  );
}
