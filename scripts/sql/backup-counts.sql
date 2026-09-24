-- Comptages de référence : calculés au moment du dump, comparés après restauration.
select json_object_agg(t, c)
from (
  select 'profiles' as t, count(*) as c from public.profiles
  union all select 'memories', count(*) from public.memories
  union all select 'memory_sources', count(*) from public.memory_sources
  union all select 'conversation_messages', count(*) from public.conversation_messages
  union all select 'media_assets', count(*) from public.media_assets
  union all select 'trusted_people', count(*) from public.trusted_people
) x;
