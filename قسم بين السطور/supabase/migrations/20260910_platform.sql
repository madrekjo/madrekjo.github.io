-- ============================================================
-- منصة بين السطور الاجتماعية: متابعة + حفظ + نجوم (مثل GitHub) + ريلز
-- نفّذه في Supabase Dashboard → SQL Editor
-- ============================================================

-- ---------- المتابعة ----------
create table if not exists public.follows (
  follower_id uuid not null references public.users(id) on delete cascade,
  following_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following on public.follows (following_id);

-- ---------- البطاقات المحفوظة ----------
create table if not exists public.saved_lines (
  line_id uuid not null references public.lines(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  primary key (line_id, device_id)
);

-- ---------- نجوم البطاقات (GitHub-style) ----------
create table if not exists public.line_stars (
  line_id uuid not null references public.lines(id) on delete cascade,
  giver_device text not null,
  created_at timestamptz not null default now(),
  primary key (line_id, giver_device)
);

alter table public.lines add column if not exists stars integer not null default 0;
create index if not exists lines_stars on public.lines (stars desc);

alter table public.follows enable row level security;
alter table public.saved_lines enable row level security;
alter table public.line_stars enable row level security;

-- ---------- قلب/إزالة الإعجاب ----------
create or replace function public.toggle_like(p_line uuid, p_device text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_likes integer;
begin
  if exists (select 1 from public.likers where line_id = p_line and device_id = p_device) then
    delete from public.likers where line_id = p_line and device_id = p_device;
  else
    insert into public.likers (line_id, device_id) values (p_line, p_device);
  end if;
  update public.lines set likes = (select count(*) from public.likers where line_id = p_line)
  where id = p_line;
  select coalesce(likes, 0) into v_likes from public.lines where id = p_line;
  return v_likes;
end;
$$;

-- ---------- نجمة لبطاقة (لصاحب المحتوى أيضاً) ----------
create or replace function public.toggle_line_star(p_line uuid, p_device text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_stars integer;
  v_owner uuid;
begin
  select user_id into v_owner from public.lines where id = p_line;
  if v_owner is null then return 0; end if;
  if exists (select 1 from public.line_stars where line_id = p_line and giver_device = p_device) then
    delete from public.line_stars where line_id = p_line and giver_device = p_device;
  else
    insert into public.line_stars (line_id, giver_device) values (p_line, p_device);
  end if;
  update public.lines set stars = (select count(*) from public.line_stars where line_id = p_line)
  where id = p_line;
  select coalesce(stars, 0) into v_stars from public.lines where id = p_line;
  return v_stars;
end;
$$;

create or replace function public.my_starred_line_ids(p_device text default '')
returns setof uuid
language sql security definer set search_path = public
as $$
  select line_id from public.line_stars where giver_device = p_device;
$$;

-- ---------- حفظ بطاقة ----------
create or replace function public.toggle_save(p_line uuid, p_device text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_saved boolean;
begin
  if exists (select 1 from public.saved_lines where line_id = p_line and device_id = p_device) then
    delete from public.saved_lines where line_id = p_line and device_id = p_device;
    v_saved := false;
  else
    insert into public.saved_lines (line_id, device_id) values (p_line, p_device);
    v_saved := true;
  end if;
  return v_saved;
end;
$$;

create or replace function public.my_saved_ids(p_device text default '')
returns setof uuid
language sql security definer set search_path = public
as $$
  select line_id from public.saved_lines where device_id = p_device order by created_at desc;
$$;

-- ---------- متابعة ----------
create or replace function public.toggle_follow(p_user uuid, p_device text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid;
  v_following boolean;
begin
  select id into v_me from public.users where device_id = p_device;
  if v_me is null then raise exception 'حدّد اسمك أولاً من البروفايل'; end if;
  if v_me = p_user then raise exception 'ما تقدر تتابع نفسك'; end if;
  if exists (select 1 from public.follows where follower_id = v_me and following_id = p_user) then
    delete from public.follows where follower_id = v_me and following_id = p_user;
    v_following := false;
  else
    insert into public.follows (follower_id, following_id) values (v_me, p_user);
    v_following := true;
  end if;
  return v_following;
end;
$$;

create or replace function public.my_following_ids(p_device text default '')
returns setof uuid
language sql security definer set search_path = public
as $$
  select f.following_id from public.follows f
  join public.users u on u.id = f.follower_id
  where u.device_id = p_device;
$$;

-- ---------- بطاقات مستخدم محدد ----------
create or replace function public.lines_by_user(p_user uuid default null)
returns setof public.lines
language sql security definer set search_path = public
as $$
  select * from public.lines
  where user_id = p_user
  order by created_at desc;
$$;

-- ---------- صيغة الريلز (بطاقة + صاحبها) ----------
create or replace function public.reels_feed(p_exclude uuid default null, p_limit int default 50)
returns table (
  line_id uuid, text text, book text, author text, category text,
  submitter text, likes integer, stars integer, shares integer, visits integer,
  created_at timestamptz, user_id uuid, username text, bio text
)
language sql security definer set search_path = public
as $$
  select l.id, l.text, l.book, l.author, l.category, l.submitter,
         l.likes, l.stars, l.shares, l.visits, l.created_at,
         u.id, u.username, u.bio
  from public.lines l
  left join public.users u on u.id = l.user_id
  where (p_exclude is null or l.user_id is distinct from p_exclude)
  order by l.created_at desc
  limit greatest(1, coalesce(p_limit, 50));
$$;

-- ---------- تحديث البروفايل: عدّادات المنصة ----------
drop function if exists public.my_profile(text);
create or replace function public.my_profile(p_device text default '')
returns table (
  id uuid, username text, bio text, avatar_url text,
  card_count bigint, likes_total bigint, shares_total bigint,
  stars_earned bigint, stars_avg numeric, stars_count integer,
  followers_count bigint, following_count bigint
)
language sql security definer set search_path = public
as $$
  select
    u.id, u.username, u.bio, u.avatar_url,
    count(l.id)::bigint,
    coalesce(sum(l.likes), 0)::bigint,
    coalesce(sum(l.shares), 0)::bigint,
    (select count(distinct ls.giver_device)
       from public.line_stars ls join public.lines ll on ll.id = ls.line_id
      where ll.user_id = u.id)::bigint,
    case when u.stars_count > 0 then round(u.stars_total::numeric / u.stars_count, 1) else 0 end,
    u.stars_count,
    (select count(*) from public.follows f where f.following_id = u.id)::bigint,
    (select count(*) from public.follows f where f.follower_id = u.id)::bigint
  from public.users u
  left join public.lines l on l.user_id = u.id
  where u.device_id = p_device
  group by u.id;
$$;

drop function if exists public.public_profile(uuid);
create or replace function public.public_profile(p_user uuid default null)
returns table (
  id uuid, username text, bio text, avatar_url text,
  card_count bigint, likes_total bigint, shares_total bigint,
  stars_earned bigint, stars_avg numeric, stars_count integer,
  followers_count bigint, following_count bigint
)
language sql security definer set search_path = public
as $$
  select
    u.id, u.username, u.bio, u.avatar_url,
    count(l.id)::bigint,
    coalesce(sum(l.likes), 0)::bigint,
    coalesce(sum(l.shares), 0)::bigint,
    (select count(distinct ls.giver_device)
       from public.line_stars ls join public.lines ll on ll.id = ls.line_id
      where ll.user_id = u.id)::bigint,
    case when u.stars_count > 0 then round(u.stars_total::numeric / u.stars_count, 1) else 0 end,
    u.stars_count,
    (select count(*) from public.follows f where f.following_id = u.id)::bigint,
    (select count(*) from public.follows f where f.follower_id = u.id)::bigint
  from public.users u
  left join public.lines l on l.user_id = u.id
  where u.id = p_user
  group by u.id;
$$;

-- ---------- الصلاحيات ----------
revoke all on function public.toggle_like(uuid, text) from public;
revoke all on function public.toggle_line_star(uuid, text) from public;
revoke all on function public.my_starred_line_ids(text) from public;
revoke all on function public.toggle_save(uuid, text) from public;
revoke all on function public.my_saved_ids(text) from public;
revoke all on function public.toggle_follow(uuid, text) from public;
revoke all on function public.my_following_ids(text) from public;
revoke all on function public.lines_by_user(uuid) from public;
revoke all on function public.reels_feed(uuid, integer) from public;
revoke all on function public.my_profile(text) from public;
revoke all on function public.public_profile(uuid) from public;

grant execute on function public.toggle_like(uuid, text) to anon;
grant execute on function public.toggle_line_star(uuid, text) to anon;
grant execute on function public.my_starred_line_ids(text) to anon;
grant execute on function public.toggle_save(uuid, text) to anon;
grant execute on function public.my_saved_ids(text) to anon;
grant execute on function public.toggle_follow(uuid, text) to anon;
grant execute on function public.my_following_ids(text) to anon;
grant execute on function public.lines_by_user(uuid) to anon;
grant execute on function public.reels_feed(uuid, integer) to anon;
grant execute on function public.my_profile(text) to anon;
grant execute on function public.public_profile(uuid) to anon;