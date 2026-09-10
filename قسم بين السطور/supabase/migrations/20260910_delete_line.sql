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