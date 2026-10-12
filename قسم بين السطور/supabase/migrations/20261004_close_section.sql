-- ================================================================
-- [20261004_close_section.sql]
-- إغلاق قسم «بين السطور» بالكامل (وضع صيانة) والتحكم به من القاعدة.
--
-- - جدول section_flag: مفتاح 'section_closed' بقيمة 'true' أو 'false'.
-- - دالة is_section_closed(): يرجع true إذا كان القسم مغلقاً — الواجهة
--   تعرض شاشة «القسم مغلق» وتمنع القراءة والنشر والتصويت.
--
-- لتنفيذ الإغلاق  : update public.section_flag set value = 'true'  where key = 'section_closed';
-- لإعادة الفتح   : update public.section_flag set value = 'false' where key = 'section_closed';
-- ================================================================

create table if not exists public.section_flag (
  key text primary key,
  value text not null
);

insert into public.section_flag (key, value)
values ('section_closed', 'false')
on conflict (key) do nothing;

create or replace function public.is_section_closed()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select value = 'true' from public.section_flag where key = 'section_closed'),
    false
  );
$$;

revoke all on table public.section_flag from anon;
revoke all on table public.section_flag from authenticated;
revoke all on function public.is_section_closed() from public;
grant execute on function public.is_section_closed() to anon;
grant execute on function public.is_section_closed() to authenticated;