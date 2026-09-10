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
  where l.user_id is distinct from p_exclude
  order by l.created_at desc
  limit greatest(1, coalesce(p_limit, 50));
$$;

-- ---------- الصلاحيات ----------
grant execute on function public.submit_line(text, text, text, text, text, text, text) to anon;
grant execute on function public.reels_feed(uuid, integer) to anon;