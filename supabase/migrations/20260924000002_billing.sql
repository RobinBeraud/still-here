-- =====================================================================
-- Still Here — billing, entitlements, usage (voir docs/BILLING.md)
-- Stripe = source de vérité des événements de paiement.
-- L'application = source de vérité des droits (entitlements) et usages.
-- =====================================================================

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  tagline text,
  active boolean not null default true,
  public boolean not null default true,
  sort_order int not null default 0,
  billing_model text not null check (billing_model in ('free','one_time','one_time_plus_annual','contact')),
  -- Prix affichés (centimes). La facturation réelle utilise provider_price_ids.
  display_price_cents int,
  display_recurring_cents int,
  currency text not null default 'eur',
  included_years int,                       -- ex. Legacy : 5 ans inclus
  provider_price_ids jsonb not null default '{}',   -- {"setup":"price_...","annual":"price_...","one_time":"price_..."}
  entitlements jsonb not null default '{}', -- droits accordés par le plan
  features jsonb not null default '[]',     -- puces marketing (langage humain)
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- État de facturation par utilisateur (machine à états, docs/BILLING.md)
create table public.billing_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text unique,
  plan_code text not null default 'discover',
  billing_state text not null default 'ACTIVE' check (billing_state in ('ACTIVE','PAST_DUE','GRACE_PERIOD','PRESERVATION_ONLY','CLOSED')),
  grace_period_ends_at timestamptz,
  paid_through timestamptz,
  updated_at timestamptz not null default now()
);
create trigger billing_accounts_updated_at before update on public.billing_accounts
  for each row execute function public.set_updated_at();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_code text not null,
  provider text not null default 'stripe',
  provider_customer_id text,
  provider_subscription_id text not null unique,
  status text not null,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Les paiements sont conservés (obligations comptables) même après suppression du compte.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  provider text not null default 'stripe',
  provider_payment_id text not null unique,
  plan_code text,
  kind text not null default 'payment' check (kind in ('payment','refund')),
  amount int not null,
  currency text not null,
  status text not null,
  receipt_url text,
  created_at timestamptz not null default now()
);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  source text not null,          -- 'plan:still_here', 'pack:minutes:<id>', 'admin:<id>'
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, key, source)
);
create index entitlements_user_idx on public.entitlements (user_id);

create table public.usage_records (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  metric text not null check (metric in ('avatar_seconds','tts_characters','stt_seconds','llm_input_tokens','llm_output_tokens','embedding_tokens','storage_bytes','backup_bytes','emails','exports')),
  quantity numeric not null,
  provider text,
  cost_estimate_usd numeric(12,6),
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
create index usage_records_user_metric_idx on public.usage_records (user_id, metric, occurred_at desc);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  provider_event_id text not null unique,     -- idempotence
  type text not null,
  status text not null default 'received' check (status in ('received','processing','processed','failed','ignored')),
  attempts int not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- V2 (table prête dès le MVP) : Gift Still Here / Family Edition
create table public.gift_purchases (
  id uuid primary key default gen_random_uuid(),
  purchaser_user_id uuid references auth.users (id) on delete set null,
  recipient_email text not null,
  gift_token_hash text not null unique,
  plan_code text not null,
  status text not null default 'pending_payment' check (status in ('pending_payment','paid','sent','activated','expired','refunded')),
  expires_at timestamptz not null,
  activated_by uuid references auth.users (id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

-- Compte de facturation créé automatiquement (plan gratuit Discover)
create or replace function public.handle_new_user_billing()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.billing_accounts (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created_billing after insert on auth.users
  for each row execute function public.handle_new_user_billing();
