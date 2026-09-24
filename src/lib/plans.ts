import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";

export type PublicPlan = {
  code: string;
  name: string;
  tagline: string | null;
  billing_model: "free" | "one_time" | "one_time_plus_annual" | "contact";
  display_price_cents: number | null;
  display_recurring_cents: number | null;
  currency: string;
  included_years: number | null;
  features: string[];
  provider_price_ids: Record<string, string>;
};

export async function listPlans(supabase: ServerSupabase): Promise<PublicPlan[]> {
  const { data } = await supabase
    .from("plans")
    .select("code, name, tagline, billing_model, display_price_cents, display_recurring_cents, currency, included_years, features, provider_price_ids")
    .order("sort_order");
  return (data ?? []) as PublicPlan[];
}

export function formatPrice(cents: number | null, currency = "eur") {
  if (cents === null) return "";
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);
}

export function priceLine(p: PublicPlan) {
  switch (p.billing_model) {
    case "free":
      return { main: "Free", sub: "No card needed" };
    case "one_time_plus_annual":
      return { main: formatPrice(p.display_price_cents, p.currency), sub: `then ${formatPrice(p.display_recurring_cents, p.currency)} per year for preservation` };
    case "one_time":
      return {
        main: formatPrice(p.display_price_cents, p.currency),
        sub: p.included_years ? `${p.included_years} years included, then about ${formatPrice(p.display_recurring_cents, p.currency)}/year` : "One-time",
      };
    case "contact":
      return { main: `From ${formatPrice(p.display_price_cents, p.currency)}`, sub: "Tailored with you" };
  }
}
