-- =====================================================================
-- Still Here — schéma cœur (MVP)
-- Voir docs/DATABASE.md pour les choix de modélisation.
-- Règle : toute table de données utilisateur a RLS activé (DEFAULT DENY).
-- =====================================================================

create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  preferred_name text,
  language text not null default 'en',
  timezone text not null default 'UTC',
  photo_path text,
  onboarding_completed_at timestamptz,
  deletion_requested_at timestamptz,
  deletion_scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, first_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'first_name', null));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Consentements versionnés (jamais supprimés, seulement révoqués)
-- ---------------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_type text not null check (consent_type in ('ai_processing','memory_storage','media','avatar','voice','terms','privacy')),
  consent_version text not null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index consents_user_idx on public.consents (user_id, consent_type);

-- ---------------------------------------------------------------------
-- Conversations (sources historiques — jamais modifiées)
-- user_id = la personne qui converse ; subject_user_id = le Still Here concerné
-- ---------------------------------------------------------------------
create table public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('interview','meet_self','loved_one','photo_story')),
  channel text not null default 'text' check (channel in ('text','voice','avatar')),
  title text,
  media_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  extracted_at timestamptz
);
create index conversation_sessions_user_idx on public.conversation_sessions (user_id, started_at desc);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.conversation_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  audio_path text,
  used_memory_ids uuid[] not null default '{}',
  answer_basis text check (answer_basis in ('KNOWN','INFERRED','UNKNOWN')),
  created_at timestamptz not null default now()
);
create index conversation_messages_session_idx on public.conversation_messages (session_id, created_at);

-- ---------------------------------------------------------------------
-- Entités de la vie du propriétaire
-- ---------------------------------------------------------------------
create table public.people (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  relation_to_owner text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index people_owner_idx on public.people (owner_user_id);
create trigger people_updated_at before update on public.people
  for each row execute function public.set_updated_at();

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  from_person_id uuid references public.people (id) on delete cascade, -- null = le propriétaire
  to_person_id uuid not null references public.people (id) on delete cascade,
  relation_type text not null,
  created_at timestamptz not null default now()
);
create index relationships_owner_idx on public.relationships (owner_user_id);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
create index places_owner_idx on public.places (owner_user_id);

-- ---------------------------------------------------------------------
-- Mémoire structurée
-- Les types EVENT / VALUE / PREFERENCE / OPINION / ADVICE / QUOTE /
-- LIFE_PERIOD vivent dans `memories` (colonne type + details jsonb).
-- ---------------------------------------------------------------------
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('PERSON','RELATIONSHIP','MEMORY','EVENT','PLACE','VALUE','PREFERENCE','OPINION','ADVICE','QUOTE','LIFE_PERIOD')),
  title text not null,
  content text not null,
  ai_original_content text,               -- extraction IA initiale, conservée pour traçabilité
  details jsonb not null default '{}',
  life_area text,                         -- childhood, family, career... (progression)
  occurred_on text,                       -- date libre ("summer 1987")
  confidence numeric(3,2) not null default 0.5 check (confidence between 0 and 1),
  importance smallint not null default 3 check (importance between 1 and 5),
  privacy_level text not null default 'OWNER_ONLY' check (privacy_level in ('OWNER_ONLY','ALL_AUTHORIZED_LOVED_ONES','SPECIFIC_PEOPLE')),
  status text not null default 'candidate' check (status in ('candidate','confirmed','corrected','rejected')),
  origin text not null default 'ai_extraction' check (origin in ('ai_extraction','user','feedback')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memories_owner_status_idx on public.memories (owner_user_id, status);
create trigger memories_updated_at before update on public.memories
  for each row execute function public.set_updated_at();

create table public.memory_sources (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  source_type text not null check (source_type in ('message','media','audio','document','user','feedback')),
  message_id uuid references public.conversation_messages (id) on delete set null,
  media_id uuid,
  excerpt text,
  created_at timestamptz not null default now()
);
create index memory_sources_memory_idx on public.memory_sources (memory_id);

create table public.memory_people (
  memory_id uuid not null references public.memories (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  primary key (memory_id, person_id)
);

create table public.memory_places (
  memory_id uuid not null references public.memories (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  primary key (memory_id, place_id)
);

-- ---------------------------------------------------------------------
-- Médias (buckets privés uniquement)
-- ---------------------------------------------------------------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null default 'media',
  path text not null unique,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  taken_on text,
  location text,
  owner_story text,          -- récit du propriétaire (vérité historique)
  ai_description text,       -- analyse IA, distincte du récit
  privacy_level text not null default 'OWNER_ONLY' check (privacy_level in ('OWNER_ONLY','ALL_AUTHORIZED_LOVED_ONES','SPECIFIC_PEOPLE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index media_assets_owner_idx on public.media_assets (owner_user_id, created_at desc);
create trigger media_assets_updated_at before update on public.media_assets
  for each row execute function public.set_updated_at();

alter table public.memory_sources
  add constraint memory_sources_media_fk foreign key (media_id) references public.media_assets (id) on delete set null;
alter table public.conversation_sessions
  add constraint conversation_sessions_media_fk foreign key (media_id) references public.media_assets (id) on delete set null;

create table public.memory_media_links (
  memory_id uuid not null references public.memories (id) on delete cascade,
  media_id uuid not null references public.media_assets (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  primary key (memory_id, media_id)
);

-- ---------------------------------------------------------------------
-- Embeddings (pgvector) — uniquement mémoires confirmées/corrigées
-- ---------------------------------------------------------------------
create table public.memory_embeddings (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null unique references public.memories (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  embedding extensions.vector(1536) not null,
  content_hash text not null,
  model text not null,
  created_at timestamptz not null default now()
);
create index memory_embeddings_owner_idx on public.memory_embeddings (owner_user_id);
create index memory_embeddings_hnsw on public.memory_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------
-- Personnalité (style de communication uniquement, aucun diagnostic)
-- ---------------------------------------------------------------------
create table public.personality_traits (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  trait text not null check (trait in ('humour','verbosity','formality','optimism','directness','emotional_style','language_style','favorite_expressions','topics_loved','topics_avoided')),
  value text not null,
  confidence numeric(3,2) not null default 0.5,
  source text not null default 'ai_inference',
  confirmed_by_user boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (owner_user_id, trait)
);
create trigger personality_traits_updated_at before update on public.personality_traits
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Avatar
-- ---------------------------------------------------------------------
create table public.avatar_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users (id) on delete cascade,
  provider text not null default 'liveavatar',
  provider_avatar_id text,
  provider_voice_id text,
  status text not null default 'draft' check (status in ('draft','consented','video_uploaded','processing','ready','failed','disabled')),
  training_video_path text,
  consent_id uuid references public.consents (id),
  voice_preference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger avatar_profiles_updated_at before update on public.avatar_profiles
  for each row execute function public.set_updated_at();

create table public.avatar_feedback (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  message_id uuid not null references public.conversation_messages (id) on delete cascade,
  rating text not null check (rating in ('sounds_like_me','not_like_me','correction')),
  correction_text text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Proches, permissions, invitations
-- ---------------------------------------------------------------------
create table public.trusted_people (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  relationship text,
  status text not null default 'pending' check (status in ('pending','invited','active','revoked')),
  linked_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, email)
);
create index trusted_people_linked_idx on public.trusted_people (linked_user_id) where status = 'active';
create trigger trusted_people_updated_at before update on public.trusted_people
  for each row execute function public.set_updated_at();

create table public.access_permissions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  trusted_person_id uuid not null references public.trusted_people (id) on delete cascade,
  memory_id uuid references public.memories (id) on delete cascade,
  media_id uuid references public.media_assets (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((memory_id is not null) <> (media_id is not null))
);
create unique index access_permissions_memory_uniq on public.access_permissions (trusted_person_id, memory_id) where memory_id is not null;
create unique index access_permissions_media_uniq on public.access_permissions (trusted_person_id, media_id) where media_id is not null;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  trusted_person_id uuid not null references public.trusted_people (id) on delete cascade,
  token_hash text not null unique,        -- sha256 du token ; le token clair n'est jamais stocké
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Audit & backups (écriture service_role uniquement)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  subject_user_id uuid,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_subject_idx on public.audit_logs (subject_user_id, created_at desc);

create table public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('database','media','restore_test')),
  status text not null check (status in ('running','succeeded','failed')),
  location text,
  size_bytes bigint,
  checksum text,
  details jsonb not null default '{}',
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ---------------------------------------------------------------------
-- Exports
-- ---------------------------------------------------------------------
create table public.data_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','ready','failed','expired')),
  path text,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
