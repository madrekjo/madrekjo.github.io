-- ============================================================
-- تعقيم ركن القرّاء: إخفاء device_id عن الجميع وإيقاف البث الحيّ للجدول
-- (البث كان يمرر device_id — المفتاح الوحيد لهوية الزائر — لأي مشترك)
-- التشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ (آمن إعادة التشغيل)
-- ============================================================

-- دالة الجلب الآمنة: تُعيد فقط الأعمدة العامة + علامة is_mine (صحيح = رسالتي)
-- بدل select * الذي كان يسرّب device_id لكل الزوار.
create or replace function public.get_chat_messages(
  p_device text default '',
  p_limit integer default 50
)
returns table (id uuid, nickname text, message text, created_at timestamptz, is_mine boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select rc.id, rc.nickname, rc.message, rc.created_at,
         (rc.device_id = p_device and char_length(coalesce(p_device, '')) >= 4) as is_mine
  from public.reader_chat rc
  order by rc.created_at desc
  limit greatest(1, coalesce(p_limit, 50));
end;
$$;

revoke all on function public.get_chat_messages(text, integer) from public;
grant execute on function public.get_chat_messages(text, integer) to anon;

-- إيقاف البث الحيّ لجدول يحتوي device_id. يُستبدل بجلب آمن دوري من الواجهة.
alter publication supabase_realtime drop table public.reader_chat;