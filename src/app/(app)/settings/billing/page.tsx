import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/services/entitlements-repo";
import { formatPrice } from "@/lib/plans";
import { Notice, ProgressBar } from "@/components/ui";

export const metadata = { title: "Billing" };

const STATE_COPY: Record<string, { label: string; tone: "ok" | "warn" | "info" | "danger" }> = {
  ACTIVE: { label: "Active", tone: "ok" },
  PAST_DUE: { label: "Payment issue: we are retrying", tone: "warn" },
  GRACE_PERIOD: { label: "Grace period", tone: "warn" },
  PRESERVATION_ONLY: { label: "Preservation mode", tone: "info" },
  CLOSED: { label: "Closed", tone: "danger" },
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const { success } = await searchParams;
  const { supabase, user } = await requireUser();
  const [ent, { data: account }, { data: payments }, { data: subs }] = await Promise.all([
    getEntitlements(user.id),
    supabase.from("billing_accounts").select("provider_customer_id, paid_through").eq("user_id", user.id).maybeSingle(),
    supabase.from("payments").select("id, amount, currency, status, kind, receipt_url, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("subscriptions").select("status, current_period_end, cancel_at_period_end").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1),
  ]);
  const { data: plan } = await supabase.from("plans").select("name").eq("code", ent.plan_code).maybeSingle();
  const planName = plan?.name ?? "Discover";
  const state = STATE_COPY[ent.billing_state];
  const sub = subs?.[0];
  const totalMinutes = ent.avatar_minutes_included + ent.avatar_minutes_extra;

  return (
    <div className="space-y-8">
      {success && (
        <Notice tone="ok">
          Thank you. Your payment is being confirmed; your plan activates as soon as our payment provider confirms it (usually a few seconds).
        </Notice>
      )}

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Current plan</p>
            <p className="font-serif text-3xl">{planName}</p>
          </div>
          <span className="chip">{state.label}</span>
        </div>
        {ent.billing_state === "GRACE_PERIOD" && ent.grace_period_ends_at && (
          <Notice tone="warn">Please update your payment method before {new Date(ent.grace_period_ends_at).toLocaleDateString()}. Your memories are safe either way.</Notice>
        )}
        {sub && (
          <p className="text-sm text-ink-soft">
            {sub.cancel_at_period_end ? "Ends" : "Renews"} on {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}.
          </p>
        )}
        {!sub && account?.paid_through && <p className="text-sm text-ink-soft">Included until {new Date(account.paid_through).toLocaleDateString()}.</p>}
        <div className="flex flex-wrap gap-3">
          <Link href="/pricing" className="btn-primary">{ent.plan_code === "discover" ? "Choose a plan" : "Change plan"}</Link>
          {account?.provider_customer_id && (
            <form action="/api/billing/portal" method="post">
              <button className="btn-ghost">Payment methods & invoices</button>
            </form>
          )}
        </div>
      </section>

      <section className="card space-y-5">
        <h2 className="text-xl">What your plan includes</h2>
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span>Video conversations this year</span>
            <span className="text-muted">
              {Math.floor(ent.avatar_minutes_remaining / 60)}h{String(ent.avatar_minutes_remaining % 60).padStart(2, "0")} left of {Math.round(totalMinutes / 60)}h
            </span>
          </div>
          <ProgressBar value={totalMinutes ? (ent.avatar_minutes_remaining / totalMinutes) * 100 : 0} />
        </div>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li>Loved ones: {ent.max_loved_ones}</li>
          <li>Memories: {ent.max_memories === null ? "unlimited" : ent.max_memories}</li>
          <li>Personal avatar: {ent.can_create_avatar ? "yes" : "no"}</li>
          <li>Storage: {Math.round(ent.storage_limit_bytes / 1024 ** 3)} GB</li>
        </ul>
      </section>

      <section className="card">
        <h2 className="mb-3 text-xl">Payments & receipts</h2>
        {payments?.length ? (
          <ul className="divide-y divide-line text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{new Date(p.created_at).toLocaleDateString()} · {p.kind === "refund" ? "Refund" : "Payment"}</span>
                <span>
                  {formatPrice(p.amount, p.currency)}{" "}
                  {p.receipt_url && <a href={p.receipt_url} className="underline" target="_blank" rel="noreferrer">receipt</a>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No payment yet.</p>
        )}
      </section>
    </div>
  );
}
