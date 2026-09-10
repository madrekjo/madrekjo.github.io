-- ============================================================
-- ركن القرّاء: تعديل وحذف رسائل المستخدم (رسائله فقط)
-- + تفعيل التحديث اللحظي للقرّاء الآخرين (سياسة قراءة عامة)
-- تشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ (أمن إعادة التشغيل)
-- ============================================================

-- يقرأ الشات بتصير علنية حتى يشوف الآخرون التحديثات لحظياً (Realtime/REST)
create policy "reader_chat_select_anon" on public.reader_chat
  for select using (true);

-- تعديل رسالة خاصة (نص الرسالة فقط؛ النص < 300 حرف)
create or replace function public.update_chat_message(
  p_id uuid,
  p_message text,
  p_device text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
  v_updated uuid;
begin
  select device_id into v_owner from public.reader_chat where id = p_id;
  if v_owner is null then
    raise exception 'الرسالة غير موجودة';
  end if;
  if v_owner <> p_device then
    raise exception 'لا يمكنك تعديل رسالة غيرك';
  end if;
  if char_length(btrim(p_message)) < 1 then
    raise exception 'اكتب رسالة أولاً';
  end if;
  update public.reader_chat set message = btrim(left(p_message, 300))
  where id = p_id
  returning id into v_updated;
  return v_updated;
end;
$$;

-- حذف رسالة خاصة (رسالة المستخدم نفسه فقط)
create or replace function public.delete_chat_message(
  p_id uuid,
  p_device text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
begin
  select device_id into v_owner from public.reader_chat where id = p_id;
  if v_owner is null then
    return false;
  end if;
  if v_owner <> p_device then
    raise exception 'لا يمكنك حذف رسالة غيرك';
  end if;
  delete from public.reader_chat where id = p_id;
  return true;
end;
$$;

revoke all on function public.update_chat_message(uuid, text, text), public.delete_chat_message(uuid, text) from public;
grant execute on function public.update_chat_message(uuid, text, text), public.delete_chat_message(uuid, text) to anon;