-- =====================================================================
-- Tests RLS : User A vs User B vs proche autorisé C
-- Exécution : `supabase test db` (pgTAP) sur une base locale ou de staging.
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Utilisateurs de test
insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- Données de A (en tant que postgres)
insert into public.conversation_sessions (id, user_id, subject_user_id, kind) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'interview');
insert into public.conversation_messages (id, session_id, user_id, role, content) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'user', 'I grew up in Lyon.');
insert into public.memories (id, owner_user_id, type, title, content, status, privacy_level) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'MEMORY', 'Childhood in Lyon', 'A grew up in Lyon.', 'confirmed', 'ALL_AUTHORIZED_LOVED_ONES'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'MEMORY', 'Private secret', 'Owner only.', 'confirmed', 'OWNER_ONLY'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'MEMORY', 'Candidate', 'Not validated.', 'candidate', 'ALL_AUTHORIZED_LOVED_ONES'),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'MEMORY', 'For specific people', 'Specific.', 'confirmed', 'SPECIFIC_PEOPLE');
insert into public.memory_embeddings (memory_id, owner_user_id, embedding, content_hash, model)
select id, owner_user_id, array_fill(0.01::real, array[1536])::extensions.vector, 'h', 'test'
from public.memories where owner_user_id = '00000000-0000-0000-0000-00000000000a';
insert into public.media_assets (id, owner_user_id, path, filename, mime_type, size_bytes, privacy_level) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a/p.jpg', 'p.jpg', 'image/jpeg', 10, 'OWNER_ONLY');
insert into public.trusted_people (id, owner_user_id, name, email, status, linked_user_id) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'C', 'c@test.local', 'active', '00000000-0000-0000-0000-00000000000c');

-- ---------------------------------------------------------------------
-- En tant que B (inconnu de A)
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select is((select count(*) from public.memories)::int, 0, 'B ne voit aucune mémoire de A');
select is((select count(*) from public.conversation_sessions)::int, 0, 'B ne voit aucune session de A');
select is((select count(*) from public.conversation_messages)::int, 0, 'B ne voit aucun message de A');
select is((select count(*) from public.media_assets)::int, 0, 'B ne voit aucune photo de A');
select is((select count(*) from public.memory_embeddings)::int, 0, 'B ne voit aucun embedding de A');
select is((select count(*) from public.trusted_people)::int, 0, 'B ne voit pas les proches de A');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a')::int, 0, 'B ne voit pas le profil de A');
select is((select count(*) from public.match_memories('00000000-0000-0000-0000-00000000000a', array_fill(0.01::real, array[1536])::extensions.vector, 10, -1))::int, 0, 'RAG : B ne récupère rien de A');
select is((select count(*) from public.still_here_card('00000000-0000-0000-0000-00000000000a'))::int, 0, 'B ne voit pas la carte Still Here de A');
select throws_ok(
  $$insert into public.memories (owner_user_id, type, title, content) values ('00000000-0000-0000-0000-00000000000a', 'MEMORY', 'x', 'y')$$,
  '42501', null, 'B ne peut pas écrire une mémoire pour A');
select throws_ok(
  $$insert into public.conversation_sessions (user_id, subject_user_id, kind) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'loved_one')$$,
  '42501', null, 'B ne peut pas ouvrir une conversation avec le Still Here de A');
update public.memories set content = 'hacked' where id = '30000000-0000-0000-0000-000000000001';
select throws_ok(
  $$insert into public.access_permissions (owner_user_id, trusted_person_id, memory_id) values ('00000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004')$$,
  '42501', null, 'B ne peut pas modifier les permissions de A');
select is((select count(*) from public.billing_events)::int, 0, 'billing_events inaccessible');

-- ---------------------------------------------------------------------
-- En tant que C (proche actif de A)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

select results_eq(
  $$select id from public.memories order by id$$,
  $$values ('30000000-0000-0000-0000-000000000001'::uuid)$$,
  'C ne voit que les mémoires confirmées partagées avec tous les proches');
select is((select count(*) from public.match_memories('00000000-0000-0000-0000-00000000000a', array_fill(0.01::real, array[1536])::extensions.vector, 10, -1))::int, 1, 'RAG : C ne récupère que ce qui est autorisé');
select is((select count(*) from public.media_assets)::int, 0, 'C ne voit pas la photo OWNER_ONLY');
select is((select count(*) from public.conversation_messages)::int, 0, 'C ne voit pas les conversations de A');
select is((select count(*) from public.still_here_card('00000000-0000-0000-0000-00000000000a'))::int, 1, 'C voit la carte Still Here de A');
select lives_ok(
  $$insert into public.conversation_sessions (user_id, subject_user_id, kind) values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'loved_one')$$,
  'C peut ouvrir une conversation avec le Still Here de A');

-- ---------------------------------------------------------------------
-- En tant que A (propriétaire)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select content from public.memories where id = '30000000-0000-0000-0000-000000000001'), 'A grew up in Lyon.', 'La mise à jour de B n''a eu aucun effet');
select is((select count(*) from public.memories)::int, 4, 'A voit toutes ses mémoires');
select is((select count(*) from public.conversation_sessions)::int, 1, 'A ne voit pas la conversation de C avec son Still Here');

-- A accorde la mémoire spécifique à C
insert into public.access_permissions (owner_user_id, trusted_person_id, memory_id) values
  ('00000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select is((select count(*) from public.memories)::int, 2, 'C voit la mémoire SPECIFIC_PEOPLE après autorisation');

-- A révoque C
reset role;
update public.trusted_people set status = 'revoked' where id = '50000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*) from public.memories)::int, 0, 'C révoqué ne voit plus rien');

select * from finish();
rollback;
