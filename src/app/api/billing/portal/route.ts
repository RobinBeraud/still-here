import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { providers } from "@/lib/providers";
import { publicEnv } from "@/lib/env";

/** Customer Portal : moyens de paiement, factures, annulation (sans suppression des souvenirs). */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", publicEnv.appUrl), { status: 303 });
  const { data: account } = await supabase.from("billing_accounts").select("provider_customer_id").eq("user_id", user.id).maybeSingle();
  if (!account?.provider_customer_id) return NextResponse.redirect(new URL("/pricing", publicEnv.appUrl), { status: 303 });
  const { url } = await providers.payment().createPortalSession({
    customerId: account.provider_customer_id,
    returnUrl: `${publicEnv.appUrl}/settings/billing`,
  });
  return NextResponse.redirect(url, { status: 303 });
}
