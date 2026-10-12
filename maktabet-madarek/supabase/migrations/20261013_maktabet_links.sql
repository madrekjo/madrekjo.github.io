-- ============================================================
-- المكتبة — إضافات: الروابط المباشرة + معلم الملفات + خروج الإدارة
-- ------------------------------------------------------------
-- المشروع المطلوب: avfybjxkdlmzqpvbvdeq (مشروع المكتبة)
-- شغّل الملف كاملاً في Database → SQL Editor → Run
-- الملف آمن على إعادة التشغيل (create if not exists / drop if exists).
--
-- يضيف:
--   1) عمود teacher لجدول الملفات (اختياري — فارغ يعني غير مخصص لمعلم).
--   2) جدول الروابط المباشرة + سياسات + عدّاد فتح + إدارة.
--   3) دوال: maktabet_add_link / maktabet_set_link_status /
--      maktabet_delete_link / maktabet_increment_link_click.
--   4) maktabet_logout_admin: خروج حقيقي يحذف دور الأدمن للجلسة.
--   5) تحديث maktabet_add_file لقبول اسم المعلم (اختياري).
-- ============================================================

-- 1) عمود المعلم في جدول الملفات (فارغ = غير مخصص لمعلم معين)
alter table public.maktabet_library_files add column if not exists teacher text;

-- 2) جدول الروابط المباشرة
create table if not exists public.maktabet_library_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  description text not null default '',
  year smallint not null check (year in (2009, 2010)),
  subject text not null check (subject in (
    'math','physics','chemistry','biology','arabic','english',
    'islamic','history','earth','cs','social'
  )),
  term smallint not null check (term in (1, 2)),
  teacher text,
  uploader text not null default 'مستخدم مجهول',
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  note text not null default '',
  clicks bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mll_status_created on public.maktabet_library_links (status, created_at desc);

-- تحديث updated_at تلقائياً
create or replace function public.maktabet_links_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists maktabet_links_touch_trg on public.maktabet_library_links;
create trigger maktabet_links_touch_trg
  before update on public.maktabet_library_links
  for each row execute function public.maktabet_links_touch();

-- 3) إضافة رابط (تحقق من العنوان والرابط)
create or replace function public.maktabet_add_link(
  p_title text,
  p_url text,
  p_description text,
  p_year smallint,
  p_subject text,
  p_term smallint,
  p_teacher text default null,
  p_uploader text default 'مستخدم مجهول'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  _id uuid;
  _url text;
begin
  if nullif(trim(p_title), '') is null then
    raise exception 'title_required';
  end if;
  _url := trim(coalesce(p_url, ''));
  if _url = '' or lower(substring(_url from 1 for 7)) not in ('http://', 'https:/') then
    raise exception 'invalid_url';
  end if;
  if p_year not in (2009, 2010) then
    raise exception 'invalid_year';
  end if;
  if p_term not in (1, 2) then
    raise exception 'invalid_term';
  end if;

  insert into public.maktabet_library_links
    (title, url, description, year, subject, term, teacher, uploader, status)
  values
    (trim(p_title),
     _url,
     coalesce(nullif(trim(p_description), ''), ''),
     p_year, p_subject, p_term,
     nullif(trim(coalesce(p_teacher, '')), ''),
     coalesce(nullif(trim(p_uploader), ''), 'مستخدم مجهول'),
     'pending')
  returning id into _id;
  return _id;
end;
$$;

grant execute on function public.maktabet_add_link(
  text, text, text, smallint, text, smallint, text, text
) to anon, authenticated;

-- 4) تعديل حالة رابط (إدارة)
create or replace function public.maktabet_set_link_status(
  p_link_id uuid,
  p_status text,
  p_note text default null
)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if public.has_role(auth.uid(), 'admin') is not true then
    return false;
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    return false;
  end if;
  update public.maktabet_library_links
     set status = p_status,
         note = coalesce(p_note, note),
         updated_at = now()
   where id = p_link_id;
  return found;
end;
$$;

grant execute on function public.maktabet_set_link_status(uuid, text, text) to authenticated;

-- 5) حذف رابط (إدارة)
create or replace function public.maktabet_delete_link(p_link_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if public.has_role(auth.uid(), 'admin') is not true then
    return false;
  end if;
  delete from public.maktabet_library_links where id = p_link_id;
  return found;
end;
$$;

grant execute on function public.maktabet_delete_link(uuid) to authenticated;

-- 6) عدّاد فتح الروابط (يزيد 1 فقط للروابط المعتمدة)
create or replace function public.maktabet_increment_link_click(p_link_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  update public.maktabet_library_links
     set clicks = clicks + 1,
         updated_at = now()
   where id = p_link_id and status = 'approved';
  return found;
end;
$$;

grant execute on function public.maktabet_increment_link_click(uuid) to anon, authenticated;

-- 7) خروج حقيقي من الإدارة: يحذف دور الأدمن لتلك الجلسة
create or replace function public.maktabet_logout_admin()
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.user_roles where user_id = auth.uid();
  return true;
end;
$$;

grant execute on function public.maktabet_logout_admin() to anon, authenticated;

-- 8) تحديث دالة إضافة الملف لتقبل اسم المعلم (اختياري)
drop function if exists public.maktabet_add_file(
  text, text, smallint, text, smallint, text, text, bigint, text, text
);
create or replace function public.maktabet_add_file(
  p_title text,
  p_description text,
  p_year smallint,
  p_subject text,
  p_term smallint,
  p_type text,
  p_ext text,
  p_size_bytes bigint,
  p_uploader text default 'مستخدم مجهول',
  p_storage_path text default null,
  p_teacher text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  _limit bigint;
  _id uuid;
begin
  if nullif(trim(p_title), '') is null then
    raise exception 'title_required';
  end if;
  if p_year not in (2009, 2010) then
    raise exception 'invalid_year';
  end if;
  if p_term not in (1, 2) then
    raise exception 'invalid_term';
  end if;
  if lower(coalesce(p_ext, '')) not in ('pdf', 'jpg', 'jpeg', 'png') then
    raise exception 'invalid_ext';
  end if;
  select max_size_bytes into _limit from public.maktabet_library_settings where id = 1;
  _limit := coalesce(_limit, 10485760); -- 10MB افتراضياً
  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'invalid_size';
  end if;
  if p_size_bytes > _limit then
    raise exception 'size_limit_exceeded';
  end if;

  insert into public.maktabet_library_files
    (title, description, year, subject, term, type, ext, size_bytes, uploader, storage_path, teacher, status)
  values
    (trim(p_title),
     coalesce(nullif(trim(p_description), ''), ''),
     p_year, p_subject, p_term, p_type,
     lower(p_ext), p_size_bytes,
     coalesce(nullif(trim(p_uploader), ''), 'مستخدم مجهول'),
     p_storage_path,
     nullif(trim(coalesce(p_teacher, '')), ''),
     'pending')
  returning id into _id;
  return _id;
end;
$$;

grant execute on function public.maktabet_add_file(
  text, text, smallint, text, smallint, text, text, bigint, text, text, text
) to anon, authenticated;

-- 9) سياسات RLS لجدول الروابط
alter table public.maktabet_library_links enable row level security;

-- قراءة: الروابط المعتمدة فقط أمام الجميع (عند تفعيل المكتبة)، وكل الحالات أمام الأدمن
drop policy if exists "ml_links_read" on public.maktabet_library_links;
create policy "ml_links_read" on public.maktabet_library_links
  for select to anon, authenticated
  using (
    (public.is_maktabet_library_enabled() AND status = 'approved')
    OR public.has_role(auth.uid(), 'admin')
  );

-- إدراج: أي زائر يضيف رابطاً بحالة «قيد المراجعة» فقط
drop policy if exists "ml_links_insert" on public.maktabet_library_links;
create policy "ml_links_insert" on public.maktabet_library_links
  for insert to anon, authenticated
  with check (status = 'pending');

-- تعديل/حذف: الأدمن فقط
drop policy if exists "ml_links_update" on public.maktabet_library_links;
create policy "ml_links_update" on public.maktabet_library_links
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "ml_links_delete" on public.maktabet_library_links;
create policy "ml_links_delete" on public.maktabet_library_links
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

grant select, insert on public.maktabet_library_links to anon, authenticated;
grant update, delete on public.maktabet_library_links to authenticated;
grant all on public.maktabet_library_links to service_role;

-- ============================================================
-- ملاحظات بعد التنفيذ:
-- 1. الخروج من الإدارة أصبح نهائياً عبر maktabet_logout_admin.
-- 2. الروابط تظهر للزوار بعد «تفعيل المكتبة» إلا إذا اعتمدها الأدمن.
-- 3. لتغيير معلم ملف/رابط لاحقاً، تُعدَّل القيمة من لوحة الإدارة أو SQL.
-- ============================================================