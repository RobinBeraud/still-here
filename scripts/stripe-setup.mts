/**
 * Crée (idempotent, via lookup_key) les produits/prix Stripe et les enregistre dans plans.provider_price_ids.
 * Usage : npm run stripe:setup   (lit .env.local : STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 * Changer un prix = nouveau lookup_key (ex. still_here_setup_v2) puis relancer : les anciens abonnés gardent leur prix.
 */
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}`);
  return v;
};
const stripe = new Stripe(need("STRIPE_SECRET_KEY"));
const db = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

type PriceDef = { slot: string; lookupKey: string; amount: number; recurring?: "year" };
const PLANS: { code: string; name: string; prices: PriceDef[] }[] = [
  {
    code: "still_here",
    name: "Still Here",
    prices: [
      { slot: "setup", lookupKey: "still_here_setup_v1", amount: 29900 },
      { slot: "annual", lookupKey: "still_here_annual_v1", amount: 7900, recurring: "year" },
    ],
  },
  { code: "legacy", name: "Still Here Legacy", prices: [{ slot: "one_time", lookupKey: "legacy_one_time_v1", amount: 69900 }] },
];

for (const plan of PLANS) {
  const products = await stripe.products.search({ query: `metadata['plan_code']:'${plan.code}'` });
  const product = products.data[0] ?? (await stripe.products.create({ name: plan.name, metadata: { plan_code: plan.code } }));
  const ids: Record<string, string> = {};
  for (const p of plan.prices) {
    const existing = await stripe.prices.list({ lookup_keys: [p.lookupKey], limit: 1 });
    const price =
      existing.data[0] ??
      (await stripe.prices.create({
        product: product.id,
        currency: "eur",
        unit_amount: p.amount,
        lookup_key: p.lookupKey,
        ...(p.recurring ? { recurring: { interval: p.recurring } } : {}),
        metadata: { plan_code: plan.code, slot: p.slot },
      }));
    ids[p.slot] = price.id;
  }
  const { error } = await db.from("plans").update({ provider_price_ids: ids }).eq("code", plan.code);
  if (error) throw error;
  console.log(`✔ ${plan.code}`, ids);
}
console.log("\nNext: configure the Customer Portal in the Stripe dashboard and create the webhook endpoint (see docs/BILLING.md).");
