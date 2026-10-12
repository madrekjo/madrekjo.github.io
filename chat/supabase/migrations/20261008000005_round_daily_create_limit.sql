-- ============================================================================
-- 20261008000005 — حدّ إنشاء الجولات اليومي (جولة واحدة لكل مستخدم يومياً)
--
-- يُنفَّذ يدوياً من: Dashboard → SQL Editor (مشروع hvrtzzouasqseyswjcex)
--
-- القواعد المتفق عليها:
--   • كل مستخدم ينشئ جولة واحدة فقط في اليوم.
--   • «اليوم» = من 3:00 فجراً بتوقيت عمّان حتى 3:00 فجراً التالية
--     (نفس حدّ تجديد المنصة اليومي).
--   • admin و rounds_manager و owner مستثنون (وظيفتهم إنشاء الجولات).
--   • الحدّ ثابت ولا يُلتف عليه بحذف الجولة — لذلك نُسجّل كل إنشاء في
--     جدول دائم (round_creation_log) لا يتأثر بحذف الجولة.
--   • يبقى القيد القديم: لا جولة pending/active إلا واحدة لكل مستخدم.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) سجل الإنشاءات الدائم
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.round_creation_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round_id   uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_round_creation_log_user_created
  ON public.round_creation_log (user_id, created_at DESC);

-- لا وصول من العميل: الجدول يُكتب/يُقرأ فقط عبر دوال SECURITY DEFINER.
ALTER TABLE public.round_creation_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.round_creation_log FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) تعبئة أولية من الجولات الحالية (مرة واحدة فقط — لا تتكرر عند إعادة التنفيذ)
-- ----------------------------------------------------------------------------
INSERT INTO public.round_creation_log (user_id, round_id, created_at)
SELECT r.user_id, r.id, r.created_at
  FROM public.study_rounds r
 WHERE NOT EXISTS (SELECT 1 FROM public.round_creation_log LIMIT 1);

-- ----------------------------------------------------------------------------
-- 3) القيد: الحدّ اليومي + القيد القديم (جولة نشطة/معلّقة واحدة)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_round_create_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- بداية «اليوم» = أحدث الساعة 3:00 فجراً مرّت (بتوقيت عمّان)
  v_day_start timestamptz;
BEGIN
  -- موظفو الجولات مستثنون
  IF public.has_role(NEW.user_id, 'admin'::app_role)
     OR public.has_role(NEW.user_id, 'rounds_manager'::app_role)
     OR public.has_role(NEW.user_id, 'owner'::app_role) THEN
    RETURN NEW;
  END IF;

  -- تسلسل الإدخال لنفس المستخدم (يمنع سباق الإدخال المتزامن)
  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text));

  v_day_start := (date_trunc('day', (now() AT TIME ZONE 'Asia/Amman') - INTERVAL '3 hours')
                  + INTERVAL '3 hours') AT TIME ZONE 'Asia/Amman';

  -- الحدّ اليومي: جولة واحدة فقط منذ بداية اليوم
  IF EXISTS (
    SELECT 1
      FROM public.round_creation_log l
     WHERE l.user_id = NEW.user_id
       AND l.created_at >= v_day_start
  ) THEN
    RAISE EXCEPTION 'round_daily_limit_reached'
      USING HINT = 'يمكنك إنشاء جولة واحدة يومياً — جرّب مجدداً بعد الساعة 3:00 فجراً';
  END IF;

  -- القيد القديم: لا جولة pending/active إلا واحدة في الوقت نفسه
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
-- 4) تسجيل كل إنشاء جديد في السجل الدائم (لا يُمسح عند حذف الجولة)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_round_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.round_creation_log (user_id, round_id, created_at)
  VALUES (NEW.user_id, NEW.id, NEW.created_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_round_creation ON public.study_rounds;
CREATE TRIGGER trg_log_round_creation
  AFTER INSERT ON public.study_rounds
  FOR EACH ROW EXECUTE FUNCTION public.log_round_creation();

-- ============================================================================
-- استعلامات التحقق (بعد التنفيذ):
--
--   -- كم جولة أنشأ كل مستخدم اليوم (منذ 3:00 فجراً)؟
--   SELECT user_id, count(*) FROM public.round_creation_log
--    WHERE created_at >= (date_trunc('day',(now() AT TIME ZONE 'Asia/Amman') - interval '3 hours') + interval '3 hours') AT TIME ZONE 'Asia/Amman'
--    GROUP BY user_id ORDER BY count(*) DESC;
--
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.study_rounds'::regclass
--      AND tgname IN ('trg_round_create_limit','trg_log_round_creation');
--   -- متوقّع: سطرين
-- ============================================================================
