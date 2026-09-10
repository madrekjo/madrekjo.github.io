-- ============================================================
-- البروفايلات: المستخدمين + التقييم + الدفتر (آمن إعادة التشغيل)
-- نفّذه في Supabase Dashboard → SQL Editor
-- ============================================================

-- ---------- المستخدمون ----------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  bio text not null default '',
  avatar_url text not null default '',
  device_id text unique not null,
  stars_total integer not null default 0,
  stars_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

-- ---------- التقييم ----------
create table if not exists public.user_ratings (
  user_id uuid not null references public.users(id) on delete cascade,
  rater_device text not null,
  stars integer not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, rater_device)
);

alter table public.user_ratings enable row level security;

-- ---------- الدفتر (كتابة حرة بدون حد حروف) ----------
create table if not exists public.notebook_pages (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) >= 1),
  is_public boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notebook_pages_user_pos on public.notebook_pages (user_id, position);

alter table public.notebook_pages enable row level security;

-- ---------- ربط البطاقات بمستخدميها ----------
alter table public.lines add column if not exists user_id uuid references public.users(id) on delete set null;
create index if not exists lines_user on public.lines (user_id);

-- ---------- إنشاء/تحديث المستخدم ----------
create or replace function public.ensure_user(p_username text, p_bio text default '', p_device text default '')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_n int := 0;
begin
  if char_length(coalesce(p_device, '')) < 4 then
    raise exception 'جهاز غير معروف';
  end if;
  v_name := btrim(coalesce(nullif(p_username, ''), 'قارئ بين السطور'));
  v_name := left(v_name, 25);
  if char_length(v_name) < 2 or not (v_name ~ '^[^[:cntrl:]]+$') then
    raise exception 'الاسم بين حرفين و25 حرفاً وبدون رموز';
  end if;

  select id into v_id from public.users where device_id = p_device;
  if v_id is not null then
    update public.users set username = v_name, updated_at = now() where id = v_id;
    update public.lines set user_id = v_id where device_id = p_device and user_id is null;
    return v_id;
  end if;

  loop
    begin
      insert into public.users (username, bio, device_id)
      values (v_name, coalesce(nullif(p_bio, ''), ''), p_device)
      returning id into v_id;
      exit;
    exception when unique_violation then
      v_n := v_n + 1;
      if v_n > 6 then
        v_name := 'قارئ-' || (floor(random() * 90000 + 10000))::int;
      else
        v_name := left(v_name, 22) || '-' || (floor(random() * 900 + 100))::int;
      end if;
    end;
  end loop;
  update public.lines set user_id = v_id where device_id = p_device and user_id is null;
  return v_id;
end;
$$;

-- ---------- بروفايلي (الرئيسية) ----------
drop function if exists public.my_profile(text);
create or replace function public.my_profile(p_device text default '')
returns table (
  id uuid, username text, bio text, avatar_url text,
  card_count bigint, likes_total bigint, shares_total bigint,
  stars_avg numeric, stars_count integer
)
language sql security definer set search_path = public
as $$
  select
    u.id, u.username, u.bio, u.avatar_url,
    count(l.id)::bigint,
    coalesce(sum(l.likes), 0)::bigint,
    coalesce(sum(l.shares), 0)::bigint,
    case when u.stars_count > 0 then round(u.stars_total::numeric / u.stars_count, 1) else 0 end,
    u.stars_count
  from public.users u
  left join public.lines l on l.user_id = u.id
  where u.device_id = p_device
  group by u.id;
$$;

-- ---------- بروفايل أي مستخدم ----------
drop function if exists public.public_profile(uuid);
create or replace function public.public_profile(p_user uuid default null)
returns table (
  id uuid, username text, bio text, avatar_url text,
  card_count bigint, likes_total bigint, shares_total bigint,
  stars_avg numeric, stars_count integer
)
language sql security definer set search_path = public
as $$
  select
    u.id, u.username, u.bio, u.avatar_url,
    count(l.id)::bigint,
    coalesce(sum(l.likes), 0)::bigint,
    coalesce(sum(l.shares), 0)::bigint,
    case when u.stars_count > 0 then round(u.stars_total::numeric / u.stars_count, 1) else 0 end,
    u.stars_count
  from public.users u
  left join public.lines l on l.user_id = u.id
  where u.id = p_user
  group by u.id;
$$;

-- سطر لديه → صاحبه
create or replace function public.user_by_line(p_line uuid)
returns uuid
language sql security definer set search_path = public
as $$
  select user_id from public.lines where id = p_line;
$$;

-- ---------- التقييم ----------
drop function if exists public.rate_user(uuid, integer, text);
create or replace function public.rate_user(p_user uuid, p_stars integer, p_device text default '')
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_avg numeric;
begin
  if char_length(coalesce(p_device, '')) < 4 then raise exception 'جهاز غير معروف'; end if;
  if p_user is null then raise exception 'مستخدم غير معروف'; end if;
  if p_stars < 1 or p_stars > 5 then raise exception 'قيمة التقييم من 1 إلى 5'; end if;
  insert into public.user_ratings (user_id, rater_device, stars)
  values (p_user, p_device, p_stars)
  on conflict (user_id, rater_device)
  do update set stars = excluded.stars, updated_at = now();
  update public.users u set
    stars_total = (select coalesce(sum(r.stars), 0) from public.user_ratings r where r.user_id = u.id),
    stars_count = (select count(*) from public.user_ratings r where r.user_id = u.id),
    updated_at = now()
  where u.id = p_user;
  select case when count(*) > 0 then round(sum(stars)::numeric / count(*), 1) else 0 end
  into v_avg from public.user_ratings where user_id = p_user;
  return v_avg;
end;
$$;

-- تقييمي أنا لهذا المستخدم (يعرض حالة التقييم الحالية)
create or replace function public.my_rating(p_user uuid, p_device text default '')
returns integer
language sql security definer set search_path = public
as $$
  select stars from public.user_ratings where user_id = p_user and rater_device = p_device;
$$;

-- ---------- الدفتر ----------
create or replace function public.add_notebook_page(p_content text, p_is_public boolean default true, p_device text default '')
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid;
  v_id bigint;
  v_max int;
begin
  if char_length(coalesce(p_device, '')) < 4 then raise exception 'جهاز غير معروف'; end if;
  if char_length(btrim(coalesce(p_content, ''))) < 1 then raise exception 'اكتب شيئاً أولاً'; end if;
  select id into v_uid from public.users where device_id = p_device;
  if v_uid is null then raise exception 'حدّد اسمك أولاً من الرئيسية'; end if;
  select coalesce(max(position), 0) + 1 into v_max from public.notebook_pages where user_id = v_uid;
  insert into public.notebook_pages (user_id, content, is_public, position)
  values (v_uid, btrim(p_content), coalesce(p_is_public, true), v_max)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.my_notebook(p_device text default '')
returns setof public.notebook_pages
language sql security definer set search_path = public
as $$
  select np.* from public.notebook_pages np
  join public.users u on u.id = np.user_id
  where u.device_id = p_device
  order by np.position asc;
$$;

create or replace function public.public_notebook(p_user uuid default null)
returns setof public.notebook_pages
language sql security definer set search_path = public
as $$
  select * from public.notebook_pages
  where user_id = p_user and is_public
  order by position asc;
$$;

create or replace function public.update_notebook_page(p_page bigint, p_content text, p_is_public boolean default true, p_device text default '')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if char_length(btrim(coalesce(p_content, ''))) < 1 then raise exception 'اكتب شيئاً أولاً'; end if;
  update public.notebook_pages np
  set content = btrim(p_content), is_public = coalesce(p_is_public, true), updated_at = now()
  from public.users u
  where np.id = p_page and u.id = np.user_id and u.device_id = p_device;
  if not found then raise exception 'هذه الصفحة ليست لك'; end if;
end;
$$;

create or replace function public.delete_notebook_page(p_page bigint, p_device text default '')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.notebook_pages np using public.users u
  where np.id = p_page and u.id = np.user_id and u.device_id = p_device;
  if not found then raise exception 'هذه الصفحة ليست لك'; end if;
end;
$$;

drop function if exists public.set_bio(text);
create or replace function public.set_bio(p_bio text, p_device text default '')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.users set bio = left(coalesce(nullif(p_bio, ''), ''), 280), updated_at = now()
  where device_id = p_device;
end;
$$;

-- ---------- ربط البطاقة الجديدة بمستخدمها تلقائياً ----------
drop function if exists public.submit_line(text, text, text, text, text, text);
create or replace function public.submit_line(
  p_text text,
  p_book text,
  p_author text default '',
  p_category text default 'رواية',
  p_submitter text default '',
  p_device text default ''
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_rate int;
  v_id uuid;
begin
  if char_length(btrim(p_device)) < 4 then raise exception 'جهاز غير معروف'; end if;
  select count(*) into v_rate
  from public.lines
  where device_id = p_device and created_at > now() - interval '60 minutes';
  if v_rate >= 3 then raise exception 'أرسلت عدداً كبيراً من السطور — جرّب بعد قليل'; end if;
  insert into public.lines (text, book, author, category, submitter, device_id, user_id)
  values (
    btrim(p_text), btrim(p_book), btrim(p_author), p_category,
    coalesce(nullif(btrim(p_submitter), ''), (select username from public.users where device_id = p_device), 'طالب مدارك جو'),
    p_device,
    (select id from public.users where device_id = p_device)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- الصلاحيات ----------
revoke all on function public.ensure_user(text, text, text) from public;
revoke all on function public.my_profile(text) from public;
revoke all on function public.public_profile(uuid) from public;
revoke all on function public.user_by_line(uuid) from public;
revoke all on function public.rate_user(uuid, integer, text) from public;
revoke all on function public.my_rating(uuid, text) from public;
revoke all on function public.add_notebook_page(text, boolean, text) from public;
revoke all on function public.my_notebook(text) from public;
revoke all on function public.public_notebook(uuid) from public;
revoke all on function public.update_notebook_page(bigint, text, boolean, text) from public;
revoke all on function public.delete_notebook_page(bigint, text) from public;
revoke all on function public.set_bio(text, text) from public;
revoke all on function public.submit_line(text, text, text, text, text, text) from public;

grant execute on function public.ensure_user(text, text, text) to anon;
grant execute on function public.my_profile(text) to anon;
grant execute on function public.public_profile(uuid) to anon;
grant execute on function public.user_by_line(uuid) to anon;
grant execute on function public.rate_user(uuid, integer, text) to anon;
grant execute on function public.my_rating(uuid, text) to anon;
grant execute on function public.add_notebook_page(text, boolean, text) to anon;
grant execute on function public.my_notebook(text) to anon;
grant execute on function public.public_notebook(uuid) to anon;
grant execute on function public.update_notebook_page(bigint, text, boolean, text) to anon;
grant execute on function public.delete_notebook_page(bigint, text) to anon;
grant execute on function public.set_bio(text, text) to anon;
grant execute on function public.submit_line(text, text, text, text, text, text) to anon;