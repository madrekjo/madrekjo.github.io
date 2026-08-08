-- ============================================================================
-- قاعدة بيانات الموقع - نسخة كاملة (كل الـ migrations مدمجة بالترتيب)
-- شغّلها على مشروع Supabase جديد من: SQL Editor → New Query → Paste → Run
-- ============================================================================


-- ============================================================================
-- Migration: 20260402083047_d48c4546-9a73-4a88-b922-60c7eba73857.sql
-- ============================================================================

-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table first
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User roles are viewable by everyone" ON public.user_roles FOR SELECT USING (true);

-- Create has_role function
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

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  name_changed_at TIMESTAMP WITH TIME ZONE,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create posts table
CREATE TABLE public.posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  video_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Posts are viewable by everyone" ON public.posts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create posts" ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own posts" ON public.posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users or admins can delete posts" ON public.posts FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create comments table
CREATE TABLE public.comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  parent_comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments are viewable by everyone" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own comments" ON public.comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users or admins can delete comments" ON public.comments FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create likes table
CREATE TABLE public.likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Likes are viewable by everyone" ON public.likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can like" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike" ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- Create suggestions table
CREATE TABLE public.suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Suggestions are viewable by everyone" ON public.suggestions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create suggestions" ON public.suggestions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create suggestion_replies table (admin only)
CREATE TABLE public.suggestion_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suggestion_id UUID REFERENCES public.suggestions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.suggestion_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Suggestion replies are viewable by everyone" ON public.suggestion_replies FOR SELECT USING (true);
CREATE POLICY "Only admins can reply to suggestions" ON public.suggestion_replies FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create banned_words table
CREATE TABLE public.banned_words (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  word TEXT NOT NULL UNIQUE
);
ALTER TABLE public.banned_words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Banned words are viewable by everyone" ON public.banned_words FOR SELECT USING (true);
CREATE POLICY "Only admins can insert banned words" ON public.banned_words FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins can delete banned words" ON public.banned_words FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'مستخدم جديد'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  IF NEW.email = 'abdalrhmanmaaith24@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to delete old comments
CREATE OR REPLACE FUNCTION public.delete_old_comments()
RETURNS void AS $$
BEGIN
  DELETE FROM public.comments WHERE created_at < now() - INTERVAL '4 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('post-media', 'post-media', true);

CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Post media is publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'post-media');
CREATE POLICY "Users can upload post media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'post-media' AND auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete their post media" ON storage.objects FOR DELETE USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Insert default banned words
INSERT INTO public.banned_words (word) VALUES
  ('fuck'), ('shit'), ('bitch'), ('damn'), ('dick'), ('pussy'), ('sex'), ('porn'), ('whore'), ('slut'),
  ('كس'), ('زب'), ('شرموط'), ('عرص'), ('منيك');


-- ============================================================================
-- Migration: 20260402083639_8828efdd-c3cb-445e-9e23-dd504f440c55.sql
-- ============================================================================

-- Add foreign keys from posts, comments, suggestions, suggestion_replies to profiles
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


-- ============================================================================
-- Migration: 20260402084015_065267db-1cb2-40a8-9b01-7f413a5d16c2.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    CASE 
      WHEN NEW.email = 'abdalrhmanmaaith24@gmail.com' THEN 'Admin Abdalrhman ✅'
      ELSE COALESCE(NEW.raw_user_meta_data->>'full_name', 'مستخدم جديد')
    END,
    NEW.raw_user_meta_data->>'avatar_url'
  );
  IF NEW.email = 'abdalrhmanmaaith24@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================================
-- Migration: 20260402084629_2f751f09-283d-4da6-aba1-6eb88e4f4040.sql
-- ============================================================================

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'reply')),
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;


-- ============================================================================
-- Migration: 20260402085609_a6ac8300-6c18-4a67-b222-212bc426d58c.sql
-- ============================================================================

CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- ============================================================================
-- Migration: 20260403071950_ac44145f-3ce5-45c3-9177-bf829b51287a.sql
-- ============================================================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderator';

-- ============================================================================
-- Migration: 20260403072001_96f46ce5-8a01-40cf-b5ea-cc3e1c152110.sql
-- ============================================================================

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Users or admins can delete posts" ON public.posts;
CREATE POLICY "Users or admins or moderators can delete posts"
ON public.posts FOR DELETE TO authenticated
USING (
  auth.uid() = user_id 
  OR public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'moderator')
);

DROP POLICY IF EXISTS "Users or admins can delete comments" ON public.comments;
CREATE POLICY "Users or admins or moderators can delete comments"
ON public.comments FOR DELETE TO authenticated
USING (
  auth.uid() = user_id 
  OR public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'moderator')
);

CREATE POLICY "Admins can update any comment"
ON public.comments FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert user roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete user roles"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));


-- ============================================================================
-- Migration: 20260404080955_92b42288-4ba5-44d0-a638-1ffe0a8a57fe.sql
-- ============================================================================

-- Add is_pinned column to posts
ALTER TABLE public.posts ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;

-- Allow admins to update any post (for pinning)
CREATE POLICY "Admins can update any post"
ON public.posts FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete suggestions
CREATE POLICY "Admins can delete suggestions"
ON public.suggestions FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));


-- ============================================================================
-- Migration: 20260404081342_c9c5ca25-ac7a-49e7-83ca-5cec93e5844e.sql
-- ============================================================================

-- Add is_pinned to suggestions
ALTER TABLE public.suggestions ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;

-- Allow admins to update suggestions (for pinning)
CREATE POLICY "Admins can update suggestions"
ON public.suggestions FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create suggestion_likes table
CREATE TABLE public.suggestion_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES public.suggestions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(suggestion_id, user_id)
);

ALTER TABLE public.suggestion_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Suggestion likes viewable by everyone"
ON public.suggestion_likes FOR SELECT TO public
USING (true);

CREATE POLICY "Authenticated users can like suggestions"
ON public.suggestion_likes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike suggestions"
ON public.suggestion_likes FOR DELETE TO authenticated
USING (auth.uid() = user_id);


-- ============================================================================
-- Migration: 20260405082222_e13c0e73-f06d-4c32-9776-86136d693461.sql
-- ============================================================================

-- 1. Create suggestion_reply_likes table
CREATE TABLE public.suggestion_reply_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id uuid NOT NULL REFERENCES public.suggestion_replies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reply_id, user_id)
);

ALTER TABLE public.suggestion_reply_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reply likes viewable by everyone"
ON public.suggestion_reply_likes FOR SELECT TO public
USING (true);

CREATE POLICY "Authenticated users can like replies"
ON public.suggestion_reply_likes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike replies"
ON public.suggestion_reply_likes FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- 2. Create support_messages table for contacting admins
CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Users can see their own conversations
CREATE POLICY "Users can view own support messages"
ON public.support_messages FOR SELECT TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- Users can send messages (user_id = themselves, sender_id = themselves)
CREATE POLICY "Users can send support messages"
ON public.support_messages FOR INSERT TO authenticated
WITH CHECK (auth.uid() = sender_id);

-- Admins can update (mark as read)
CREATE POLICY "Admins can update support messages"
ON public.support_messages FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role) OR auth.uid() = user_id);

-- 3. Protect original admin from role deletion via trigger
CREATE OR REPLACE FUNCTION public.protect_original_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_email text;
BEGIN
  SELECT email INTO target_email FROM auth.users WHERE id = OLD.user_id;
  IF target_email = 'abdalrhmanmaaith24@gmail.com' AND OLD.role = 'admin' THEN
    RAISE EXCEPTION 'Cannot remove admin role from the original administrator';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER protect_original_admin_trigger
BEFORE DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.protect_original_admin();

-- Enable realtime for support_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;


-- ============================================================================
-- Migration: 20260406085529_cc76c652-d707-4531-a52e-91273149776e.sql
-- ============================================================================

CREATE POLICY "Users can update own replies"
ON public.suggestion_replies
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- ============================================================================
-- Migration: 20260406090009_24c3a991-ef33-43d8-97d1-3da824fccafa.sql
-- ============================================================================

CREATE TABLE public.comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comment likes viewable by everyone" ON public.comment_likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can like comments" ON public.comment_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike comments" ON public.comment_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ============================================================================
-- Migration: 20260408162906_5a4ef1dd-9594-4260-8acc-22d214984787.sql
-- ============================================================================

-- Allow admins/moderators to delete support messages
CREATE POLICY "Admins can delete support messages"
ON public.support_messages
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));


-- ============================================================================
-- Migration: 20260501035027_a76b6842-7352-4580-9a4d-383fe2c556fa.sql
-- ============================================================================
-- Add soft delete columns to posts and comments
ALTER TABLE public.posts 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

ALTER TABLE public.comments 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- Update existing delete function to do soft delete via auto-cleanup of old posts (4 days)
CREATE OR REPLACE FUNCTION public.delete_old_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Hard delete posts older than 4 days (and their cascade content via app logic)
  DELETE FROM public.posts WHERE created_at < now() - INTERVAL '4 days';
  DELETE FROM public.comments WHERE created_at < now() - INTERVAL '4 days';
  -- Also purge soft-deleted records older than 4 days
  DELETE FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '4 days';
  DELETE FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '4 days';
END;
$$;

-- Add admin SELECT policy for viewing soft-deleted (already viewable via existing policy since SELECT is true; that's fine)

-- Index for pagination performance
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_deleted_at ON public.posts(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_deleted_at ON public.comments(deleted_at) WHERE deleted_at IS NOT NULL;

-- Enable required extensions for cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule cleanup every hour
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-posts') THEN
    PERFORM cron.schedule(
      'cleanup-old-posts',
      '0 * * * *',
      $cron$ SELECT public.delete_old_posts(); $cron$
    );
  END IF;
END $$;

-- ============================================================================
-- Migration: 20260501035656_b5ff4dbe-e58c-4e55-b9b4-db3748ab0b57.sql
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_email(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_email text;
BEGIN
  -- Only admins can see emails
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NULL;
  END IF;
  SELECT email INTO result_email FROM auth.users WHERE id = _user_id;
  RETURN result_email;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_email(uuid) TO authenticated;

-- ============================================================================
-- Migration: 20260502034910_8eb12c80-0c84-4f4a-aa3c-11d3d61abd8c.sql
-- ============================================================================
-- Study Rounds
CREATE TABLE public.study_rounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.study_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rounds viewable by everyone" ON public.study_rounds FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create rounds" ON public.study_rounds FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners or admins can update rounds" ON public.study_rounds FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners or admins/mods can delete rounds" ON public.study_rounds FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- Round Participants
CREATE TABLE public.round_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.study_rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, user_id)
);
ALTER TABLE public.round_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants viewable by everyone" ON public.round_participants FOR SELECT USING (true);
CREATE POLICY "Users can join rounds" ON public.round_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave rounds" ON public.round_participants FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Schedules (image-only)
CREATE TABLE public.schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT,
  image_url TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Schedules viewable by everyone" ON public.schedules FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create schedules" ON public.schedules FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners or admins can update schedules" ON public.schedules FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners or admins/mods can delete schedules" ON public.schedules FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- Schedule comments
CREATE TABLE public.schedule_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.schedule_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Schedule comments viewable by everyone" ON public.schedule_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment on schedules" ON public.schedule_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners or admins can update schedule comments" ON public.schedule_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners or admins/mods can delete schedule comments" ON public.schedule_comments FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- Staff chat (admin/moderator only)
CREATE TABLE public.staff_chat (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_chat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only staff can view staff chat" ON public.staff_chat FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Only staff can send to staff chat" ON public.staff_chat FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)) AND auth.uid() = user_id);
CREATE POLICY "Staff can update own staff messages" ON public.staff_chat FOR UPDATE TO authenticated USING (auth.uid() = user_id AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)));
CREATE POLICY "Staff can delete staff messages" ON public.staff_chat FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR (auth.uid() = user_id AND has_role(auth.uid(), 'moderator'::app_role)));

-- Storage buckets for schedules and staff images
INSERT INTO storage.buckets (id, name, public) VALUES ('schedules', 'schedules', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('staff-chat', 'staff-chat', false) ON CONFLICT DO NOTHING;

CREATE POLICY "Schedule images publicly viewable" ON storage.objects FOR SELECT USING (bucket_id = 'schedules');
CREATE POLICY "Authenticated can upload schedule images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'schedules' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owners/admins can delete schedule images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'schedules' AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Staff can view staff-chat images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'staff-chat' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)));
CREATE POLICY "Staff can upload staff-chat images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'staff-chat' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)));
CREATE POLICY "Staff can delete staff-chat images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'staff-chat' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)));

-- ============================================================================
-- Migration: 20260503031237_7556ee1d-59a4-4373-9ab4-826608f605a2.sql
-- ============================================================================
-- Add break/timer/status fields to study_rounds
ALTER TABLE public.study_rounds
  ADD COLUMN IF NOT EXISTS break_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS break_interval_minutes integer,
  ADD COLUMN IF NOT EXISTS break_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- Update auto-delete to skip pinned posts/comments
CREATE OR REPLACE FUNCTION public.delete_old_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.posts
    WHERE created_at < now() - INTERVAL '4 days'
    AND is_pinned = false;
  DELETE FROM public.comments
    WHERE created_at < now() - INTERVAL '4 days'
    AND is_pinned = false;
  DELETE FROM public.posts
    WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '4 days'
    AND is_pinned = false;
  DELETE FROM public.comments
    WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '4 days'
    AND is_pinned = false;
END;
$function$;

-- Allow round owner to update (already exists), and ensure participants get notifications via app

-- Helper: get round participation counts per user (public, anyone can see)
CREATE OR REPLACE FUNCTION public.get_round_counts(_user_ids uuid[])
RETURNS TABLE(user_id uuid, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT user_id, COUNT(*)::bigint
  FROM public.round_participants
  WHERE user_id = ANY(_user_ids)
  GROUP BY user_id;
$$;

-- ============================================================================
-- Migration: 20260503031819_68b111f4-e0cc-49f3-9767-5392919dd82e.sql
-- ============================================================================
-- Helper: is user participant or owner of round
CREATE OR REPLACE FUNCTION public.is_round_member(_round_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.round_participants
    WHERE round_id = _round_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.study_rounds
    WHERE id = _round_id AND user_id = _user_id
  );
$$;

CREATE TABLE IF NOT EXISTS public.round_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.study_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_round_chat_round ON public.round_chat(round_id);

ALTER TABLE public.round_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Round members can view chat" ON public.round_chat
FOR SELECT TO authenticated
USING (public.is_round_member(round_id, auth.uid()));

CREATE POLICY "Round members can send" ON public.round_chat
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_round_member(round_id, auth.uid()));

CREATE POLICY "Owner or admin/mod or self can delete" ON public.round_chat
FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'moderator'::app_role)
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.round_chat;

-- Allow moderators to update posts (for soft delete)
DROP POLICY IF EXISTS "Moderators can update posts" ON public.posts;
CREATE POLICY "Moderators can update posts" ON public.posts
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role))
WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));

-- ============================================================================
-- Migration: 20260504022457_2696f8f5-4ee1-4056-acd4-b8e689f47da0.sql
-- ============================================================================

-- Allow admins/mods to remove participants (kick)
CREATE POLICY "Admins or mods can kick"
ON public.round_participants
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));

-- Meetings inside Rounds page (invite-only)
CREATE TABLE public.round_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.round_meetings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.round_meeting_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.round_meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);
ALTER TABLE public.round_meeting_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.round_meeting_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.round_meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.round_meeting_messages ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION public.is_meeting_member(_meeting_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.round_meetings WHERE id = _meeting_id AND owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.round_meeting_members WHERE meeting_id = _meeting_id AND user_id = _user_id
  );
$$;

-- Meetings policies
CREATE POLICY "Members can view meetings" ON public.round_meetings FOR SELECT TO authenticated
USING (public.is_meeting_member(id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can create meetings" ON public.round_meetings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner or admin can delete meetings" ON public.round_meetings FOR DELETE TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owner can update meetings" ON public.round_meetings FOR UPDATE TO authenticated
USING (auth.uid() = owner_id);

-- Members policies
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

-- Messages policies
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

-- Storage bucket for meeting images
INSERT INTO storage.buckets (id, name, public) VALUES ('round-meetings', 'round-meetings', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload meeting images" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'round-meetings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Authenticated can read meeting images" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'round-meetings');


-- ============================================================================
-- Migration: 20260505042929_548f17a4-f626-40ae-98c9-a639c7e98894.sql
-- ============================================================================
-- Add mute option for round alarm
ALTER TABLE public.study_rounds
ADD COLUMN IF NOT EXISTS alarm_muted boolean NOT NULL DEFAULT false;

-- Create changes_messages table (شو المنصة غيرت فيك / تحفيز)
CREATE TABLE IF NOT EXISTS public.changes_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('change','motivation')),
  content text NOT NULL,
  image_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.changes_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Changes viewable by everyone"
ON public.changes_messages FOR SELECT
USING (true);

CREATE POLICY "Authenticated can post changes"
ON public.changes_messages FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner or admin/mod can delete changes"
ON public.changes_messages FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));

CREATE INDEX IF NOT EXISTS idx_changes_messages_category_created ON public.changes_messages(category, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.changes_messages;

-- ============================================================================
-- Migration: 20260506030034_7f49d143-1889-4931-91dd-1888ca5def5c.sql
-- ============================================================================
-- Warnings
CREATE TABLE public.user_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  issued_by UUID NOT NULL,
  reason TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User can view own warnings" ON public.user_warnings FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));
CREATE POLICY "Admin can insert warnings" ON public.user_warnings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admin can delete warnings" ON public.user_warnings FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "User can ack own warning" ON public.user_warnings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add timeout_until and chat_banned to profiles
ALTER TABLE public.profiles ADD COLUMN timeout_until TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN chat_banned BOOLEAN NOT NULL DEFAULT false;

-- Reply support in chats
ALTER TABLE public.round_chat ADD COLUMN reply_to UUID;
ALTER TABLE public.round_meeting_messages ADD COLUMN reply_to UUID;
ALTER TABLE public.changes_messages ADD COLUMN reply_to UUID;
ALTER TABLE public.staff_chat ADD COLUMN reply_to UUID;

-- Round completions (self assessment)
CREATE TABLE public.round_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL,
  user_id UUID NOT NULL,
  achievement TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, user_id)
);
ALTER TABLE public.round_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Completions viewable by all" ON public.round_completions FOR SELECT USING (true);
CREATE POLICY "User can insert own completion" ON public.round_completions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Update round counts function to count from completions instead
CREATE OR REPLACE FUNCTION public.get_round_counts(_user_ids uuid[])
RETURNS TABLE(user_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT user_id, COUNT(*)::bigint
  FROM public.round_completions
  WHERE user_id = ANY(_user_ids)
  GROUP BY user_id;
$$;

-- ============================================================================
-- Migration: 20260601090807_509e284b-49cf-40a9-8e61-efadfb7f546f.sql
-- ============================================================================

-- Banned devices table (block by device fingerprint)
CREATE TABLE public.banned_devices (
  device_id text PRIMARY KEY,
  reason text,
  banned_by uuid,
  banned_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.banned_devices TO anon, authenticated;
GRANT ALL ON public.banned_devices TO service_role;
GRANT INSERT, DELETE ON public.banned_devices TO authenticated;
ALTER TABLE public.banned_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can check device bans" ON public.banned_devices FOR SELECT USING (true);
CREATE POLICY "Admins can ban devices" ON public.banned_devices FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));
CREATE POLICY "Admins can unban devices" ON public.banned_devices FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

-- Track user devices so admins can ban a user's device
CREATE TABLE public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id)
);
GRANT SELECT, INSERT, UPDATE ON public.user_devices TO authenticated;
GRANT ALL ON public.user_devices TO service_role;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Self or staff can view devices" ON public.user_devices FOR SELECT TO authenticated USING (auth.uid()=user_id OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));
CREATE POLICY "Users can register own device" ON public.user_devices FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users can update own device" ON public.user_devices FOR UPDATE TO authenticated USING (auth.uid()=user_id);

-- Section locks (admin can close sections with message + countdown)
CREATE TABLE public.section_locks (
  section text PRIMARY KEY,
  locked boolean NOT NULL DEFAULT false,
  message text,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.section_locks TO anon, authenticated;
GRANT ALL ON public.section_locks TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.section_locks TO authenticated;
ALTER TABLE public.section_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Section locks viewable by all" ON public.section_locks FOR SELECT USING (true);
CREATE POLICY "Admins manage locks insert" ON public.section_locks FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins manage locks update" ON public.section_locks FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins manage locks delete" ON public.section_locks FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));


-- ============================================================================
-- Migration: 20260602060752_e81060b4-92e3-4475-8ac9-e768003f2b82.sql
-- ============================================================================

-- 1) Admin actions log
CREATE TABLE public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  target_user_id uuid,
  action_type text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_actions TO authenticated;
GRANT ALL ON public.admin_actions TO service_role;
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view admin actions" ON public.admin_actions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role));
CREATE POLICY "Staff can insert admin actions" ON public.admin_actions
  FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid() AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role)));
CREATE INDEX idx_admin_actions_created ON public.admin_actions(created_at DESC);

-- 2) Prevent users from updating their own ban/timeout columns on profiles
CREATE OR REPLACE FUNCTION public.guard_profile_moderation_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
DROP TRIGGER IF EXISTS trg_profile_guard_mod ON public.profiles;
CREATE TRIGGER trg_profile_guard_mod
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_moderation_columns();

-- 3) Tighten notifications INSERT: actor must own the underlying post/comment OR target is owner of referenced row
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;
CREATE POLICY "Valid notifications only" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = actor_id
    AND user_id <> actor_id
    AND (
      (post_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = notifications.user_id))
      OR (comment_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_id AND c.user_id = notifications.user_id))
    )
  );

-- 4) Tighten support_messages: only allow inserts where user_id thread = self OR sender is staff
DROP POLICY IF EXISTS "Users can send support messages" ON public.support_messages;
CREATE POLICY "Users can send support messages" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      user_id = auth.uid()
      OR public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'moderator'::app_role)
    )
  );

-- 5) Protect user_warnings columns: user can only change "acknowledged"
CREATE OR REPLACE FUNCTION public.guard_warning_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() = NEW.user_id AND NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    NEW.reason    := OLD.reason;
    NEW.issued_by := OLD.issued_by;
    NEW.user_id   := OLD.user_id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_warning_guard ON public.user_warnings;
CREATE TRIGGER trg_warning_guard
BEFORE UPDATE ON public.user_warnings
FOR EACH ROW EXECUTE FUNCTION public.guard_warning_columns();

-- 6) Storage policies: post-media folder = uid, plus update/delete
DROP POLICY IF EXISTS "post media upload own folder" ON storage.objects;
CREATE POLICY "post media upload own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'post-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
DROP POLICY IF EXISTS "post media update own" ON storage.objects;
CREATE POLICY "post media update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "post media delete own or staff" ON storage.objects;
CREATE POLICY "post media delete own or staff" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'post-media'
    AND (auth.uid()::text = (storage.foldername(name))[1]
         OR public.has_role(auth.uid(),'admin'::app_role)
         OR public.has_role(auth.uid(),'moderator'::app_role))
  );

-- round-meetings update/delete
DROP POLICY IF EXISTS "round-meetings update own" ON storage.objects;
CREATE POLICY "round-meetings update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'round-meetings' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "round-meetings delete own or staff" ON storage.objects;
CREATE POLICY "round-meetings delete own or staff" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'round-meetings'
    AND (auth.uid()::text = (storage.foldername(name))[1]
         OR public.has_role(auth.uid(),'admin'::app_role)
         OR public.has_role(auth.uid(),'moderator'::app_role))
  );

-- 7) Hard delete RPC for staff (used by deleted-items section)
CREATE OR REPLACE FUNCTION public.hard_delete_post(_post_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.comments WHERE post_id = _post_id;
  DELETE FROM public.likes WHERE post_id = _post_id;
  DELETE FROM public.notifications WHERE post_id = _post_id;
  DELETE FROM public.posts WHERE id = _post_id;
END $$;

CREATE OR REPLACE FUNCTION public.hard_delete_comment(_comment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.comment_likes WHERE comment_id = _comment_id;
  DELETE FROM public.notifications WHERE comment_id = _comment_id;
  DELETE FROM public.comments WHERE id = _comment_id;
END $$;


-- ============================================================================
-- Migration: 20260604041058_2f48797e-875d-4fcd-a2cf-cbcbc64a57c8.sql
-- ============================================================================

-- 1) Attach moderation guard triggers (functions exist but were never bound)
DROP TRIGGER IF EXISTS trg_guard_profile_moderation ON public.profiles;
CREATE TRIGGER trg_guard_profile_moderation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_moderation_columns();

DROP TRIGGER IF EXISTS trg_guard_warning_columns ON public.user_warnings;
CREATE TRIGGER trg_guard_warning_columns
  BEFORE UPDATE ON public.user_warnings
  FOR EACH ROW EXECUTE FUNCTION public.guard_warning_columns();

DROP TRIGGER IF EXISTS trg_protect_original_admin ON public.user_roles;
CREATE TRIGGER trg_protect_original_admin
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_original_admin();

-- 2) Fix mutable search_path
CREATE OR REPLACE FUNCTION public.join_round(p_round_id uuid, p_user_id uuid)
RETURNS text LANGUAGE plpgsql SET search_path TO 'public' AS $$
begin
  if exists (select 1 from round_participants where round_id = p_round_id and user_id = p_user_id) then
    return 'already_joined';
  end if;
  insert into round_participants (round_id, user_id, joined_at) values (p_round_id, p_user_id, now());
  return 'joined';
exception when others then return 'error';
end;
$$;

-- 3) Post-media storage: drop overly-permissive policy, keep folder-scoped one
DROP POLICY IF EXISTS "Users can upload post media" ON storage.objects;
-- Ensure folder-scoped policy exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='post media upload own folder') THEN
    CREATE POLICY "post media upload own folder" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'post-media' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

-- 4) Round-meetings storage: replace broad read policy with membership check
DROP POLICY IF EXISTS "Authenticated can read meeting images" ON storage.objects;
CREATE POLICY "Meeting members can read meeting images" ON storage.objects
  FOR SELECT TO authenticated
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

-- 5) Banned devices: restrict public read to device_id only via column-aware policy
DROP POLICY IF EXISTS "Anyone can check device bans" ON public.banned_devices;
CREATE POLICY "Authenticated can view full ban info" ON public.banned_devices
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));

-- Provide an unauth-friendly check function for device gate
CREATE OR REPLACE FUNCTION public.is_device_banned(_device_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.banned_devices WHERE device_id = _device_id);
$$;
REVOKE ALL ON FUNCTION public.is_device_banned(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_device_banned(text) TO anon, authenticated;

-- 6) Support messages: tighten insert to prevent staff spoofing user_id arbitrarily
DROP POLICY IF EXISTS "Users can send support messages" ON public.support_messages;
CREATE POLICY "Users can send support messages" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      -- regular user writes only to their own thread
      (user_id = auth.uid())
      -- staff replies must target an existing user thread (a user must have written first)
      OR (
        (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role))
        AND EXISTS (SELECT 1 FROM public.support_messages sm WHERE sm.user_id = support_messages.user_id)
      )
    )
  );

-- 7) Realtime: lock down channel subscriptions
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can subscribe to allowed topics" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to allowed topics" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    -- public broadcast topics (chat, rounds list, changes, suggestions) anyone signed-in can join
    (realtime.topic() IN ('chat','rounds','changes','suggestions','schedules','notifications'))
    -- support thread: only the thread owner or staff
    OR (realtime.topic() LIKE 'support:%' AND (
          split_part(realtime.topic(),':',2) = auth.uid()::text
          OR public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'moderator'::app_role)
       ))
    -- per-user notifications topic
    OR (realtime.topic() LIKE 'user:%' AND split_part(realtime.topic(),':',2) = auth.uid()::text)
    -- round chat: members only
    OR (realtime.topic() LIKE 'round:%' AND public.is_round_member(
          NULLIF(split_part(realtime.topic(),':',2),'')::uuid, auth.uid()))
    -- meeting chat: members only
    OR (realtime.topic() LIKE 'meeting:%' AND public.is_meeting_member(
          NULLIF(split_part(realtime.topic(),':',2),'')::uuid, auth.uid()))
    -- staff chat
    OR (realtime.topic() = 'staff' AND (
          public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role)))
  );


-- ============================================================================
-- Migration: 20260604041914_56ed5a1a-cce6-4533-ba08-cc73b5ad7e15.sql
-- ============================================================================

-- 1) profiles: require auth to read
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);
REVOKE SELECT ON public.profiles FROM anon;

-- 2) suggestion_replies: only admins can update (mirror insert)
DROP POLICY IF EXISTS "Users can update own replies" ON public.suggestion_replies;
CREATE POLICY "Only admins can update replies" ON public.suggestion_replies
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));


-- ============================================================================
-- Migration: 20260604142248_fb9fec76-b83b-4bc1-a608-f4d5704f4379.sql
-- ============================================================================

-- Helper: is current user banned (full or chat)
CREATE OR REPLACE FUNCTION public.is_user_banned()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(is_banned, false) FROM public.profiles WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_user_chat_banned()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(is_banned, false) OR COALESCE(chat_banned, false)
    OR COALESCE(timeout_until > now(), false)
  FROM public.profiles WHERE user_id = auth.uid();
$$;

-- Trigger fn: block banned users from writing content
CREATE OR REPLACE FUNCTION public.enforce_ban_on_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_user_banned() THEN
    RAISE EXCEPTION 'user_banned';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_chat_ban_on_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_user_chat_banned() THEN
    RAISE EXCEPTION 'user_chat_banned';
  END IF;
  RETURN NEW;
END $$;

-- Trigger fn: banned word filter (admins exempt)
CREATE OR REPLACE FUNCTION public.check_banned_words()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  txt text := lower(COALESCE(NEW.content, ''));
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

-- Attach ban-enforcement triggers
DROP TRIGGER IF EXISTS trg_ban_posts ON public.posts;
CREATE TRIGGER trg_ban_posts BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.enforce_chat_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_comments ON public.comments;
CREATE TRIGGER trg_ban_comments BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.enforce_chat_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_likes ON public.likes;
CREATE TRIGGER trg_ban_likes BEFORE INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_comment_likes ON public.comment_likes;
CREATE TRIGGER trg_ban_comment_likes BEFORE INSERT ON public.comment_likes FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_changes ON public.changes_messages;
CREATE TRIGGER trg_ban_changes BEFORE INSERT ON public.changes_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_round_chat ON public.round_chat;
CREATE TRIGGER trg_ban_round_chat BEFORE INSERT ON public.round_chat FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_schedule_comments ON public.schedule_comments;
CREATE TRIGGER trg_ban_schedule_comments BEFORE INSERT ON public.schedule_comments FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_suggestions ON public.suggestions;
CREATE TRIGGER trg_ban_suggestions BEFORE INSERT ON public.suggestions FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_round_meeting_messages ON public.round_meeting_messages;
CREATE TRIGGER trg_ban_round_meeting_messages BEFORE INSERT ON public.round_meeting_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_support ON public.support_messages;
CREATE TRIGGER trg_ban_support BEFORE INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

-- Attach banned-word triggers to text content tables
DROP TRIGGER IF EXISTS trg_words_posts ON public.posts;
CREATE TRIGGER trg_words_posts BEFORE INSERT OR UPDATE OF content ON public.posts FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();

DROP TRIGGER IF EXISTS trg_words_comments ON public.comments;
CREATE TRIGGER trg_words_comments BEFORE INSERT OR UPDATE OF content ON public.comments FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();

DROP TRIGGER IF EXISTS trg_words_changes ON public.changes_messages;
CREATE TRIGGER trg_words_changes BEFORE INSERT ON public.changes_messages FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();

DROP TRIGGER IF EXISTS trg_words_round_chat ON public.round_chat;
CREATE TRIGGER trg_words_round_chat BEFORE INSERT ON public.round_chat FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();

DROP TRIGGER IF EXISTS trg_words_schedule_comments ON public.schedule_comments;
CREATE TRIGGER trg_words_schedule_comments BEFORE INSERT ON public.schedule_comments FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();

DROP TRIGGER IF EXISTS trg_words_suggestions ON public.suggestions;
CREATE TRIGGER trg_words_suggestions BEFORE INSERT ON public.suggestions FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();

DROP TRIGGER IF EXISTS trg_words_round_meeting_messages ON public.round_meeting_messages;
CREATE TRIGGER trg_words_round_meeting_messages BEFORE INSERT ON public.round_meeting_messages FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();


-- ============================================================================
-- Migration: 20260606193001_404489bf-ef05-4e98-ac57-594adfd63360.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

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
END;
$function$;

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

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-posts-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-comments-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-old-posts-hourly',
  '0 * * * *',
  $$SELECT public.delete_old_posts();$$
);

SELECT cron.schedule(
  'cleanup-old-comments-hourly',
  '15 * * * *',
  $$SELECT public.delete_old_comments();$$
);

SELECT public.delete_old_posts();


-- ============================================================================
-- Migration: 20260606193312_1f2099bb-e1e8-4b8a-9d2f-ffcaad907cbf.sql
-- ============================================================================

-- Update cleanup: soft-deleted items removed after 1 day; rounds removed after 10 days
CREATE OR REPLACE FUNCTION public.delete_old_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Hard delete posts/comments older than 24h
  DELETE FROM public.notifications WHERE post_id IN (SELECT id FROM public.posts WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.likes WHERE post_id IN (SELECT id FROM public.posts WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.comment_likes WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.notifications WHERE comment_id IN (SELECT id FROM public.comments WHERE created_at < now() - INTERVAL '24 hours');
  DELETE FROM public.comments WHERE created_at < now() - INTERVAL '24 hours';
  DELETE FROM public.posts WHERE created_at < now() - INTERVAL '24 hours';

  -- Also remove anything soft-deleted more than 1 day ago (safety)
  DELETE FROM public.comment_likes WHERE comment_id IN (SELECT id FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.notifications WHERE comment_id IN (SELECT id FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.comments WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day';
  DELETE FROM public.notifications WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.likes WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.comments WHERE post_id IN (SELECT id FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day');
  DELETE FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '1 day';
END;
$function$;

-- New function: delete old rounds (>10 days)
CREATE OR REPLACE FUNCTION public.delete_old_rounds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.round_chat WHERE round_id IN (SELECT id FROM public.study_rounds WHERE created_at < now() - INTERVAL '10 days');
  DELETE FROM public.round_participants WHERE round_id IN (SELECT id FROM public.study_rounds WHERE created_at < now() - INTERVAL '10 days');
  DELETE FROM public.round_completions WHERE round_id IN (SELECT id FROM public.study_rounds WHERE created_at < now() - INTERVAL '10 days');
  DELETE FROM public.study_rounds WHERE created_at < now() - INTERVAL '10 days';
END;
$function$;

DO $$
BEGIN PERFORM cron.unschedule('cleanup-old-rounds-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'cleanup-old-rounds-daily',
  '30 3 * * *',
  $$SELECT public.delete_old_rounds();$$
);

-- Allow admins/moderators to view all round chat messages
DROP POLICY IF EXISTS "Round members can view chat" ON public.round_chat;
CREATE POLICY "Round members or staff can view chat"
ON public.round_chat
FOR SELECT
TO authenticated
USING (
  public.is_round_member(round_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
);

-- Also allow staff to view all rounds (even those they're not part of)
DROP POLICY IF EXISTS "Rounds viewable by everyone" ON public.study_rounds;
CREATE POLICY "Rounds viewable by everyone"
ON public.study_rounds
FOR SELECT
TO public
USING (true);

SELECT public.delete_old_rounds();


-- ============================================================================
-- Migration: 20260704074110_786f98b3-345f-4865-8542-8fcf058665c8.sql
-- ============================================================================

-- 1) generation + field on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS generation text,
  ADD COLUMN IF NOT EXISTS field text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_generation_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_generation_check
  CHECK (generation IS NULL OR generation IN ('09','10'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_field_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_field_check
  CHECK (field IS NULL OR field IN ('medical','engineering','languages','business'));

-- 2) post_reports table
CREATE TABLE IF NOT EXISTS public.post_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, reporter_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_reports TO authenticated;
GRANT ALL ON public.post_reports TO service_role;

ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users insert own reports" ON public.post_reports;
CREATE POLICY "users insert own reports" ON public.post_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "staff read all reports" ON public.post_reports;
CREATE POLICY "staff read all reports" ON public.post_reports
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'moderator'::app_role)
    OR auth.uid() = reporter_id
  );

DROP POLICY IF EXISTS "staff update reports" ON public.post_reports;
CREATE POLICY "staff update reports" ON public.post_reports
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role));

DROP POLICY IF EXISTS "admin delete reports" ON public.post_reports;
CREATE POLICY "admin delete reports" ON public.post_reports
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

-- 3) admin_delete_user function
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_email text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT email INTO target_email FROM auth.users WHERE id = _user_id;
  IF target_email = 'abdalrhmanmaaith24@gmail.com' THEN
    RAISE EXCEPTION 'cannot delete original administrator';
  END IF;

  -- Delete dependents
  DELETE FROM public.comment_likes WHERE user_id = _user_id
    OR comment_id IN (SELECT id FROM public.comments WHERE user_id = _user_id);
  DELETE FROM public.likes WHERE user_id = _user_id
    OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id);
  DELETE FROM public.notifications WHERE user_id = _user_id OR actor_id = _user_id;
  DELETE FROM public.post_reports WHERE reporter_id = _user_id
    OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id);
  DELETE FROM public.comments WHERE user_id = _user_id
    OR post_id IN (SELECT id FROM public.posts WHERE user_id = _user_id);
  DELETE FROM public.posts WHERE user_id = _user_id;

  DELETE FROM public.round_chat WHERE user_id = _user_id;
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

  DELETE FROM public.user_warnings WHERE user_id = _user_id OR issued_by = _user_id;
  DELETE FROM public.user_devices WHERE user_id = _user_id;
  DELETE FROM public.admin_actions WHERE admin_id = _user_id OR target_user_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE user_id = _user_id;

  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;


-- ============================================================================
-- Migration: 20260705154306_a9a5c520-912d-4882-815e-47529af3142e.sql
-- ============================================================================

-- Fix 1: round_completions must require membership
DROP POLICY IF EXISTS "User can insert own completion" ON public.round_completions;
DROP POLICY IF EXISTS "Users can insert own completion" ON public.round_completions;
CREATE POLICY "User can insert own completion" ON public.round_completions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_round_member(round_id, auth.uid())
  );

-- Fix 2: server-side section lock enforcement
CREATE OR REPLACE FUNCTION public.check_section_lock()
RETURNS trigger
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

DROP TRIGGER IF EXISTS enforce_chat_lock_posts ON public.posts;
CREATE TRIGGER enforce_chat_lock_posts
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('chat');

DROP TRIGGER IF EXISTS enforce_chat_lock_comments ON public.comments;
CREATE TRIGGER enforce_chat_lock_comments
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('chat');

DROP TRIGGER IF EXISTS enforce_suggestions_lock ON public.suggestions;
CREATE TRIGGER enforce_suggestions_lock
  BEFORE INSERT ON public.suggestions
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('suggestions');

DROP TRIGGER IF EXISTS enforce_suggestions_lock_replies ON public.suggestion_replies;
CREATE TRIGGER enforce_suggestions_lock_replies
  BEFORE INSERT ON public.suggestion_replies
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('suggestions');

DROP TRIGGER IF EXISTS enforce_changes_lock ON public.changes_messages;
CREATE TRIGGER enforce_changes_lock
  BEFORE INSERT ON public.changes_messages
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('changes');

DROP TRIGGER IF EXISTS enforce_schedules_lock ON public.schedule_comments;
CREATE TRIGGER enforce_schedules_lock
  BEFORE INSERT ON public.schedule_comments
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('schedules');

DROP TRIGGER IF EXISTS enforce_schedules_lock_uploads ON public.schedules;
CREATE TRIGGER enforce_schedules_lock_uploads
  BEFORE INSERT ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('schedules');

DROP TRIGGER IF EXISTS enforce_rounds_lock ON public.study_rounds;
CREATE TRIGGER enforce_rounds_lock
  BEFORE INSERT ON public.study_rounds
  FOR EACH ROW EXECUTE FUNCTION public.check_section_lock('rounds');


-- ============================================================================
-- Migration: 20260705154605_24037e27-a9da-4ff9-ac3f-74e0db585eb7.sql
-- ============================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'rounds_manager';


-- ============================================================================
-- Migration: 20260705154635_434e2064-d9a7-41af-8c6c-c50293162959.sql
-- ============================================================================

-- ============ role_permissions ============
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role public.app_role PRIMARY KEY,
  can_delete_posts boolean NOT NULL DEFAULT false,
  can_delete_comments boolean NOT NULL DEFAULT false,
  can_ban_users boolean NOT NULL DEFAULT false,
  can_timeout boolean NOT NULL DEFAULT false,
  can_warn boolean NOT NULL DEFAULT false,
  can_manage_reports boolean NOT NULL DEFAULT false,
  can_lock_sections boolean NOT NULL DEFAULT false,
  can_manage_words boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role perms read" ON public.role_permissions;
CREATE POLICY "role perms read" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin manages role perms" ON public.role_permissions;
CREATE POLICY "admin manages role perms" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- Seed defaults (moderator keeps everything, supervisor is lighter, rounds_manager is empty)
INSERT INTO public.role_permissions (role, can_delete_posts, can_delete_comments, can_ban_users, can_timeout, can_warn, can_manage_reports, can_lock_sections, can_manage_words)
VALUES
  ('moderator', true, true, true, true, true, true, false, false),
  ('supervisor', true, true, false, true, true, true, false, false),
  ('rounds_manager', false, false, false, false, false, false, false, false)
ON CONFLICT (role) DO NOTHING;

-- ============ has_permission helper ============
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ok boolean := false;
BEGIN
  IF public.has_role(_user_id, 'admin'::app_role) THEN RETURN true; END IF;

  EXECUTE format('
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = $1 AND rp.%I = true
    )', _perm)
  INTO ok
  USING _user_id;

  RETURN COALESCE(ok, false);
END $$;

-- ============ study_rounds: restrict creation ============
DROP POLICY IF EXISTS "Users can insert own study round" ON public.study_rounds;
DROP POLICY IF EXISTS "Users can create study rounds" ON public.study_rounds;
DROP POLICY IF EXISTS "Users insert own round" ON public.study_rounds;
CREATE POLICY "Rounds managers/admins create rounds" ON public.study_rounds
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'rounds_manager'::app_role)
    )
  );

-- ============ Chat generation separation ============
ALTER TABLE public.posts    ADD COLUMN IF NOT EXISTS generation text;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS generation text;

-- Backfill from author profile
UPDATE public.posts p
  SET generation = pr.generation
FROM public.profiles pr
WHERE p.user_id = pr.user_id AND p.generation IS NULL;

UPDATE public.comments c
  SET generation = pr.generation
FROM public.profiles pr
WHERE c.user_id = pr.user_id AND c.generation IS NULL;

-- Trigger to auto-fill generation from author profile (unless staff => NULL for shared/announcement)
CREATE OR REPLACE FUNCTION public.set_content_generation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  author_gen text;
  is_staff boolean;
BEGIN
  is_staff := public.has_role(NEW.user_id, 'admin'::app_role)
           OR public.has_role(NEW.user_id, 'moderator'::app_role)
           OR public.has_role(NEW.user_id, 'supervisor'::app_role);

  IF is_staff THEN
    -- Staff posts default to shared (NULL) unless they explicitly set one
    RETURN NEW;
  END IF;

  SELECT generation INTO author_gen FROM public.profiles WHERE user_id = NEW.user_id;
  NEW.generation := author_gen;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS set_posts_generation ON public.posts;
CREATE TRIGGER set_posts_generation
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_content_generation();

DROP TRIGGER IF EXISTS set_comments_generation ON public.comments;
CREATE TRIGGER set_comments_generation
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.set_content_generation();

-- Visibility helper: returns true if row is visible to current user
CREATE OR REPLACE FUNCTION public.can_see_generation(_gen text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_gen text;
BEGIN
  IF _gen IS NULL THEN RETURN true; END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role)
     OR public.has_role(auth.uid(), 'supervisor'::app_role) THEN
    RETURN true;
  END IF;
  SELECT generation INTO my_gen FROM public.profiles WHERE user_id = auth.uid();
  RETURN my_gen IS NOT NULL AND my_gen = _gen;
END $$;

-- Replace SELECT policies on posts/comments to enforce generation visibility
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON public.posts;
DROP POLICY IF EXISTS "Anyone can view posts" ON public.posts;
DROP POLICY IF EXISTS "Everyone reads posts" ON public.posts;
DROP POLICY IF EXISTS "Public read posts" ON public.posts;
DROP POLICY IF EXISTS "posts select" ON public.posts;
CREATE POLICY "posts select by generation" ON public.posts
  FOR SELECT TO authenticated
  USING (public.can_see_generation(generation));

DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments;
DROP POLICY IF EXISTS "Anyone can view comments" ON public.comments;
DROP POLICY IF EXISTS "Everyone reads comments" ON public.comments;
DROP POLICY IF EXISTS "Public read comments" ON public.comments;
DROP POLICY IF EXISTS "comments select" ON public.comments;
CREATE POLICY "comments select by generation" ON public.comments
  FOR SELECT TO authenticated
  USING (public.can_see_generation(generation));

