-- ============================================================
-- ركن الإدارة في «بين السطور» — 2026-09-18
-- أدمن واحد بكلمة سر: يحذف بطاقات الناس ورسائل ركن القرّاء،
-- ويحظر جهازاً (منع النشر + حذف كامل محتواه).
-- تشغيل (مرة واحدة يدوياً): Supabase Dashboard → SQL Editor
--   1) نفّذ هذا الملف بالكامل.
--   2) عيّن كلمة سر الأدمن:
--        select public.set_admin_password('ضع-كلمة-سر-قوية-هنا');
--      (هذه الدالة مخصصة لأصحاب القاعدة فقط — لا يصلها المستخدمون)
-- آمن إعادة التشغيل لهذا الملف نفسه.
-- ============================================================

-- ---------- جدول الأسرار (يُدار من القاعدة فقط) ----------
create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ---------- الأجهزة المحظورة ----------
create table if not exists public.banned_devices (
  device_id text primary key,
  reason text not null default '',
  banned_at timestamptz not null default now(),
  banned_by text not null default ''
);

alter table public.banned_devices enable row level security;
-- لا سياسات: لا يقرؤه/يكتبه أحد عبر REST — الوظائف الأمنية (security definer) وحدها.

-- ---------- بيانات الجهاز (تُجمع عند أي نشر لمساعدة الأدمن على معرفة الشخص) ----------
create table if not exists public.device_info (
  device_id text primary key,
  user_agent text not null default '',
  platform text not null default '',
  language text not null default '',
  timezone text not null default '',
  screen text not null default '',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

alter table public.device_info enable row level security;
-- لا سياسات: تُقرأ عبر admin_list_devices فقط (security definer).

alter table public.device_info add column if not exists ip text not null default '';
alter table public.device_info add column if not exists region text not null default '';

-- ---------- تسجيل بيانات الجهاز ----------
create or replace function public.upsert_device_info(p_device text, p_meta jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_meta is null or jsonb_typeof(p_meta) <> 'object' then
    p_meta := '{}'::jsonb;
  end if;
  insert into public.device_info
    (device_id, user_agent, platform, language, timezone, screen, ip, region, first_seen, last_seen)
  values (
    p_device,
    left(coalesce(p_meta->>'user_agent', ''), 200),
    left(coalesce(p_meta->>'platform', ''), 60),
    left(coalesce(p_meta->>'language', ''), 40),
    left(coalesce(p_meta->>'timezone', ''), 60),
    left(coalesce(p_meta->>'screen', ''), 40),
    left(coalesce(p_meta->>'ip', ''), 45),
    left(coalesce(p_meta->>'region', ''), 200),
    now(), now()
  )
  on conflict (device_id) do update set
    user_agent = coalesce(nullif(excluded.user_agent, ''), device_info.user_agent),
    platform   = coalesce(nullif(excluded.platform, ''), device_info.platform),
    language   = coalesce(nullif(excluded.language, ''), device_info.language),
    timezone   = coalesce(nullif(excluded.timezone, ''), device_info.timezone),
    screen     = coalesce(nullif(excluded.screen, ''), device_info.screen),
    ip         = coalesce(nullif(excluded.ip, ''), device_info.ip),
    region     = coalesce(nullif(excluded.region, ''), device_info.region),
    last_seen  = now();
end;
$$;

revoke all on function public.upsert_device_info(text, jsonb) from public;
-- تُستدعى فقط من دوال النشر الداخلية (صاحب القاعدة).

-- ---------- تعيين كلمة السر (مالك القاعدة فقط) ----------
create or replace function public.set_admin_password(p_password text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_hash text;
begin
  if char_length(coalesce(p_password, '')) < 6 then
    raise exception 'كلمة السر يجب أن تكون 6 أحرف أو أكثر';
  end if;
  v_hash := encode(sha256(p_password::bytea), 'hex');
  insert into public.app_secrets (key, value)
  values ('admin_password_hash', v_hash)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  delete from public.app_secrets where key in ('admin_fails', 'admin_locked_until');
  return 'تم حفظ كلمة سر الأدمن ✓';
end;
$$;

-- ---------- تحقق كلمة السر (مع إقفال ضد التخمين) ----------
create or replace function public.verify_admin_password(p_admin_key text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_hash text;
  v_fails int;
  v_locked text;
begin
  select value into v_hash from public.app_secrets where key = 'admin_password_hash';
  if v_hash is null or char_length(coalesce(v_hash, '')) <> 64 then
    return false;
  end if;

  select value into v_locked from public.app_secrets where key = 'admin_locked_until';
  if v_locked is not null and v_locked::timestamptz > now() then
    return false;
  end if;

  if lower(coalesce(p_admin_key, '')) = v_hash then
    insert into public.app_secrets (key, value) values ('admin_fails', '0')
      on conflict (key) do update set value = '0', updated_at = now();
    return true;
  end if;

  select value::int into v_fails from public.app_secrets where key = 'admin_fails';
  v_fails := coalesce(v_fails, 0) + 1;
  if v_fails >= 5 then
    insert into public.app_secrets (key, value)
    values ('admin_locked_until', (now() + interval '15 minutes')::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
    insert into public.app_secrets (key, value) values ('admin_fails', '0')
      on conflict (key) do update set value = '0', updated_at = now();
  else
    insert into public.app_secrets (key, value) values ('admin_fails', v_fails::text)
      on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  return false;
end;
$$;

-- ---------- حظر النشر: تفعيل عند إرسال بطاقة ----------
create or replace function public.submit_line(
  p_text text,
  p_book text,
  p_author text default '',
  p_category text default 'رواية',
  p_submitter text default '',
  p_device text default '',
  p_meta jsonb default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_rate int;
  v_id uuid;
  v_reason text;
begin
  if char_length(btrim(p_device)) < 4 then raise exception 'جهاز غير معروف'; end if;
  perform public.upsert_device_info(p_device, p_meta);
  select reason into v_reason from public.banned_devices where device_id = p_device;
  if v_reason is not null then
    if char_length(coalesce(v_reason, '')) > 0 then
      raise exception 'جهازك محظور من المشاركة في بين السطور. رسالة الإدارة: %', v_reason;
    end if;
    raise exception 'جهازك محظور من المشاركة في بين السطور';
  end if;
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

-- ---------- حظر النشر: تفعيل عند إرسال رسالة ركن القرّاء ----------
create or replace function public.post_chat_message(
  p_nickname text,
  p_message text,
  p_device text default '',
  p_meta jsonb default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_rate integer;
  v_reason text;
begin
  if char_length(btrim(p_device)) < 4 then
    raise exception 'جهاز غير معروف';
  end if;
  perform public.upsert_device_info(p_device, p_meta);
  select reason into v_reason from public.banned_devices where device_id = p_device;
  if v_reason is not null then
    if char_length(coalesce(v_reason, '')) > 0 then
      raise exception 'جهازك محظور من المشاركة في ركن القرّاء. رسالة الإدارة: %', v_reason;
    end if;
    raise exception 'جهازك محظور من المشاركة في ركن القرّاء';
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

-- ---------- دوال الإدارة (كلها بكلمة سر الأدمن) ----------

create or replace function public.admin_list_lines(p_admin_key text, p_limit integer default 100)
returns table (
  id uuid, text text, book text, author text, category text,
  submitter text, device_id text, likes integer, created_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.verify_admin_password(p_admin_key) then
    raise exception 'كلمة سر الأدمن غير صحيحة';
  end if;
  return query
    select l.id, l.text, l.book, l.author, l.category,
           l.submitter, l.device_id, l.likes, l.created_at
    from public.lines l
    order by l.created_at desc
    limit greatest(1, coalesce(p_limit, 100));
end;
$$;

create or replace function public.admin_list_chat(p_admin_key text, p_limit integer default 100)
returns table (
  id uuid, nickname text, message text, device_id text, created_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.verify_admin_password(p_admin_key) then
    raise exception 'كلمة سر الأدمن غير صحيحة';
  end if;
  return query
    select c.id, c.nickname, c.message, c.device_id, c.created_at
    from public.reader_chat c
    order by c.created_at desc
    limit greatest(1, coalesce(p_limit, 100));
end;
$$;

create or replace function public.admin_delete_line(p_line uuid, p_admin_key text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.verify_admin_password(p_admin_key) then
    raise exception 'كلمة سر الأدمن غير صحيحة';
  end if;
  delete from public.lines where id = p_line;
  return true;
end;
$$;

create or replace function public.admin_delete_chat_message(p_id uuid, p_admin_key text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.verify_admin_password(p_admin_key) then
    raise exception 'كلمة سر الأدمن غير صحيحة';
  end if;
  delete from public.reader_chat where id = p_id;
  return true;
end;
$$;

-- حظر جهاز: يمنع نشره، ويحذف كل بطاقاته ورسائله فوراً
create or replace function public.admin_ban_device(p_device text, p_admin_key text, p_reason text default '', p_delete_content boolean default false)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.verify_admin_password(p_admin_key) then
    raise exception 'كلمة سر الأدمن غير صحيحة';
  end if;
  if char_length(coalesce(p_device, '')) < 4 then
    raise exception 'جهاز غير معروف';
  end if;
  insert into public.banned_devices (device_id, reason, banned_by)
  values (p_device, left(coalesce(nullif(p_reason, ''), ''), 200), 'admin')
  on conflict (device_id) do update set reason = excluded.reason, banned_at = now(), banned_by = 'admin';
  if p_delete_content then
    delete from public.lines where device_id = p_device;
    delete from public.reader_chat where device_id = p_device;
  end if;
  return true;
end;
$$;

create or replace function public.admin_unban_device(p_device text, p_admin_key text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.verify_admin_password(p_admin_key) then
    raise exception 'كلمة سر الأدمن غير صحيحة';
  end if;
  delete from public.banned_devices where device_id = p_device;
  return true;
end;
$$;

create or replace function public.admin_list_banned(p_admin_key text)
returns table (device_id text, reason text, banned_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.verify_admin_password(p_admin_key) then
    raise exception 'كلمة سر الأدمن غير صحيحة';
  end if;
  return query select b.device_id, b.reason, b.banned_at from public.banned_devices b order by b.banned_at desc;
end;
$$;

-- ملخص كل جهاز: عدد البطاقات/الرسائل والإعجابات وأول وآخر نشاط
-- مرتباً بآخر نشاط (الأكثر فاعلية أولاً) لمعرفة المُخرب سريعاً
create or replace function public.admin_list_devices(p_admin_key text)
returns table (
  device_id text,
  name text,
  username text,
  bio text,
  avatar_url text,
  user_id uuid,
  user_agent text,
  platform text,
  language text,
  timezone text,
  screen text,
  ip text,
  region text,
  lines_count bigint,
  chat_count bigint,
  likes_total bigint,
  stars_total bigint,
  first_seen timestamptz,
  last_seen timestamptz,
  is_banned boolean
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.verify_admin_password(p_admin_key) then
    raise exception 'كلمة سر الأدمن غير صحيحة';
  end if;
  return query
    with act as (
      select device_id, created_at, 'l'::text as kind
      from public.lines
      where device_id is not null and char_length(device_id) >= 4
      union all
      select device_id, created_at, 'c'::text as kind
      from public.reader_chat
      where device_id is not null and char_length(device_id) >= 4
    ),
    agg as (
      select a.device_id,
             min(a.created_at) as first_seen,
             max(a.created_at) as last_seen,
             count(*) filter (where a.kind = 'l')::bigint as lines_count,
             count(*) filter (where a.kind = 'c')::bigint as chat_count
      from act a
      group by a.device_id
    ),
    pl as (
      select device_id,
             coalesce(sum(likes), 0)::bigint as likes_total,
             coalesce(sum(stars), 0)::bigint as stars_total,
             (array_agg(submitter order by created_at desc))[1] as last_submitter
      from public.lines
      where device_id is not null and char_length(device_id) >= 4
      group by device_id
    ),
    pc as (
      select device_id,
             (array_agg(nickname order by created_at desc))[1] as last_nickname
      from public.reader_chat
      where device_id is not null and char_length(device_id) >= 4
      group by device_id
    )
    select agg.device_id,
           coalesce(left(pl.last_submitter, 40), left(pc.last_nickname, 40), u.username, '') as name,
           coalesce(u.username, ''),
           coalesce(u.bio, ''),
           coalesce(u.avatar_url, ''),
           u.id,
           coalesce(di.user_agent, ''),
           coalesce(di.platform, ''),
           coalesce(di.language, ''),
           coalesce(di.timezone, ''),
           coalesce(di.screen, ''),
           coalesce(di.ip, ''),
           coalesce(di.region, ''),
           agg.lines_count,
           agg.chat_count,
           coalesce(pl.likes_total, 0)::bigint,
           coalesce(pl.stars_total, 0)::bigint,
           agg.first_seen,
           agg.last_seen,
           exists (select 1 from public.banned_devices b where b.device_id = agg.device_id) as is_banned
    from agg
    left join pl on pl.device_id = agg.device_id
    left join pc on pc.device_id = agg.device_id
    left join public.users u on u.device_id = agg.device_id
    left join public.device_info di on di.device_id = agg.device_id
    order by agg.last_seen desc;
end;
$$;

-- حالة الجهاز نفسه: هل محظور + رسالة الإدارة إن وُجدت
create or replace function public.my_ban_info(p_device text)
returns table (is_banned boolean, reason text)
language plpgsql security definer set search_path = public
as $$
begin
  return query
    select exists (select 1 from public.banned_devices b where b.device_id = p_device) as is_banned,
           coalesce((select b.reason from public.banned_devices b where b.device_id = p_device), '');
end;
$$;

-- ---------- الصلاحيات ----------
revoke all on function public.set_admin_password(text) from public;
-- المتعمد: لم نمنح set_admin_password لأي دور — تُشغَّل من SQL Editor فقط.

revoke all on function public.verify_admin_password(text) from public;
revoke all on function public.admin_list_lines(text, integer) from public;
revoke all on function public.admin_list_chat(text, integer) from public;
revoke all on function public.admin_delete_line(uuid, text) from public;
revoke all on function public.admin_delete_chat_message(uuid, text) from public;
revoke all on function public.admin_ban_device(text, text, text, boolean) from public;
revoke all on function public.admin_unban_device(text, text) from public;
revoke all on function public.admin_list_banned(text) from public;
revoke all on function public.admin_list_devices(text) from public;
revoke all on function public.my_ban_info(text) from public;

grant execute on function public.verify_admin_password(text) to anon;
grant execute on function public.admin_list_lines(text, integer) to anon;
grant execute on function public.admin_list_chat(text, integer) to anon;
grant execute on function public.admin_delete_line(uuid, text) to anon;
grant execute on function public.admin_delete_chat_message(uuid, text) to anon;
grant execute on function public.admin_ban_device(text, text, text, boolean) to anon;
grant execute on function public.admin_unban_device(text, text) to anon;
grant execute on function public.admin_list_banned(text) to anon;
grant execute on function public.admin_list_devices(text) to anon;
grant execute on function public.my_ban_info(text) to anon;