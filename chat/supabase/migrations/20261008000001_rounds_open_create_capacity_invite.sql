-- ============================================================================
-- 20261008000001 — الجولات: إنشاء للجميع + سعة + صورة + دعوة + تسوية تلقائية
--
-- يُنفَّذ يدوياً من: Dashboard → SQL Editor (مشروع hvrtzzouasqseyswjcex)
--
-- ماذا يغيّر:
--   1) study_rounds: عمودا capacity (السعة) و cover_image_url (صورة الغلاف)
--   2) أي مستخدم مسجّل ينشئ جولته (كان admin/مسؤول جولات فقط)
--   3) سقف الإنشاء: لا جولة جديدة ما دامت لديك pending/active
--   4) السعة تُفرض في القاعدة (trigger) — يمنع تجاوزها عند الإدخال المتزامن
--   5) صورة الغلاف من Cloudinary حساب iahnnsgu فقط
--   6) notifications.round_id + نوع إشعار round_invite (دعوة لجولة)
--   7) cron: تسوية تلقائية كل دقيقة للجولات المنتهية (يُنهي أي استطلاع)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) أعمدة جديدة
-- ----------------------------------------------------------------------------
ALTER TABLE public.study_rounds
  ADD COLUMN IF NOT EXISTS capacity INTEGER
    CHECK (capacity IS NULL OR capacity > 0),
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

COMMENT ON COLUMN public.study_rounds.capacity IS
  'سعة الجولة (عدد المنضمين). NULL = بلا حد (كل الجولات القديمة).';
COMMENT ON COLUMN public.study_rounds.cover_image_url IS
  'صورة غلاف الجولة — من Cloudinary فقط (يفرضها trg_round_cover_image).';

-- ----------------------------------------------------------------------------
-- 2) أي مستخدم ينشئ جولته (بديل سياسة المسؤولين only)
--    يبقى enforce_rounds_lock (قفل القسم الإداري) ساريًا — الأدمن يتجاوزه.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Rounds managers/admins create rounds" ON public.study_rounds;

CREATE POLICY "Users create their own rounds" ON public.study_rounds
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3) سقف الإنشاء: مستخدم عادي = جولة واحدة pending/active في كل مرة.
--    الهروب: حذف جولته، أو انتهاء/تسويتها، أو منظّف الجولات القديمة (10 أيام).
--    admin و rounds_manager مستثنون (وظيفتهم إنشاء الجولات).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_round_create_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(NEW.user_id, 'admin'::app_role)
     OR public.has_role(NEW.user_id, 'rounds_manager'::app_role) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.study_rounds r
     WHERE r.user_id = NEW.user_id
       AND r.status IN ('pending', 'active')
  ) THEN
    RAISE EXCEPTION 'round_limit_reached'
      USING HINT = 'انتظر انتهاء جولتك الحالية أو احذفها أولاً';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_round_create_limit ON public.study_rounds;
CREATE TRIGGER trg_round_create_limit
  BEFORE INSERT ON public.study_rounds
  FOR EACH ROW EXECUTE FUNCTION public.enforce_round_create_limit();

-- ----------------------------------------------------------------------------
-- 4) السعة: يُرفض الانضمام إذا بلغ عدد المنضمين capacity.
--    قفل صف الجولة (FOR UPDATE) يمنع سباق الإدخال المتزامن (SLOP).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_round_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap   integer;
  v_count integer;
BEGIN
  SELECT capacity
    INTO v_cap
    FROM public.study_rounds
   WHERE id = NEW.round_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW; -- الجولة اختفت تزامنياً — نترك FK يقرر
  END IF;

  IF v_cap IS NOT NULL THEN
    SELECT count(*)
      INTO v_count
      FROM public.round_participants
     WHERE round_id = NEW.round_id;

    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'round_full'
        USING HINT = 'الجولة ممتلئة';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_round_capacity ON public.round_participants;
CREATE TRIGGER trg_round_capacity
  BEFORE INSERT ON public.round_participants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_round_capacity();

-- ----------------------------------------------------------------------------
-- 4ب) join_round(): يعيد 'full' بدل 'error' عند امتلاء السعة
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_round(p_round_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM round_participants
     WHERE round_id = p_round_id AND user_id = p_user_id
  ) THEN
    RETURN 'already_joined';
  END IF;

  INSERT INTO round_participants (round_id, user_id, joined_at)
  VALUES (p_round_id, p_user_id, now());
  RETURN 'joined';

EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%round_full%' THEN
    RETURN 'full';
  END IF;
  RETURN 'error';
WHEN OTHERS THEN
  RETURN 'error';
END;
$$;

-- ----------------------------------------------------------------------------
-- 5) قفل صورة الغلاف: Cloudinary حسابنا فقط (يمنع رفع روابط خارجية/تتبّع)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_round_cover_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cover_image_url IS NOT NULL
     AND NEW.cover_image_url !~ '^https://res\.cloudinary\.com/iahnnsgu/' THEN
    RAISE EXCEPTION 'invalid_cover_image_url'
      USING HINT = 'الصورة يجب أن تكون من Cloudinary';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_round_cover_image ON public.study_rounds;
CREATE TRIGGER trg_round_cover_image
  BEFORE INSERT OR UPDATE ON public.study_rounds
  FOR EACH ROW EXECUTE FUNCTION public.enforce_round_cover_image();

-- ----------------------------------------------------------------------------
-- 6) إشعار الدعوة لجولة
--    6أ) عمود round_id على notifications
--    6ب) دالة عدّ (SECURITY DEFINER) — عدّ الإشعارات يرى صفوف الآخرين
--        رغم RLS SELECT الخاص بـnotifications
--    6ج) استبدال سياسة الإدراج بإضافة فرع round_invite:
--        - المُرسِل = مالك الجولة فقط
--        - حدّ 100 دعوة/اليوم لكل مُرسِل
-- ----------------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS round_id UUID
    REFERENCES public.study_rounds(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_round_id
  ON public.notifications (round_id)
  WHERE round_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.round_invites_today(p_actor uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
    FROM public.notifications
   WHERE type = 'round_invite'
     AND actor_id = p_actor
     AND created_at > now() - interval '1 day';
$$;

GRANT EXECUTE ON FUNCTION public.round_invites_today(uuid) TO authenticated;

DROP POLICY IF EXISTS "Valid notifications only" ON public.notifications;

CREATE POLICY "Valid notifications only" ON public.notifications
  FOR INSERT TO authenticated
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
      OR (post_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.posts p
             WHERE p.id = notifications.post_id
               AND p.user_id = notifications.user_id))
      OR (comment_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.comments c
             WHERE c.id = notifications.comment_id
               AND c.user_id = notifications.user_id))
      OR (
        type = 'round_invite'
        AND round_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.study_rounds sr
           WHERE sr.id = notifications.round_id
             AND sr.user_id = auth.uid()
        )
        AND public.round_invites_today(auth.uid()) <= 100
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 7) التسوية التلقائية: كل دقيقة تُحسم الجولات النشطة منتهية الوقت.
--    round_settle_internal(id, NULL, true) — p_system=true يتجاوز فحص الملكية،
--    والدالة نفسها تضبط app.round_internal فلا يعترضها guard_round_timing.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_settle_due_rounds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r record;
  v_n integer := 0;
BEGIN
  FOR v_r IN
    SELECT id
      FROM public.study_rounds
     WHERE status = 'active'
       AND scheduled_end_at IS NOT NULL
       AND scheduled_end_at <= now()
       AND NOT settled
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.round_settle_internal(v_r.id, NULL, true);
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-settle-rounds') THEN
      PERFORM cron.unschedule('auto-settle-rounds');
    END IF;
    PERFORM cron.schedule(
      'auto-settle-rounds',
      '* * * * *',
      $cron$ SELECT public.auto_settle_due_rounds(); $cron$
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'تعذر جدولة auto-settle-rounds: % — الجولات تحتاج إنهاءً يدوياً', SQLERRM;
  END;
END $$;

-- ============================================================================
-- استعلامات التحقق (بعد التنفيذ):
--
--   SELECT polname FROM pg_policies
--    WHERE tablename = 'study_rounds' AND cmd = 'INSERT';
--   -- متوقّع: Users create their own rounds
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'study_rounds'
--      AND column_name IN ('capacity', 'cover_image_url');
--   -- متوقّع: سطرين
--
--   SELECT count(*) FROM cron.job WHERE jobname = 'auto-settle-rounds';
--   -- متوقّع: 1
--
--   -- الجولة النشطة القديمة يجب أن تُحسم خلال دقيقة:
--   SELECT id, status, settled FROM study_rounds
--    WHERE status = 'active' ORDER BY starts_at DESC;
--   -- متوقّع: لا صفوف (أو صف settled=true)
-- ============================================================================
