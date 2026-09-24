import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getProgress } from "@/lib/services/memory";
import { underdocumentedAreas } from "@/lib/services/progress";
import { LIFE_AREA_LABELS, type LifeArea } from "@/lib/constants";
import { ProgressBar } from "@/components/ui";

export const metadata = { title: "Home" };

const QUESTIONS: Record<LifeArea, string[]> = {
  life_story: ["If your life were a book, what would the chapters be called?", "What moment changed the direction of your life?"],
  childhood: ["What did the house you grew up in smell like?", "Who was your best friend when you were eight?"],
  family: ["What is a tradition your family always kept?", "What did you learn from your grandparents?"],
  relationships: ["How did you meet the people who matter most to you?", "Who made you laugh the most?"],
  career: ["What was your very first job, and what did it teach you?", "What work are you proudest of?"],
  values: ["What do you believe in, no matter what?", "What would you never compromise on?"],
  advice: ["What would you tell your 20-year-old self?", "What advice would you give someone facing a hard choice?"],
  personality: ["What do people always say about you?", "What is an expression you use all the time?"],
  photos: ["Which photo would you save first in a fire?"],
  voice: ["Is there a song you always sing?"],
};

function greeting(tz: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, progress, { count: candidates }] = await Promise.all([
    supabase.from("profiles").select("first_name, preferred_name, timezone").eq("id", user.id).single(),
    getProgress(supabase, user.id),
    supabase.from("memories").select("id", { count: "exact", head: true }).eq("owner_user_id", user.id).eq("status", "candidate"),
  ]);
  const name = profile?.preferred_name || profile?.first_name || "";
  const focus = underdocumentedAreas(progress, 1)[0] ?? "life_story";
  const pool = QUESTIONS[focus];
  const question = pool[new Date().getUTCDate() % pool.length];

  const tiles = [
    { href: "/talk/new", title: "Talk about my life", body: "Continue your story with your interviewer." },
    { href: "/memories", title: "My Memories", body: candidates ? `${candidates} memories waiting for your review.` : "Everything you confirmed, in one place." },
    { href: "/photos", title: "My Photos", body: "Tell the story behind a picture." },
    { href: "/meet", title: "Meet My Still Here", body: "Talk with your digital self and correct it." },
    { href: "/people", title: "My People", body: "Choose who can explore your Still Here." },
    { href: "/settings", title: "Settings", body: "Profile, privacy, billing, export." },
  ];

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-4xl sm:text-5xl">
          {greeting(profile?.timezone ?? "UTC")}, {name}.
        </h1>
        <p className="mt-3 text-lg text-ink-soft">
          Your Still Here is <span className="font-serif text-2xl text-ink">{progress.total}%</span> complete.
        </p>
        <div className="mt-4 max-w-md">
          <ProgressBar value={progress.total} />
        </div>
        <p className="mt-2 text-xs text-muted">A simple guide to encourage you, not a measure of who you are.</p>
      </section>

      <section className="card bg-paper-2">
        <p className="eyebrow mb-2">Question of the day · {LIFE_AREA_LABELS[focus]}</p>
        <p className="font-serif text-2xl">{question}</p>
        <Link href={`/talk/new?prompt=${encodeURIComponent(question)}`} className="btn-primary mt-5">Answer this</Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="card transition hover:border-glow">
            <h2 className="text-xl">{t.title}</h2>
            <p className="mt-1 text-sm text-ink-soft">{t.body}</p>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="mb-4 text-2xl">Your story so far</h2>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {progress.areas.map((a) => (
            <div key={a.area}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{LIFE_AREA_LABELS[a.area]}</span>
                <span className="text-muted">{a.percent}%</span>
              </div>
              <ProgressBar value={a.percent} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
