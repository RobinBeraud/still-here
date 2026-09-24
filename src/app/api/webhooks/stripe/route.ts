import { NextResponse } from "next/server";
import { providers } from "@/lib/providers";
import { processBillingEvent } from "@/lib/services/billing";
import { billingDeps } from "@/lib/services/billing-repo";

export const maxDuration = 60;

/**
 * Webhook Stripe : signature vérifiée, traitement idempotent (event_id), relecture de l'état réel.
 * 200 = traité ou déjà traité ; 400 = signature invalide ; 500 = échec → Stripe rejoue.
 * Aucune donnée de carte n'est journalisée.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const raw = await request.text();
  let event;
  try {
    event = providers.payment().parseWebhook(raw, signature);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const result = await processBillingEvent(event, billingDeps());
    return NextResponse.json({ received: true, result });
  } catch (err) {
    console.error(`[stripe] event ${event.id} (${event.type}) failed:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
