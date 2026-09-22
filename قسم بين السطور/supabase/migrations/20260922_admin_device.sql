-- ============================================================
-- بين السطور: أجهزة الإدارة — زر «لوحة الإدارة» يظهر لجهازك فقط
--
-- التشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ
-- (آمن إعادة التشغيل).
--
-- الاستخدام:
--   1) بعد التنفيذ افتح القسم مع ؟admin=1 (مثال: /sutur/?admin=1)
--      حتى يظهر زر الإدارة لأول مرة.
--   2) ادخل كلمة سر الأدمن ثم في تبويب «الأجهزة» اضغط
--      «تثبيت هذا الجهاز كجهاز إدارة».
--   3) من بعدها الزر يظهر لهذا الجهاز فقط — ولأي جهاز تضيفه من هنا.
-- ============================================================

create table if not exists public.admin_devices (
  device_id  text        primary key,
  note       text        not null default '',
  created_at timestamptz not null default now()
);

alter table public.admin_devices enable row level security;

-- هل هذا الجهاز جهاز إدارة؟
create or replace function public.is_admin_device(p_device text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if char_length(coalesce(p_device, '')) < 4 then
    return false;
  end if;
  return exists (
    select 1 from public.admin_devices where device_id = p_device
  );
end;
$$;

-- تسجيل جهاز جديد (يتطلب كلمة سر الأدمن)
create or replace function public.add_admin_device(p_device text, p_admin_key text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.verify_admin_password(p_admin_key) then
    raise exception 'مصادقة الإدارة مطلوبة';
  end if;
  if char_length(coalesce(p_device, '')) < 4 then
    raise exception 'جهاز غير معروف';
  end if;
  insert into public.admin_devices (device_id, note)
  values (p_device, '')
  on conflict (device_id) do nothing;
end;
$$;

-- إزالة جهاز من الإدارة
create or replace function public.remove_admin_device(p_device text, p_admin_key text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.verify_admin_password(p_admin_key) then
    raise exception 'مصادقة الإدارة مطلوبة';
  end if;
  delete from public.admin_devices where device_id = p_device;
end;
$$;

revoke all on function public.is_admin_device(text) from public;
revoke all on function public.add_admin_device(text, text) from public;
revoke all on function public.remove_admin_device(text, text) from public;

grant execute on function public.is_admin_device(text) to anon;
grant execute on function public.add_admin_device(text, text) to anon;
grant execute on function public.remove_admin_device(text, text) to anon;