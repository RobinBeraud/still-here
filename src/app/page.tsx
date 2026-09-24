import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-header";

const steps = [
  { n: "01", title: "Tell your story", body: "An AI biographer listens and asks the right questions, by text, voice or video. Childhood, love, work, the lessons you learned." },
  { n: "02", title: "Confirm what matters", body: "Still Here turns your words into memories. Nothing is kept as true until you confirm, correct or reject it. Every memory links back to your own words." },
  { n: "03", title: "Share with those you love", body: "Create your avatar and voice, choose who can see what, and let your loved ones talk with your Still Here, grounded only in what you shared." },
];

const principles = [
  { title: "It never pretends", body: "Your Still Here always says it is an AI representation. It is not you, and it never claims to be." },
  { title: "It never invents", body: "If you never told it something, it says so. No made-up anecdotes, no false memories." },
  { title: "Your memories are yours", body: "Private by default, exportable at any time, never sold, never used to train external models." },
  { title: "Built to last", body: "Encrypted off-site backups, tested restores, and an archive you can read without us." },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <section className="py-16 sm:py-28">
          <p className="eyebrow mb-6">A living memory, in your own words</p>
          <h1 className="max-w-4xl text-5xl leading-[1.05] sm:text-7xl">
            Your stories.
            <br />
            Your voice.
            <br />
            <span className="italic text-glow">Still here.</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg text-ink-soft">
            Talk about your life with a gentle AI interviewer. Still Here preserves your memories, your photos and the way you speak, so the people you love can
            keep hearing your stories.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-primary px-7 py-3 text-base">Begin for free</Link>
            <Link href="/pricing" className="btn-ghost px-7 py-3 text-base">See plans</Link>
          </div>
        </section>

        <section className="grid gap-6 border-t border-line py-16 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n}>
              <p className="font-serif text-3xl text-glow">{s.n}</p>
              <h2 className="mt-3 text-2xl">{s.title}</h2>
              <p className="mt-2 text-ink-soft">{s.body}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl bg-paper-2 px-6 py-14 sm:px-12">
          <h2 className="max-w-2xl text-3xl sm:text-4xl">A memory you can trust.</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            {principles.map((p) => (
              <div key={p.title}>
                <h3 className="text-xl">{p.title}</h3>
                <p className="mt-2 text-ink-soft">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-20 text-center">
          <h2 className="mx-auto max-w-2xl text-3xl sm:text-4xl">The best time to tell your story is while you can tell it yourself.</h2>
          <Link href="/signup" className="btn-primary mt-8 px-7 py-3 text-base">Start your Still Here</Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
