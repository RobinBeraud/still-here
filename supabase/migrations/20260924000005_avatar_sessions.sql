-- =====================================================================
-- Sessions Live Avatar : la durée facturée est calculée côté serveur
-- (horodatage serveur), jamais sur la seule déclaration du navigateur.
-- =====================================================================
create table public.avatar_live_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,        -- qui converse
  quota_user_id uuid not null references auth.users (id) on delete cascade,  -- quota débité (propriétaire du Still Here)
  conversation_session_id uuid references public.conversation_sessions (id) on delete set null,
  provider text not null,
  provider_session_id text not null,
  max_seconds int not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  billed_seconds int
);
create index avatar_live_sessions_open_idx on public.avatar_live_sessions (started_at) where ended_at is null;

alter table public.avatar_live_sessions enable row level security;
revoke all on public.avatar_live_sessions from anon;
create policy avatar_live_sessions_own on public.avatar_live_sessions for select to authenticated using (user_id = auth.uid());
