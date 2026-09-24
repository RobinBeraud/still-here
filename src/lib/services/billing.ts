/**
 * BillingService — traitement des événements de paiement (indépendant de Stripe).
 *
 * Invariants (docs/BILLING.md) :
 *  - idempotence : un event_id n'est traité qu'une fois (doublons ignorés, échecs rejoués) ;
 *  - insensible à l'ordre : l'état d'un abonnement est TOUJOURS relu chez le fournisseur ;
 *  - un plan n'est activé que par un événement vérifié, jamais par un redirect client ;
 *  - aucune donnée mémorielle n'est jamais supprimée par un événement de paiement.
 */
import type { BillingState } from "./entitlements";
import { planToRows, type EntitlementRow } from "./entitlements";
import type { BillingDomainEvent, PaymentProvider, ProviderEvent, ProviderSubscription } from "@/lib/providers/types";

export type Plan = {
  code: string;
  billing_model: "free" | "one_time" | "one_time_plus_annual" | "contact";
  included_years: number | null;
  entitlements: Record<string, unknown>;
};

export type BillingAccount = {
  user_id: string;
  plan_code: string;
  billing_state: BillingState;
  grace_period_ends_at: string | null;
  paid_through: string | null;
  provider_customer_id: string | null;
};

export type BillingNotice = "payment_failed" | "grace_period_started" | "preservation_mode" | "payment_confirmed";

export interface BillingRepo {
  /** 'process' si l'événement doit être traité, 'skip' si déjà traité / en cours. */
  claimEvent(eventId: string, type: string): Promise<"process" | "skip">;
  completeEvent(eventId: string, status: "processed" | "ignored"): Promise<void>;
  failEvent(eventId: string, error: string): Promise<void>;

  findUserIdByCustomer(customerId: string): Promise<string | null>;
  getAccount(userId: string): Promise<BillingAccount | null>;
  updateAccount(userId: string, patch: Partial<Omit<BillingAccount, "user_id">>): Promise<void>;
  getPlan(code: string): Promise<Plan | null>;
  upsertEntitlements(userId: string, rows: EntitlementRow[]): Promise<void>;
  expireEntitlements(userId: string, sourcePrefix: string, at: Date): Promise<void>;
  upsertSubscription(userId: string, sub: ProviderSubscription, planCode: string): Promise<void>;
  recordPayment(p: {
    userId: string | null;
    providerPaymentId: string;
    planCode: string | null;
    kind: "payment" | "refund";
    amount: number;
    currency: string;
    status: string;
    receiptUrl?: string | null;
  }): Promise<void>;
  notify(userId: string, notice: BillingNotice): Promise<void>;
  audit(userId: string | null, action: string, metadata: Record<string, unknown>): Promise<void>;
}

export type BillingDeps = {
  repo: BillingRepo;
  payment: Pick<PaymentProvider, "getSubscription">;
  gracePeriodDays: number;
  now?: () => Date;
};

export const planSource = (planCode: string) => `plan:${planCode}`;

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
const addYears = (d: Date, years: number) => {
  const r = new Date(d);
  r.setUTCFullYear(r.getUTCFullYear() + years);
  return r;
};

/** Point d'entrée : idempotent, rejouable. */
export async function processBillingEvent(pe: ProviderEvent, deps: BillingDeps): Promise<"processed" | "ignored" | "skipped"> {
  const { repo } = deps;
  if ((await repo.claimEvent(pe.id, pe.type)) === "skip") return "skipped";
  try {
    const handled = await handle(pe.event, deps);
    const status = handled ? "processed" : "ignored";
    await repo.completeEvent(pe.id, status);
    return status;
  } catch (err) {
    await repo.failEvent(pe.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function handle(ev: BillingDomainEvent, deps: BillingDeps): Promise<boolean> {
  switch (ev.kind) {
    case "checkout_completed":
      return onCheckoutCompleted(ev, deps);
    case "invoice_paid":
      return onInvoicePaid(ev, deps);
    case "invoice_payment_failed":
      return onInvoiceFailed(ev, deps);
    case "subscription_changed":
      return syncSubscription(ev.subscriptionId, deps);
    case "refund":
      return onRefund(ev, deps);
    case "ignored":
      return false;
  }
}

async function onCheckoutCompleted(ev: Extract<BillingDomainEvent, { kind: "checkout_completed" }>, deps: BillingDeps) {
  if (!ev.paid) return false; // paiement asynchrone : attendre async_payment_succeeded
  const { repo } = deps;
  const now = deps.now?.() ?? new Date();
  const plan = await repo.getPlan(ev.planCode);
  if (!plan) throw new Error(`Unknown plan ${ev.planCode}`);

  await repo.updateAccount(ev.userId, {
    provider_customer_id: ev.customerId || null,
    plan_code: plan.code,
    billing_state: "ACTIVE",
    grace_period_ends_at: null,
  });

  if (ev.subscriptionId) {
    // Abonnement : l'état réel vient du fournisseur (ordre des webhooks indifférent)
    await syncSubscription(ev.subscriptionId, deps, { userId: ev.userId, planCode: plan.code });
  } else {
    // Paiement unique : Legacy = N années incluses, Forever = sans échéance
    const expiresAt = plan.included_years ? addYears(now, plan.included_years) : null;
    await repo.upsertEntitlements(ev.userId, planToRows(plan.entitlements, planSource(plan.code), now, expiresAt));
    await repo.updateAccount(ev.userId, { paid_through: expiresAt ? expiresAt.toISOString() : null });
    await repo.recordPayment({
      userId: ev.userId,
      providerPaymentId: ev.paymentId,
      planCode: plan.code,
      kind: "payment",
      amount: ev.amount,
      currency: ev.currency,
      status: "succeeded",
    });
  }
  await repo.audit(ev.userId, "billing.plan_activated", { plan: plan.code });
  await repo.notify(ev.userId, "payment_confirmed");
  return true;
}

async function onInvoicePaid(ev: Extract<BillingDomainEvent, { kind: "invoice_paid" }>, deps: BillingDeps) {
  const userId = await deps.repo.findUserIdByCustomer(ev.customerId);
  if (!userId) throw new Error(`No user for customer ${ev.customerId}`); // rejoué plus tard
  await deps.repo.recordPayment({
    userId,
    providerPaymentId: ev.paymentId,
    planCode: null,
    kind: "payment",
    amount: ev.amount,
    currency: ev.currency,
    status: "succeeded",
    receiptUrl: ev.receiptUrl,
  });
  if (ev.subscriptionId) await syncSubscription(ev.subscriptionId, deps, { userId });
  return true;
}

async function onInvoiceFailed(ev: Extract<BillingDomainEvent, { kind: "invoice_payment_failed" }>, deps: BillingDeps) {
  const userId = await deps.repo.findUserIdByCustomer(ev.customerId);
  if (!userId) throw new Error(`No user for customer ${ev.customerId}`);
  if (!ev.subscriptionId) return false;
  // Un échec obsolète (arrivé après régularisation) ne doit pas dégrader le compte.
  return syncSubscription(ev.subscriptionId, deps, { userId });
}

/**
 * Machine à états : ACTIVE → PAST_DUE → GRACE_PERIOD → PRESERVATION_ONLY.
 * Aucune transition ne supprime de souvenirs. CLOSED n'est jamais posé automatiquement.
 */
export async function syncSubscription(
  subscriptionId: string,
  deps: BillingDeps,
  hint: { userId?: string; planCode?: string } = {},
): Promise<boolean> {
  const { repo } = deps;
  const now = deps.now?.() ?? new Date();
  const sub = await deps.payment.getSubscription(subscriptionId);
  const userId = hint.userId ?? sub.userId ?? (await repo.findUserIdByCustomer(sub.customerId));
  if (!userId) throw new Error(`No user for subscription ${subscriptionId}`);
  const planCode = hint.planCode ?? sub.planCode;
  if (!planCode) throw new Error(`No plan_code metadata on subscription ${subscriptionId}`);
  const plan = await repo.getPlan(planCode);
  if (!plan) throw new Error(`Unknown plan ${planCode}`);

  const account = await repo.getAccount(userId);
  await repo.upsertSubscription(userId, sub, planCode);

  switch (sub.status) {
    case "active":
    case "trialing": {
      await repo.upsertEntitlements(userId, planToRows(plan.entitlements, planSource(planCode), now, null));
      await repo.updateAccount(userId, {
        plan_code: planCode,
        billing_state: "ACTIVE",
        grace_period_ends_at: null,
        paid_through: sub.currentPeriodEnd?.toISOString() ?? null,
        provider_customer_id: sub.customerId,
      });
      return true;
    }
    case "past_due": {
      if (account?.billing_state !== "PAST_DUE") {
        await repo.updateAccount(userId, { billing_state: "PAST_DUE" });
        await repo.notify(userId, "payment_failed");
      }
      return true;
    }
    case "unpaid":
    case "canceled":
    case "incomplete_expired": {
      const nonPayment = sub.status === "unpaid" || account?.billing_state === "PAST_DUE";
      if (nonPayment) {
        if (account?.billing_state !== "GRACE_PERIOD" && account?.billing_state !== "PRESERVATION_ONLY") {
          await repo.updateAccount(userId, {
            billing_state: "GRACE_PERIOD",
            grace_period_ends_at: addDays(now, deps.gracePeriodDays).toISOString(),
          });
          await repo.notify(userId, "grace_period_started");
        }
      } else if (account?.billing_state !== "PRESERVATION_ONLY") {
        // Annulation volontaire arrivée à échéance
        await enterPreservation(userId, planCode, deps, now);
      }
      return true;
    }
    default:
      return false; // incomplete, paused… : pas de changement de droits
  }
}

export async function enterPreservation(userId: string, planCode: string, deps: BillingDeps, now: Date) {
  await deps.repo.expireEntitlements(userId, planSource(planCode), now);
  await deps.repo.updateAccount(userId, { billing_state: "PRESERVATION_ONLY", grace_period_ends_at: null });
  await deps.repo.audit(userId, "billing.preservation_mode", { plan: planCode });
  await deps.repo.notify(userId, "preservation_mode");
}

async function onRefund(ev: Extract<BillingDomainEvent, { kind: "refund" }>, deps: BillingDeps) {
  const userId = ev.customerId ? await deps.repo.findUserIdByCustomer(ev.customerId) : null;
  await deps.repo.recordPayment({
    userId,
    providerPaymentId: `${ev.paymentId}:refund:${ev.amountRefunded}`,
    planCode: null,
    kind: "refund",
    amount: -Math.abs(ev.amountRefunded),
    currency: ev.currency,
    status: ev.fullyRefunded ? "refunded" : "partially_refunded",
  });
  await deps.repo.audit(userId, "billing.refund", { payment: ev.paymentId, amount: ev.amountRefunded, full: ev.fullyRefunded });
  if (userId && ev.fullyRefunded) {
    const account = await deps.repo.getAccount(userId);
    if (account && account.plan_code !== "discover") {
      await enterPreservation(userId, account.plan_code, deps, deps.now?.() ?? new Date());
    }
  }
  return true;
}

/** Cron quotidien : fin de période de grâce et fin des années incluses (Legacy). */
export async function expireGracePeriods(
  accounts: BillingAccount[],
  deps: BillingDeps,
  usersWithLiveSubscription: Set<string> = new Set(),
): Promise<number> {
  const now = deps.now?.() ?? new Date();
  let changed = 0;
  for (const acc of accounts) {
    const graceOver = acc.billing_state === "GRACE_PERIOD" && acc.grace_period_ends_at && new Date(acc.grace_period_ends_at) <= now;
    // Les abonnements sont pilotés par le fournisseur ; seuls les prépaiements expirent ici.
    const prepaidOver =
      acc.billing_state === "ACTIVE" &&
      acc.plan_code !== "discover" &&
      !usersWithLiveSubscription.has(acc.user_id) &&
      acc.paid_through &&
      new Date(acc.paid_through) <= now;
    if (graceOver || prepaidOver) {
      await enterPreservation(acc.user_id, acc.plan_code, deps, now);
      changed++;
    }
  }
  return changed;
}
