-- ============================================================
-- مدارك جو - Full Database Schema
-- Run this in Supabase SQL Editor (will drop existing objects)
-- ============================================================

-- ============================================================
-- 00. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 01. ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('user', 'admin', 'section_manager');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.task_category AS ENUM ('daily', 'weekly', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.broadcast_type AS ENUM ('info', 'warning', 'update', 'maintenance');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.round_status AS ENUM ('active', 'ended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 02. DROP EXISTING (clean slate)
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
DROP TRIGGER IF EXISTS set_updated_at_sections ON public.sections;
DROP TRIGGER IF EXISTS set_updated_at_tasks ON public.tasks;
DROP TRIGGER IF EXISTS set_updated_at_rounds ON public.rounds;
DROP TRIGGER IF EXISTS set_updated_at_achievement_tasks ON public.achievement_tasks;
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
DROP TRIGGER IF EXISTS trg_rounds_updated_at ON public.rounds;
DROP TRIGGER IF EXISTS trg_enforce_display_name_change ON public.profiles;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_display_name_change_limit() CASCADE;
DROP FUNCTION IF EXISTS public.get_public_successful_tasks() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_successful_tasks(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_support_admin_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_support_admin_ids() CASCADE;
DROP FUNCTION IF EXISTS public.leave_active_rounds() CASCADE;
DROP FUNCTION IF EXISTS public.get_completed_round_counts() CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.user_role) CASCADE;

DROP VIEW IF EXISTS public.user_stats;

DROP TABLE IF EXISTS public.round_participants CASCADE;
DROP TABLE IF EXISTS public.round_creators CASCADE;
DROP TABLE IF EXISTS public.rounds CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.achievement_tasks CASCADE;
DROP TABLE IF EXISTS public.broadcasts CASCADE;
DROP TABLE IF EXISTS public.sections CASCADE;
DROP TABLE IF EXISTS public.user_bans CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================================
-- 03. PROFILES TABLE
-- ============================================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT,
    avatar_url TEXT DEFAULT '',
    email TEXT,
    role user_role NOT NULL DEFAULT 'user',
    last_username_change TIMESTAMPTZ,
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    managed_section_id UUID,
    display_name_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.profiles IS 'ملفات تعريف المستخدمين - تدعم صلاحيات أدمن ومسؤول قسم';
COMMENT ON COLUMN public.profiles.role IS 'user = مستخدم عادي, admin = أدمن كامل, section_manager = مسؤول عن قسم معين';
COMMENT ON COLUMN public.profiles.managed_section_id IS 'معرف القسم الذي يديره مسؤول القسم (فقط لـ section_manager)';

-- RLS Policies
CREATE POLICY "Anyone can view profiles"
    ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update any profile"
    ON public.profiles FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Section managers can update profiles"
    ON public.profiles FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'section_manager'));

-- ============================================================
-- 04. SECTIONS TABLE (menu links)
-- ============================================================
CREATE TABLE public.sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT,
    icon TEXT DEFAULT '📌',
    category TEXT,
    year TEXT DEFAULT '2009',
    field TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.sections IS 'الأقسام والروابط التي يديرها الأدمن وتظهر في الشريط الجانبي';

CREATE POLICY "Anyone can view active sections"
    ON public.sections FOR SELECT USING (true);

CREATE POLICY "Admins can manage sections"
    ON public.sections FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 05. BROADCASTS TABLE (alert messages)
-- ============================================================
CREATE TABLE public.broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    type broadcast_type NOT NULL DEFAULT 'info',
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.broadcasts IS 'التنبيهات والإشعارات التي تظهر لجميع المستخدمين';

CREATE POLICY "Anyone can view active broadcasts"
    ON public.broadcasts FOR SELECT
    USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE POLICY "Admins can manage broadcasts"
    ON public.broadcasts FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 06. TASKS TABLE (study tasks - used by React app)
-- ============================================================
CREATE TABLE public.tasks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category task_category NOT NULL DEFAULT 'daily',
    duration INTEGER NOT NULL,
    daily_unit TEXT NOT NULL DEFAULT 'minutes',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 day'),
    completed BOOLEAN NOT NULL DEFAULT false,
    is_success BOOLEAN DEFAULT NULL,
    is_stopwatch BOOLEAN NOT NULL DEFAULT false,
    paused_at TIMESTAMPTZ,
    paused_total_ms BIGINT NOT NULL DEFAULT 0,
    heartbeat_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.tasks IS 'المهام الدراسية للمستخدمين - يومي/أسبوعي/شهري';

-- RLS Policies
CREATE POLICY "Users can view own tasks"
    ON public.tasks FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view successful tasks"
    ON public.tasks FOR SELECT
    USING (completed = true AND is_success = true);

CREATE POLICY "Admins and managers can view all tasks"
    ON public.tasks FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'section_manager')));

CREATE POLICY "Users can create own tasks"
    ON public.tasks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks"
    ON public.tasks FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can update all tasks"
    ON public.tasks FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Section managers can update tasks"
    ON public.tasks FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'section_manager'));

CREATE POLICY "Users can delete own tasks"
    ON public.tasks FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete all tasks"
    ON public.tasks FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Section managers can delete tasks"
    ON public.tasks FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'section_manager'));

-- ============================================================
-- 07. MESSAGES TABLE
-- ============================================================
CREATE TABLE public.messages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.messages IS 'الرسائل الخاصة بين المستخدمين والأدمن';

-- RLS Policies
CREATE POLICY "Admins can view all messages"
    ON public.messages FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can view own messages"
    ON public.messages FOR SELECT TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Admins can insert messages"
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can message admins"
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = receiver_id AND role = 'admin')
    );

CREATE POLICY "Users can reply to admins"
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (SELECT 1 FROM public.messages m WHERE m.sender_id = receiver_id AND m.receiver_id = auth.uid())
    );

CREATE POLICY "Receivers can mark messages as read"
    ON public.messages FOR UPDATE TO authenticated
    USING (auth.uid() = receiver_id)
    WITH CHECK (auth.uid() = receiver_id AND is_read = true);

CREATE POLICY "Senders can delete own messages"
    ON public.messages FOR DELETE TO authenticated
    USING (auth.uid() = sender_id);

CREATE POLICY "Admins can delete any message"
    ON public.messages FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 08. STUDY ROUNDS (Pomodoro-style)
-- ============================================================
CREATE TABLE public.rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image_path TEXT,
    total_minutes INTEGER NOT NULL CHECK (total_minutes BETWEEN 1 AND 300),
    work_minutes INTEGER NOT NULL CHECK (work_minutes >= 1),
    break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ NOT NULL,
    status round_status NOT NULL DEFAULT 'active',
    credited BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rounds IS 'جلسات الدراسة المركزة (Pomodoro) - يديرها منشئ الجلسة أو الأدمن';

CREATE POLICY "Anyone can view rounds"
    ON public.rounds FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized users can create rounds"
    ON public.rounds FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = creator_id
    );

CREATE POLICY "Creator or admin can update rounds"
    ON public.rounds FOR UPDATE TO authenticated
    USING (auth.uid() = creator_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (auth.uid() = creator_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Creator or admin can delete rounds"
    ON public.rounds FOR DELETE TO authenticated
    USING (auth.uid() = creator_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 09. ROUND PARTICIPANTS
-- ============================================================
CREATE TABLE public.round_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (round_id, user_id)
);

ALTER TABLE public.round_participants ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.round_participants IS 'المشاركون في جلسات الدراسة';

CREATE POLICY "Anyone can view participants"
    ON public.round_participants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can join as themselves"
    ON public.round_participants FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users or admins can remove participants"
    ON public.round_participants FOR DELETE TO authenticated
    USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 10. ROUND CREATORS (authorized creators beyond admins)
-- ============================================================
CREATE TABLE public.round_creators (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.round_creators ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.round_creators IS 'المستخدمون المخولون بإنشاء جلسات دراسة (بالإضافة للأدمن)';

CREATE POLICY "Anyone can view round creators"
    ON public.round_creators FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage round creators"
    ON public.round_creators FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 11. USER BANS TABLE
-- ============================================================
CREATE TABLE public.user_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    section_id UUID REFERENCES public.sections(id) ON DELETE CASCADE,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_bans IS 'سجل حظر المستخدمين - يمكن أن يكون حظر عام أو خاص بقسم معين';

CREATE POLICY "Admins can manage bans"
    ON public.user_bans FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can view own bans"
    ON public.user_bans FOR SELECT
    USING (user_id = auth.uid());

-- ============================================================
-- 12. INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_managed_section ON public.profiles (managed_section_id) WHERE managed_section_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_banned ON public.profiles (is_banned) WHERE is_banned = true;

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON public.tasks (category);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON public.tasks (completed, is_success);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_user_category ON public.tasks (user_id, category);
CREATE INDEX IF NOT EXISTS idx_tasks_heartbeat ON public.tasks (heartbeat_at) WHERE heartbeat_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON public.messages (receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages (receiver_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages (sender_id, receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rounds_status ON public.rounds (status);
CREATE INDEX IF NOT EXISTS idx_rounds_creator ON public.rounds (creator_id);
CREATE INDEX IF NOT EXISTS idx_rounds_ends_at ON public.rounds (ends_at) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_round_participants_round ON public.round_participants (round_id);
CREATE INDEX IF NOT EXISTS idx_round_participants_user ON public.round_participants (user_id);

CREATE INDEX IF NOT EXISTS idx_broadcasts_active ON public.broadcasts (is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_sections_year_field ON public.sections (year, field);
CREATE INDEX IF NOT EXISTS idx_sections_active ON public.sections (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sections_sort ON public.sections (sort_order, year, field);

CREATE INDEX IF NOT EXISTS idx_user_bans_user ON public.user_bans (user_id);
CREATE INDEX IF NOT EXISTS idx_user_bans_section ON public.user_bans (section_id) WHERE section_id IS NOT NULL;

-- ============================================================
-- 13. TRIGGER FUNCTION: updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ============================================================
-- 14. TRIGGER FUNCTION: enforce display_name change limit
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_display_name_change_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    caller_uuid UUID := auth.uid();
    is_admin_caller BOOLEAN := false;
BEGIN
    IF NEW.username IS DISTINCT FROM OLD.username THEN
        IF caller_uuid IS NOT NULL THEN
            SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = caller_uuid AND role = 'admin') INTO is_admin_caller;
        END IF;
        IF NOT is_admin_caller THEN
            IF OLD.last_username_change IS NOT NULL
               AND OLD.last_username_change > (now() - interval '30 days') THEN
                RAISE EXCEPTION 'display_name_change_too_soon'
                    USING HINT = 'يمكنك تغيير اسمك مرة كل 30 يوماً';
            END IF;
        END IF;
        NEW.last_username_change := now();
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================================
-- 15. TRIGGER: auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.profiles (id, username, avatar_url, role, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
        CASE
            WHEN NEW.email IN ('abdalrhmnmaaith1@gmail.com', 'madrekjo@gmail.com') THEN 'admin'::user_role
            ELSE 'user'::user_role
        END,
        NEW.email
    );
    RETURN NEW;
END;
$$;

-- ============================================================
-- 16. APPLY TRIGGERS
-- ============================================================
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_rounds_updated_at
    BEFORE UPDATE ON public.rounds
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_sections_updated_at
    BEFORE UPDATE ON public.sections
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_enforce_display_name_change
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_display_name_change_limit();

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 17. VIEWS
-- ============================================================

-- User statistics view
CREATE OR REPLACE VIEW public.user_stats AS
SELECT
    COUNT(*) AS total_users,
    COUNT(*) FILTER (WHERE role = 'admin') AS admins,
    COUNT(*) FILTER (WHERE role = 'section_manager') AS section_managers,
    COUNT(*) FILTER (WHERE is_banned) AS banned
FROM public.profiles;

COMMENT ON VIEW public.user_stats IS 'إحصائيات المستخدمين للأدمن';

-- ============================================================
-- 18. FUNCTIONS
-- ============================================================

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role user_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = _user_id AND role = _role
    );
$$;

-- Get admin user IDs (for support)
CREATE OR REPLACE FUNCTION public.get_support_admin_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT id FROM public.profiles WHERE role = 'admin';
$$;

-- Get first admin ID
CREATE OR REPLACE FUNCTION public.get_support_admin_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT id FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;
$$;

-- Safe leaderboard: return successful tasks without exposing titles
CREATE OR REPLACE FUNCTION public.get_public_successful_tasks()
RETURNS TABLE (
    id UUID,
    user_id UUID,
    category task_category,
    duration INTEGER,
    daily_unit TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT t.id, t.user_id, t.category, t.duration, t.daily_unit, t.created_at, t.updated_at
    FROM public.tasks t
    WHERE t.completed = true AND t.is_success = true AND auth.uid() IS NOT NULL;
$$;

-- Per-user analytics
CREATE OR REPLACE FUNCTION public.get_user_successful_tasks(_user_id UUID)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    category task_category,
    duration INTEGER,
    daily_unit TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT t.id, t.user_id, t.category, t.duration, t.daily_unit, t.created_at, t.updated_at
    FROM public.tasks t
    WHERE t.user_id = _user_id AND t.completed = true AND t.is_success = true AND auth.uid() IS NOT NULL;
$$;

-- Leave active rounds (called on page unload)
CREATE OR REPLACE FUNCTION public.leave_active_rounds()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    DELETE FROM public.round_participants p
    USING public.rounds r
    WHERE p.user_id = auth.uid()
        AND p.round_id = r.id
        AND r.status = 'active'
        AND r.ends_at > now();
$$;

-- Get completed round counts per user
CREATE OR REPLACE FUNCTION public.get_completed_round_counts()
RETURNS TABLE (user_id UUID, completed_rounds BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.user_id, COUNT(*)::BIGINT AS completed_rounds
    FROM public.round_participants p
    JOIN public.rounds r ON r.id = p.round_id
    WHERE r.status = 'ended'
    GROUP BY p.user_id;
$$;

-- ============================================================
-- 19. FUNCTION GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_public_successful_tasks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_successful_tasks(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_active_rounds() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_completed_round_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_admin_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_admin_ids() TO authenticated;

-- ============================================================
-- 20. STORAGE BUCKETS
-- ============================================================

-- Avatars bucket (public)
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Support attachments bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('support-attachments', 'support-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Round images bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('round-images', 'round-images', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 21. STORAGE POLICIES
-- ============================================================

-- Avatars
DROP POLICY IF EXISTS "avatars_select" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;

CREATE POLICY "avatars_select" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "avatars_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "avatars_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Support attachments
DROP POLICY IF EXISTS "support_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_delete" ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_admin_all" ON storage.objects;

CREATE POLICY "support_attachments_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'support-attachments'
        AND (auth.uid()::text = (storage.foldername(name))[1]
             OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    );

CREATE POLICY "support_attachments_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'support-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "support_attachments_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'support-attachments'
        AND (auth.uid()::text = (storage.foldername(name))[1]
             OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    );

CREATE POLICY "support_attachments_admin_all" ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'support-attachments' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (bucket_id = 'support-attachments' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Round images
DROP POLICY IF EXISTS "round_images_select" ON storage.objects;
DROP POLICY IF EXISTS "round_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "round_images_update" ON storage.objects;
DROP POLICY IF EXISTS "round_images_delete" ON storage.objects;

CREATE POLICY "round_images_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'round-images');

CREATE POLICY "round_images_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'round-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "round_images_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'round-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "round_images_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'round-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- 22. REALTIME (enable for messages)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ============================================================
-- 23. SEED: Ensure existing users get admin role
-- ============================================================
UPDATE public.profiles
SET role = 'admin'::user_role
WHERE email IN ('abdalrhmnmaaith1@gmail.com', 'madrekjo@gmail.com')
  AND role != 'admin';

-- ============================================================
-- 24. DATA INTEGRITY: sync email column
-- ============================================================
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- ============================================================
-- 25. ANALYTICS VIEWS
-- ============================================================

-- Task completion stats per user
CREATE OR REPLACE VIEW public.user_task_stats AS
SELECT
    p.id AS user_id,
    p.username,
    COUNT(t.id) FILTER (WHERE t.category = 'daily' AND t.completed AND t.is_success) AS daily_done,
    COUNT(t.id) FILTER (WHERE t.category = 'weekly' AND t.completed AND t.is_success) AS weekly_done,
    COUNT(t.id) FILTER (WHERE t.category = 'monthly' AND t.completed AND t.is_success) AS monthly_done,
    COALESCE(SUM(t.duration) FILTER (WHERE t.completed AND t.is_success), 0) AS total_minutes,
    COALESCE(SUM(t.duration) FILTER (WHERE t.completed AND t.is_success AND t.category = 'daily'), 0) AS daily_minutes,
    COALESCE(SUM(t.duration) FILTER (WHERE t.completed AND t.is_success AND t.category = 'weekly'), 0) AS weekly_minutes,
    COALESCE(SUM(t.duration) FILTER (WHERE t.completed AND t.is_success AND t.category = 'monthly'), 0) AS monthly_minutes,
    MAX(t.updated_at) FILTER (WHERE t.completed AND t.is_success) AS last_achievement
FROM public.profiles p
LEFT JOIN public.tasks t ON t.user_id = p.id
GROUP BY p.id, p.username;

COMMENT ON VIEW public.user_task_stats IS 'إحصائيات المهام المنجزة لكل مستخدم';

-- Leaderboard view
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
    p.id AS user_id,
    p.username,
    p.avatar_url,
    COALESCE(SUM(t.duration) FILTER (WHERE t.completed AND t.is_success), 0) AS total_minutes,
    COUNT(t.id) FILTER (WHERE t.completed AND t.is_success) AS tasks_completed,
    RANK() OVER (ORDER BY COALESCE(SUM(t.duration) FILTER (WHERE t.completed AND t.is_success), 0) DESC) AS rank
FROM public.profiles p
JOIN public.tasks t ON t.user_id = p.id
WHERE p.is_banned = false
GROUP BY p.id, p.username, p.avatar_url
HAVING COALESCE(SUM(t.duration) FILTER (WHERE t.completed AND t.is_success), 0) > 0;

COMMENT ON VIEW public.leaderboard IS 'لوحة المتصدرين - ترتيب المستخدمين حسب إجمالي الدقائق';

-- Active users in last 7 days
CREATE OR REPLACE VIEW public.active_users AS
SELECT DISTINCT
    p.id AS user_id,
    p.username,
    p.avatar_url,
    p.role,
    MAX(t.updated_at) AS last_active
FROM public.profiles p
JOIN public.tasks t ON t.user_id = p.id
WHERE t.updated_at > now() - interval '7 days'
GROUP BY p.id, p.username, p.avatar_url, p.role;

COMMENT ON VIEW public.active_users IS 'المستخدمون النشطون آخر 7 أيام';

-- ============================================================
-- 26. MAINTENANCE FUNCTIONS
-- ============================================================

-- Soft-delete old ended rounds (mark as ended)
CREATE OR REPLACE FUNCTION public.auto_end_expired_rounds()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE public.rounds
    SET status = 'ended', updated_at = now()
    WHERE status = 'active' AND ends_at < now();
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;

COMMENT ON FUNCTION public.auto_end_expired_rounds IS 'تنهي تلقائياً جلسات الدراسة المنتهية صلاحيتها';

-- Clean up stale heartbeat tasks (tasks with no heartbeat for 2+ hours)
CREATE OR REPLACE FUNCTION public.cleanup_stale_stopwatch_tasks()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE public.tasks
    SET is_stopwatch = false, heartbeat_at = NULL, paused_at = NULL
    WHERE is_stopwatch = true
        AND heartbeat_at IS NOT NULL
        AND heartbeat_at < now() - interval '2 hours';
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_stopwatch_tasks IS 'تنظيف مهام الإيقاف التي لا نبض لها لأكثر من ساعتين';

-- Ban expired cleanup
CREATE OR REPLACE FUNCTION public.cleanup_expired_bans()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    affected INTEGER;
BEGIN
    DELETE FROM public.user_bans
    WHERE created_at < now() - interval '90 days';
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_bans IS 'حذف سجلات الحظر الأقدم من 90 يوماً';

-- ============================================================
-- 27. GRANTS FOR MAINTENANCE FUNCTIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.auto_end_expired_rounds() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_stopwatch_tasks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_bans() TO authenticated;

-- ============================================================
-- 28. SEED DATA (optional - run once)
-- ============================================================

-- Insert default sections if table is empty
INSERT INTO public.sections (name, url, icon, category, year, field, sort_order, is_active)
SELECT * FROM (VALUES
    ('الدردشة الدراسية', '../chat.html', '💬', '⚙️ خدمات عامة', '2009', NULL, 1, true),
    ('الإنجاز', '../achievement/', '🏆', '⚙️ خدمات عامة', '2009', NULL, 2, true),
    ('أنا مجهول', 'https://anonymous-confessions-space.lovable.app', '🕵️', '⚙️ خدمات عامة', '2009', NULL, 3, true),
    ('تلاوات', 'https://spiritual-boost.lovable.app/recitations', '📖', '⚙️ خدمات عامة', '2009', NULL, 4, true),
    ('أجر وثواب', 'https://spiritual-boost.lovable.app', '🌙', '⚙️ خدمات عامة', '2009', NULL, 5, true),
    ('مشاركة ملفات', 'https://unified-login-pal.lovable.app', '📁', '⚙️ خدمات عامة', '2009', NULL, 6, true),
    ('نموذج الاقتراحات', 'https://docs.google.com/forms/d/e/1FAIpQLSeOP7ow84vcJ-q8tm4YlHsKMCuGdoL-E5OCJw6C66PDrbMpWw/viewform', '💡', '📬 تواصل', '2009', NULL, 7, true),
    ('الدردشة الدراسية', '../chat.html', '💬', '⚙️ خدمات عامة', '2010', NULL, 1, true),
    ('الإنجاز', '../achievement/', '🏆', '⚙️ خدمات عامة', '2010', NULL, 2, true),
    ('أنا مجهول', 'https://anonymous-confessions-space.lovable.app', '🕵️', '⚙️ خدمات عامة', '2010', NULL, 3, true),
    ('تلاوات', 'https://spiritual-boost.lovable.app/recitations', '📖', '⚙️ خدمات عامة', '2010', NULL, 4, true),
    ('أجر وثواب', 'https://spiritual-boost.lovable.app', '🌙', '⚙️ خدمات عامة', '2010', NULL, 5, true),
    ('مشاركة ملفات', 'https://unified-login-pal.lovable.app', '📁', '⚙️ خدمات عامة', '2010', NULL, 6, true)
) AS v(name, url, icon, category, year, field, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.sections LIMIT 1);

-- ============================================================
-- 29. COMPREHENSIVE RLS ENFORCEMENT (profiles)
-- ============================================================

-- Ensure banned users cannot login/access
CREATE OR REPLACE FUNCTION public.check_user_not_banned()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_banned = true) THEN
        RAISE EXCEPTION 'user_is_banned' USING HINT = 'حسابك محظور. تواصل مع الإدارة.';
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================================
-- 30. GRANTS FOR TABLES
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.sections TO authenticated;
GRANT SELECT ON public.broadcasts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT SELECT ON public.messages TO authenticated;
GRANT SELECT ON public.rounds TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.round_participants TO authenticated;
GRANT SELECT ON public.round_creators TO authenticated;
GRANT SELECT ON public.user_bans TO authenticated;
GRANT SELECT ON public.user_stats TO authenticated;
GRANT SELECT ON public.user_task_stats TO authenticated;
GRANT SELECT ON public.leaderboard TO authenticated;
GRANT SELECT ON public.active_users TO authenticated;

-- ============================================================
-- END OF DATABASE SCHEMA — مدارك جو
-- ============================================================
