-- =====================================================================
-- Still Here — Row Level Security, fonctions d'accès, RAG, storage
-- DEFAULT DENY : RLS activé partout ; seules les policies ci-dessous ouvrent l'accès.
-- service_role contourne RLS et n'est utilisé que côté serveur (jobs, webhooks).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Activer RLS sur toutes les tables
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','consents','conversation_sessions','conversation_messages','people','relationships','places',
    'memories','memory_sources','memory_people','memory_places','media_assets','memory_media_links',
    'memory_embeddings','personality_traits','avatar_profiles','avatar_feedback','trusted_people',
    'access_permissions','invitations','audit_logs','backup_runs','data_exports',
    'plans','billing_accounts','subscriptions','payments','entitlements','usage_records','billing_events','gift_purchases'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Fonctions d'accès (SECURITY DEFINER pour éviter la récursion RLS)
-- ---------------------------------------------------------------------

-- Le viewer courant est-il un proche actif du propriétaire ?
create or replace function public.active_trusted_person_id(p_owner uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select tp.id
  from public.trusted_people tp
  join public.profiles p on p.id = tp.owner_user_id
  where tp.owner_user_id = p_owner
    and tp.linked_user_id = auth.uid()
    and tp.status = 'active'
    and p.deletion_requested_at is null
  limit 1
$$;

-- Règle unique de visibilité d'une mémoire ou d'un média
create or replace function public.can_view_item(p_owner uuid, p_privacy text, p_memory_id uuid, p_media_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare tp_id uuid;
begin
  if auth.uid() is null then return false; end if;
  if p_owner = auth.uid() then return true; end if;
  if p_privacy = 'OWNER_ONLY' then return false; end if;
  tp_id := public.active_trusted_person_id(p_owner);
  if tp_id is null then return false; end if;
  if p_privacy = 'ALL_AUTHORIZED_LOVED_ONES' then return true; end if;
  if p_privacy = 'SPECIFIC_PEOPLE' then
    return exists (
      select 1 from public.access_permissions ap
      where ap.trusted_person_id = tp_id
        and ((p_memory_id is not null and ap.memory_id = p_memory_id)
          or (p_media_id is not null and ap.media_id = p_media_id))
    );
  end if;
  return false;
end $$;

-- Carte publique minimale d'un Still Here (propriétaire ou proche actif uniquement)
create or replace function public.still_here_card(p_owner uuid)
returns table (owner_id uuid, display_name text, language text, photo_path text, avatar_ready boolean, provider_avatar_id text, provider_voice_id text)
language sql stable security definer set search_path = '' as $$
  select p.id,
         coalesce(nullif(p.preferred_name, ''), p.first_name, 'Still Here'),
         p.language,
         p.photo_path,
         coalesce(a.status = 'ready', false),
         case when a.status = 'ready' then a.provider_avatar_id end,
         case when a.status = 'ready' then a.provider_voice_id end
  from public.profiles p
  left join public.avatar_profiles a on a.owner_user_id = p.id
  where p.id = p_owner
    and (p_owner = auth.uid() or public.active_trusted_person_id(p_owner) is not null)
$$;

revoke execute on function public.active_trusted_person_id(uuid) from public, anon;
revoke execute on function public.can_view_item(uuid, text, uuid, uuid) from public, anon;
revoke execute on function public.still_here_card(uuid) from public, anon;
grant execute on function public.active_trusted_person_id(uuid) to authenticated;
grant execute on function public.can_view_item(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.still_here_card(uuid) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_user_billing() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- Les dates de suppression ne sont modifiables que côté serveur
revoke update on public.profiles from authenticated;
grant update (first_name, last_name, preferred_name, language, timezone, photo_path, onboarding_completed_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- Consentements : insert + révocation, jamais de suppression
-- ---------------------------------------------------------------------
create policy consents_select_own on public.consents for select to authenticated using (user_id = auth.uid());
create policy consents_insert_own on public.consents for insert to authenticated with check (user_id = auth.uid() and revoked_at is null);
create policy consents_update_own on public.consents for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.consents from authenticated;
grant update (revoked_at) on public.consents to authenticated;

-- ---------------------------------------------------------------------
-- Conversations : chacun ne voit que ses propres échanges.
-- Les messages sont immuables (pas d'UPDATE/DELETE).
-- ---------------------------------------------------------------------
create policy sessions_select_own on public.conversation_sessions for select to authenticated using (user_id = auth.uid());
create policy sessions_insert_own on public.conversation_sessions for insert to authenticated with check (
  user_id = auth.uid() and (
    (kind <> 'loved_one' and subject_user_id = auth.uid())
    or (kind = 'loved_one' and subject_user_id <> auth.uid() and public.active_trusted_person_id(subject_user_id) is not null)
  )
);
create policy sessions_update_own on public.conversation_sessions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.conversation_sessions from authenticated;
grant update (title, ended_at, extracted_at) on public.conversation_sessions to authenticated;

create policy messages_select_own on public.conversation_messages for select to authenticated using (user_id = auth.uid());
create policy messages_insert_own on public.conversation_messages for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from public.conversation_sessions s where s.id = session_id and s.user_id = auth.uid())
);

-- ---------------------------------------------------------------------
-- Entités du propriétaire (people, places, relations, liens) : owner only
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['people','relationships','places','memory_people','memory_places','memory_media_links','memory_sources','access_permissions'] loop
    execute format('create policy %I on public.%I for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid())', t || '_owner_all', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Mémoires : owner = tout ; proche = lecture des mémoires confirmées autorisées
-- ---------------------------------------------------------------------
create policy memories_owner_all on public.memories for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy memories_viewer_select on public.memories for select to authenticated
  using (owner_user_id <> auth.uid() and status in ('confirmed','corrected') and public.can_view_item(owner_user_id, privacy_level, id, null));

-- Embeddings : écriture serveur uniquement ; lecture si la mémoire est lisible
create policy embeddings_select on public.memory_embeddings for select to authenticated
  using (exists (select 1 from public.memories m where m.id = memory_id));

-- Médias
create policy media_owner_all on public.media_assets for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy media_viewer_select on public.media_assets for select to authenticated
  using (owner_user_id <> auth.uid() and public.can_view_item(owner_user_id, privacy_level, null, id));

-- Personnalité : owner = tout ; proche = traits confirmés
create policy traits_owner_all on public.personality_traits for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy traits_viewer_select on public.personality_traits for select to authenticated
  using (confirmed_by_user and public.active_trusted_person_id(owner_user_id) is not null);

-- Avatar : lecture owner ; écritures via serveur (workflow consentement → vidéo → provider)
create policy avatar_owner_select on public.avatar_profiles for select to authenticated using (owner_user_id = auth.uid());
create policy avatar_feedback_owner on public.avatar_feedback for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- Proches
create policy trusted_owner_all on public.trusted_people for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy trusted_linked_select on public.trusted_people for select to authenticated
  using (linked_user_id = auth.uid() and status = 'active');

create policy invitations_owner_select on public.invitations for select to authenticated using (owner_user_id = auth.uid());
create policy invitations_owner_insert on public.invitations for insert to authenticated with check (owner_user_id = auth.uid());
create policy invitations_owner_update on public.invitations for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
revoke update on public.invitations from authenticated;
grant update (revoked_at) on public.invitations to authenticated;

-- Audit / exports : lecture de ses propres lignes ; écriture serveur
create policy audit_select_own on public.audit_logs for select to authenticated using (subject_user_id = auth.uid());
create policy exports_select_own on public.data_exports for select to authenticated using (user_id = auth.uid());
-- backup_runs : aucune policy → service_role uniquement

-- ---------------------------------------------------------------------
-- Billing : lecture de ses propres données ; écriture serveur (webhooks)
-- ---------------------------------------------------------------------
grant select on public.plans to anon;
create policy plans_public_select on public.plans for select to anon, authenticated using (active and public);
create policy billing_accounts_own on public.billing_accounts for select to authenticated using (user_id = auth.uid());
create policy subscriptions_own on public.subscriptions for select to authenticated using (user_id = auth.uid());
create policy payments_own on public.payments for select to authenticated using (user_id = auth.uid());
create policy entitlements_own on public.entitlements for select to authenticated using (user_id = auth.uid());
create policy usage_own on public.usage_records for select to authenticated using (user_id = auth.uid());
create policy gifts_purchaser on public.gift_purchases for select to authenticated using (purchaser_user_id = auth.uid());
-- billing_events : aucune policy → service_role uniquement

-- ---------------------------------------------------------------------
-- Recherche sémantique — SECURITY INVOKER : les policies RLS s'appliquent.
-- Filtre explicite par propriétaire : aucun retrieval cross-user possible.
-- ---------------------------------------------------------------------
create or replace function public.match_memories(
  p_owner uuid,
  p_query extensions.vector(1536),
  p_count int default 8,
  p_min_similarity float default 0.25
)
returns table (memory_id uuid, type text, title text, content text, occurred_on text, similarity float)
language sql stable security invoker set search_path = public, extensions as $$
  select * from (
    select m.id, m.type, m.title, m.content, m.occurred_on,
           1 - (e.embedding <=> p_query) as similarity
    from public.memory_embeddings e
    join public.memories m on m.id = e.memory_id
    where e.owner_user_id = p_owner
      and m.owner_user_id = p_owner
      and m.status in ('confirmed','corrected')
    order by e.embedding <=> p_query
    limit least(greatest(p_count, 1), 20)
  ) r
  where r.similarity >= p_min_similarity
$$;
revoke execute on function public.match_memories(uuid, extensions.vector, int, float) from public, anon;
grant execute on function public.match_memories(uuid, extensions.vector, int, float) to authenticated;

-- ---------------------------------------------------------------------
-- Storage : buckets privés uniquement. Chemins = <owner_uuid>/<fichier>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('media', 'media', false, 26214400, array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('audio', 'audio', false, 26214400, array['audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav']),
  ('avatar-training', 'avatar-training', false, 524288000, array['video/mp4','video/quicktime','video/webm']),
  ('exports', 'exports', false, null, array['application/zip'])
on conflict (id) do update set public = false;

create policy storage_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('media','audio','avatar-training') and (storage.foldername(name))[1] = auth.uid()::text);
create policy storage_owner_select on storage.objects for select to authenticated
  using (bucket_id in ('media','audio','avatar-training','exports') and (storage.foldername(name))[1] = auth.uid()::text);
create policy storage_owner_delete on storage.objects for delete to authenticated
  using (bucket_id in ('media','audio') and (storage.foldername(name))[1] = auth.uid()::text);
-- Proches : lecture d'un média uniquement si media_assets l'autorise
create policy storage_viewer_select_media on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1 from public.media_assets ma
      where ma.bucket = 'media' and ma.path = storage.objects.name
        and public.can_view_item(ma.owner_user_id, ma.privacy_level, null, ma.id)
    )
  );
