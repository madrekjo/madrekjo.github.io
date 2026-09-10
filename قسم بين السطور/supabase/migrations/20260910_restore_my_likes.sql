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