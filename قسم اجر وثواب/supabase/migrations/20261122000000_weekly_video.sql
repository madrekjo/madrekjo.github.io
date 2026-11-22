-- فيديو الأسبوع + اقتراحات المستخدمين
-- يُنفّذ يدويًا في Supabase Dashboard لمشروع أجر وثواب (njdvogvquzofnqqwyvyl)

create table if not exists public.weekly_videos (
  id uuid primary key default gen_random_uuid(),
  youtube_url text not null,
  youtube_id text not null,
  title text not null default '',
  week_label text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists weekly_videos_active_created_idx
  on public.weekly_videos (is_active, created_at desc);

create table if not exists public.weekly_video_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  youtube_url text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists weekly_video_suggestions_created_idx
  on public.weekly_video_suggestions (created_at desc);
create index if not exists weekly_video_suggestions_user_idx
  on public.weekly_video_suggestions (user_id, created_at desc);

alter table public.weekly_videos enable row level security;
alter table public.weekly_video_suggestions enable row level security;

-- weekly_videos policies
drop policy if exists "weekly_videos_read_all" on public.weekly_videos;
create policy "weekly_videos_read_all"
  on public.weekly_videos for select
  to anon, authenticated
  using (true);

drop policy if exists "weekly_videos_admin_insert" on public.weekly_videos;
create policy "weekly_videos_admin_insert"
  on public.weekly_videos for insert
  to authenticated
  with check (public.is_ajr_admin());

drop policy if exists "weekly_videos_admin_update" on public.weekly_videos;
create policy "weekly_videos_admin_update"
  on public.weekly_videos for update
  to authenticated
  using (public.is_ajr_admin())
  with check (public.is_ajr_admin());

drop policy if exists "weekly_videos_admin_delete" on public.weekly_videos;
create policy "weekly_videos_admin_delete"
  on public.weekly_videos for delete
  to authenticated
  using (public.is_ajr_admin());

-- weekly_video_suggestions policies
drop policy if exists "weekly_video_suggestions_read" on public.weekly_video_suggestions;
create policy "weekly_video_suggestions_read"
  on public.weekly_video_suggestions for select
  to authenticated
  using (public.is_ajr_admin() or auth.uid() = user_id);

drop policy if exists "weekly_video_suggestions_insert_own" on public.weekly_video_suggestions;
create policy "weekly_video_suggestions_insert_own"
  on public.weekly_video_suggestions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "weekly_video_suggestions_admin_update" on public.weekly_video_suggestions;
create policy "weekly_video_suggestions_admin_update"
  on public.weekly_video_suggestions for update
  to authenticated
  using (public.is_ajr_admin())
  with check (public.is_ajr_admin());

drop policy if exists "weekly_video_suggestions_admin_delete" on public.weekly_video_suggestions;
create policy "weekly_video_suggestions_admin_delete"
  on public.weekly_video_suggestions for delete
  to authenticated
  using (public.is_ajr_admin());

grant select on public.weekly_videos to anon, authenticated;
grant insert, update, delete on public.weekly_videos to authenticated;
grant select, insert, update, delete on public.weekly_video_suggestions to authenticated;
