import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { providers } from "@/lib/providers";
import { publicEnv } from "@/lib/env";

/**
 * pricing → auth → Stripe Checkout → webhook vérifié → entitlements.
 * Cette route ne donne AUCUN droit : seule la confirmation webhook active un plan.
 */
export async function POST(request: NextRequest) {
  const back = (path: string) => NextResponse.redirect(new URL(path, publicEnv.appUrl), { status: 303 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return back("/login?next=/pricing");

  const form = await request.formData();
  const planCode = String(form.get("plan") ?? "");
  const admin = createAdminClient();
  const [{ data: plan }, { data: account }] = await Promise.all([
    admin.from("plans").select("code, billing_model, provider_price_ids, active").eq("code", planCode).maybeSingle(),
    admin.from("billing_accounts").select("provider_customer_id, plan_code, billing_state").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!plan?.active) return back("/pricing?error=plan");
  if (account?.plan_code === plan.code && account?.billing_state === "ACTIVE") return back("/settings/billing");

  const prices = plan.provider_price_ids as Record<string, string>;
  let mode: "payment" | "subscription";
  let lines: { priceId: string; quantity: number }[];
  if (plan.billing_model === "one_time_plus_annual" && prices.setup && prices.annual) {
    mode = "subscription";
    lines = [
      { priceId: prices.setup, quantity: 1 },
      { priceId: prices.annual, quantity: 1 },
    ];
  } else if (plan.billing_model === "one_time" && prices.one_time) {
    mode = "payment";
    lines = [{ priceId: prices.one_time, quantity: 1 }];
  } else {
    console.error(`[checkout] plan ${plan.code} is not purchasable online (missing Stripe prices?)`);
    return back("/pricing?error=unavailable");
  }

  const payment = providers.payment();
  const customerId = await payment.ensureCustomer({ userId: user.id, email: user.email, existingCustomerId: account?.provider_customer_id ?? null });
  if (customerId !== account?.provider_customer_id) {
    await admin.from("billing_accounts").upsert({ user_id: user.id, provider_customer_id: customerId }, { onConflict: "user_id" });
  }

  const { url } = await payment.createCheckout({
    userId: user.id,
    customerId,
    planCode: plan.code,
    mode,
    lines,
    successUrl: `${publicEnv.appUrl}/settings/billing?success=1`,
    cancelUrl: `${publicEnv.appUrl}/pricing?canceled=1`,
  });
  return NextResponse.redirect(url, { status: 303 });
}
