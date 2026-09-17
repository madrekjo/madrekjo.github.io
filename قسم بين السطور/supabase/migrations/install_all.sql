-- ===================================================================
-- مدارك جو · بين السطور — ملف التنصيب الكامل (نفّذه دفعة واحدة في SQL Editor)
-- تاريخ الإنشاء: 2026-09-17
-- آمن لإعادة التشغيل (idempotent). الارتباط: bayn_al_sutur ← reader_chat ← profiles ← platform ← ...
-- ===================================================================

-- ================================================================
-- [20260910_bayn_al_sutur.sql]
-- ================================================================
-- ============================================================
-- بين السطور — قسم بطاقات القراءة
-- تشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ
-- ============================================================

-- ---------- الجداول ----------
create table public.lines (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(btrim(text)) between 1 and 300),
  book text not null check (char_length(btrim(book)) between 1 and 120),
  author text not null default '',
  category text not null check (category in ('رواية', 'ديني', 'تنمية', 'شعر', 'تاريخ')),
  submitter text not null default 'طالب مدارك جو' check (char_length(btrim(submitter)) between 1 and 40),
  device_id text not null,
  likes integer not null default 0,
  shares integer not null default 0,
  visits integer not null default 0,
  featured_date date,
  created_at timestamptz not null default now()
);

create table public.likers (
  line_id uuid not null references public.lines(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  primary key (line_id, device_id)
);

create table public.share_events (
  id bigint generated always as identity primary key,
  line_id uuid not null references public.lines(id) on delete cascade,
  platform text not null,
  device_id text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.engagement_reports (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.lines(id) on delete cascade,
  platform text not null,
  reach integer not null default 0 check (reach >= 0),
  reactions integer not null default 0 check (reactions >= 0),
  note text not null default '',
  device_id text not null,
  created_at timestamptz not null default now()
);

create table public.proofs (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.lines(id) on delete cascade,
  storage_path text not null,
  device_id text not null,
  created_at timestamptz not null default now()
);

create index share_events_line_time on public.share_events (line_id, created_at);
create index lines_featured_daily on public.lines (featured_date desc);
create index lines_created on public.lines (created_at desc);

alter table public.lines enable row level security;
alter table public.likers enable row level security;
alter table public.share_events enable row level security;
alter table public.engagement_reports enable row level security;
alter table public.proofs enable row level security;

-- ---------- الدوال (كل الوصول عبر دوال آمنة) ----------

create or replace function public.get_lines()
returns setof public.lines
language sql
security definer
set search_path = public
as $$
  select * from public.lines
  order by (featured_date is not null) desc, featured_date desc nulls last, created_at desc;
$$;

create or replace function public.submit_line(
  p_text text,
  p_book text,
  p_author text default '',
  p_category text default 'رواية',
  p_submitter text default 'طالب مدارك جو',
  p_device text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate int;
  v_id uuid;
begin
  if char_length(btrim(p_device)) < 4 then
    raise exception 'جهاز غير معروف';
  end if;
  select count(*) into v_rate
  from public.lines
  where device_id = p_device and created_at > now() - interval '60 minutes';
  if v_rate >= 3 then
    raise exception 'أرسلت عدداً كبيراً من السطور — جرّب بعد قليل';
  end if;
  insert into public.lines (text, book, author, category, submitter, device_id)
  values (
    btrim(p_text),
    btrim(p_book),
    btrim(p_author),
    p_category,
    coalesce(nullif(btrim(p_submitter), ''), 'طالب مدارك جو'),
    p_device
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.like_line(p_line uuid, p_device text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_likes integer;
begin
  insert into public.likers (line_id, device_id)
  values (p_line, p_device)
  on conflict (line_id, device_id) do nothing;

  update public.lines set likes = likes + 1
  where id = p_line
  and exists (select 1 from public.likers l where l.line_id = p_line and l.device_id = p_device);

  select likes into v_likes from public.lines where id = p_line;
  return coalesce(v_likes, 0);
end;
$$;

create or replace function public.record_share(p_line uuid, p_platform text, p_device text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shares integer;
begin
  insert into public.share_events (line_id, platform, device_id, completed)
  values (p_line, coalesce(nullif(p_platform, ''), 'system'), p_device, true);

  update public.lines set shares = shares + 1 where id = p_line;
  select shares into v_shares from public.lines where id = p_line;
  return coalesce(v_shares, 0);
end;
$$;

create or replace function public.record_visit(p_line uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.lines set visits = visits + 1 where id = p_line;
$$;

create or replace function public.weekly_top(p_limit integer default 3)
returns table (
  line_id uuid,
  text text,
  book text,
  author text,
  category text,
  submitter text,
  likes integer,
  shares integer,
  week_shares bigint
)
language sql
security definer
set search_path = public
as $$
  select
    l.id as line_id,
    l.text,
    l.book,
    l.author,
    l.category,
    l.submitter,
    l.likes,
    l.shares,
    count(se.id)::bigint as week_shares
  from public.lines l
  left join public.share_events se
    on se.line_id = l.id and se.completed and se.created_at >= now() - interval '7 days'
  group by l.id
  order by week_shares desc, l.likes desc, l.created_at asc
  limit greatest(1, coalesce(p_limit, 3));
$$;

create or replace function public.my_lines(p_device text default '')
returns setof public.lines
language sql
security definer
set search_path = public
as $$
  select * from public.lines where device_id = p_device order by created_at desc;
$$;

create or replace function public.submit_report(
  p_line uuid,
  p_platform text,
  p_reach integer default 0,
  p_reactions integer default 0,
  p_note text default '',
  p_device text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.lines where id = p_line and device_id = p_device) then
    raise exception 'هذه البطاقة ليست لك';
  end if;
  insert into public.engagement_reports (line_id, platform, reach, reactions, note, device_id)
  values (p_line, p_platform, greatest(0, coalesce(p_reach, 0)), greatest(0, coalesce(p_reactions, 0)), coalesce(p_note, ''), p_device)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.attach_proof(p_line uuid, p_path text, p_device text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.lines where id = p_line and device_id = p_device) then
    raise exception 'هذه البطاقة ليست لك';
  end if;
  insert into public.proofs (line_id, storage_path, device_id)
  values (p_line, p_path, p_device)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.my_reports(p_device text default '')
returns table (
  report_id uuid,
  line_id uuid,
  line_text text,
  platform text,
  reach integer,
  reactions integer,
  note text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.id as report_id, l.id as line_id, l.text as line_text,
         r.platform, r.reach, r.reactions, r.note, r.created_at
  from public.engagement_reports r
  join public.lines l on l.id = r.line_id
  where l.device_id = p_device
  order by r.created_at desc;
$$;

create or replace function public.my_proofs(p_device text default '')
returns table (
  proof_id uuid,
  line_id uuid,
  line_text text,
  storage_path text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.id as proof_id, l.id as line_id, l.text as line_text,
         p.storage_path, p.created_at
  from public.proofs p
  join public.lines l on l.id = p.line_id
  where l.device_id = p_device
  order by p.created_at desc;
$$;

-- ---------- صلاحيات الدوال ----------
revoke all on function
  public.get_lines(),
  public.submit_line(text, text, text, text, text, text),
  public.like_line(uuid, text),
  public.record_share(uuid, text, text),
  public.record_visit(uuid),
  public.weekly_top(integer),
  public.my_lines(text),
  public.submit_report(uuid, text, integer, integer, text, text),
  public.attach_proof(uuid, text, text),
  public.my_reports(text),
  public.my_proofs(text)
from public;

grant execute on function
  public.get_lines(),
  public.submit_line(text, text, text, text, text, text),
  public.like_line(uuid, text),
  public.record_share(uuid, text, text),
  public.record_visit(uuid),
  public.weekly_top(integer),
  public.my_lines(text),
  public.submit_report(uuid, text, integer, integer, text, text),
  public.attach_proof(uuid, text, text),
  public.my_reports(text),
  public.my_proofs(text)
to anon;

-- ---------- التخزين (سكرين شوت الأدلة) ----------
insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', true)
on conflict (id) do nothing;

drop policy if exists "proofs-upload-anon" on storage.objects;
create policy "proofs-upload-anon"
on storage.objects
for insert
to anon
with check (bucket_id = 'proofs');

-- ================================================================
-- [20260910_reader_chat.sql]
-- ================================================================
-- ============================================================
-- ركن القرّاء — شات جانبي للقرّاء في قسم بين السطور
-- تشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ
-- ============================================================

create table public.reader_chat (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(btrim(nickname)) between 1 and 40),
  message text not null check (char_length(btrim(message)) between 1 and 300),
  device_id text not null,
  created_at timestamptz not null default now()
);

alter table public.reader_chat enable row level security;

create index reader_chat_created on public.reader_chat (created_at desc);

create or replace function public.get_chat_messages(p_limit integer default 50)
returns setof public.reader_chat
language sql
security definer
set search_path = public
as $$
  select * from public.reader_chat
  order by created_at desc
  limit greatest(1, coalesce(p_limit, 50));
$$;

create or replace function public.post_chat_message(
  p_nickname text,
  p_message text,
  p_device text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_rate integer;
begin
  if char_length(btrim(p_device)) < 4 then
    raise exception 'جهاز غير معروف';
  end if;
  if char_length(btrim(p_message)) < 1 then
    raise exception 'اكتب رسالة أولاً';
  end if;
  select count(*) into v_rate
  from public.reader_chat
  where device_id = p_device and created_at > now() - interval '60 seconds';
  if v_rate >= 3 then
    raise exception 'تمهّل قليلاً قبل إرسال رسالة أخرى';
  end if;
  insert into public.reader_chat (nickname, message, device_id)
  values (btrim(left(coalesce(nullif(p_nickname, ''), 'قارئ'), 40)), btrim(left(p_message, 300)), p_device)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.get_chat_messages(integer), public.post_chat_message(text, text, text) from public;
grant execute on function public.get_chat_messages(integer), public.post_chat_message(text, text, text) to anon;

-- تفعيل التحديث اللحظي (Realtime)
alter publication supabase_realtime add table public.reader_chat;

-- ================================================================
-- [20260910_profiles.sql]
-- ================================================================
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

-- ================================================================
-- [20260910_platform.sql]
-- ================================================================
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

-- ================================================================
-- [20260910_restore_my_likes.sql]
-- ================================================================
-- ============================================================
-- تثبيت اللايك على الجهاز: استرجاع لايكات الجهاز عند الدخول
-- + منع تكرار عدّ اللايك الواحد عند إعادة التصويت
-- تشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ (أمن إعادة التشغيل)
-- ============================================================

create or replace function public.my_liked_line_ids(p_device text default '')
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select line_id from public.likers where device_id = p_device;
$$;

revoke all on function public.my_liked_line_ids(text) from public;
grant execute on function public.my_liked_line_ids(text) to anon;

-- like_line: يزيد العداد مرة واحدة فقط لكل (سطر + جهاز)
create or replace function public.like_line(p_line uuid, p_device text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_likes integer;
begin
  update public.lines set likes = likes + 1
  where id = p_line
  and not exists (
    select 1 from public.likers l where l.line_id = p_line and l.device_id = p_device
  );

  insert into public.likers (line_id, device_id)
  values (p_line, p_device)
  on conflict (line_id, device_id) do nothing;

  select likes into v_likes from public.lines where id = p_line;
  return coalesce(v_likes, 0);
end;
$$;

revoke all on function public.like_line(uuid, text) from public;
grant execute on function public.like_line(uuid, text) to anon;

-- ================================================================
-- [20260910_share_verified.sql]
-- ================================================================
-- ============================================================
-- مشاركة بالإثبات: نقطة المتصدر لا تُحسب إلا بدليل نشر فعلي
-- (آمن إعادة التشغيل — نفّذه في Supabase Dashboard → SQL Editor)
-- ============================================================

-- (1) تنظيف تكرارات المشاركات القديمة لكل جهاز+سطر ثم منع التكرار مستقبلاً
delete from public.share_events a
using public.share_events b
where a.line_id = b.line_id
  and a.device_id = b.device_id
  and a.created_at < b.created_at;

create unique index if not exists share_events_line_device
  on public.share_events (line_id, device_id, md5(device_id));

-- (2) تسجيل المشاركة كـ«محاولة» (completed=false) بدون زيادة نقطة
create or replace function public.record_share(p_line uuid, p_platform text, p_device text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shares integer;
begin
  if char_length(coalesce(p_device, '')) < 4 then
    select shares into v_shares from public.lines where id = p_line;
    return coalesce(v_shares, 0);
  end if;
  insert into public.share_events (line_id, platform, device_id, completed)
  values (p_line, coalesce(nullif(p_platform, ''), 'system'), p_device, false)
  on conflict do nothing;
  select shares into v_shares from public.lines where id = p_line;
  return coalesce(v_shares, 0);
end;
$$;

-- (3) اعتماد المشاركة بعد رفع دليل النشر (سكرين شوت) — هنا فقط تزيد النقطة
create or replace function public.confirm_share(p_line uuid, p_device text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shares integer;
begin
  if char_length(coalesce(p_device, '')) < 4 then
    select shares into v_shares from public.lines where id = p_line;
    return coalesce(v_shares, 0);
  end if;
  update public.share_events set completed = true
  where line_id = p_line and device_id = p_device and not completed;
  if found then
    update public.lines set shares = shares + 1 where id = p_line;
  end if;
  select shares into v_shares from public.lines where id = p_line;
  return coalesce(v_shares, 0);
end;
$$;

-- (4) الصلاحيات
revoke all on function public.record_share(uuid, text, text) from public;
grant execute on function public.record_share(uuid, text, text) to anon;
grant execute on function public.confirm_share(uuid, text) to anon;

-- ================================================================
-- [20260910_card_color.sql]
-- ================================================================
-- ============================================================
-- بين السطور — لون البطاقة (اختيار اللون وقت النشر + بيج كافتراضي)
-- تشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ
-- ============================================================

-- ---------- العمود ----------
alter table public.lines
  add column if not exists color text not null default '';

-- ---------- submit_line: تستقبل اللون ----------
drop function if exists public.submit_line(text, text, text, text, text, text);
drop function if exists public.submit_line(text, text, text, text, text, text, text);

create or replace function public.submit_line(
  p_text text,
  p_book text,
  p_author text default '',
  p_category text default 'رواية',
  p_submitter text default 'طالب مدارك جو',
  p_color text default '',
  p_device text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate int;
  v_id uuid;
  v_usr uuid;
begin
  if char_length(btrim(p_device)) < 4 then
    raise exception 'جهاز غير معروف';
  end if;
  select count(*) into v_rate
  from public.lines
  where device_id = p_device and created_at > now() - interval '60 minutes';
  if v_rate >= 10 then
    raise exception 'أرسلت عدداً كبيراً من السطور — جرّب بعد قليل';
  end if;
  insert into public.lines (text, book, author, category, submitter, color, device_id)
  values (
    btrim(p_text),
    btrim(p_book),
    btrim(p_author),
    p_category,
    coalesce(nullif(btrim(p_submitter), ''), 'طالب مدارك جو'),
    coalesce(nullif(btrim(p_color), ''), ''),
    p_device
  )
  returning id into v_id;
  select id into v_usr from public.users where device_id = p_device limit 1;
  if v_usr is not null then
    update public.lines set user_id = v_usr where id = v_id and user_id is null;
  end if;
  return v_id;
end;
$$;

-- ---------- reels_feed: يجلب اللون ----------
drop function if exists public.reels_feed(uuid, integer);

create or replace function public.reels_feed(p_exclude uuid default null, p_limit int default 50)
returns table (
  line_id uuid, text text, book text, author text, category text,
  submitter text, likes integer, stars integer, shares integer, visits integer,
  created_at timestamptz, user_id uuid, username text, bio text, color text
)
language sql security definer set search_path = public
as $$
  select l.id, l.text, l.book, l.author, l.category, l.submitter,
         l.likes, l.stars, l.shares, l.visits, l.created_at,
         u.id, u.username, u.bio, l.color
  from public.lines l
  left join public.users u on u.id = l.user_id
  where (p_exclude is null or l.user_id is distinct from p_exclude)
  order by l.created_at desc
  limit greatest(1, coalesce(p_limit, 50));
$$;

-- ---------- الصلاحيات ----------
grant execute on function public.submit_line(text, text, text, text, text, text, text) to anon;
grant execute on function public.reels_feed(uuid, integer) to anon;

-- ================================================================
-- [20260910_delete_line.sql]
-- ================================================================
-- ============================================================
-- بين السطور — حذف بطاقة بواسطة صاحبها فقط
-- تشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ
-- ============================================================

create or replace function public.delete_line(p_line uuid, p_device text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
begin
  if char_length(coalesce(p_device, '')) < 4 then
    raise exception 'جهاز غير معروف';
  end if;
  select device_id into v_owner
  from public.lines
  where id = p_line;
  if v_owner is null then
    raise exception 'السطر غير موجود';
  end if;
  if v_owner <> p_device then
    raise exception 'ما لك صلاحية حذف سطر غيرك';
  end if;
  delete from public.lines
  where id = p_line;
  return true;
end;
$$;

grant execute on function public.delete_line(uuid, text) to anon;

-- ================================================================
-- [20260910_reader_chat_manage.sql]
-- ================================================================
-- ============================================================
-- ركن القرّاء: تعديل وحذف رسائل المستخدم (رسائله فقط)
-- + تفعيل التحديث اللحظي للقرّاء الآخرين (سياسة قراءة عامة)
-- تشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ (أمن إعادة التشغيل)
-- ============================================================

-- يقرأ الشات بتصير علنية حتى يشوف الآخرون التحديثات لحظياً (Realtime/REST)
drop policy if exists "reader_chat_select_anon" on public.reader_chat;
create policy "reader_chat_select_anon" on public.reader_chat
  for select using (true);

-- نسخة وافية لرسائل UPDATE/DELETE في التحديث اللحظي
alter table public.reader_chat replica identity full;

-- التأكد أن الجدول مشترك في نشر Realtime (أمن إعادة التشغيل)
do $$
begin
  alter publication supabase_realtime add table public.reader_chat;
exception when duplicate_object then
  null;
end $$;

-- تعديل رسالة خاصة (نص الرسالة فقط؛ النص < 300 حرف)
create or replace function public.update_chat_message(
  p_id uuid,
  p_message text,
  p_device text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
  v_updated uuid;
begin
  select device_id into v_owner from public.reader_chat where id = p_id;
  if v_owner is null then
    raise exception 'الرسالة غير موجودة';
  end if;
  if v_owner <> p_device then
    raise exception 'لا يمكنك تعديل رسالة غيرك';
  end if;
  if char_length(btrim(p_message)) < 1 then
    raise exception 'اكتب رسالة أولاً';
  end if;
  update public.reader_chat set message = btrim(left(p_message, 300))
  where id = p_id
  returning id into v_updated;
  return v_updated;
end;
$$;

-- حذف رسالة خاصة (رسالة المستخدم نفسه فقط)
create or replace function public.delete_chat_message(
  p_id uuid,
  p_device text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
begin
  select device_id into v_owner from public.reader_chat where id = p_id;
  if v_owner is null then
    return false;
  end if;
  if v_owner <> p_device then
    raise exception 'لا يمكنك حذف رسالة غيرك';
  end if;
  delete from public.reader_chat where id = p_id;
  return true;
end;
$$;

revoke all on function public.update_chat_message(uuid, text, text), public.delete_chat_message(uuid, text) from public;
grant execute on function public.update_chat_message(uuid, text, text), public.delete_chat_message(uuid, text) to anon;

-- ================================================================
-- [20260910_apply_pending_running.sql]
-- ================================================================
-- ============================================================
-- تطبيق كل التحديثات المعلقة لقسم بين السطور دفعة واحدة (آمن إعادة التشغيل)
-- نفّذه كله مرة واحدة في Supabase Dashboard → SQL Editor
-- ============================================================

-- (1) إصلاح دالة إرسال الرسائل في ركن القرّاء (الـ 40 برة coalesce)
create or replace function public.post_chat_message(
  p_nickname text,
  p_message text,
  p_device text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_rate integer;
begin
  if char_length(btrim(p_device)) < 4 then
    raise exception 'جهاز غير معروف';
  end if;
  if char_length(btrim(p_message)) < 1 then
    raise exception 'اكتب رسالة أولاً';
  end if;
  select count(*) into v_rate
  from public.reader_chat
  where device_id = p_device and created_at > now() - interval '60 seconds';
  if v_rate >= 3 then
    raise exception 'تمهّل قليلاً قبل إرسال رسالة أخرى';
  end if;
  insert into public.reader_chat (nickname, message, device_id)
  values (btrim(left(coalesce(nullif(p_nickname, ''), 'قارئ'), 40)), btrim(left(p_message, 300)), p_device)
  returning id into v_id;
  return v_id;
end;
$$;

-- (2) استرجاع لايكات الجهاز + منع إعادة عد اللايك المكرر
create or replace function public.my_liked_line_ids(p_device text default '')
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select line_id from public.likers where device_id = p_device;
$$;

create or replace function public.like_line(p_line uuid, p_device text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_likes integer;
begin
  update public.lines set likes = likes + 1
  where id = p_line
  and not exists (
    select 1 from public.likers l where l.line_id = p_line and l.device_id = p_device
  );

  insert into public.likers (line_id, device_id)
  values (p_line, p_device)
  on conflict (line_id, device_id) do nothing;

  select likes into v_likes from public.lines where id = p_line;
  return coalesce(v_likes, 0);
end;
$$;

-- (3) ركن القرّاء: قراءة عامة + Realtime كامل + تعديل/حذف رسائلك
drop policy if exists "reader_chat_select_anon" on public.reader_chat;
create policy "reader_chat_select_anon" on public.reader_chat
  for select using (true);

alter table public.reader_chat replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.reader_chat;
exception when duplicate_object then
  null;
end $$;

create or replace function public.update_chat_message(
  p_id uuid,
  p_message text,
  p_device text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
  v_updated uuid;
begin
  select device_id into v_owner from public.reader_chat where id = p_id;
  if v_owner is null then
    raise exception 'الرسالة غير موجودة';
  end if;
  if v_owner <> p_device then
    raise exception 'لا يمكنك تعديل رسالة غيرك';
  end if;
  if char_length(btrim(p_message)) < 1 then
    raise exception 'اكتب رسالة أولاً';
  end if;
  update public.reader_chat set message = btrim(left(p_message, 300))
  where id = p_id
  returning id into v_updated;
  return v_updated;
end;
$$;

create or replace function public.delete_chat_message(
  p_id uuid,
  p_device text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
begin
  select device_id into v_owner from public.reader_chat where id = p_id;
  if v_owner is null then
    return false;
  end if;
  if v_owner <> p_device then
    raise exception 'لا يمكنك حذف رسالة غيرك';
  end if;
  delete from public.reader_chat where id = p_id;
  return true;
end;
$$;

revoke all on function public.get_chat_messages(integer) from public;
revoke all on function public.post_chat_message(text, text, text) from public;
revoke all on function public.update_chat_message(uuid, text, text) from public;
revoke all on function public.delete_chat_message(uuid, text) from public;
revoke all on function public.my_liked_line_ids(text) from public;
revoke all on function public.like_line(uuid, text) from public;

grant execute on function public.get_chat_messages(integer) to anon;
grant execute on function public.post_chat_message(text, text, text) to anon;
grant execute on function public.update_chat_message(uuid, text, text) to anon;
grant execute on function public.delete_chat_message(uuid, text) to anon;
grant execute on function public.my_liked_line_ids(text) to anon;
grant execute on function public.like_line(uuid, text) to anon;

-- (4) تفعيل رفع صور الدليل (سكرين شوت) في بطاقتي
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proofs',
  'proofs',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set public = true;

drop policy if exists "proofs_public_insert" on storage.objects;
create policy "proofs_public_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'proofs');

drop policy if exists "proofs_public_select" on storage.objects;
create policy "proofs_public_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'proofs');

drop policy if exists "proofs_public_update" on storage.objects;
create policy "proofs_public_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'proofs');

drop policy if exists "proofs_public_delete" on storage.objects;
create policy "proofs_public_delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'proofs');

-- ================================================================
-- [20260910_proofs_storage.sql]
-- ================================================================
-- ============================================================
-- تفعيل رفع صور الدليل (سكرين شوت) في «بطاقتي»
-- ينشئ البكت + صلاحيات عامة (القراءة للعرض، والرفع والمسح)
-- تشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ (أمن إعادة التشغيل)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proofs',
  'proofs',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set public = true;

create policy "proofs_public_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'proofs');

create policy "proofs_public_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'proofs');

create policy "proofs_public_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'proofs');

create policy "proofs_public_delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'proofs');

-- ================================================================
-- [20260911_bind_orphan_lines.sql]
-- ================================================================
-- ربط البطاقات المعلّقة (نُشرت قبل ربط user_id في submit_line) بصاحبها عبر الجهاز
update public.lines l
set user_id = u.id
from public.users u
where l.user_id is null
  and l.device_id = u.device_id;
