-- =====================================================
-- قسم «اكتب سؤالك» — مدارك جو
-- قاعدة: بروفايلات + أسئلة + لايك + محفوظات + محاولات إجابة
-- نفّذ هذا السكربت يدوياً في Supabase → SQL Editor
-- =====================================================

-- ========= البروفايلات =========
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  field text,
  grade text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy " Profiles: anyone can read" on public.profiles for select using (true);
create policy "Profiles: own profile" on public.profiles for update using (auth.uid() = id);
create policy "Profiles: delete own" on public.profiles for delete using (auth.uid() = id);

-- إنشاء بروفايل تلقائياً عند التسجيل
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, field, grade)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', 'طالب' || left(new.id::text, 6)),
    new.raw_user_meta_data ->> 'field',
    new.raw_user_meta_data ->> 'grade'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========= الأسئلة =========
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  question text not null,
  image_url text,
  options jsonb not null default '[]'::jsonb,
  correct text not null,
  field text not null,
  subject text not null,
  grade text,
  ayah jsonb,
  reactions integer not null default 0,
  answers_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.questions enable row level security;

create policy "Questions: readable by all" on public.questions for select using (true);
create policy "Questions: author can insert" on public.questions for insert with check (auth.uid() = author_id);
create policy "Questions: author can update" on public.questions for update using (auth.uid() = author_id);
create policy "Questions: author can delete" on public.questions for delete using (auth.uid() = author_id);

create index if not exists idx_questions_field_subject on public.questions (field, subject);
create index if not exists idx_questions_author on public.questions (author_id);
create index if not exists idx_questions_created on public.questions (created_at desc);

-- ========= اللايكات =========
create table if not exists public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.likes enable row level security;

create policy "Likes: readable" on public.likes for select using (true);
create policy "Likes: toggle own" on public.likes for insert with check (auth.uid() = user_id);
create policy "Likes: can remove own" on public.likes for delete using (auth.uid() = user_id);

-- ========= المحفوظات =========
create table if not exists public.saves (
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.saves enable row level security;

create policy "Saves: readable" on public.saves for select using (true);
create policy "Saves: toggle own" on public.saves for insert with check (auth.uid() = user_id);
create policy "Saves: can remove own" on public.saves for delete using (auth.uid() = user_id);

-- ========= محاولات الإجابة =========
-- يسمح بإعادة الحل: upsert على المفتاح الأساسي يحتفظ بأحدث محاولة لكل طالب
create table if not exists public.answer_attempts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  chosen text not null,
  correct boolean not null,
  attempts integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.answer_attempts enable row level security;

create policy "Attempts: read own" on public.answer_attempts
  for select using (auth.uid() = user_id);
create policy "Attempts: upsert own" on public.answer_attempts
  for insert with check (auth.uid() = user_id);
create policy "Attempts: update own" on public.answer_attempts
  for update using (auth.uid() = user_id);
create policy "Attempts: delete own" on public.answer_attempts
  for delete using (auth.uid() = user_id);

-- ========= عدّاد الإجابات لكل سؤال =========
create or replace function public.bump_answers_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.questions set answers_count = answers_count + 1 where id = new.question_id;
  return new;
end;
$$;

drop trigger if exists trg_bump_answers_count on public.answer_attempts;
create trigger trg_bump_answers_count
  after insert on public.answer_attempts
  for each row execute function public.bump_answers_count();

-- ========= إحصاءات موحّدة للسؤال =========
-- يستخدمها db.ts بدلاً من استعلامات موزّعة
create or replace view public.question_stats as
select
  q.id as question_id,
  (select count(*)::int from public.likes l where l.question_id = q.id) as likes_count,
  (select count(*)::int from public.answer_attempts a where a.question_id = q.id) as attempts_total,
  (select count(distinct a.user_id)::int from public.answer_attempts a where a.question_id = q.id) as unique_answers
from public.questions q;