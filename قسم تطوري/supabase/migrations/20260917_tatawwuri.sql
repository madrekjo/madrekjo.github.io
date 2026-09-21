-- ============================================================
-- قسم «تطوري» — مدارك جو
-- نظام بناء الانضباط: عادات + إنجازات + تقييم يومي + مؤشرات + ستريك + أهداف + متصدرون
-- نفّذه يدوياً في Supabase Dashboard → SQL Editor
-- آمن إعادة التشغيل (IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ---------- المستخدمون ----------
create table if not exists public.prog_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  device_id text unique not null,
  created_at timestamptz not null default now()
);

alter table public.prog_users enable row level security;

-- ---------- عادات المستخدم (مكتبة أو مخصصة) ----------
create table if not exists public.prog_user_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.prog_users(id) on delete cascade,
  key text not null,
  name text not null,
  icon text not null default 'Star',
  category text not null default 'تطوير ذاتي',
  is_custom boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists prog_user_habits_user on public.prog_user_habits (user_id);

alter table public.prog_user_habits enable row level security;

-- ---------- سجل أداء العادات يومياً ----------
create table if not exists public.prog_habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.prog_user_habits(id) on delete cascade,
  day date not null,
  done boolean not null default true,
  created_at timestamptz not null default now(),
  unique (habit_id, day)
);

create index if not exists prog_habit_logs_day on public.prog_habit_logs (day);

alter table public.prog_habit_logs enable row level security;

-- ---------- الإنجازات اليومية ----------
create table if not exists public.prog_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.prog_users(id) on delete cascade,
  category text not null,
  description text not null,
  day date not null,
  created_at timestamptz not null default now()
);

create index if not exists prog_achievements_user_day on public.prog_achievements (user_id, day);

alter table public.prog_achievements enable row level security;

-- ---------- تقييم نهاية اليوم ----------
create table if not exists public.prog_day_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.prog_users(id) on delete cascade,
  day date not null,
  energy integer not null check (energy between 1 and 10),
  mood integer not null check (mood between 1 and 10),
  satisfaction integer not null check (satisfaction between 1 and 10),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

alter table public.prog_day_evaluations enable row level security;

-- ---------- الأهداف الأسبوعية ----------
create table if not exists public.prog_weekly_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.prog_users(id) on delete cascade,
  week_start date not null,
  description text not null,
  target numeric not null default 1,
  unit text not null default '',
  progress numeric not null default 0,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists prog_weekly_goals_user_week on public.prog_weekly_goals (user_id, week_start);

alter table public.prog_weekly_goals enable row level security;

-- ============================================================
-- النواة: نقطة اليوم (تُحسب لكل مستخدم ويوم)
-- score = التزام العادات (40) + الإنجازات (30) + التقييم (20) + نشاط اليوم (10)
-- ============================================================
create or replace function public.prog_day_point(p_user uuid, p_day date)
returns table (
  score int,
  habits_done int,
  habits_total int,
  achievement_count int,
  energy int,
  mood int,
  satisfaction int,
  note text,
  active boolean
)
language sql security definer set search_path = public
as $$
  with h as (
    select
      (select count(*)::int from public.prog_user_habits uh where uh.user_id = p_user and uh.active) as total,
      (select count(*)::int from public.prog_habit_logs hl
        join public.prog_user_habits uh on uh.id = hl.habit_id
        where uh.user_id = p_user and uh.active and hl.day = p_day and hl.done) as done
  ),
  a as (
    select count(*)::int as n from public.prog_achievements
    where user_id = p_user and day = p_day
  ),
  e as (
    select energy, mood, satisfaction, coalesce(note, '') as note
    from public.prog_day_evaluations
    where user_id = p_user and day = p_day
  ),
  c as (
    select (h.done > 0 or a.n > 0 or e.energy is not null) as active
    from h, a, e
  )
  select
    (case when c.active then
      coalesce((case when h.total > 0 then round((h.done::numeric / h.total) * 40) else 0 end), 0)
      + least(coalesce(a.n, 0), 6) * 5
      + case when e.energy is not null then round(((e.energy + e.mood + e.satisfaction)::numeric / 30) * 20) else 0 end
      + 10
    else 0 end)::int,
    h.done,
    h.total,
    a.n,
    coalesce(e.energy, 0),
    coalesce(e.mood, 0),
    coalesce(e.satisfaction, 0),
    e.note,
    c.active
  from h, a, e, c;
$$;

-- ============================================================
-- المستخدمون
-- ============================================================
create or replace function public.prog_ensure_user(p_username text, p_device text default '')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_n int := 0;
begin
  if char_length(coalesce(p_device, '')) < 4 then
    raise exception 'جهاز غير معروف';
  end if;
  v_name := btrim(coalesce(nullif(p_username, ''), 'طالب متطور'));
  v_name := left(v_name, 25);
  if char_length(v_name) < 2 or not (v_name ~ '^[^[:cntrl:]]+$') then
    raise exception 'الاسم بين حرفين و25 حرفاً وبدون رموز';
  end if;

  select id into v_id from public.prog_users where device_id = p_device;
  if v_id is not null then
    update public.prog_users set username = v_name, created_at = now() where id = v_id;
    return v_id;
  end if;

  loop
    begin
      insert into public.prog_users (username, device_id)
      values (v_name, p_device)
      returning id into v_id;
      exit;
    exception when unique_violation then
      v_n := v_n + 1;
      if v_n > 6 then
        v_name := 'متطور-' || (floor(random() * 90000 + 10000))::int;
      else
        v_name := left(v_name, 22) || '-' || (floor(random() * 900 + 100))::int;
      end if;
    end;
  end loop;
  return v_id;
end;
$$;

create or replace function public.prog_user_streak(p_user uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_streak int := 0;
  v_day date := current_date;
  v_active boolean;
begin
  if p_user is null then return 0; end if;
  select
    exists(select 1 from public.prog_habit_logs hl
      join public.prog_user_habits uh on uh.id = hl.habit_id
      where uh.user_id = p_user and uh.active and hl.day = v_day and hl.done)
    or exists(select 1 from public.prog_achievements ach where ach.user_id = p_user and ach.day = v_day)
    or exists(select 1 from public.prog_day_evaluations ev where ev.user_id = p_user and ev.day = v_day)
  into v_active;
  if not v_active then
    v_day := v_day - 1;
  end if;
  loop
    select
      exists(select 1 from public.prog_habit_logs hl
        join public.prog_user_habits uh on uh.id = hl.habit_id
        where uh.user_id = p_user and uh.active and hl.day = v_day and hl.done)
      or exists(select 1 from public.prog_achievements ach where ach.user_id = p_user and ach.day = v_day)
      or exists(select 1 from public.prog_day_evaluations ev where ev.user_id = p_user and ev.day = v_day)
    into v_active;
    exit when not v_active;
    v_streak := v_streak + 1;
    v_day := v_day - 1;
    if v_streak > 2000 then exit; end if;
  end loop;
  return v_streak;
end;
$$;

create or replace function public.prog_my_profile(p_device text default '')
returns table (id uuid, username text, streak int, habits_count int, total_achievements bigint)
language sql security definer set search_path = public
as $$
  select
    u.id,
    u.username,
    public.prog_user_streak(u.id),
    (select count(*)::int from public.prog_user_habits uh where uh.user_id = u.id and uh.active),
    (select count(*) from public.prog_achievements ach where ach.user_id = u.id)
  from public.prog_users u
  where u.device_id = p_device;
$$;

-- ============================================================
-- العادات
-- ============================================================
create or replace function public.prog_my_habits(p_day date, p_device text default '')
returns table (id uuid, key text, name text, icon text, category text, is_custom boolean, done boolean)
language sql security definer set search_path = public
as $$
  select
    uh.id, uh.key, uh.name, uh.icon, uh.category, uh.is_custom,
    exists(select 1 from public.prog_habit_logs hl where hl.habit_id = uh.id and hl.day = p_day) as done
  from public.prog_user_habits uh
  join public.prog_users u on u.id = uh.user_id
  where u.device_id = p_device and uh.active
  order by uh.is_custom asc, uh.created_at asc;
$$;

create or replace function public.prog_toggle_habit(p_habit uuid, p_day date, p_device text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid;
  v_owned int;
begin
  if char_length(coalesce(p_device, '')) < 4 then raise exception 'جهاز غير معروف'; end if;
  select id into v_uid from public.prog_users where device_id = p_device;
  if v_uid is null then raise exception 'حدّد اسمك أولاً'; end if;
  select count(*) into v_owned from public.prog_user_habits
  where id = p_habit and user_id = v_uid and active;
  if v_owned = 0 then raise exception 'هذه العادة ليست لك'; end if;

  if exists(select 1 from public.prog_habit_logs where habit_id = p_habit and day = p_day) then
    delete from public.prog_habit_logs where habit_id = p_habit and day = p_day;
  else
    insert into public.prog_habit_logs (habit_id, day) values (p_habit, p_day);
  end if;
end;
$$;

create or replace function public.prog_add_habit(
  p_key text,
  p_name text,
  p_icon text default 'Star',
  p_category text default 'تطوير ذاتي',
  p_is_custom boolean default false,
  p_device text default ''
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid;
  v_id uuid;
begin
  if char_length(coalesce(p_device, '')) < 4 then raise exception 'جهاز غير معروف'; end if;
  select id into v_uid from public.prog_users where device_id = p_device;
  if v_uid is null then raise exception 'حدّد اسمك أولاً'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'اكتب اسم العادة'; end if;
  if char_length(coalesce(p_key, '')) < 1 then p_key := gen_random_uuid()::text; end if;

  if (select count(*) from public.prog_user_habits where user_id = v_uid and active) >= 24 then
    raise exception 'يمكنك متابعة حتى 24 عادة — احذف عادة أولاً';
  end if;

  insert into public.prog_user_habits (user_id, key, name, icon, category, is_custom)
  values (v_uid, p_key, left(btrim(p_name), 40), p_icon, p_category, coalesce(p_is_custom, false))
  on conflict (user_id, key)
  do update set active = true, name = excluded.name, icon = excluded.icon,
                category = excluded.category, is_custom = excluded.is_custom
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.prog_delete_habit(p_habit uuid, p_device text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid;
begin
  if char_length(coalesce(p_device, '')) < 4 then raise exception 'جهاز غير معروف'; end if;
  select id into v_uid from public.prog_users where device_id = p_device;
  if v_uid is null then raise exception 'حدّد اسمك أولاً'; end if;
  update public.prog_user_habits set active = false
  where id = p_habit and user_id = v_uid;
end;
$$;

create or replace function public.prog_habit_logs_range(p_from date, p_to date, p_device text default '')
returns table (habit_id uuid, name text, icon text, category text, day date, done boolean)
language sql security definer set search_path = public
as $$
  select hl.habit_id, uh.name, uh.icon, uh.category, hl.day, hl.done
  from public.prog_habit_logs hl
  join public.prog_user_habits uh on uh.id = hl.habit_id
  join public.prog_users u on u.id = uh.user_id
  where u.device_id = p_device and uh.active
    and hl.day between p_from and p_to;
$$;

-- ============================================================
-- الإنجازات
-- ============================================================
create or replace function public.prog_my_achievements(p_device text default '')
returns table (id uuid, category text, description text, day date, created_at timestamptz)
language sql security definer set search_path = public
as $$
  select ach.id, ach.category, ach.description, ach.day, ach.created_at
  from public.prog_achievements ach
  join public.prog_users u on u.id = ach.user_id
  where u.device_id = p_device
  order by ach.day desc, ach.created_at desc;
$$;

create or replace function public.prog_add_achievement(
  p_category text,
  p_description text,
  p_day date,
  p_device text default ''
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid;
  v_rate int;
  v_id uuid;
begin
  if char_length(coalesce(p_device, '')) < 4 then raise exception 'جهاز غير معروف'; end if;
  select id into v_uid from public.prog_users where device_id = p_device;
  if v_uid is null then raise exception 'حدّد اسمك أولاً'; end if;
  if char_length(btrim(coalesce(p_description, ''))) < 3 then raise exception 'اكتب وصف الإنجاز'; end if;
  if p_day > current_date then raise exception 'لا يمكن تسجيل إنجاز من المستقبل'; end if;

  select count(*) into v_rate from public.prog_achievements
  where user_id = v_uid and day = p_day;
  if v_rate >= 20 then raise exception 'سجّلت 20 إنجازاً — خفّف واكتب الأهم'; end if;

  insert into public.prog_achievements (user_id, category, description, day)
  values (
    v_uid,
    coalesce(nullif(p_category, ''), 'أخرى'),
    left(btrim(p_description), 160),
    p_day
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.prog_delete_achievement(p_achievement uuid, p_device text default '')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.prog_achievements
  where id = p_achievement
    and user_id in (select id from public.prog_users where device_id = p_device);
end;
$$;

-- ============================================================
-- تقييم نهاية اليوم
-- ============================================================
create or replace function public.prog_save_evaluation(
  p_energy int,
  p_mood int,
  p_satisfaction int,
  p_note text default '',
  p_day date default current_date,
  p_device text default ''
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid;
begin
  if char_length(coalesce(p_device, '')) < 4 then raise exception 'جهاز غير معروف'; end if;
  select id into v_uid from public.prog_users where device_id = p_device;
  if v_uid is null then raise exception 'حدّد اسمك أولاً'; end if;
  if p_energy < 1 or p_energy > 10 or p_mood < 1 or p_mood > 10 or p_satisfaction < 1 or p_satisfaction > 10
    then raise exception 'التقييم من 1 إلى 10'; end if;

  insert into public.prog_day_evaluations (user_id, day, energy, mood, satisfaction, note)
  values (v_uid, p_day, p_energy, p_mood, p_satisfaction, left(coalesce(nullif(p_note, ''), ''), 500))
  on conflict (user_id, day)
  do update set energy = excluded.energy, mood = excluded.mood,
                satisfaction = excluded.satisfaction, note = excluded.note, updated_at = now();
end;
$$;

create or replace function public.prog_get_evaluation(p_day date, p_device text default '')
returns table (energy int, mood int, satisfaction int, note text)
language sql security definer set search_path = public
as $$
  select ev.energy, ev.mood, ev.satisfaction, ev.note
  from public.prog_day_evaluations ev
  join public.prog_users u on u.id = ev.user_id
  where u.device_id = p_device and ev.day = p_day;
$$;

-- ============================================================
-- المؤشرات والسلاسل الزمنية
-- ============================================================
create or replace function public.prog_day_score(p_day date, p_device text default '')
returns table (score int, habits_done int, habits_total int, achievement_count int, energy int, mood int, satisfaction int, note text, active boolean)
language sql security definer set search_path = public
as $$
  select p.*
  from public.prog_day_point(
    (select id from public.prog_users where device_id = p_device),
    p_day
  ) p;
$$;

create or replace function public.prog_timeline(p_from date, p_to date, p_device text default '')
returns table (day date, score int, habits_done int, habits_total int, achievement_count int, energy int, mood int, satisfaction int, note text, active boolean)
language sql security definer set search_path = public
as $$
  select
    g.day,
    p.score, p.habits_done, p.habits_total, p.achievement_count,
    p.energy, p.mood, p.satisfaction, p.note, p.active
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g(day)
  left join public.prog_day_point(
    (select id from public.prog_users where device_id = p_device),
    g.day::date
  ) p on true;
$$;

-- ============================================================
-- الأهداف الأسبوعية
-- ============================================================
create or replace function public.prog_my_goals(p_week_start date, p_device text default '')
returns table (id uuid, description text, target numeric, unit text, progress numeric, done boolean)
language sql security definer set search_path = public
as $$
  select g.id, g.description, g.target, g.unit, g.progress, g.done
  from public.prog_weekly_goals g
  join public.prog_users u on u.id = g.user_id
  where u.device_id = p_device and g.week_start = p_week_start
  order by g.created_at asc;
$$;

create or replace function public.prog_add_goal(
  p_description text,
  p_target numeric default 1,
  p_unit text default '',
  p_week_start date default current_date,
  p_device text default ''
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid;
  v_count int;
  v_id uuid;
begin
  if char_length(coalesce(p_device, '')) < 4 then raise exception 'جهاز غير معروف'; end if;
  select id into v_uid from public.prog_users where device_id = p_device;
  if v_uid is null then raise exception 'حدّد اسمك أولاً'; end if;
  if char_length(btrim(coalesce(p_description, ''))) < 3 then raise exception 'اكتب الهدف'; end if;
  if coalesce(p_target, 0) <= 0 then raise exception 'حدّد كمية الهدف'; end if;

  select count(*) into v_count from public.prog_weekly_goals
  where user_id = v_uid and week_start = p_week_start;
  if v_count >= 8 then raise exception 'حدّد حتى 8 أهداف في الأسبوع'; end if;

  insert into public.prog_weekly_goals (user_id, week_start, description, target, unit)
  values (
    v_uid, p_week_start, left(btrim(p_description), 90),
    p_target, left(coalesce(nullif(p_unit, ''), ''), 20)
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.prog_update_goal(
  p_goal uuid,
  p_progress numeric default null,
  p_done boolean default null,
  p_device text default ''
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.prog_weekly_goals
  set
    progress = coalesce(p_progress, progress),
    done = coalesce(p_done, done)
  where id = p_goal
    and user_id in (select id from public.prog_users where device_id = p_device);
end;
$$;

create or replace function public.prog_delete_goal(p_goal uuid, p_device text default '')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.prog_weekly_goals
  where id = p_goal
    and user_id in (select id from public.prog_users where device_id = p_device);
end;
$$;

-- ============================================================
-- لوحة المتصدرين (منافسة صحية عامة)
-- ============================================================
create or replace function public.prog_leaderboard(p_metric text, p_week_start date)
returns table (user_id uuid, username text, value numeric, active_days int)
language sql security definer set search_path = public
as $$
  with week_days as (
    select g::date as day
    from generate_series(p_week_start::timestamp, (p_week_start + 6)::timestamp, interval '1 day') g
  )
  select
    u.id as user_id,
    u.username,
    case p_metric
      when 'score' then
        coalesce(round(
          avg(s.score) filter (where s.active) * 0.7
          + avg(case when s.habits_total > 0 then (s.habits_done::numeric / s.habits_total) * 100 else 0 end) filter (where s.active) * 0.3
        ), 0)::numeric
      when 'streak' then
        (select public.prog_user_streak(u.id))::numeric
      when 'achievements' then
        coalesce((select count(*)::numeric from public.prog_achievements ach
          where ach.user_id = u.id and ach.day between p_week_start and p_week_start + 6), 0)
      when 'commitment' then
        coalesce(round(avg(
          case when s.habits_total > 0 then (s.habits_done::numeric / s.habits_total) * 100 else 0 end
        )), 0)::numeric
      else 0
    end as value,
    count(*) filter (where s.active)::int as active_days
  from public.prog_users u
  cross join week_days wd
  left join lateral public.prog_day_point(u.id, wd.day) s on true
  group by u.id, u.username
  having count(*) filter (where s.active) > 0
  order by value desc
  limit 100;
$$;

-- ============================================================
-- الصلاحيات
-- ============================================================
revoke all on function public.prog_day_point(uuid, date) from public;
revoke all on function public.prog_ensure_user(text, text) from public;
revoke all on function public.prog_user_streak(uuid) from public;
revoke all on function public.prog_my_profile(text) from public;
revoke all on function public.prog_my_habits(date, text) from public;
revoke all on function public.prog_toggle_habit(uuid, date, text) from public;
revoke all on function public.prog_add_habit(text, text, text, text, boolean, text) from public;
revoke all on function public.prog_delete_habit(uuid, text) from public;
revoke all on function public.prog_habit_logs_range(date, date, text) from public;
revoke all on function public.prog_my_achievements(text) from public;
revoke all on function public.prog_add_achievement(text, text, date, text) from public;
revoke all on function public.prog_delete_achievement(uuid, text) from public;
revoke all on function public.prog_save_evaluation(int, int, int, text, date, text) from public;
revoke all on function public.prog_get_evaluation(date, text) from public;
revoke all on function public.prog_day_score(date, text) from public;
revoke all on function public.prog_timeline(date, date, text) from public;
revoke all on function public.prog_my_goals(date, text) from public;
revoke all on function public.prog_add_goal(text, numeric, text, date, text) from public;
revoke all on function public.prog_update_goal(uuid, numeric, boolean, text) from public;
revoke all on function public.prog_delete_goal(uuid, text) from public;
revoke all on function public.prog_leaderboard(text, date) from public;

grant execute on function public.prog_day_point(uuid, date) to anon;
grant execute on function public.prog_ensure_user(text, text) to anon;
grant execute on function public.prog_user_streak(uuid) to anon;
grant execute on function public.prog_my_profile(text) to anon;
grant execute on function public.prog_my_habits(date, text) to anon;
grant execute on function public.prog_toggle_habit(uuid, date, text) to anon;
grant execute on function public.prog_add_habit(text, text, text, text, boolean, text) to anon;
grant execute on function public.prog_delete_habit(uuid, text) to anon;
grant execute on function public.prog_habit_logs_range(date, date, text) to anon;
grant execute on function public.prog_my_achievements(text) to anon;
grant execute on function public.prog_add_achievement(text, text, date, text) to anon;
grant execute on function public.prog_delete_achievement(uuid, text) to anon;
grant execute on function public.prog_save_evaluation(int, int, int, text, date, text) to anon;
grant execute on function public.prog_get_evaluation(date, text) to anon;
grant execute on function public.prog_day_score(date, text) to anon;
grant execute on function public.prog_timeline(date, date, text) to anon;
grant execute on function public.prog_my_goals(date, text) to anon;
grant execute on function public.prog_add_goal(text, numeric, text, date, text) to anon;
grant execute on function public.prog_update_goal(uuid, numeric, boolean, text) to anon;
grant execute on function public.prog_delete_goal(uuid, text) to anon;
grant execute on function public.prog_leaderboard(text, date) to anon;