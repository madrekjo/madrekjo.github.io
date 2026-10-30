-- =========================================================
-- «أنا مجهول»: نظام التحذير بالحساب (بديل device_warnings القديم)
-- تحذير من الإدارة يظهر للمستخدم كشاشة حمراء وامضة + صوت إنذار
-- حتى يضغط «قرأت التحذير». الهوية بالإيميل/الحساب لا بالجهاز.
-- =========================================================

-- 1) جدول التحذيرات (لا يُقرأ مباشرة — الوصول عبر RPC فقط)
create table if not exists public.user_warnings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  message    text not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  seen_at    timestamptz
);

grant all on public.user_warnings to service_role;
alter table public.user_warnings enable row level security;

drop policy if exists "admins manage user warnings" on public.user_warnings;
create policy "admins manage user warnings" on public.user_warnings
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create index if not exists user_warnings_created_at_idx on public.user_warnings (created_at desc);

-- 2) الإدارة ترسل/تحدّث تحذيراً لحساب (seen_at = null => يظهر من جديد)
create or replace function public.admin_warn_user(p_user_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if p_message is null or length(btrim(p_message)) = 0 then
    raise exception 'message required';
  end if;

  insert into public.user_warnings (user_id, email, message, created_by, seen_at)
  values (
    p_user_id,
    (select lower(email) from auth.users where id = p_user_id),
    left(btrim(p_message), 500),
    auth.uid(),
    null
  )
  on conflict (user_id) do update
    set email      = excluded.email,
        message    = excluded.message,
        created_at = now(),
        created_by = excluded.created_by,
        seen_at    = null;
end; $$;
revoke execute on function public.admin_warn_user(uuid, text) from public, anon;
grant  execute on function public.admin_warn_user(uuid, text) to authenticated;

-- 3) الإدارة ترسل تحذيراً بالإيميل (لما ما عندنا user_id)
create or replace function public.admin_warn_user_email(p_email text, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;
  if p_email is null or length(btrim(p_email)) = 0 then
    raise exception 'email required';
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_uid is null then
    raise exception 'user not found';
  end if;

  perform public.admin_warn_user(v_uid, p_message);
end; $$;
revoke execute on function public.admin_warn_user_email(text, text) from public, anon;
grant  execute on function public.admin_warn_user_email(text, text) to authenticated;

-- 4) الإدارة تلغي التحذير
create or replace function public.admin_clear_user_warning(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;
  delete from public.user_warnings where user_id = p_user_id;
end; $$;
revoke execute on function public.admin_clear_user_warning(uuid) from public, anon;
grant  execute on function public.admin_clear_user_warning(uuid) to authenticated;

-- 5) تحذير حساب معيّن كما يراه الأدمن (لغرض ملف الحساب)
create or replace function public.admin_user_warning(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;
  select jsonb_build_object(
    'message', w.message,
    'at',      w.created_at,
    'seen_at', w.seen_at
  ) into v
  from public.user_warnings w
  where w.user_id = p_user_id;
  return v;
end; $$;
revoke execute on function public.admin_user_warning(uuid) from public, anon;
grant  execute on function public.admin_user_warning(uuid) to authenticated;

-- 6) التحذير النشط للمستخدم الحالي (غير مقروء فقط)
create or replace function public.my_active_warning()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('message', w.message, 'at', w.created_at)
  from public.user_warnings w
  where w.user_id = auth.uid() and w.seen_at is null
  limit 1
$$;
revoke execute on function public.my_active_warning() from public, anon;
grant  execute on function public.my_active_warning() to authenticated;

-- 7) المستخدم يؤكّد أنه قرأ التحذير (لحسابه فقط)
create or replace function public.ack_my_warning()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.user_warnings
     set seen_at = now()
   where user_id = auth.uid() and seen_at is null;
end; $$;
revoke execute on function public.ack_my_warning() from public, anon;
grant  execute on function public.ack_my_warning() to authenticated;
