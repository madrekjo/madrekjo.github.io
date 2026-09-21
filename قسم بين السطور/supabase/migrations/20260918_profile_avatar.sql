-- ============================================================
-- بين السطور: تغيير الاسم + صورة البروفايل
-- بكت «avatars» + حفظ رابط الصورة في users.avatar_url
-- التشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ (آمن إعادة التشغيل)
-- ============================================================

-- ---------- تغيير الاسم المستعار (حسب الجهاز) ----------
create or replace function public.set_username(p_username text, p_device text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_id uuid;
begin
  if char_length(coalesce(p_device, '')) < 4 then
    raise exception 'جهاز غير معروف';
  end if;
  v_name := btrim(coalesce(nullif(p_username, ''), ''));
  v_name := left(v_name, 25);
  if char_length(v_name) < 2 or not (v_name ~ '^[^[:cntrl:]]+$') then
    raise exception 'الاسم بين حرفين و25 حرفاً وبدون رموز';
  end if;
  update public.users set username = v_name, updated_at = now()
  where device_id = p_device;
  if found then
    return;
  end if;
  -- لا نُنشئ حساباً صامتاً من هنا: الحساب يُنشأ عند أول تفعيل (أي سطر/متابعة)
  raise exception 'سجّل اسمك أولاً من الرئيسية';
exception
  when unique_violation then
    raise exception 'هذا الاسم مستخدم سابقاً — جرّب اسماً آخر';
end;
$$;

-- ---------- حفظ صورة البروفايل ----------
create or replace function public.set_avatar(p_url text, p_device text default '')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if char_length(coalesce(p_device, '')) < 4 then
    raise exception 'جهاز غير معروف';
  end if;
  update public.users set avatar_url = left(coalesce(p_url, ''), 300), updated_at = now()
  where device_id = p_device;
  if not found then
    raise exception 'سجّل اسمك أولاً من الرئيسية';
  end if;
end;
$$;

-- ---------- الصلاحيات ----------
revoke all on function public.set_username(text, text) from public;
revoke all on function public.set_avatar(text, text) from public;

grant execute on function public.set_username(text, text) to anon;
grant execute on function public.set_avatar(text, text) to anon;

-- ---------- بكت الصور ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set public = true, file_size_limit = 2097152;

create policy "avatars_public_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'avatars');

create policy "avatars_public_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

create policy "avatars_public_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'avatars');

create policy "avatars_public_delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'avatars');