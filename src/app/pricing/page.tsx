import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { listPlans, priceLine } from "@/lib/plans";

export const metadata = { title: "Pricing" };

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ canceled?: string; error?: string }> }) {
  const { canceled, error } = await searchParams;
  const supabase = await createClient();
  const [plans, { data: { user } }] = await Promise.all([listPlans(supabase), supabase.auth.getUser()]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <section className="py-12 sm:py-16">
          <p className="eyebrow mb-3">Plans</p>
          <h1 className="max-w-3xl text-4xl sm:text-5xl">Preserve a life. Pass it on.</h1>
          <p className="mt-4 max-w-2xl text-ink-soft">
            You are not buying AI credits. You are creating a memory that is kept safe and can be passed on. A missed payment never erases a life: your
            memories stay preserved and exportable.
          </p>
          {canceled && <p className="mt-4 text-sm text-warn">Checkout was cancelled. Nothing was charged.</p>}
          {error && <p className="mt-4 text-sm text-danger">This plan can&apos;t be purchased online right now. Please contact us.</p>}
        </section>

        <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const price = priceLine(plan);
            const highlighted = plan.code === "still_here";
            return (
              <div key={plan.code} className={`card flex flex-col ${highlighted ? "border-glow ring-1 ring-glow/40" : ""}`}>
                {highlighted && <span className="chip mb-3 self-start">Most chosen</span>}
                <h2 className="text-2xl">{plan.name}</h2>
                <p className="mt-1 text-sm text-ink-soft">{plan.tagline}</p>
                <p className="mt-6 font-serif text-4xl">{price.main}</p>
                <p className="mt-1 min-h-10 text-sm text-muted">{price.sub}</p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-glow" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  {plan.billing_model === "free" ? (
                    <Link href={user ? "/dashboard" : "/signup"} className="btn-ghost w-full">Begin for free</Link>
                  ) : plan.billing_model === "contact" ? (
                    <a href="mailto:hello@stillhere.app?subject=Still%20Here%20Forever" className="btn-ghost w-full">Talk to us</a>
                  ) : user ? (
                    <form action="/api/billing/checkout" method="post">
                      <input type="hidden" name="plan" value={plan.code} />
                      <button className={highlighted ? "btn-primary w-full" : "btn-ghost w-full"}>Choose {plan.name}</button>
                    </form>
                  ) : (
                    <Link href={`/signup?next=${encodeURIComponent("/pricing")}`} className={highlighted ? "btn-primary w-full" : "btn-ghost w-full"}>
                      Choose {plan.name}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <section className="mt-16 grid gap-8 text-sm text-ink-soft md:grid-cols-3">
          <div>
            <h3 className="text-lg text-ink">What does &ldquo;5 hours of video conversations&rdquo; mean?</h3>
            <p className="mt-2">Time spent talking face to face with your Still Here avatar each year. Text and voice conversations are not counted.</p>
          </div>
          <div>
            <h3 className="text-lg text-ink">What if a payment fails?</h3>
            <p className="mt-2">You get a grace period. After that, your Still Here switches to Preservation mode: nothing is deleted, you can always read and export everything.</p>
          </div>
          <div>
            <h3 className="text-lg text-ink">Can I leave?</h3>
            <p className="mt-2">Yes. Download your complete archive at any time, in open formats readable without Still Here.</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
