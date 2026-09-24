import { beforeEach, describe, expect, it } from "vitest";
import { expireGracePeriods, processBillingEvent, type BillingAccount, type BillingDeps, type BillingRepo, type Plan } from "@/lib/services/billing";
import { resolveEntitlements, type EntitlementRow } from "@/lib/services/entitlements";
import type { ProviderEvent, ProviderSubscription } from "@/lib/providers/types";

// ------------------------------------------------------------------ in-memory fakes

const PLANS: Record<string, Plan> = {
  discover: { code: "discover", billing_model: "free", included_years: null, entitlements: { max_memories: 10 } },
  still_here: {
    code: "still_here",
    billing_model: "one_time_plus_annual",
    included_years: null,
    entitlements: { can_use_live_avatar: true, can_create_avatar: true, max_loved_ones: 1, max_memories: null, avatar_minutes_included: 300 },
  },
  legacy: { code: "legacy", billing_model: "one_time", included_years: 5, entitlements: { can_use_live_avatar: true, max_loved_ones: 10 } },
};

class MemoryRepo implements BillingRepo {
  events = new Map<string, { status: string; attempts: number }>();
  accounts = new Map<string, BillingAccount>();
  entitlements: (EntitlementRow & { user_id: string })[] = [];
  subscriptions = new Map<string, { userId: string; status: string }>();
  payments = new Map<string, { amount: number; kind: string }>();
  notices: string[] = [];
  deletedMemories = 0; // doit toujours rester à 0

  async claimEvent(id: string) {
    const e = this.events.get(id);
    if (!e) {
      this.events.set(id, { status: "processing", attempts: 1 });
      return "process" as const;
    }
    if (e.status === "processed" || e.status === "ignored" || e.status === "processing") return "skip" as const;
    e.status = "processing";
    e.attempts++;
    return "process" as const;
  }
  async completeEvent(id: string, status: "processed" | "ignored") {
    this.events.get(id)!.status = status;
  }
  async failEvent(id: string) {
    this.events.get(id)!.status = "failed";
  }
  async findUserIdByCustomer(customerId: string) {
    return [...this.accounts.values()].find((a) => a.provider_customer_id === customerId)?.user_id ?? null;
  }
  async getAccount(userId: string) {
    return this.accounts.get(userId) ?? null;
  }
  async updateAccount(userId: string, patch: Partial<BillingAccount>) {
    const current = this.accounts.get(userId) ?? {
      user_id: userId,
      plan_code: "discover",
      billing_state: "ACTIVE",
      grace_period_ends_at: null,
      paid_through: null,
      provider_customer_id: null,
    };
    this.accounts.set(userId, { ...current, ...patch } as BillingAccount);
  }
  async getPlan(code: string) {
    return PLANS[code] ?? null;
  }
  async upsertEntitlements(userId: string, rows: EntitlementRow[]) {
    for (const r of rows) {
      this.entitlements = this.entitlements.filter((e) => !(e.user_id === userId && e.key === r.key && e.source === r.source));
      this.entitlements.push({ ...r, user_id: userId });
    }
  }
  async expireEntitlements(userId: string, source: string, at: Date) {
    for (const e of this.entitlements) if (e.user_id === userId && e.source === source) e.expires_at = at.toISOString();
  }
  async upsertSubscription(userId: string, sub: ProviderSubscription) {
    this.subscriptions.set(sub.id, { userId, status: sub.status });
  }
  async recordPayment(p: { providerPaymentId: string; amount: number; kind: string }) {
    if (!this.payments.has(p.providerPaymentId)) this.payments.set(p.providerPaymentId, { amount: p.amount, kind: p.kind });
  }
  async notify(_: string, notice: string) {
    this.notices.push(notice);
  }
  async audit() {}

  effective(userId: string, now = new Date()) {
    const acc = this.accounts.get(userId)!;
    return resolveEntitlements(this.entitlements.filter((e) => e.user_id === userId), acc.billing_state, now);
  }
}

class FakeProvider {
  subs = new Map<string, ProviderSubscription>();
  calls = 0;
  async getSubscription(id: string) {
    this.calls++;
    const s = this.subs.get(id);
    if (!s) throw new Error("not found");
    return s;
  }
}

const USER = "user-1";
const CUSTOMER = "cus_1";
let repo: MemoryRepo;
let provider: FakeProvider;
let deps: BillingDeps;
let now: Date;

function sub(status: string, extra: Partial<ProviderSubscription> = {}): ProviderSubscription {
  return {
    id: "sub_1",
    customerId: CUSTOMER,
    status,
    planCode: "still_here",
    userId: USER,
    currentPeriodEnd: new Date("2027-09-24T00:00:00Z"),
    cancelAtPeriodEnd: false,
    ...extra,
  };
}

const checkout = (id = "evt_checkout"): ProviderEvent => ({
  id,
  type: "checkout.session.completed",
  event: { kind: "checkout_completed", userId: USER, planCode: "still_here", customerId: CUSTOMER, subscriptionId: "sub_1", paymentId: "cs_1", amount: 37800, currency: "eur", paid: true },
});
const subChanged = (id: string): ProviderEvent => ({ id, type: "customer.subscription.updated", event: { kind: "subscription_changed", customerId: CUSTOMER, subscriptionId: "sub_1" } });
const invoicePaid = (id: string, paymentId = "in_1"): ProviderEvent => ({
  id,
  type: "invoice.paid",
  event: { kind: "invoice_paid", customerId: CUSTOMER, subscriptionId: "sub_1", paymentId, amount: 37800, currency: "eur", receiptUrl: null },
});
const invoiceFailed = (id: string): ProviderEvent => ({ id, type: "invoice.payment_failed", event: { kind: "invoice_payment_failed", customerId: CUSTOMER, subscriptionId: "sub_1" } });

beforeEach(() => {
  repo = new MemoryRepo();
  provider = new FakeProvider();
  now = new Date("2026-09-24T12:00:00Z");
  deps = { repo, payment: provider, gracePeriodDays: 30, now: () => now };
  provider.subs.set("sub_1", sub("active"));
  repo.accounts.set(USER, { user_id: USER, plan_code: "discover", billing_state: "ACTIVE", grace_period_ends_at: null, paid_through: null, provider_customer_id: CUSTOMER });
});

// ------------------------------------------------------------------ tests

describe("webhooks — idempotence", () => {
  it("processes a checkout once and grants entitlements", async () => {
    expect(await processBillingEvent(checkout(), deps)).toBe("processed");
    const ent = repo.effective(USER, now);
    expect(ent.can_use_live_avatar).toBe(true);
    expect(ent.max_memories).toBeNull();
    expect(repo.accounts.get(USER)!.plan_code).toBe("still_here");
  });

  it("ignores a duplicate delivery of the same event", async () => {
    await processBillingEvent(checkout(), deps);
    const callsAfterFirst = provider.calls;
    expect(await processBillingEvent(checkout(), deps)).toBe("skipped");
    expect(provider.calls).toBe(callsAfterFirst);
    expect(repo.notices.filter((n) => n === "payment_confirmed")).toHaveLength(1);
  });

  it("does not record the same payment twice when invoice.paid is delivered twice", async () => {
    await processBillingEvent(checkout(), deps);
    await processBillingEvent(invoicePaid("evt_inv_a"), deps);
    await processBillingEvent(invoicePaid("evt_inv_b"), deps); // autre event_id, même paiement
    expect(repo.payments.size).toBe(1);
  });

  it("retries a failed event and succeeds", async () => {
    provider.subs.delete("sub_1");
    await expect(processBillingEvent(checkout(), deps)).rejects.toThrow();
    expect(repo.events.get("evt_checkout")!.status).toBe("failed");
    provider.subs.set("sub_1", sub("active"));
    expect(await processBillingEvent(checkout(), deps)).toBe("processed");
    expect(repo.events.get("evt_checkout")!.attempts).toBe(2);
    expect(repo.effective(USER, now).can_use_live_avatar).toBe(true);
  });

  it("does not grant anything for an unpaid (async) checkout", async () => {
    const ev = checkout();
    if (ev.event.kind === "checkout_completed") ev.event.paid = false;
    expect(await processBillingEvent(ev, deps)).toBe("ignored");
    expect(repo.effective(USER, now).can_use_live_avatar).toBe(false);
  });
});

describe("webhooks — out of order", () => {
  it("a stale payment_failed arriving after recovery does not degrade the account", async () => {
    await processBillingEvent(checkout(), deps);
    // Le fournisseur indique que l'abonnement est actif (paiement régularisé)
    await processBillingEvent(invoiceFailed("evt_old_failure"), deps);
    expect(repo.accounts.get(USER)!.billing_state).toBe("ACTIVE");
  });

  it("subscription.updated before checkout.completed converges to the same state", async () => {
    await processBillingEvent(subChanged("evt_sub_first"), deps);
    await processBillingEvent(checkout(), deps);
    const acc = repo.accounts.get(USER)!;
    expect(acc.billing_state).toBe("ACTIVE");
    expect(acc.plan_code).toBe("still_here");
    expect(repo.effective(USER, now).can_use_live_avatar).toBe(true);
  });
});

describe("failed payment → grace → preservation", () => {
  it("never deletes memories and keeps data accessible", async () => {
    await processBillingEvent(checkout(), deps);

    provider.subs.set("sub_1", sub("past_due"));
    await processBillingEvent(invoiceFailed("evt_fail_1"), deps);
    expect(repo.accounts.get(USER)!.billing_state).toBe("PAST_DUE");
    expect(repo.notices).toContain("payment_failed");
    expect(repo.effective(USER, now).can_use_live_avatar).toBe(true); // rien n'est coupé pendant les relances

    provider.subs.set("sub_1", sub("unpaid"));
    await processBillingEvent(subChanged("evt_unpaid"), deps);
    const acc = repo.accounts.get(USER)!;
    expect(acc.billing_state).toBe("GRACE_PERIOD");
    expect(new Date(acc.grace_period_ends_at!).getTime()).toBe(now.getTime() + 30 * 86_400_000);
    expect(repo.effective(USER, now).can_use_live_avatar).toBe(true);

    // Le cron avant la fin de la grâce ne change rien
    expect(await expireGracePeriods([repo.accounts.get(USER)!], deps)).toBe(0);

    now = new Date(now.getTime() + 31 * 86_400_000);
    expect(await expireGracePeriods([repo.accounts.get(USER)!], deps)).toBe(1);
    expect(repo.accounts.get(USER)!.billing_state).toBe("PRESERVATION_ONLY");
    const ent = repo.effective(USER, now);
    expect(ent.can_use_live_avatar).toBe(false);
    expect(ent.can_add_content).toBe(false);
    expect(repo.deletedMemories).toBe(0);
  });

  it("recovering payment during grace restores ACTIVE", async () => {
    await processBillingEvent(checkout(), deps);
    provider.subs.set("sub_1", sub("unpaid"));
    repo.accounts.get(USER)!.billing_state = "PAST_DUE";
    await processBillingEvent(subChanged("evt_unpaid"), deps);
    expect(repo.accounts.get(USER)!.billing_state).toBe("GRACE_PERIOD");
    provider.subs.set("sub_1", sub("active"));
    await processBillingEvent(invoicePaid("evt_recovered", "in_2"), deps);
    expect(repo.accounts.get(USER)!.billing_state).toBe("ACTIVE");
    expect(repo.accounts.get(USER)!.grace_period_ends_at).toBeNull();
  });

  it("voluntary cancellation at period end goes to preservation, not deletion", async () => {
    await processBillingEvent(checkout(), deps);
    provider.subs.set("sub_1", sub("canceled", { cancelAtPeriodEnd: true }));
    await processBillingEvent(subChanged("evt_cancel"), deps);
    expect(repo.accounts.get(USER)!.billing_state).toBe("PRESERVATION_ONLY");
    expect(repo.effective(USER, now).can_use_live_avatar).toBe(false);
  });
});

describe("refunds and one-time plans", () => {
  it("full refund moves to preservation and records a negative payment", async () => {
    await processBillingEvent(checkout(), deps);
    await processBillingEvent(
      { id: "evt_refund", type: "charge.refunded", event: { kind: "refund", customerId: CUSTOMER, paymentId: "ch_1", amountRefunded: 37800, currency: "eur", fullyRefunded: true } },
      deps,
    );
    expect(repo.accounts.get(USER)!.billing_state).toBe("PRESERVATION_ONLY");
    expect([...repo.payments.values()].some((p) => p.kind === "refund" && p.amount === -37800)).toBe(true);
  });

  it("legacy one-time plan includes 5 years then expires into preservation", async () => {
    await processBillingEvent(
      {
        id: "evt_legacy",
        type: "checkout.session.completed",
        event: { kind: "checkout_completed", userId: USER, planCode: "legacy", customerId: CUSTOMER, subscriptionId: null, paymentId: "cs_legacy", amount: 69900, currency: "eur", paid: true },
      },
      deps,
    );
    const acc = repo.accounts.get(USER)!;
    expect(new Date(acc.paid_through!).getUTCFullYear()).toBe(2031);
    expect(repo.effective(USER, now).max_loved_ones).toBe(10);

    now = new Date("2031-10-01T00:00:00Z");
    expect(repo.effective(USER, now).max_loved_ones).toBe(0); // entitlements expirés
    expect(await expireGracePeriods([repo.accounts.get(USER)!], deps)).toBe(1);
    expect(repo.accounts.get(USER)!.billing_state).toBe("PRESERVATION_ONLY");
  });

  it("the prepaid-expiry cron never touches users with a live subscription", async () => {
    await processBillingEvent(checkout(), deps);
    const acc = { ...repo.accounts.get(USER)!, paid_through: "2026-01-01T00:00:00Z" };
    expect(await expireGracePeriods([acc], deps, new Set([USER]))).toBe(0);
  });
});
