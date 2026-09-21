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
  if exists (select 1 from public.banned_devices where device_id = p_device) then
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
  p_device text default ''
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_rate integer;
begin
  if char_length(btrim(p_device)) < 4 then
    raise exception 'جهاز غير معروف';
  end if;
  if exists (select 1 from public.banned_devices where device_id = p_device) then
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
create or replace function public.admin_ban_device(p_device text, p_admin_key text, p_reason text default '')
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
  delete from public.lines where device_id = p_device;
  delete from public.reader_chat where device_id = p_device;
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

-- ---------- الصلاحيات ----------
revoke all on function public.set_admin_password(text) from public;
-- المتعمد: لم نمنح set_admin_password لأي دور — تُشغَّل من SQL Editor فقط.

revoke all on function public.verify_admin_password(text) from public;
revoke all on function public.admin_list_lines(text, integer) from public;
revoke all on function public.admin_list_chat(text, integer) from public;
revoke all on function public.admin_delete_line(uuid, text) from public;
revoke all on function public.admin_delete_chat_message(uuid, text) from public;
revoke all on function public.admin_ban_device(text, text, text) from public;
revoke all on function public.admin_unban_device(text, text) from public;
revoke all on function public.admin_list_banned(text) from public;

grant execute on function public.verify_admin_password(text) to anon;
grant execute on function public.admin_list_lines(text, integer) to anon;
grant execute on function public.admin_list_chat(text, integer) to anon;
grant execute on function public.admin_delete_line(uuid, text) to anon;
grant execute on function public.admin_delete_chat_message(uuid, text) to anon;
grant execute on function public.admin_ban_device(text, text, text) to anon;
grant execute on function public.admin_unban_device(text, text) to anon;
grant execute on function public.admin_list_banned(text) to anon;