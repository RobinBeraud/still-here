import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";
import type { BillingDomainEvent, PaymentProvider, ProviderEvent, ProviderSubscription } from "./types";

let client: Stripe | null = null;
function stripe() {
  if (!client) client = new Stripe(serverEnv.stripeSecretKey, { appInfo: { name: "still-here" } });
  return client;
}

function idOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

/** Normalise un événement Stripe en événement métier indépendant du fournisseur. */
export function normalizeStripeEvent(event: Stripe.Event): ProviderEvent {
  let domain: BillingDomainEvent = { kind: "ignored" };
  const obj = event.data.object as unknown as Record<string, unknown>;

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = obj as unknown as Stripe.Checkout.Session;
      const userId = s.metadata?.user_id ?? s.client_reference_id;
      const planCode = s.metadata?.plan_code;
      if (userId && planCode) {
        domain = {
          kind: "checkout_completed",
          userId,
          planCode,
          customerId: idOf(s.customer) ?? "",
          subscriptionId: idOf(s.subscription),
          paymentId: s.id,
          amount: s.amount_total ?? 0,
          currency: s.currency ?? "eur",
          paid: s.payment_status === "paid" || s.payment_status === "no_payment_required",
        };
      }
      break;
    }
    case "invoice.paid": {
      const inv = obj as unknown as Stripe.Invoice;
      domain = {
        kind: "invoice_paid",
        customerId: idOf(inv.customer) ?? "",
        subscriptionId: idOf(inv.parent?.subscription_details?.subscription ?? null),
        paymentId: inv.id ?? event.id,
        amount: inv.amount_paid,
        currency: inv.currency,
        receiptUrl: inv.hosted_invoice_url ?? null,
      };
      break;
    }
    case "invoice.payment_failed": {
      const inv = obj as unknown as Stripe.Invoice;
      domain = {
        kind: "invoice_payment_failed",
        customerId: idOf(inv.customer) ?? "",
        subscriptionId: idOf(inv.parent?.subscription_details?.subscription ?? null),
      };
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = obj as unknown as Stripe.Subscription;
      domain = { kind: "subscription_changed", customerId: idOf(sub.customer) ?? "", subscriptionId: sub.id };
      break;
    }
    case "charge.refunded": {
      const ch = obj as unknown as Stripe.Charge;
      domain = {
        kind: "refund",
        customerId: idOf(ch.customer),
        paymentId: ch.id,
        amountRefunded: ch.amount_refunded,
        currency: ch.currency,
        fullyRefunded: ch.refunded,
      };
      break;
    }
  }
  return { id: event.id, type: event.type, event: domain };
}

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";

  async ensureCustomer(opts: { userId: string; email: string; existingCustomerId: string | null }) {
    if (opts.existingCustomerId) return opts.existingCustomerId;
    const customer = await stripe().customers.create(
      { email: opts.email, metadata: { user_id: opts.userId } },
      { idempotencyKey: `customer-${opts.userId}` },
    );
    return customer.id;
  }

  async createCheckout(opts: {
    userId: string;
    customerId: string;
    planCode: string;
    mode: "payment" | "subscription";
    lines: { priceId: string; quantity: number }[];
    successUrl: string;
    cancelUrl: string;
  }) {
    const metadata = { user_id: opts.userId, plan_code: opts.planCode };
    const session = await stripe().checkout.sessions.create({
      mode: opts.mode,
      customer: opts.customerId,
      client_reference_id: opts.userId,
      line_items: opts.lines.map((l) => ({ price: l.priceId, quantity: l.quantity })),
      allow_promotion_codes: true,
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      metadata,
      ...(opts.mode === "subscription"
        ? { subscription_data: { metadata } }
        : { payment_intent_data: { metadata }, invoice_creation: { enabled: true } }),
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url };
  }

  async createPortalSession(opts: { customerId: string; returnUrl: string }) {
    const session = await stripe().billingPortal.sessions.create({ customer: opts.customerId, return_url: opts.returnUrl });
    return { url: session.url };
  }

  parseWebhook(rawBody: string, signature: string) {
    const event = stripe().webhooks.constructEvent(rawBody, signature, serverEnv.stripeWebhookSecret);
    return normalizeStripeEvent(event);
  }

  async retrieveEvent(eventId: string) {
    return normalizeStripeEvent(await stripe().events.retrieve(eventId));
  }

  async getSubscription(subscriptionId: string): Promise<ProviderSubscription> {
    const sub = await stripe().subscriptions.retrieve(subscriptionId);
    const periodEnd = sub.items.data.reduce<number | null>((max, item) => {
      const end = item.current_period_end;
      return max === null || end > max ? end : max;
    }, null);
    return {
      id: sub.id,
      customerId: idOf(sub.customer) ?? "",
      status: sub.status,
      planCode: sub.metadata?.plan_code ?? null,
      userId: sub.metadata?.user_id ?? null,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    };
  }

  async cancelSubscription(subscriptionId: string) {
    await stripe().subscriptions.cancel(subscriptionId);
  }
}
