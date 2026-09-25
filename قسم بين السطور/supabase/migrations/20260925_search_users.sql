-- ================================================================
-- [20260925_search_users.sql]
-- البحث عن أسماء المستخدمين (تبويب «بحث» الجديد)
-- ================================================================

create or replace function public.search_users(p_query text default '')
returns table (
  id uuid, username text, bio text, avatar_url text,
  card_count bigint
)
language sql security definer set search_path = public
as $$
  select
    u.id, u.username, u.bio, u.avatar_url,
    (select count(*) from public.lines l where l.user_id = u.id)::bigint
  from public.users u
  where p_query = ''
     or u.username ilike '%' || p_query || '%'
  order by (select count(*) from public.lines l where l.user_id = u.id) desc, u.username asc
  limit 60;
$$;

revoke all on function public.search_users(text) from public;
grant execute on function public.search_users(text) to anon;