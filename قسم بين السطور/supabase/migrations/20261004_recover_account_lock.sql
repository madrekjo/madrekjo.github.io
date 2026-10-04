-- ================================================================
-- [20261004_recover_account_lock.sql]
-- قفل الاسترجاع بعد أول مرة + ترحيل أجهزة الدومين القديم للجديد
--
-- 1) recovered_at: يحارب على users. أول استرجاع ناجح يختم الحساب
--    ويمنع أي استرجاع ثانٍ (ما يقدر حدا يدخل على حساب مسترجَع).
-- 2) عند الاسترجاع: تُنقل بطاقات الحساب (lines) من device_id
--    الدومين القديم إلى الجهاز الجديد بالكامل، ويُستبدل device_id
--    في users، وما تعود أجهزة الدومين القديم مربوطة بالحساب.
-- 3) recover_candidates لا تعرض سوى الحسابات غير المسترجَعة بعد.
--
-- يُنفَّذ في Supabase Dashboard → SQL Editor
-- ================================================================

-- ---------- عمود ختم الاسترجاع ----------
alter table public.users add column if not exists recovered_at timestamptz;

-- ---------- مرشّحو الاسترجاع (مستبعدٌ منهم المسترجَع والجهاز الحالي) ----------
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
    and u.recovered_at is null
  order by u.username asc
  limit 40;
$$;

-- ---------- الاسترجاع (مرة واحدة + ترحيل الأجهزة) ----------
create or replace function public.recover_account(p_username text, p_device text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_existing uuid;
  v_old_dev text;
begin
  if char_length(coalesce(nullif(p_device, ''), '')) < 4 then
    raise exception 'جهاز غير معروف';
  end if;

  select id, device_id into v_id, v_old_dev
  from public.users
  where btrim(username) = btrim(p_username);

  if v_id is null then
    raise exception 'ما لقينا حساب بهذا الاسم على المنصة القديمة';
  end if;

  -- حال كان الجهاز الحالي صاحب الحساب أصلًا → لا يحتاج استرجاع
  if v_old_dev = p_device then
    return v_id;
  end if;

  -- قفل الاسترجاع: الحساب المسترجَع لا يقبل أي استرجاع أو سيطرة ثانية
  if (select recovered_at from public.users where id = v_id) is not null then
    raise exception 'هذا الحساب مسترجَع من قبل على جهاز آخر — ما فيك تدخل عليه مرة ثانية';
  end if;

  -- دمج أي حساب مؤقت صار على الجهاز الحالي (من الدومين الجديد) في الحساب القديم وحذفه
  select id into v_existing from public.users where device_id = p_device;
  if v_existing is not null and v_existing <> v_id then
    update public.lines set user_id = v_id where user_id = v_existing;
    update public.notebook_pages set user_id = v_id where user_id = v_existing;
    update public.user_ratings set user_id = v_id where user_id = v_existing;
    delete from public.users where id = v_existing;
  end if;

  -- ترحيل كل بطاقات الحساب من جهاز الدومين القديم إلى الجهاز الجديد
  update public.lines set device_id = p_device, user_id = v_id where user_id = v_id;
  -- بطاقات الدومين القديم المجهولة (بدون حساب) لأصحاب هذا الجهاز → تُنسب للحساب وتُنقل
  update public.lines set user_id = v_id, device_id = p_device
  where device_id = v_old_dev and user_id is null;

  -- تحديث هوية الحساب: الجهاز الجديد + ختم الاسترجاع
  update public.users set device_id = p_device, updated_at = now(), recovered_at = now()
  where id = v_id;

  return v_id;
end $$;

revoke all on function public.recover_candidates(text, text) from public;
grant execute on function public.recover_candidates(text, text) to anon;
revoke all on function public.recover_account(text, text) from public;
grant execute on function public.recover_account(text, text) to anon;