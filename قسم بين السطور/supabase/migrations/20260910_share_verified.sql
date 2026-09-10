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