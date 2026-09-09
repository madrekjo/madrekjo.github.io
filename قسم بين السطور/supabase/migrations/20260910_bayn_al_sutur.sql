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