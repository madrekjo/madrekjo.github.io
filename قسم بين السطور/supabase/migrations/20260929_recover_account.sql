-- ================================================================
-- [20260929_recover_account.sql]
-- استرجاع الحساب القديم بعد تغيير رابط المنصة
-- سبب المشكلة: هوية الجهاز device_id مرتبطة بالدومين القديم
-- (localStorage + بصمة canvas/webgl التي تنوعها متصفحات الخصوصية
--  لكل أصل)، فتغيّر الرابط ⟵ أصبح كل جهاز «جديداً».
-- هذا الميغريشن يسمح لصاحب الحساب أن يربط نفسه بالاسم + التأكيد.
-- يُنفَّذ في Supabase Dashboard → SQL Editor
-- ================================================================

-- ---------- البحث عن مرشّحي الاسترجاع (تستبعد الجهاز الحالي) ----------
create or replace function public.recover_candidates(p_query text default '', p_device text default '')
returns table (
  id uuid, username text, bio text, avatar_url text,
  card_count bigint, created_at timestamptz
)
language sql security definer set search_path = public
as $$
  select
    u.id, u.username, u.bio, u.avatar_url,
    (select count(*) from public.lines l where l.user_id = u.id)::bigint,
    u.created_at
  from public.users u
  where (p_query = '' or u.username ilike '%' || p_query || '%')
    and coalesce(u.device_id, '') <> coalesce(p_device, '')
  order by u.username asc
  limit 40;
$$;

-- ---------- ربط الجهاز الحالي بالحساب القديم ----------
create or replace function public.recover_account(p_username text, p_device text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_existing uuid;
begin
  if char_length(coalesce(nullif(p_device, ''), '')) < 4 then
    raise exception 'جهاز غير معروف';
  end if;

  select id into v_id
  from public.users
  where btrim(username) = btrim(p_username);

  if v_id is null then
    raise exception 'ما لقينا حساب بهذا الاسم على المنصة القديمة';
  end if;

  -- إن كان الجهاز الحالي أنشأ حساباً جديداً (مؤقتاً) ندمجه ونتخلص منه
  select id into v_existing from public.users where device_id = p_device;
  if v_existing is not null and v_existing <> v_id then
    update public.lines set user_id = v_id where user_id = v_existing;
    update public.notebook_pages set user_id = v_id where user_id = v_existing;
    update public.user_ratings set user_id = v_id where user_id = v_existing;
    delete from public.users where id = v_existing;
  end if;

  update public.users set device_id = p_device, updated_at = now() where id = v_id;
  update public.lines set user_id = v_id where device_id = p_device and user_id is null;

  return v_id;
end $$;

revoke all on function public.recover_candidates(text, text) from public;
grant execute on function public.recover_candidates(text, text) to anon;
revoke all on function public.recover_account(text, text) from public;
grant execute on function public.recover_account(text, text) to anon;