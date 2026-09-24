import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { MemoryCard, type MemoryCardData } from "@/components/memory-card";
import { EmptyState, PageHeader } from "@/components/ui";
import { NewMemoryForm } from "./new-memory-form";

export const metadata = { title: "My Memories" };

const TABS = [
  { key: "candidate", label: "To review" },
  { key: "kept", label: "Kept" },
  { key: "rejected", label: "Rejected" },
] as const;

export default async function MemoriesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tab = "candidate", q } = await searchParams;
  const { supabase, user } = await requireUser();

  let query = supabase
    .from("memories")
    .select("id, type, title, content, occurred_on, status, privacy_level")
    .eq("owner_user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (tab === "candidate") query = query.eq("status", "candidate");
  else if (tab === "rejected") query = query.eq("status", "rejected");
  else query = query.in("status", ["confirmed", "corrected"]);
  if (q) query = query.or(`title.ilike.%${q.replace(/[%,()]/g, "")}%,content.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data } = await query;
  const memories = (data ?? []) as MemoryCardData[];

  return (
    <>
      <PageHeader eyebrow="My Memories" title="Your memory library">
        Every memory links back to your own words. <Link className="underline" href="/memories/personality">See how you speak →</Link>
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-paper-2 p-1 text-sm">
          {TABS.map((t) => (
            <Link key={t.key} href={`/memories?tab=${t.key}`} className={`rounded-full px-3.5 py-1.5 ${tab === t.key ? "bg-card shadow-sm" : "text-ink-soft"}`}>
              {t.label}
            </Link>
          ))}
        </div>
        <form className="flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <input className="input py-2" name="q" defaultValue={q} placeholder="Search memories" />
        </form>
      </div>

      {tab === "kept" && <NewMemoryForm />}

      {memories.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {memories.map((m) => (
            <MemoryCard key={m.id} memory={m} />
          ))}
        </div>
      ) : (
        <EmptyState title={tab === "candidate" ? "Nothing waiting for review" : "No memory here yet"}>
          <Link href="/talk/new" className="underline">Talk about your life</Link> to add more.
        </EmptyState>
      )}
    </>
  );
}
