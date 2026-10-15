-- ============================================================================
-- «أنا مجهول» — إزالة نظام الجهاز/البصمة نهائياً + الهوية بالحساب (auth.uid / email)
-- يُنفَّذ يدوياً في SQL Editor لمشروع: jmucsccdxxizvqtkyieq
--
-- ⚠️ ملف مدمّر: يحذف المحتوى غير المرتبط بحساب، ويحذف جداول/دوال/أعمدة الجهاز.
--    مع ذلك يأخذ نسخاً احتياطية في schema «backup_20261015» قبل أي حذف.
--
-- المبدأ الجديد:
--   • الملكية = user_id (= auth.uid())، والبريد author_email لإدارة/تقارير فقط.
--   • لا بصمة جهاز، لا visitor gate، لا نبض، لا ربط جهاز↔حساب.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0) نسخ احتياطية
-- ----------------------------------------------------------------------------
create schema if not exists backup_20261015;

do $$
declare t text;
begin
  foreach t in array array[
    'posts','comments','chat_posts','chat_comments','post_likes','chat_likes','reports',
    'post_edits','comment_edits',
    'device_names','device_signatures','device_fingerprints','blocked_devices',
    'banned_fingerprints','banned_signatures','device_presence','device_aliases',
    'admin_devices','device_warnings','ban_challenges','ban_bypasses','ban_audit_log',
    'visitor_codes','identity_links','chat_post_mutes','chat_messages',
    'ban_scoring_config','ban_fingerprint_profiles','device_notes'
  ] loop
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=t) then
      execute format(
        'create table if not exists backup_20261015.%I as select * from public.%I', t, t);
    end if;
  end loop;
end; $$;

-- ----------------------------------------------------------------------------
-- 1) حذف المحتوى القديم بلا حساب (لا رجعة)  — الأطفال أولاً
-- ----------------------------------------------------------------------------
delete from public.comments      where author_email is null;
delete from public.chat_comments where author_email is null;
delete from public.posts         where author_email is null;
delete from public.chat_posts    where author_email is null;

-- الإعجابات كانت مفتاحها الجهاز فقط — تُصفَّر وتُعاد بالحساب
delete from public.post_likes;
delete from public.chat_likes;

-- ----------------------------------------------------------------------------
-- 2) أعمدة الملكية user_id + تعبئتها من الإيميل للحسابات
-- ----------------------------------------------------------------------------
alter table public.posts         add column if not exists user_id uuid;
alter table public.comments      add column if not exists user_id uuid;
alter table public.chat_posts    add column if not exists user_id uuid;
alter table public.chat_comments add column if not exists user_id uuid;
alter table public.post_likes    add column if not exists user_id uuid;
alter table public.chat_likes    add column if not exists user_id uuid;

update public.posts p set user_id = u.id
  from auth.users u where p.user_id is null and lower(u.email) = lower(p.author_email);
update public.comments c set user_id = u.id
  from auth.users u where c.user_id is null and lower(u.email) = lower(c.author_email);
update public.chat_posts cp set user_id = u.id
  from auth.users u where cp.user_id is null and lower(u.email) = lower(cp.author_email);
update public.chat_comments cc set user_id = u.id
  from auth.users u where cc.user_id is null and lower(u.email) = lower(cc.author_email);

create index if not exists idx_posts_user_id         on public.posts(user_id);
create index if not exists idx_comments_user_id      on public.comments(user_id);
create index if not exists idx_chat_posts_user_id    on public.chat_posts(user_id);
create index if not exists idx_chat_comments_user_id on public.chat_comments(user_id);

-- ----------------------------------------------------------------------------
-- 3) إسقاط كل سياسات RLS على جداول المحتوى (تُعاد لاحقاً بالحساب)
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
     where schemaname='public'
       and tablename in ('posts','comments','chat_posts','chat_comments',
                         'post_likes','chat_likes','reports','post_edits','comment_edits')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end; $$;

-- ----------------------------------------------------------------------------
-- 4) إسقاط الأعمدة الجهازية من جداول المحتوى
-- ----------------------------------------------------------------------------
alter table public.posts         drop column if exists device_id;
alter table public.comments      drop column if exists device_id;
alter table public.chat_posts    drop column if exists device_id;
alter table public.chat_comments drop column if exists device_id;
alter table public.post_likes    drop column if exists device_id;
alter table public.chat_likes    drop column if exists device_id;

-- ----------------------------------------------------------------------------
-- 5) ترحيل جداول البلاغات/سجل التعديلات إلى الحساب
-- ----------------------------------------------------------------------------
alter table public.reports add column if not exists reporter_user_id uuid;
alter table public.reports add column if not exists reporter_email   text;
alter table public.reports add column if not exists owner_user_id    uuid;
alter table public.reports add column if not exists owner_email      text;
alter table public.reports drop column if exists reporter_device_id;
alter table public.reports drop column if exists content_owner_device_id;
do $$
begin
  if not exists (select 1 from pg_constraint where conname='reports_unique_reporter_acct') then
    alter table public.reports
      add constraint reports_unique_reporter_acct unique (reporter_user_id, content_type, content_id);
  end if;
end; $$;

alter table public.post_edits    add column if not exists author_email text;
alter table public.post_edits    drop column if exists device_id;
alter table public.comment_edits add column if not exists author_email text;
alter table public.comment_edits drop column if exists device_id;

-- ----------------------------------------------------------------------------
-- 6) الدوال/المشغّلات: الملكية من الجلسة
-- ----------------------------------------------------------------------------
create or replace function public.stamp_author_email()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.author_email := coalesce(lower(auth.jwt() ->> 'email'), new.author_email);
  if new.user_id is null then new.user_id := auth.uid(); end if;
  return new;
end; $$;
revoke execute on function public.stamp_author_email() from public, anon, authenticated;

create or replace function public.posts_before_insert()
returns trigger language plpgsql security definer set search_path=public as $$
declare is_admin_user boolean; s record;
begin
  is_admin_user := auth.uid() is not null and public.has_role(auth.uid(),'admin');
  new.user_id := auth.uid();
  if is_admin_user and coalesce(new.post_mode,'auto') <> 'anon' then
    new.status := 'approved'; new.is_admin := true; new.post_mode := 'admin';
    if new.anon_number is null then new.anon_number := floor(random()*9999+1)::int; end if;
    if new.bg_color is null and new.text_color is null then
      select admin_post_bg, admin_post_text into s from public.site_settings where id=1;
      if s.admin_post_bg   is not null then new.bg_color   := s.admin_post_bg;   end if;
      if s.admin_post_text is not null then new.text_color := s.admin_post_text; end if;
    end if;
  elsif is_admin_user and new.post_mode = 'anon' then
    new.status := 'approved'; new.is_admin := false;
    new.author_name := null; new.author_avatar_url := null;
    new.pinned := coalesce(new.pinned,false);
    if new.anon_number is null then new.anon_number := floor(random()*9999+1)::int; end if;
  else
    new.anon_number := floor(random()*9999+1)::int; new.status := 'pending';
    new.author_name := null; new.author_avatar_url := null; new.pinned := false;
    new.is_admin := false; new.post_mode := 'auto';
    new.bg_color := null; new.text_color := null; new.hidden := false;
  end if;
  return new;
end; $$;
revoke execute on function public.posts_before_insert() from public, anon, authenticated;

create or replace function public.comments_before_insert()
returns trigger language plpgsql security definer set search_path=public as $$
declare is_admin_user boolean; s record;
begin
  is_admin_user := auth.uid() is not null and public.has_role(auth.uid(),'admin');
  new.user_id := auth.uid();
  if is_admin_user and coalesce(new.post_mode,'auto') <> 'anon' then
    new.is_admin := true; new.post_mode := 'admin';
    if new.anon_number is null then new.anon_number := floor(random()*9999+1)::int; end if;
    if new.bg_color is null and new.text_color is null then
      select admin_comment_bg, admin_comment_text into s from public.site_settings where id=1;
      if s.admin_comment_bg   is not null then new.bg_color   := s.admin_comment_bg;   end if;
      if s.admin_comment_text is not null then new.text_color := s.admin_comment_text; end if;
    end if;
  elsif is_admin_user and new.post_mode = 'anon' then
    new.is_admin := false; new.author_name := null; new.author_avatar_url := null;
    if new.anon_number is null then new.anon_number := floor(random()*9999+1)::int; end if;
  else
    new.anon_number := floor(random()*9999+1)::int; new.is_admin := false;
    new.author_name := null; new.author_avatar_url := null; new.post_mode := 'auto';
    new.bg_color := null; new.text_color := null;
  end if;
  return new;
end; $$;
revoke execute on function public.comments_before_insert() from public, anon, authenticated;

create or replace function public.record_post_edit()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.content is distinct from old.content then
    insert into public.post_edits(post_id, author_email, previous_content, new_content)
    values (new.id, new.author_email, old.content, new.content);
  end if;
  return new;
end; $$;
revoke execute on function public.record_post_edit() from public, anon, authenticated;

create or replace function public.record_comment_edit()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.content is distinct from old.content then
    insert into public.comment_edits(comment_id, author_email, previous_content, new_content)
    values (new.id, new.author_email, old.content, new.content);
  end if;
  return new;
end; $$;
revoke execute on function public.record_comment_edit() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7) إسقاط كل دوال الجهاز/البصمة/الحظر بالإشارات (حسب الاسم — كل التحميلات)
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (
       'record_visitor_fingerprint','check_visitor_banned','heartbeat_device',
       'issue_visitor_code','link_visitor_identity','device_is_blocked',
       'device_has_open_challenge','device_name_feature','get_device_name',
       'set_device_name','set_device_label','set_device_bot_label',
       'admin_list_device_names','admin_list_devices','get_device_dossier',
       'admin_ban_device','admin_unban_device','admin_warn_device','admin_clear_warning',
       'ack_device_warning','admin_ban_scoring_config','admin_set_ban_scoring_config',
       'admin_clear_ban_bypass','ban_challenge_gc','ban_decide','ban_expire_due',
       'ban_log_audit','ban_score_visitor','ban_scoring_settings','ban_sync_profile',
       'bypass_ban_with_code','cleanup_device_ban_artifacts','mirror_device_to_fingerprints',
       'assign_anon_number','edit_post','edit_comment','edit_chat_post','edit_chat_comment',
       'unlike_post','unlike_chat_post','submit_report','admin_resolve_report',
       'admin_list_users','cfg_num','bp_crypt','bp_verify','normalize_anon_name'
     )
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end; $$;

-- ----------------------------------------------------------------------------
-- 8) إسقاط جداول الجهاز/البصمة/الحظر بالإشارات
-- ----------------------------------------------------------------------------
drop table if exists public.device_signatures        cascade;
drop table if exists public.device_fingerprints      cascade;
drop table if exists public.blocked_devices          cascade;
drop table if exists public.banned_fingerprints      cascade;
drop table if exists public.banned_signatures        cascade;
drop table if exists public.device_presence          cascade;
drop table if exists public.device_aliases           cascade;
drop table if exists public.admin_devices            cascade;
drop table if exists public.device_warnings          cascade;
drop table if exists public.ban_challenges           cascade;
drop table if exists public.ban_bypasses             cascade;
drop table if exists public.ban_audit_log            cascade;
drop table if exists public.visitor_codes            cascade;
drop table if exists public.identity_links           cascade;
drop table if exists public.chat_post_mutes          cascade;
drop table if exists public.chat_messages            cascade;
drop table if exists public.ban_scoring_config       cascade;
drop table if exists public.ban_fingerprint_profiles cascade;
drop table if exists public.device_notes             cascade;
drop table if exists public.device_names             cascade;

-- ----------------------------------------------------------------------------
-- 9) إعادة بناء سياسات RLS — الحساب فقط
-- ----------------------------------------------------------------------------
-- posts
create policy "read posts"        on public.posts for select to anon, authenticated using (true);
create policy "authed insert post" on public.posts for insert to authenticated
  with check (auth.uid() is not null and length(content) between 1 and 5000 and user_id = auth.uid());
create policy "admin update post" on public.posts for update to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin delete post" on public.posts for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

-- comments
create policy "read comments"        on public.comments for select to anon, authenticated using (true);
create policy "authed insert comment" on public.comments for insert to authenticated
  with check (auth.uid() is not null and length(content) between 1 and 2000 and user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and p.allow_comments = true));
create policy "admin update comment" on public.comments for update to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin delete comment" on public.comments for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

-- chat_posts
create policy "read chat posts"        on public.chat_posts for select to anon, authenticated using (true);
create policy "authed insert chat post" on public.chat_posts for insert to authenticated
  with check (auth.uid() is not null and length(content) between 1 and 5000
    and length(display_name) between 1 and 40 and user_id = auth.uid());
create policy "admin update chat post" on public.chat_posts for update to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin delete chat post" on public.chat_posts for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

-- chat_comments
create policy "read chat comments"        on public.chat_comments for select to anon, authenticated using (true);
create policy "authed insert chat comment" on public.chat_comments for insert to authenticated
  with check (auth.uid() is not null and length(content) between 1 and 2000
    and length(display_name) between 1 and 40 and user_id = auth.uid());
create policy "admin update chat comment" on public.chat_comments for update to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin delete chat comment" on public.chat_comments for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

-- post_likes
create policy "read post likes"    on public.post_likes for select to anon, authenticated using (true);
create policy "authed insert like" on public.post_likes for insert to authenticated
  with check (auth.uid() is not null and user_id = auth.uid());
create policy "admin delete like"  on public.post_likes for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

-- chat_likes
create policy "read chat likes"    on public.chat_likes for select to anon, authenticated using (true);
create policy "authed insert chat like" on public.chat_likes for insert to authenticated
  with check (auth.uid() is not null and user_id = auth.uid());
create policy "admin delete chat like" on public.chat_likes for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

-- reports (أدمن فقط)
create policy "admin read reports"   on public.reports for select to authenticated
  using (public.has_role(auth.uid(),'admin'));
create policy "admin manage reports" on public.reports for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- edit history (أدمن فقط)
create policy "admin read post edits"    on public.post_edits for select to authenticated
  using (public.has_role(auth.uid(),'admin'));
create policy "admin read comment edits" on public.comment_edits for select to authenticated
  using (public.has_role(auth.uid(),'admin'));

-- ----------------------------------------------------------------------------
-- 10) دوال العميل بالحساب (تحتاج تسجيل دخول)
-- ----------------------------------------------------------------------------
create or replace function public.edit_post(p_id uuid, p_content text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_content is null or length(btrim(p_content))=0 or length(p_content)>5000 then
    raise exception 'invalid content';
  end if;
  update public.posts set content=p_content, edited_at=now() where id=p_id and user_id=auth.uid();
end; $$;
revoke execute on function public.edit_post(uuid,text) from public, anon;
grant  execute on function public.edit_post(uuid,text) to authenticated;

create or replace function public.edit_comment(p_id uuid, p_content text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_content is null or length(btrim(p_content))=0 or length(p_content)>2000 then
    raise exception 'invalid content';
  end if;
  update public.comments set content=p_content, edited_at=now() where id=p_id and user_id=auth.uid();
end; $$;
revoke execute on function public.edit_comment(uuid,text) from public, anon;
grant  execute on function public.edit_comment(uuid,text) to authenticated;

create or replace function public.edit_chat_post(p_id uuid, p_content text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_content is null or length(btrim(p_content))=0 or length(p_content)>5000 then
    raise exception 'invalid content';
  end if;
  update public.chat_posts set content=p_content, edited_at=now() where id=p_id and user_id=auth.uid();
end; $$;
revoke execute on function public.edit_chat_post(uuid,text) from public, anon;
grant  execute on function public.edit_chat_post(uuid,text) to authenticated;

create or replace function public.edit_chat_comment(p_id uuid, p_content text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_content is null or length(btrim(p_content))=0 or length(p_content)>2000 then
    raise exception 'invalid content';
  end if;
  update public.chat_comments set content=p_content, edited_at=now() where id=p_id and user_id=auth.uid();
end; $$;
revoke execute on function public.edit_chat_comment(uuid,text) from public, anon;
grant  execute on function public.edit_chat_comment(uuid,text) to authenticated;

create or replace function public.unlike_post(p_post_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.post_likes where post_id=p_post_id and user_id=auth.uid();
end; $$;
revoke execute on function public.unlike_post(uuid) from public, anon;
grant  execute on function public.unlike_post(uuid) to authenticated;

create or replace function public.unlike_chat_post(p_post_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.chat_likes where post_id=p_post_id and user_id=auth.uid();
end; $$;
revoke execute on function public.unlike_chat_post(uuid) from public, anon;
grant  execute on function public.unlike_chat_post(uuid) to authenticated;

create or replace function public.submit_report(
  p_content_type text, p_content_id uuid, p_reason_code text, p_reason_text text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_email text;
        owner_uid uuid; owner_email text; snap text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_email := lower(auth.jwt() ->> 'email');
  if p_content_type not in ('post','comment','chat_post','chat_comment') then
    raise exception 'invalid content type';
  end if;
  if p_reason_code is null or length(btrim(p_reason_code))=0 then
    raise exception 'reason required';
  end if;
  if p_reason_text is not null and length(p_reason_text) > 500 then
    raise exception 'reason too long';
  end if;

  if p_content_type='post' then
    select user_id, left(content,800) into owner_uid, snap from public.posts where id=p_content_id;
  elsif p_content_type='comment' then
    select user_id, left(content,800) into owner_uid, snap from public.comments where id=p_content_id;
  elsif p_content_type='chat_post' then
    select user_id, left(content,800) into owner_uid, snap from public.chat_posts where id=p_content_id;
  elsif p_content_type='chat_comment' then
    select user_id, left(content,800) into owner_uid, snap from public.chat_comments where id=p_content_id;
  end if;

  if snap is null then raise exception 'content not found'; end if;
  select email into owner_email from auth.users where id = owner_uid;

  insert into public.reports(
    reporter_user_id, reporter_email, content_type, content_id,
    owner_user_id, owner_email, content_snapshot, reason_code, reason_text)
  values (
    v_uid, v_email, p_content_type, p_content_id,
    owner_uid, owner_email, snap, p_reason_code, nullif(btrim(p_reason_text),''))
  on conflict (reporter_user_id, content_type, content_id) do nothing;

  return jsonb_build_object('ok', true);
end; $$;
revoke execute on function public.submit_report(text,uuid,text,text) from public, anon;
grant  execute on function public.submit_report(text,uuid,text,text) to authenticated;

create or replace function public.admin_resolve_report(
  p_report_id uuid, p_action text, p_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.reports;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin') then
    raise exception 'forbidden';
  end if;
  select * into r from public.reports where id = p_report_id;
  if r.id is null then raise exception 'not found'; end if;

  if p_action = 'content_deleted' then
    if r.content_type='post' then delete from public.posts where id=r.content_id;
    elsif r.content_type='comment' then delete from public.comments where id=r.content_id;
    elsif r.content_type='chat_post' then delete from public.chat_posts where id=r.content_id;
    elsif r.content_type='chat_comment' then delete from public.chat_comments where id=r.content_id;
    end if;
    update public.reports set status='content_deleted', resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     where id=p_report_id;
    update public.reports set status='content_deleted', resolved_at=now(), resolved_by=auth.uid()
     where content_type=r.content_type and content_id=r.content_id and status='open' and id<>p_report_id;
  else
    update public.reports set status=coalesce(p_action,'resolved'), resolved_at=now(), resolved_by=auth.uid(), resolution_note=p_note
     where id=p_report_id;
  end if;
  return jsonb_build_object('ok', true);
end; $$;
revoke execute on function public.admin_resolve_report(uuid,text,text) from public, anon;
grant  execute on function public.admin_resolve_report(uuid,text,text) to authenticated;

-- ----------------------------------------------------------------------------
-- 11) قائمة الحسابات للأدمن (بلا أجهزة)
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_search text default null, p_limit int default 50, p_offset int default 0, p_sort text default 'old')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rows jsonb; v_total int;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin') then
    raise exception 'forbidden';
  end if;
  if coalesce(auth.jwt() ->> 'email','') = '' then raise exception 'forbidden'; end if;

  select count(*) into v_total
    from auth.users u
   where p_search is null or u.email ilike '%'||p_search||'%';

  select coalesce(jsonb_agg(t),'[]'::jsonb) into v_rows from (
    select u.id as user_id, u.email, u.created_at, u.last_sign_in_at,
      (select count(*) from public.posts p         where p.user_id  = u.id) as post_count,
      (select count(*) from public.comments c      where c.user_id  = u.id) as comment_count,
      (select count(*) from public.chat_posts cp   where cp.user_id = u.id) as chat_count,
      exists(select 1 from public.user_roles r where r.user_id=u.id and r.role='admin') as is_admin
    from auth.users u
    where p_search is null or u.email ilike '%'||p_search||'%'
    order by
      case when p_sort='new' then u.created_at end desc nulls last,
      case when p_sort='old' then u.created_at end asc  nulls last,
      u.created_at asc
    limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)
  ) t;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end; $$;
revoke execute on function public.admin_list_users(text,int,int,text) from public, anon;
grant  execute on function public.admin_list_users(text,int,int,text) to authenticated;

-- ----------------------------------------------------------------------------
-- 12) صلاحيات الإعجابات (تسجيل الدخول فقط للإدراج)
-- ----------------------------------------------------------------------------
revoke insert on public.post_likes, public.chat_likes from anon;
grant  select, insert on public.post_likes, public.chat_likes to authenticated;

commit;
