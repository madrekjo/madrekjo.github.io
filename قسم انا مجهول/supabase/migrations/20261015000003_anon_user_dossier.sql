-- =========================================================
-- «أنا مجهول»: ملف الحساب للأدمن (بديل «ملف الجهاز» القديم)
-- يجمع كل ما كتبه صاحب الحساب + عدّاداته، بالاعتماد على user_id/الإيميل.
-- + إمكانية تعيين/إزالة صلاحية أدمن.
-- =========================================================

-- 1) ملف المستخدم الكامل
create or replace function public.admin_user_dossier(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;
  if p_user_id is null then
    raise exception 'invalid user';
  end if;

  select jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'is_admin', exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'admin'),
    'post_count',         (select count(*) from public.posts p          where p.user_id = u.id),
    'comment_count',      (select count(*) from public.comments c       where c.user_id = u.id),
    'chat_post_count',    (select count(*) from public.chat_posts cp    where cp.user_id = u.id),
    'chat_comment_count', (select count(*) from public.chat_comments cc where cc.user_id = u.id),
    'like_count',         (select count(*) from public.post_likes pl    where pl.user_id = u.id),
    'recent_posts', coalesce((
      select jsonb_agg(x) from (
        select id, left(content, 400) as content, created_at, status, hidden, pinned
        from public.posts where user_id = u.id
        order by created_at desc limit 30
      ) x), '[]'::jsonb),
    'recent_comments', coalesce((
      select jsonb_agg(x) from (
        select id, post_id, left(content, 400) as content, created_at
        from public.comments where user_id = u.id
        order by created_at desc limit 30
      ) x), '[]'::jsonb),
    'recent_chat_posts', coalesce((
      select jsonb_agg(x) from (
        select id, left(content, 400) as content, created_at
        from public.chat_posts where user_id = u.id
        order by created_at desc limit 30
      ) x), '[]'::jsonb),
    'recent_chat_comments', coalesce((
      select jsonb_agg(x) from (
        select id, post_id, left(content, 400) as content, created_at
        from public.chat_comments where user_id = u.id
        order by created_at desc limit 30
      ) x), '[]'::jsonb)
  ) into v_result
  from auth.users u
  where u.id = p_user_id;

  if v_result is null then
    raise exception 'user not found';
  end if;
  return v_result;
end; $$;
revoke execute on function public.admin_user_dossier(uuid) from public, anon;
grant  execute on function public.admin_user_dossier(uuid) to authenticated;

-- 2) تعيين/إزالة صلاحية أدمن بالحساب
create or replace function public.admin_set_user_admin(p_user_id uuid, p_admin boolean)
returns jsonb
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

  if p_admin then
    insert into public.user_roles (user_id, role)
    values (p_user_id, 'admin')
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_user_id and role = 'admin';
  end if;

  return jsonb_build_object('ok', true);
end; $$;
revoke execute on function public.admin_set_user_admin(uuid, boolean) from public, anon;
grant  execute on function public.admin_set_user_admin(uuid, boolean) to authenticated;
