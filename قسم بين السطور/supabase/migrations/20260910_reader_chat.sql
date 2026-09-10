-- ============================================================
-- ركن القرّاء — شات جانبي للقرّاء في قسم بين السطور
-- تشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ
-- ============================================================

create table public.reader_chat (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(btrim(nickname)) between 1 and 40),
  message text not null check (char_length(btrim(message)) between 1 and 300),
  device_id text not null,
  created_at timestamptz not null default now()
);

alter table public.reader_chat enable row level security;

create index reader_chat_created on public.reader_chat (created_at desc);

create or replace function public.get_chat_messages(p_limit integer default 50)
returns setof public.reader_chat
language sql
security definer
set search_path = public
as $$
  select * from public.reader_chat
  order by created_at desc
  limit greatest(1, coalesce(p_limit, 50));
$$;

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

revoke all on function public.get_chat_messages(integer), public.post_chat_message(text, text, text) from public;
grant execute on function public.get_chat_messages(integer), public.post_chat_message(text, text, text) to anon;

-- تفعيل التحديث اللحظي (Realtime)
alter publication supabase_realtime add table public.reader_chat;