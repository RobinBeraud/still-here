import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { providers } from "@/lib/providers";
import { serverEnv } from "@/lib/env";
import { audit } from "./audit";
import { sendBillingNotice } from "./emails";
import type { BillingAccount, BillingDeps, BillingRepo, Plan } from "./billing";

/** Implémentation Supabase (service_role) du dépôt de facturation. */
export function supabaseBillingRepo(): BillingRepo {
  const db = createAdminClient();

  return {
    async claimEvent(eventId, type) {
      const { data: inserted } = await db
        .from("billing_events")
        .upsert({ provider_event_id: eventId, type, status: "processing", attempts: 1 }, { onConflict: "provider_event_id", ignoreDuplicates: true })
        .select("id");
      if (inserted && inserted.length > 0) return "process";

      const { data: existing } = await db.from("billing_events").select("status, attempts, received_at").eq("provider_event_id", eventId).single();
      if (!existing || existing.status === "processed" || existing.status === "ignored") return "skip";
      // Traitement concurrent en cours → skip (Stripe rejouera) ; bloqué depuis >10 min → reprise.
      const stale = Date.now() - new Date(existing.received_at).getTime() > 10 * 60_000;
      if (existing.status === "processing" && !stale) return "skip";
      // received / failed / processing bloqué → retry (verrou optimiste sur le statut lu)
      const { data: claimed } = await db
        .from("billing_events")
        .update({ status: "processing", attempts: (existing.attempts ?? 0) + 1 })
        .eq("provider_event_id", eventId)
        .eq("status", existing.status)
        .eq("attempts", existing.attempts)
        .select("id");
      return claimed && claimed.length > 0 ? "process" : "skip";
    },
    async completeEvent(eventId, status) {
      await db.from("billing_events").update({ status, processed_at: new Date().toISOString(), last_error: null }).eq("provider_event_id", eventId);
    },
    async failEvent(eventId, error) {
      await db.from("billing_events").update({ status: "failed", last_error: error.slice(0, 1000) }).eq("provider_event_id", eventId);
    },
    async findUserIdByCustomer(customerId) {
      if (!customerId) return null;
      const { data } = await db.from("billing_accounts").select("user_id").eq("provider_customer_id", customerId).maybeSingle();
      return data?.user_id ?? null;
    },
    async getAccount(userId) {
      const { data } = await db.from("billing_accounts").select("*").eq("user_id", userId).maybeSingle();
      return (data as BillingAccount) ?? null;
    },
    async updateAccount(userId, patch) {
      const { error } = await db.from("billing_accounts").upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
      if (error) throw new Error(`updateAccount: ${error.message}`);
    },
    async getPlan(code) {
      const { data } = await db.from("plans").select("code, billing_model, included_years, entitlements").eq("code", code).maybeSingle();
      return (data as Plan) ?? null;
    },
    async upsertEntitlements(userId, rows) {
      if (rows.length === 0) return;
      const { error } = await db
        .from("entitlements")
        .upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict: "user_id,key,source" });
      if (error) throw new Error(`upsertEntitlements: ${error.message}`);
    },
    async expireEntitlements(userId, source, at) {
      const { error } = await db.from("entitlements").update({ expires_at: at.toISOString() }).eq("user_id", userId).eq("source", source);
      if (error) throw new Error(`expireEntitlements: ${error.message}`);
    },
    async upsertSubscription(userId, sub, planCode) {
      const { error } = await db.from("subscriptions").upsert(
        {
          user_id: userId,
          plan_code: planCode,
          provider: "stripe",
          provider_customer_id: sub.customerId,
          provider_subscription_id: sub.id,
          status: sub.status,
          cancel_at_period_end: sub.cancelAtPeriodEnd,
          current_period_end: sub.currentPeriodEnd?.toISOString() ?? null,
        },
        { onConflict: "provider_subscription_id" },
      );
      if (error) throw new Error(`upsertSubscription: ${error.message}`);
    },
    async recordPayment(p) {
      const { error } = await db.from("payments").upsert(
        {
          user_id: p.userId,
          provider: "stripe",
          provider_payment_id: p.providerPaymentId,
          plan_code: p.planCode,
          kind: p.kind,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          receipt_url: p.receiptUrl ?? null,
        },
        { onConflict: "provider_payment_id", ignoreDuplicates: true },
      );
      if (error) throw new Error(`recordPayment: ${error.message}`);
    },
    async notify(userId, notice) {
      await sendBillingNotice(userId, notice).catch((e) => console.error("[billing] notice failed", e));
    },
    async audit(userId, action, metadata) {
      await audit({ actor: null, subject: userId, action, metadata });
    },
  };
}

export function billingDeps(): BillingDeps {
  return { repo: supabaseBillingRepo(), payment: providers.payment(), gracePeriodDays: serverEnv.gracePeriodDays };
}
