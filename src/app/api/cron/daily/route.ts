import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { providers } from "@/lib/providers";
import { expireGracePeriods, processBillingEvent, type BillingAccount } from "@/lib/services/billing";
import { billingDeps } from "@/lib/services/billing-repo";
import { executeDueDeletions } from "@/lib/services/account";
import { closeStaleLiveSessions } from "@/lib/services/avatar";
import { sendEmail } from "@/lib/services/emails";

export const maxDuration = 300;

/**
 * Cron quotidien (Vercel Cron, authentifié par CRON_SECRET) :
 *  1. réconciliation des événements de paiement en échec (dead-letter) ;
 *  2. fin des périodes de grâce → Preservation mode (jamais de suppression) ;
 *  3. clôture des sessions avatar orphelines ;
 *  4. exécution des suppressions de compte arrivées à échéance ;
 *  5. contrôle de fraîcheur des sauvegardes (alerte si > 26 h).
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${serverEnv.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const report: Record<string, unknown> = {};

  // 1. Réconciliation
  const { data: failed } = await admin.from("billing_events").select("provider_event_id, attempts").eq("status", "failed").lt("attempts", 10).limit(50);
  let reprocessed = 0;
  for (const ev of failed ?? []) {
    try {
      const event = await providers.payment().retrieveEvent(ev.provider_event_id);
      await processBillingEvent(event, billingDeps());
      reprocessed++;
    } catch (e) {
      console.error("[cron] reconcile failed", ev.provider_event_id, e);
    }
  }
  report.reconciled = reprocessed;
  if ((failed ?? []).some((f) => f.attempts >= 5) && serverEnv.adminAlertEmail) {
    await sendEmail(serverEnv.adminAlertEmail, "Billing events need attention", [
      "Some Stripe events failed 5 times or more. Check the billing_events table (status = failed).",
    ]).catch(() => undefined);
  }

  // 2. Périodes de grâce / prépaiements échus
  const { data: accounts } = await admin
    .from("billing_accounts")
    .select("user_id, plan_code, billing_state, grace_period_ends_at, paid_through, provider_customer_id")
    .in("billing_state", ["GRACE_PERIOD", "ACTIVE"])
    .or(`grace_period_ends_at.lte.${new Date().toISOString()},paid_through.lte.${new Date().toISOString()}`);
  const { data: liveSubs } = await admin.from("subscriptions").select("user_id").in("status", ["active", "trialing", "past_due"]);
  report.preservation = await expireGracePeriods((accounts ?? []) as BillingAccount[], billingDeps(), new Set((liveSubs ?? []).map((s) => s.user_id)));

  // 3. Sessions avatar
  report.closedAvatarSessions = await closeStaleLiveSessions();

  // 4. Suppressions
  report.deletedAccounts = await executeDueDeletions();

  // 5. Sauvegardes
  const { data: lastBackup } = await admin
    .from("backup_runs")
    .select("finished_at")
    .eq("kind", "database")
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ageHours = lastBackup?.finished_at ? (Date.now() - new Date(lastBackup.finished_at).getTime()) / 3_600_000 : Infinity;
  report.backupAgeHours = Number.isFinite(ageHours) ? Math.round(ageHours) : null;
  if (ageHours > 26 && serverEnv.adminAlertEmail) {
    await sendEmail(serverEnv.adminAlertEmail, "CRITICAL: no valid Still Here backup in the last 26 hours", [
      `Last successful database backup: ${lastBackup?.finished_at ?? "never"}.`,
      "Check the GitHub Actions backup workflow and the backup_runs table immediately.",
    ]).catch(() => undefined);
  }

  console.log("[cron] daily", report);
  return NextResponse.json(report);
}
