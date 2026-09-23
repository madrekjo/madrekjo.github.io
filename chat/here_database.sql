-- ============================================================================
-- ★ قاعدة بيانات الدردشة — نسخة كاملة محدّثة ★
-- جميع الجداول + النقاط + مراجعة المنشورات + الدعوات + الدوال + الـ Triggers + Policies + Storage + Realtime + Cron
-- شغّلها من: Supabase → SQL Editor → New Query → Paste → Run
-- آخر تحديث: 2026-09-22
-- ============================================================================


-- ============================================================================
-- 0) تنظيف + Extensions
-- ============================================================================

-- إزالة سياسات التخزين القديمة لو وُجدت (حتى يتكرر البناء بسلام)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ============================================================================
-- 1) ENUM: app_role
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'moderator', 'supervisor', 'rounds_manager');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- 2) الجداول
-- ============================================================================

-- ===================== user_roles =====================
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ===================== profiles =====================
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  name_changed_at TIMESTAMP WITH TIME ZONE,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  timeout_until TIMESTAMPTZ,
  chat_banned BOOLEAN NOT NULL DEFAULT false,
  generation TEXT,
  field TEXT,
  gender TEXT,
  theme TEXT DEFAULT 'light',
  last_seen_at TIMESTAMPTZ,
  via_invite BOOLEAN NOT NULL DEFAULT false,
  invited_code TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT profiles_generation_check CHECK (generation IS NULL OR generation IN ('09','10')),
  CONSTRAINT profiles_field_check CHECK (field IS NULL OR field IN ('medical','engineering','languages','business','law')),
  CONSTRAINT profiles_gender_check CHECK (gender IS NULL OR gender IN ('male','female'))
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===================== posts =====================
CREATE TABLE public.posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  image_urls TEXT[],
  video_url TEXT,
  channel TEXT,
  generation TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT posts_channel_check CHECK (channel IS NULL OR channel IN ('all','male','female','09','10'))
);
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- ===================== comments =====================
CREATE TABLE public.comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  generation TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- ===================== likes =====================
CREATE TABLE public.likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL DEFAULT 'like',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id),
  CONSTRAINT likes_type_check CHECK (type IN ('like', 'love', 'haha', 'wow', 'sad', 'angry'))
);
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

-- ===================== comment_likes =====================
CREATE TABLE public.comment_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

-- ===================== notifications =====================
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ===================== suggestions =====================
CREATE TABLE public.suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

-- ===================== suggestion_replies =====================
CREATE TABLE public.suggestion_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suggestion_id UUID REFERENCES public.suggestions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.suggestion_replies ENABLE ROW LEVEL SECURITY;

-- ===================== suggestion_likes =====================
CREATE TABLE public.suggestion_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suggestion_id UUID REFERENCES public.suggestions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(suggestion_id, user_id)
);
ALTER TABLE public.suggestion_likes ENABLE ROW LEVEL SECURITY;

-- ===================== suggestion_reply_likes =====================
CREATE TABLE public.suggestion_reply_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reply_id UUID REFERENCES public.suggestion_replies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(reply_id, user_id)
);
ALTER TABLE public.suggestion_reply_likes ENABLE ROW LEVEL SECURITY;

-- ===================== banned_words =====================
CREATE TABLE public.banned_words (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  word TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.banned_words ENABLE ROW LEVEL SECURITY;

-- ===================== support_messages =====================
CREATE TABLE public.support_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- ===================== study_rounds =====================
CREATE TABLE public.study_rounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 5,
  rounds_count INTEGER NOT NULL DEFAULT 1,
  start_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.study_rounds ENABLE ROW LEVEL SECURITY;

-- ===================== round_participants =====================
CREATE TABLE public.round_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID REFERENCES public.study_rounds(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(round_id, user_id)
);
ALTER TABLE public.round_participants ENABLE ROW LEVEL SECURITY;

-- ===================== round_completions =====================
CREATE TABLE public.round_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID REFERENCES public.study_rounds(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(round_id, user_id)
);
ALTER TABLE public.round_completions ENABLE ROW LEVEL SECURITY;

-- ===================== round_meetings =====================
CREATE TABLE public.round_meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.round_meetings ENABLE ROW LEVEL SECURITY;

-- ===================== round_meeting_members =====================
CREATE TABLE public.round_meeting_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID REFERENCES public.round_meetings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);
ALTER TABLE public.round_meeting_members ENABLE ROW LEVEL SECURITY;

-- ===================== round_meeting_messages =====================
CREATE TABLE public.round_meeting_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID REFERENCES public.round_meetings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.round_meeting_messages ENABLE ROW LEVEL SECURITY;

-- ===================== schedules =====================
CREATE TABLE public.schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  description TEXT,
  generation TEXT,
  field TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- ===================== schedule_comments =====================
CREATE TABLE public.schedule_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID REFERENCES public.schedules(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.schedule_comments ENABLE ROW LEVEL SECURITY;

-- ===================== staff_chat =====================
CREATE TABLE public.staff_chat (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_chat ENABLE ROW LEVEL SECURITY;

-- ===================== changes_messages =====================
CREATE TABLE public.changes_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.changes_messages ENABLE ROW LEVEL SECURITY;

-- ===================== user_warnings =====================
CREATE TABLE public.user_warnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  issued_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;

-- ===================== banned_devices =====================
CREATE TABLE public.banned_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  reason TEXT,
  banned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.banned_devices ENABLE ROW LEVEL SECURITY;

-- ===================== user_devices =====================
CREATE TABLE public.user_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  device_id TEXT NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id)
);
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- ===================== section_locks =====================
CREATE TABLE public.section_locks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section TEXT NOT NULL UNIQUE,
  locked BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.section_locks ENABLE ROW LEVEL SECURITY;

-- ===================== admin_actions =====================
CREATE TABLE public.admin_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action_type TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- ===================== post_reports =====================
CREATE TABLE public.post_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  reporter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, reporter_id)
);
ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;

-- ===================== role_permissions =====================
CREATE TABLE public.role_permissions (
  role app_role PRIMARY KEY,
  can_delete_posts BOOLEAN NOT NULL DEFAULT false,
  can_delete_comments BOOLEAN NOT NULL DEFAULT false,
  can_ban_users BOOLEAN NOT NULL DEFAULT false,
  can_timeout BOOLEAN NOT NULL DEFAULT false,
  can_warn BOOLEAN NOT NULL DEFAULT false,
  can_manage_reports BOOLEAN NOT NULL DEFAULT false,
  can_lock_sections BOOLEAN NOT NULL DEFAULT false,
  can_manage_words BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- ===================== channel_settings =====================
CREATE TABLE public.channel_settings (
  channel TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
ALTER TABLE public.channel_settings ENABLE ROW LEVEL SECURITY;

-- ===================== post_mentions =====================
CREATE TABLE public.post_mentions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  mentioned_name TEXT NOT NULL,
  is_all BOOLEAN NOT NULL DEFAULT false,
  channel TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT post_mentions_source_check CHECK (
    (post_id IS NOT NULL AND comment_id IS NULL) OR
    (post_id IS NOT NULL AND comment_id IS NOT NULL) OR
    (post_id IS NULL AND comment_id IS NOT NULL)
  ),
  CONSTRAINT post_mentions_all_check CHECK ((is_all AND user_id IS NULL) OR (NOT is_all AND user_id IS NOT NULL))
);
ALTER TABLE public.post_mentions ENABLE ROW LEVEL SECURITY;

-- ===================== access_codes =====================
CREATE TABLE public.access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  max_uses INTEGER NOT NULL CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  rewarded_uses INTEGER NOT NULL DEFAULT 0 CHECK (rewarded_uses >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  message TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

-- ===================== user_points =====================
CREATE TABLE public.user_points (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 50 CHECK (balance >= 0 AND balance <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;

-- ===================== point_transactions =====================
CREATE TABLE public.point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  source TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 3) Foreign Keys الإضافية والفهارس
-- ============================================================================

ALTER TABLE public.posts
  ADD CONSTRAINT posts_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.suggestions
  ADD CONSTRAINT suggestions_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.suggestion_replies
  ADD CONSTRAINT suggestion_replies_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_deleted_at ON public.posts(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_channel ON public.posts(channel);
CREATE INDEX IF NOT EXISTS idx_posts_status ON public.posts(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_deleted_at ON public.comments(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_changes_messages_category_created ON public.changes_messages(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON public.admin_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_gender ON public.profiles(gender);
CREATE INDEX IF NOT EXISTS post_mentions_post_idx ON public.post_mentions(post_id);
CREATE INDEX IF NOT EXISTS post_mentions_comment_idx ON public.post_mentions(comment_id);
CREATE INDEX IF NOT EXISTS post_mentions_user_idx ON public.post_mentions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_points_user_id ON public.user_points(user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON public.point_transactions(user_id, created_at DESC);


-- ============================================================================
-- 4) الدوال المساعدة الأساسية والدوال الخاصة بالنظام
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ===================== initialize_user_points =====================
CREATE OR REPLACE FUNCTION public.initialize_user_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_points (user_id, balance)
  VALUES (NEW.id, 50)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ===================== get_user_points =====================
CREATE OR REPLACE FUNCTION public.get_user_points(p_user_id UUID)
RETURNS TABLE (balance INTEGER, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_updated TIMESTAMPTZ;
BEGIN
  SELECT up.balance, up.updated_at INTO v_balance, v_updated
  FROM public.user_points up
  WHERE up.user_id = p_user_id;

  IF v_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance)
    VALUES (p_user_id, 50)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT up.balance, up.updated_at INTO v_balance, v_updated
    FROM public.user_points up WHERE up.user_id = p_user_id;
  END IF;

  RETURN QUERY SELECT COALESCE(v_balance, 50), COALESCE(v_updated, now());
END;
$$;

-- ===================== handle_new_user =====================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url, gender, via_invite, email)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.email = 'abdalrhmanmaaith24@gmail.com' THEN 'Admin Abdalrhman ✅'
      ELSE COALESCE(NEW.raw_user_meta_data->>'full_name', 'مستخدم جديد')
    END,
    NEW.raw_user_meta_data->>'avatar_url',
    NULLIF(NEW.raw_user_meta_data->>'gender', ''),
    COALESCE((NEW.raw_user_meta_data->>'via_invite')::boolean, false),
    NEW.email
  );

  INSERT INTO public.user_points (user_id, balance)
  VALUES (NEW.id, 50)
  ON CONFLICT (user_id) DO NOTHING;

  IF NEW.email = 'abdalrhmanmaaith24@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$function$;

-- ===================== protect_original_admin =====================
CREATE OR REPLACE FUNCTION public.protect_original_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_email TEXT;
BEGIN
  SELECT email INTO target_email FROM auth.users WHERE id = OLD.user_id;
  IF target_email = 'abdalrhmanmaaith24@gmail.com' AND OLD.role = 'admin' THEN
    RAISE EXCEPTION 'Cannot remove admin role from the original administrator';
  END IF;
  RETURN OLD;
END;
$$;

-- ===================== get_user_email =====================
CREATE OR REPLACE FUNCTION public.get_user_email(_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_email TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NULL;
  END IF;
  SELECT email INTO result_email FROM auth.users WHERE id = _user_id;
  RETURN result_email;
END;
$$;

-- ===================== delete_old_posts =====================
CREATE OR REPLACE FUNCTION public.delete_old_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.notifications WHERE post_id IN (SELECT id FROM public.posts WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.likes WHERE post_id IN (SELECT id FROM public.posts WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.comment_likes WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.notifications WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.comments WHERE created_at < now() - INTERVAL '24 hours';
  DELETE FROM public.posts WHERE created_at < now() - INTERVAL '24 hours';

  DELETE FROM public.comment_likes WHERE comment_id IN (SELECT id FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.notifications WHERE comment_id IN (SELECT id FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day';
  DELETE FROM public.notifications WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.likes WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.comments WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day';
END;
$function$;

-- ===================== delete_old_comments =====================
CREATE OR REPLACE FUNCTION public.delete_old_comments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.comment_likes WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.notifications WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.comments WHERE created_at < now() - INTERVAL '24 hours';
END;
$function$;

-- ===================== delete_old_rounds =====================
CREATE OR REPLACE FUNCTION public.delete_old_rounds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.round_participants WHERE round_id IN (SELECT id FROM public.study_rounds WHERE created_at < now() - INTERVAL '10 days');
  DELETE FROM public.round_completions WHERE round_id IN (SELECT id FROM public.study_rounds WHERE created_at < now() - INTERVAL '10 days');
  DELETE FROM public.study_rounds WHERE created_at < now() - INTERVAL '10 days';
END;
$function$;

-- ===================== post review triggers & RPCs =====================
CREATE OR REPLACE FUNCTION public.set_post_review_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.channel = 'all' OR NEW.channel IS NULL)
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.has_role(auth.uid(), 'moderator'::app_role) THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_post_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.has_role(auth.uid(), 'moderator'::app_role) THEN
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pending_posts()
RETURNS TABLE (
  id uuid,
  content text,
  image_url text,
  image_urls text[],
  video_url text,
  user_id uuid,
  created_at timestamptz,
  status text,
  author_full_name text,
  author_avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.content, p.image_url, p.image_urls, p.video_url,
    p.user_id, p.created_at, p.status, pr.full_name, pr.avatar_url
  FROM public.posts p
  LEFT JOIN public.profiles pr ON pr.user_id = p.user_id
  WHERE p.deleted_at IS NULL AND p.status = 'pending'
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.posts
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_post_id AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_amount INTEGER;
  v_balance INTEGER;
  v_txn_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  DELETE FROM public.posts WHERE id = p_post_id AND status = 'pending';
  IF NOT FOUND THEN RETURN; END IF;

  SELECT id INTO v_txn_id FROM public.point_transactions
  WHERE amount < 0 AND transaction_type IN ('post', 'everyone')
    AND metadata->>'postId' = p_post_id::text
    AND (metadata->>'refunded' IS NULL OR metadata->>'refunded' <> '1')
  ORDER BY created_at DESC LIMIT 1;

  IF v_txn_id IS NULL THEN RETURN; END IF;

  UPDATE public.point_transactions
  SET metadata = COALESCE(metadata, '{}') || '{"refunded": "1"}'::jsonb
  WHERE id = v_txn_id AND (metadata->>'refunded' IS NULL OR metadata->>'refunded' <> '1')
  RETURNING user_id, abs(amount) INTO v_user_id, v_amount;

  IF NOT FOUND OR v_user_id IS NULL THEN RETURN; END IF;

  SELECT balance INTO v_balance FROM public.user_points WHERE user_id = v_user_id FOR UPDATE;
  IF v_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance) VALUES (v_user_id, 50) ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_balance FROM public.user_points WHERE user_id = v_user_id FOR UPDATE;
  END IF;

  v_balance := LEAST(v_balance + v_amount, 100);
  UPDATE public.user_points SET balance = v_balance WHERE user_id = v_user_id;

  INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source, metadata)
  VALUES (v_user_id, v_amount, v_balance, 'post_refund', 'admin_reject', jsonb_build_object('postId', p_post_id::text, 'original_txn', v_txn_id));
END;
$$;

-- ===================== invites system RPCs =====================
CREATE OR REPLACE FUNCTION public.create_my_invite_code()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  UUID := auth.uid();
  v_row   public.access_codes%ROWTYPE;
  v_code  TEXT;
  v_exp   TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'login_required'; END IF;

  SELECT * INTO v_row FROM public.access_codes
  WHERE created_by = v_user AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('code', v_row.code, 'expires_at', v_row.expires_at, 'max_uses', v_row.max_uses, 'used_count', v_row.used_count);
  END IF;

  LOOP
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.access_codes WHERE code = v_code);
  END LOOP;

  v_exp := now() + interval '7 days';

  INSERT INTO public.access_codes (code, created_by, max_uses, used_count, expires_at, message)
  VALUES (v_code, v_user, 20, 0, v_exp, '')
  RETURNING id, code, expires_at, max_uses, used_count INTO v_row.id, v_row.code, v_row.expires_at, v_row.max_uses, v_row.used_count;

  RETURN jsonb_build_object('code', v_row.code, 'expires_at', v_row.expires_at, 'max_uses', v_row.max_uses, 'used_count', v_row.used_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.reward_inviter(p_code TEXT)
RETURNS TABLE(success BOOLEAN, inviter_id UUID, new_balance INTEGER, points_earned INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      public.access_codes%ROWTYPE;
  v_balance  INTEGER;
  v_added    INTEGER;
  v_admin    BOOLEAN;
  v_staff    BOOLEAN;
BEGIN
  SELECT * INTO v_row FROM public.access_codes WHERE code = lpad(p_code, 6, '0') FOR UPDATE;
  IF NOT FOUND OR v_row.created_by IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::INTEGER, 0; RETURN;
  END IF;

  IF v_row.used_count <= v_row.rewarded_uses THEN
    RETURN QUERY SELECT FALSE, v_row.created_by, NULL::INTEGER, 0; RETURN;
  END IF;

  SELECT public.has_role(v_row.created_by, 'admin') INTO v_admin;
  SELECT public.has_role(v_row.created_by, 'moderator') OR public.has_role(v_row.created_by, 'supervisor') INTO v_staff;
  IF v_admin OR v_staff THEN
    UPDATE public.access_codes SET rewarded_uses = used_count WHERE id = v_row.id;
    RETURN QUERY SELECT TRUE, v_row.created_by, 100, 0; RETURN;
  END IF;

  SELECT balance INTO v_balance FROM public.user_points WHERE user_id = v_row.created_by FOR UPDATE;
  IF v_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance) VALUES (v_row.created_by, 50) ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_balance FROM public.user_points WHERE user_id = v_row.created_by;
  END IF;

  v_added := LEAST(v_balance + 25, 100) - v_balance;
  IF v_added < 0 THEN v_added := 0; END IF;

  IF v_added > 0 THEN
    UPDATE public.user_points SET balance = v_balance + v_added WHERE user_id = v_row.created_by;
    INSERT INTO public.point_transactions (user_id, amount, balance_after, transaction_type, source, metadata)
    VALUES (v_row.created_by, v_added, v_balance + v_added, 'invite_reward', 'invite', jsonb_build_object('invited_code', v_row.code));
  END IF;

  UPDATE public.access_codes SET rewarded_uses = used_count WHERE id = v_row.id;
  RETURN QUERY SELECT TRUE, v_row.created_by, v_balance + v_added, v_added;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_invite_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_row  public.access_codes%ROWTYPE;
  v_prof public.profiles%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'login_required'; END IF;

  SELECT * INTO v_prof FROM public.profiles WHERE user_id = v_user;
  IF FOUND AND ((v_prof.via_invite IS TRUE) OR v_prof.invited_code IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  SELECT * INTO v_row FROM public.access_codes WHERE code = lpad(p_code, 6, '0') FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_row.expires_at <= now() THEN RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF;
  IF v_row.used_count >= v_row.max_uses THEN RETURN jsonb_build_object('ok', false, 'reason', 'used_up'); END IF;
  IF v_row.created_by = v_user THEN RETURN jsonb_build_object('ok', false, 'reason', 'self_claim'); END IF;

  UPDATE public.access_codes SET used_count = used_count + 1 WHERE id = v_row.id;
  UPDATE public.profiles SET via_invite = true, invited_code = v_row.code WHERE user_id = v_user;

  BEGIN
    PERFORM public.reward_inviter(v_row.code);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'inviter_id', v_row.created_by);
END;
$$;

-- ===================== admin_delete_user =====================
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_email TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT email INTO target_email FROM auth.users WHERE id = _user_id;
  IF target_email = 'abdalrhmanmaaith24@gmail.com' THEN
    RAISE EXCEPTION 'cannot delete original administrator';
  END IF;

  DELETE FROM public.comment_likes WHERE user_id = _user_id OR comment_id IN (SELECT id FROM public.comments WHERE user_id = _user_id);
  DELETE FROM public.likes WHERE user_id = _user_id OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id);
  DELETE FROM public.notifications WHERE user_id = _user_id OR actor_id = _user_id;
  DELETE FROM public.post_reports WHERE reporter_id = _user_id OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id);
  DELETE FROM public.post_mentions WHERE user_id = _user_id OR actor_id = _user_id
    OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id)
    OR comment_id IN (SELECT id FROM public.comments WHERE user_id = _user_id);
  DELETE FROM public.comments WHERE user_id = _user_id OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id);
  DELETE FROM public.posts WHERE user_id = _user_id;

  DELETE FROM public.round_completions WHERE user_id = _user_id;
  DELETE FROM public.round_participants WHERE user_id = _user_id;
  DELETE FROM public.round_meeting_messages WHERE user_id = _user_id;
  DELETE FROM public.round_meeting_members WHERE user_id = _user_id;
  DELETE FROM public.round_meetings WHERE owner_id = _user_id;
  DELETE FROM public.study_rounds WHERE user_id = _user_id;

  DELETE FROM public.schedule_comments WHERE user_id = _user_id;
  DELETE FROM public.schedules WHERE user_id = _user_id;

  DELETE FROM public.suggestion_reply_likes WHERE user_id = _user_id;
  DELETE FROM public.suggestion_replies WHERE user_id = _user_id;
  DELETE FROM public.suggestion_likes WHERE user_id = _user_id;
  DELETE FROM public.suggestions WHERE user_id = _user_id;

  DELETE FROM public.support_messages WHERE user_id = _user_id;
  DELETE FROM public.staff_chat WHERE user_id = _user_id;
  DELETE FROM public.changes_messages WHERE user_id = _user_id;

  DELETE FROM public.point_transactions WHERE user_id = _user_id;
  DELETE FROM public.user_points WHERE user_id = _user_id;

  DELETE FROM public.user_warnings WHERE user_id = _user_id OR issued_by = _user_id;
  DELETE FROM public.user_devices WHERE user_id = _user_id;
  DELETE FROM public.admin_actions WHERE admin_id = _user_id OR target_user_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE user_id = _user_id;

  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

-- ===================== other helpers & triggers =====================
CREATE OR REPLACE FUNCTION public.is_round_member(_round_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.round_participants
    WHERE round_id = _round_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.study_rounds
    WHERE id = _round_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_meeting_member(_meeting_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.round_meetings WHERE id = _meeting_id AND owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.round_meeting_members WHERE meeting_id = _meeting_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.join_round(p_round_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM round_participants WHERE round_id = p_round_id AND user_id = p_user_id) THEN
    RETURN 'already_joined';
  END IF;
  INSERT INTO round_participants (round_id, user_id, joined_at) VALUES (p_round_id, p_user_id, now());
  RETURN 'joined';
EXCEPTION WHEN OTHERS THEN RETURN 'error';
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_moderation_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = NEW.user_id
     AND NOT public.has_role(auth.uid(),'admin'::app_role)
     AND NOT public.has_role(auth.uid(),'moderator'::app_role) THEN
    NEW.is_banned    := OLD.is_banned;
    NEW.chat_banned  := OLD.chat_banned;
    NEW.timeout_until := OLD.timeout_until;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_warning_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = NEW.user_id AND NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    NEW.reason    := OLD.reason;
    NEW.issued_by := OLD.issued_by;
    NEW.user_id   := OLD.user_id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.is_user_banned()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(is_banned, false) FROM public.profiles WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_user_chat_banned()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(is_banned, false) OR COALESCE(chat_banned, false)
    OR COALESCE(timeout_until > now(), false)
  FROM public.profiles WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.enforce_ban_on_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_user_banned() THEN
    RAISE EXCEPTION 'user_banned';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_chat_ban_on_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_user_chat_banned() THEN
    RAISE EXCEPTION 'user_chat_banned';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.check_banned_words()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  txt TEXT := lower(COALESCE(NEW.content, ''));
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF txt = '' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.banned_words WHERE position(lower(word) IN txt) > 0) THEN
    RAISE EXCEPTION 'content_contains_banned_word';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.check_section_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.section_locks
    WHERE section = TG_ARGV[0]
      AND locked = true
      AND (locked_until IS NULL OR locked_until > now())
  ) THEN
    RAISE EXCEPTION 'section_locked';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.hard_delete_post(_post_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.comments WHERE post_id = _post_id;
  DELETE FROM public.likes WHERE post_id = _post_id;
  DELETE FROM public.notifications WHERE post_id = _post_id;
  DELETE FROM public.posts WHERE id = _post_id;
END $$;

CREATE OR REPLACE FUNCTION public.hard_delete_comment(_comment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.comment_likes WHERE comment_id = _comment_id;
  DELETE FROM public.notifications WHERE comment_id = _comment_id;
  DELETE FROM public.comments WHERE id = _comment_id;
END $$;

CREATE OR REPLACE FUNCTION public.is_device_banned(_device_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.banned_devices WHERE device_id = _device_id);
$$;

CREATE OR REPLACE FUNCTION public.set_content_generation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  author_gen TEXT;
  is_staff BOOLEAN;
BEGIN
  is_staff := public.has_role(NEW.user_id, 'admin'::app_role)
           OR public.has_role(NEW.user_id, 'moderator'::app_role)
           OR public.has_role(NEW.user_id, 'supervisor'::app_role);

  IF is_staff THEN RETURN NEW; END IF;

  SELECT generation INTO author_gen FROM public.profiles WHERE user_id = NEW.user_id;
  NEW.generation := author_gen;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_posts_channel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.channel IS NULL THEN NEW.channel := 'all'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.block_field_law_for_non_admins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.field = 'law' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'حقل القانون لا يمكن تعيينه إلا من قبل الإدارة';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET last_seen_at = now() WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_mention_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO target_profile FROM public.profiles WHERE user_id = NEW.user_id;
  IF target_profile.id IS NOT NULL AND (target_profile.is_banned OR COALESCE(target_profile.chat_banned, false)) THEN
    RAISE EXCEPTION 'cannot_mention_banned';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_all_mention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_all AND NOT public.has_role(NEW.actor_id, 'admin') THEN
    RAISE EXCEPTION 'only_admins_can_mention_all';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_access_code(
  p_max_uses INTEGER,
  p_duration_hours INTEGER,
  p_message TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_id   UUID;
  v_exp  TIMESTAMPTZ;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admins_only'; END IF;
  IF p_max_uses IS NULL OR p_max_uses < 1 THEN RAISE EXCEPTION 'max_uses_must_be_positive'; END IF;
  IF p_duration_hours IS NULL OR p_duration_hours < 1 THEN RAISE EXCEPTION 'duration_must_be_positive'; END IF;

  LOOP
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.access_codes WHERE code = v_code);
  END LOOP;

  v_exp := now() + make_interval(hours => p_duration_hours);

  INSERT INTO public.access_codes (code, created_by, max_uses, used_count, expires_at, message)
  VALUES (v_code, auth.uid(), p_max_uses, 0, v_exp, COALESCE(p_message, ''))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'code', v_code, 'max_uses', p_max_uses, 'used_count', 0, 'expires_at', v_exp, 'message', COALESCE(p_message, ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.list_access_codes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admins_only'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',         a.id,
    'code',       a.code,
    'max_uses',   a.max_uses,
    'used_count', a.used_count,
    'expires_at', a.expires_at,
    'message',    a.message,
    'created_at', a.created_at,
    'active',     (a.expires_at > now() AND a.used_count < a.max_uses)
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO v_result FROM public.access_codes a;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_access_code(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admins_only'; END IF;
  DELETE FROM public.access_codes WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_access_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.access_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.access_codes WHERE code = lpad(p_code, 6, '0');

  IF NOT FOUND THEN RETURN jsonb_build_object('valid', false, 'reason', 'not_found', 'message', null); END IF;
  IF v_row.expires_at <= now() THEN RETURN jsonb_build_object('valid', false, 'reason', 'expired', 'message', null); END IF;
  IF v_row.used_count >= v_row.max_uses THEN RETURN jsonb_build_object('valid', false, 'reason', 'used_up', 'message', null); END IF;

  RETURN jsonb_build_object(
    'valid',    true,
    'reason',   'ok',
    'message',  COALESCE(NULLIF(v_row.message, ''), 'تم التحقق من الكود بنجاح. أنشئ حسابك الآن للدخول إلى الدردشة.'),
    'remaining', v_row.max_uses - v_row.used_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_access_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.access_codes%ROWTYPE;
  v_valid BOOLEAN;
  v_reason TEXT;
BEGIN
  SELECT * INTO v_row FROM public.access_codes
  WHERE code = lpad(p_code, 6, '0') AND expires_at > now() AND used_count < max_uses
  FOR UPDATE;

  v_valid := FOUND;

  IF NOT v_valid THEN
    SELECT EXISTS (SELECT 1 FROM public.access_codes WHERE code = lpad(p_code, 6, '0')) INTO v_valid;
    IF NOT v_valid THEN v_reason := 'not_found';
    ELSIF EXISTS (SELECT 1 FROM public.access_codes WHERE code = lpad(p_code, 6, '0') AND expires_at <= now()) THEN v_reason := 'expired';
    ELSE v_reason := 'used_up';
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', v_reason, 'id', null, 'message', null);
  END IF;

  UPDATE public.access_codes SET used_count = used_count + 1 WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true, 'reason', 'ok', 'id', v_row.id, 'code', v_row.code, 'message', COALESCE(NULLIF(v_row.message, ''), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.consume_access_code(p_code TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_access_code(p_code TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.refund_access_code(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.access_codes
  SET used_count = GREATEST(used_count - 1, 0)
  WHERE code = lpad(p_code, 6, '0');
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_access_code(p_code TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_access_code(p_code TEXT) TO service_role;


-- ============================================================================
-- 5) الـ Triggers
-- ============================================================================

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER trg_protect_original_admin
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_original_admin();

CREATE TRIGGER trg_profile_guard_mod
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_moderation_columns();

CREATE TRIGGER block_field_law_for_non_admins
  BEFORE INSERT OR UPDATE OF field ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.block_field_law_for_non_admins();

CREATE TRIGGER trg_guard_warning_columns
  BEFORE UPDATE ON public.user_warnings
  FOR EACH ROW EXECUTE FUNCTION public.guard_warning_columns();

CREATE TRIGGER trg_set_posts_channel
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_posts_channel();

CREATE TRIGGER set_posts_generation BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.set_content_generation();
CREATE TRIGGER set_comments_generation BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.set_content_generation();

CREATE TRIGGER touch_last_seen_posts AFTER INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.touch_last_seen();
CREATE TRIGGER touch_last_seen_comments AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.touch_last_seen();
CREATE TRIGGER touch_last_seen_likes AFTER INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION public.touch_last_seen();

CREATE TRIGGER guard_mention_target_trigger BEFORE INSERT OR UPDATE OF user_id ON public.post_mentions FOR EACH ROW EXECUTE FUNCTION public.guard_mention_target();
CREATE TRIGGER guard_all_mention_trigger BEFORE INSERT OR UPDATE OF is_all ON public.post_mentions FOR EACH ROW EXECUTE FUNCTION public.guard_all_mention();

CREATE TRIGGER trg_set_post_review_status BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.set_post_review_status();
CREATE TRIGGER trg_guard_post_status BEFORE UPDATE OF status ON public.posts FOR EACH ROW EXECUTE FUNCTION public.guard_post_status();

CREATE TRIGGER trg_ban_posts BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.enforce_chat_ban_on_write();
CREATE TRIGGER trg_ban_comments BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.enforce_chat_ban_on_write();
CREATE TRIGGER trg_ban_likes BEFORE INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();
CREATE TRIGGER trg_ban_comment_likes BEFORE INSERT ON public.comment_likes FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();
CREATE TRIGGER trg_ban_changes BEFORE INSERT ON public.changes_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();
CREATE TRIGGER trg_ban_schedule_comments BEFORE INSERT ON public.schedule_comments FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();
CREATE TRIGGER trg_ban_suggestions BEFORE INSERT ON public.suggestions FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();
CREATE TRIGGER trg_ban_round_meeting_messages BEFORE INSERT ON public.round_meeting_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();
CREATE TRIGGER trg_ban_support BEFORE INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

CREATE TRIGGER trg_words_posts BEFORE INSERT OR UPDATE OF content ON public.posts FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();
CREATE TRIGGER trg_words_comments BEFORE INSERT OR UPDATE OF content ON public.comments FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();
CREATE TRIGGER trg_words_changes BEFORE INSERT ON public.changes_messages FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();
CREATE TRIGGER trg_words_schedule_comments BEFORE INSERT ON public.schedule_comments FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();
CREATE TRIGGER trg_words_suggestions BEFORE INSERT ON public.suggestions FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();
CREATE TRIGGER trg_words_round_meeting_messages BEFORE INSERT ON public.round_meeting_messages FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();

CREATE TRIGGER enforce_chat_lock_posts BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('chat');
CREATE TRIGGER enforce_chat_lock_comments BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('chat');
CREATE TRIGGER enforce_suggestions_lock BEFORE INSERT ON public.suggestions FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('suggestions');
CREATE TRIGGER enforce_suggestions_lock_replies BEFORE INSERT ON public.suggestion_replies FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('suggestions');
CREATE TRIGGER enforce_changes_lock BEFORE INSERT ON public.changes_messages FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('changes');
CREATE TRIGGER enforce_schedules_lock BEFORE INSERT ON public.schedule_comments FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('schedules');
CREATE TRIGGER enforce_schedules_lock_uploads BEFORE INSERT ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('schedules');
CREATE TRIGGER enforce_rounds_lock BEFORE INSERT ON public.study_rounds FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('rounds');


-- ============================================================================
-- 6) سياسات RLS (Policies)
-- ============================================================================

-- ===================== user_roles =====================
CREATE POLICY "User roles are viewable by everyone" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "Admins can insert user roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete user roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ===================== profiles =====================
CREATE POLICY "Authenticated users can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===================== posts =====================
CREATE POLICY "posts select all for authenticated" ON public.posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create posts" ON public.posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own posts" ON public.posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users or admins or moderators can delete posts" ON public.posts FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
CREATE POLICY "Admins can update any post" ON public.posts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Moderators can update posts" ON public.posts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'moderator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Staff review post status" ON public.posts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role));

-- ===================== comments =====================
CREATE POLICY "Comments are viewable by everyone" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create comments" ON public.comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own comments" ON public.comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users or admins or moderators can delete comments" ON public.comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
CREATE POLICY "Admins can update any comment" ON public.comments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===================== likes =====================
CREATE POLICY "Likes are viewable by everyone" ON public.likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can like" ON public.likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike" ON public.likes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can change own reactions" ON public.likes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===================== comment_likes =====================
CREATE POLICY "Comment likes viewable by everyone" ON public.comment_likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can like comments" ON public.comment_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike comments" ON public.comment_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===================== notifications =====================
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Valid notifications only" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = actor_id
    AND user_id <> actor_id
    AND (
      (
        type = 'mention'
        AND EXISTS (
          SELECT 1 FROM public.post_mentions pm
          WHERE pm.actor_id = auth.uid()
            AND pm.post_id IS NOT DISTINCT FROM notifications.post_id
            AND pm.comment_id IS NOT DISTINCT FROM notifications.comment_id
            AND (pm.user_id = notifications.user_id OR pm.is_all)
        )
      )
      OR (post_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = notifications.user_id))
      OR (comment_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_id AND c.user_id = notifications.user_id))
    )
  );
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- ===================== suggestions =====================
CREATE POLICY "Suggestions are viewable by everyone" ON public.suggestions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create suggestions" ON public.suggestions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can delete suggestions" ON public.suggestions FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update suggestions" ON public.suggestions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ===================== suggestion_replies =====================
CREATE POLICY "Suggestion replies are viewable by everyone" ON public.suggestion_replies FOR SELECT USING (true);
CREATE POLICY "Only admins can reply to suggestions" ON public.suggestion_replies FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins can update replies" ON public.suggestion_replies FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ===================== suggestion_likes & reply_likes =====================
CREATE POLICY "Suggestion likes viewable by everyone" ON public.suggestion_likes FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated users can like suggestions" ON public.suggestion_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike suggestions" ON public.suggestion_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Reply likes viewable by everyone" ON public.suggestion_reply_likes FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated users can like replies" ON public.suggestion_reply_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike replies" ON public.suggestion_reply_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===================== banned_words =====================
CREATE POLICY "Banned words are viewable by everyone" ON public.banned_words FOR SELECT USING (true);
CREATE POLICY "Only admins can insert banned words" ON public.banned_words FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins can delete banned words" ON public.banned_words FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ===================== support_messages =====================
CREATE POLICY "Users can view own support messages" ON public.support_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Users can send support messages" ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      (user_id = auth.uid())
      OR (
        (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role))
        AND EXISTS (SELECT 1 FROM public.support_messages sm WHERE sm.user_id = support_messages.user_id)
      )
    )
  );
CREATE POLICY "Admins can update support messages" ON public.support_messages FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role) OR auth.uid() = user_id);
CREATE POLICY "Admins can delete support messages" ON public.support_messages FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- ===================== study_rounds =====================
CREATE POLICY "Rounds viewable by everyone" ON public.study_rounds FOR SELECT TO public USING (true);
CREATE POLICY "Rounds managers/admins create rounds" ON public.study_rounds FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'rounds_manager'::app_role)
    )
  );
CREATE POLICY "Owners or admins can update rounds" ON public.study_rounds FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners or admins/mods can delete rounds" ON public.study_rounds FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- ===================== round_participants =====================
CREATE POLICY "Participants viewable by everyone" ON public.round_participants FOR SELECT USING (true);
CREATE POLICY "Users can join rounds" ON public.round_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave rounds" ON public.round_participants FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins or mods can kick" ON public.round_participants FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));

-- ===================== round_completions =====================
CREATE POLICY "Completions viewable by all" ON public.round_completions FOR SELECT USING (true);
CREATE POLICY "User can insert own completion" ON public.round_completions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_round_member(round_id, auth.uid()));

-- ===================== round_meetings =====================
CREATE POLICY "Members can view meetings" ON public.round_meetings FOR SELECT TO authenticated
  USING (public.is_meeting_member(id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can create meetings" ON public.round_meetings FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner or admin can delete meetings" ON public.round_meetings FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owner can update meetings" ON public.round_meetings FOR UPDATE TO authenticated USING (auth.uid() = owner_id);

-- ===================== round_meeting_members =====================
CREATE POLICY "Members or admin can view members" ON public.round_meeting_members FOR SELECT TO authenticated
  USING (public.is_meeting_member(meeting_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owner or admin can add members" ON public.round_meeting_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.round_meetings WHERE id = meeting_id AND owner_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY "Owner/admin/self can remove members" ON public.round_meeting_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.round_meetings WHERE id = meeting_id AND owner_id = auth.uid())
  );

-- ===================== round_meeting_messages =====================
CREATE POLICY "Members can view messages" ON public.round_meeting_messages FOR SELECT TO authenticated
  USING (public.is_meeting_member(meeting_id, auth.uid()));
CREATE POLICY "Members can send messages" ON public.round_meeting_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_meeting_member(meeting_id, auth.uid()));
CREATE POLICY "Owner/admin/self can delete messages" ON public.round_meeting_messages FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.round_meetings WHERE id = meeting_id AND owner_id = auth.uid())
  );

-- ===================== schedules =====================
CREATE POLICY "Schedules viewable by everyone" ON public.schedules FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create schedules" ON public.schedules FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners or admins can update schedules" ON public.schedules FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners or admins/mods can delete schedules" ON public.schedules FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- ===================== schedule_comments =====================
CREATE POLICY "Schedule comments viewable by everyone" ON public.schedule_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment on schedules" ON public.schedule_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners or admins can update schedule comments" ON public.schedule_comments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners or admins/mods can delete schedule comments" ON public.schedule_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- ===================== staff_chat =====================
CREATE POLICY "Only staff can view staff chat" ON public.staff_chat FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Only staff can send to staff chat" ON public.staff_chat FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)) AND auth.uid() = user_id);
CREATE POLICY "Staff can update own staff messages" ON public.staff_chat FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)));
CREATE POLICY "Staff can delete staff messages" ON public.staff_chat FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR (auth.uid() = user_id AND has_role(auth.uid(), 'moderator'::app_role)));

-- ===================== changes_messages =====================
CREATE POLICY "Changes viewable by everyone" ON public.changes_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated can post changes" ON public.changes_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner or admin/mod can delete changes" ON public.changes_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));

-- ===================== user_warnings =====================
CREATE POLICY "User can view own warnings" ON public.user_warnings FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));
CREATE POLICY "Admin can insert warnings" ON public.user_warnings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admin can delete warnings" ON public.user_warnings FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "User can ack own warning" ON public.user_warnings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===================== banned_devices =====================
CREATE POLICY "Authenticated can view full ban info" ON public.banned_devices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Admins can ban devices" ON public.banned_devices FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));
CREATE POLICY "Admins can unban devices" ON public.banned_devices FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

-- ===================== user_devices =====================
CREATE POLICY "Self or staff can view devices" ON public.user_devices FOR SELECT TO authenticated
  USING (auth.uid()=user_id OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));
CREATE POLICY "Users can register own device" ON public.user_devices FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users can update own device" ON public.user_devices FOR UPDATE TO authenticated USING (auth.uid()=user_id);

-- ===================== section_locks =====================
CREATE POLICY "Section locks viewable by all" ON public.section_locks FOR SELECT USING (true);
CREATE POLICY "Admins manage locks insert" ON public.section_locks FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins manage locks update" ON public.section_locks FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins manage locks delete" ON public.section_locks FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

-- ===================== admin_actions =====================
CREATE POLICY "Staff can view admin actions" ON public.admin_actions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role));
CREATE POLICY "Staff can insert admin actions" ON public.admin_actions FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid() AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role)));

-- ===================== post_reports =====================
CREATE POLICY "users insert own reports" ON public.post_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "staff read all reports" ON public.post_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role) OR auth.uid() = reporter_id);
CREATE POLICY "staff update reports" ON public.post_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role));
CREATE POLICY "admin delete reports" ON public.post_reports FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

-- ===================== role_permissions =====================
CREATE POLICY "role perms read" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manages role perms" ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- ===================== channel_settings =====================
CREATE POLICY "channel settings viewable by everyone" ON public.channel_settings FOR SELECT USING (true);
CREATE POLICY "channel settings manage for admins" ON public.channel_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ===================== post_mentions =====================
CREATE POLICY "Mentions are viewable by everyone" ON public.post_mentions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create mentions" ON public.post_mentions FOR INSERT WITH CHECK (auth.uid() = actor_id);

-- ===================== access_codes =====================
CREATE POLICY "Admins can view access codes" ON public.access_codes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert access codes" ON public.access_codes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete access codes" ON public.access_codes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ===================== user_points =====================
CREATE POLICY "Users can view own points" ON public.user_points FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ===================== point_transactions =====================
CREATE POLICY "Users can view own transactions" ON public.point_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));


-- ============================================================================
-- 7) GRANTs على الجداول والصلاحيات
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

GRANT SELECT ON public.banned_devices TO anon, authenticated;
GRANT ALL ON public.banned_devices TO service_role;
GRANT INSERT, DELETE ON public.banned_devices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_devices TO authenticated;
GRANT ALL ON public.user_devices TO service_role;
GRANT SELECT ON public.section_locks TO anon, authenticated;
GRANT ALL ON public.section_locks TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.section_locks TO authenticated;
GRANT SELECT, INSERT ON public.admin_actions TO authenticated;
GRANT ALL ON public.admin_actions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_reports TO authenticated;
GRANT ALL ON public.post_reports TO service_role;
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_email(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_email(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.is_device_banned(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_device_banned(TEXT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

REVOKE SELECT ON public.profiles FROM anon;


-- ============================================================================
-- 8) Storage Buckets + Policies
-- ============================================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('post-media', 'post-media', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('schedules', 'schedules', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('staff-chat', 'staff-chat', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('round-meetings', 'round-meetings', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('support-media', 'support-media', true) ON CONFLICT (id) DO NOTHING;

-- ===================== avatars =====================
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ===================== post-media =====================
CREATE POLICY "Post media is publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'post-media');
CREATE POLICY "post media upload own folder" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "post media update own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "post media delete own or staff" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'post-media'
    AND (auth.uid()::text = (storage.foldername(name))[1]
         OR public.has_role(auth.uid(),'admin'::app_role)
         OR public.has_role(auth.uid(),'moderator'::app_role))
  );

-- ===================== schedules =====================
CREATE POLICY "Schedule images publicly viewable" ON storage.objects FOR SELECT USING (bucket_id = 'schedules');
CREATE POLICY "Authenticated can upload schedule images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'schedules' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owners/admins can delete schedule images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'schedules' AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'admin'::app_role)));

-- ===================== staff-chat =====================
CREATE POLICY "Staff can view staff-chat images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'staff-chat' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)));
CREATE POLICY "Staff can upload staff-chat images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'staff-chat' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)));
CREATE POLICY "Staff can delete staff-chat images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'staff-chat' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)));

-- ===================== round-meetings =====================
CREATE POLICY "Authenticated can upload meeting images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'round-meetings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Meeting members can read meeting images" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'round-meetings'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.round_meetings rm
        WHERE rm.id::text = (storage.foldername(name))[1]
          AND public.is_meeting_member(rm.id, auth.uid())
      )
    )
  );
CREATE POLICY "round-meetings update own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'round-meetings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "round-meetings delete own or staff" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'round-meetings'
    AND (auth.uid()::text = (storage.foldername(name))[1]
         OR public.has_role(auth.uid(),'admin'::app_role)
         OR public.has_role(auth.uid(),'moderator'::app_role))
  );

-- ===================== support-media =====================
CREATE POLICY "Support media is publicly accessible" ON storage.objects FOR SELECT TO public USING (bucket_id = 'support-media');
CREATE POLICY "Users can upload support media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'support-media' AND auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete their support media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'support-media' AND auth.uid()::text = (storage.foldername(name))[1]);


-- ============================================================================
-- 9) Realtime
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  arr TEXT[] := ARRAY[
    'public.posts',
    'public.comments',
    'public.likes',
    'public.comment_likes',
    'public.section_locks',
    'public.channel_settings',
    'public.profiles',
    'public.notifications',
    'public.support_messages',
    'public.changes_messages',
    'public.schedules',
    'public.suggestions'
  ];
BEGIN
  FOREACH t IN ARRAY arr
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', t);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'realtime add skip %: %', t, SQLERRM;
    END;
  END LOOP;
END $$;

-- Realtime policy (قناة آمنة)
DO $$
DECLARE pol TEXT;
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'realtime RLS skip: %', SQLERRM;
  END;

  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated can subscribe to allowed topics" ON realtime.messages';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'realtime policy drop skip: %', SQLERRM;
  END;

  pol := $pol$
    CREATE POLICY "Authenticated can subscribe to allowed topics" ON realtime.messages
      FOR SELECT TO authenticated
      USING (
        (realtime.topic() IN ('chat','rounds','changes','suggestions','schedules','notifications'))
        OR (realtime.topic() LIKE 'support:%' AND (
              split_part(realtime.topic(),':',2) = auth.uid()::text
              OR public.has_role(auth.uid(),'admin'::app_role)
              OR public.has_role(auth.uid(),'moderator'::app_role)
           ))
        OR (realtime.topic() LIKE 'user:%' AND split_part(realtime.topic(),':',2) = auth.uid()::text)
        OR (realtime.topic() LIKE 'round:%' AND public.is_round_member(
              NULLIF(split_part(realtime.topic(),':',2),'')::uuid, auth.uid()))
        OR (realtime.topic() LIKE 'meeting:%' AND public.is_meeting_member(
              NULLIF(split_part(realtime.topic(),':',2),'')::uuid, auth.uid()))
        OR (realtime.topic() = 'staff' AND (
              public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role)))
      );
  $pol$;
  BEGIN
    EXECUTE pol;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'realtime policy create skip: %', SQLERRM;
  END;
END $$;


-- ============================================================================
-- 10) Cron Jobs (تنظيف تلقائي)
-- ============================================================================

DO $$ BEGIN
  PERFORM cron.unschedule('cleanup-old-posts-hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('cleanup-old-comments-hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('cleanup-old-rounds-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'cleanup-old-posts-hourly',
    '0 * * * *',
    $cq$SELECT public.delete_old_posts();$cq$
  );
EXCEPTION WHEN others THEN RAISE NOTICE 'cron posts skip: %', SQLERRM; END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'cleanup-old-comments-hourly',
    '15 * * * *',
    $cq$SELECT public.delete_old_comments();$cq$
  );
EXCEPTION WHEN others THEN RAISE NOTICE 'cron comments skip: %', SQLERRM; END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'cleanup-old-rounds-daily',
    '30 3 * * *',
    $cq$SELECT public.delete_old_rounds();$cq$
  );
EXCEPTION WHEN others THEN RAISE NOTICE 'cron rounds skip: %', SQLERRM; END $$;


-- ============================================================================
-- 11) البيانات الافتراضية
-- ============================================================================

-- كلمات محظورة
INSERT INTO public.banned_words (word) VALUES
  ('fuck'), ('shit'), ('bitch'), ('damn'), ('dick'), ('pussy'), ('sex'), ('porn'), ('whore'), ('slut'),
  ('كس'), ('زب'), ('شرموط'), ('عرص'), ('منيك')
ON CONFLICT (word) DO NOTHING;

-- إعدادات القنوات
INSERT INTO public.channel_settings (channel, enabled) VALUES
  ('all', true), ('male', true), ('female', true), ('09', true), ('10', true)
ON CONFLICT (channel) DO NOTHING;

-- صلاحيات الأدوار
INSERT INTO public.role_permissions (role, can_delete_posts, can_delete_comments, can_ban_users, can_timeout, can_warn, can_manage_reports, can_lock_sections, can_manage_words)
VALUES
  ('moderator', true, true, true, true, true, true, false, false),
  ('supervisor', true, true, false, true, true, true, false, false),
  ('rounds_manager', false, false, false, false, false, false, false, false)
ON CONFLICT (role) DO NOTHING;


-- ============================================================================
-- ★ انتهى الملف — انسخ المحتوى بالكامل وشغّله من SQL Editor ★
-- ============================================================================
