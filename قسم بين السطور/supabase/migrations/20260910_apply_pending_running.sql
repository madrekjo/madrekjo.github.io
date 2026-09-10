-- ============================================================
-- تطبيق كل التحديثات المعلقة لقسم بين السطور دفعة واحدة (آمن إعادة التشغيل)
-- نفّذه كله مرة واحدة في Supabase Dashboard → SQL Editor
-- ============================================================

-- (1) إصلاح دالة إرسال الرسائل في ركن القرّاء (الـ 40 برة coalesce)
create or replace function public.post_chat_message(
  p_nickname text,
  p_message text,
  p_device text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_rate integer;
begin
  if char_length(btrim(p_device)) < 4 then
    raise exception 'جهاز غير معروف';
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

-- (2) استرجاع لايكات الجهاز + منع إعادة عد اللايك المكرر
create or replace function public.my_liked_line_ids(p_device text default '')
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select line_id from public.likers where device_id = p_device;
$$;

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

-- (3) ركن القرّاء: قراءة عامة + Realtime كامل + تعديل/حذف رسائلك
drop policy if exists "reader_chat_select_anon" on public.reader_chat;
create policy "reader_chat_select_anon" on public.reader_chat
  for select using (true);

alter table public.reader_chat replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.reader_chat;
exception when duplicate_object then
  null;
end $$;

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

revoke all on function public.get_chat_messages(integer) from public;
revoke all on function public.post_chat_message(text, text, text) from public;
revoke all on function public.update_chat_message(uuid, text, text) from public;
revoke all on function public.delete_chat_message(uuid, text) from public;
revoke all on function public.my_liked_line_ids(text) from public;
revoke all on function public.like_line(uuid, text) from public;

grant execute on function public.get_chat_messages(integer) to anon;
grant execute on function public.post_chat_message(text, text, text) to anon;
grant execute on function public.update_chat_message(uuid, text, text) to anon;
grant execute on function public.delete_chat_message(uuid, text) to anon;
grant execute on function public.my_liked_line_ids(text) to anon;
grant execute on function public.like_line(uuid, text) to anon;

-- (4) تفعيل رفع صور الدليل (سكرين شوت) في بطاقتي
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proofs',
  'proofs',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set public = true;

drop policy if exists "proofs_public_insert" on storage.objects;
create policy "proofs_public_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'proofs');

drop policy if exists "proofs_public_select" on storage.objects;
create policy "proofs_public_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'proofs');

drop policy if exists "proofs_public_update" on storage.objects;
create policy "proofs_public_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'proofs');

drop policy if exists "proofs_public_delete" on storage.objects;
create policy "proofs_public_delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'proofs');