-- ============================================================================
-- ★ الحد الأقصى للجولات النشطة في وقت واحد: 3 جولات ★
-- + إعادة الحد الأقصى لمدة الجولة إلى 4 ساعات (240 دقيقة)
-- التاريخ: 2026-10-22
-- التنفيذ: Supabase Dashboard -> SQL Editor -> New Query -> Run
--
-- المنطق:
--   - لا يمكن إنشاء جولة جديدة (ولو معلّقة pending) إذا كان هناك 3 جولات
--     نشطة (status = 'active') على المنصة كلها — حتى تنتهي إحداها.
--   - ولا يمكن بدء جولة (pending -> active) إذا كان عدد النشطات 3.
--   - قفل استشاري (advisory lock) يمنع طلبين متزامنين من تجاوز الحد.
--
-- رسالة الخطأ النصية: too_many_active_rounds — الواجهة تعرضها بالعربية.
-- (أُلغي حد 3 ساعات السابق؛ المدة القصوى 240 دقيقة كما كانت.)
--
-- آمن لإعادة التشغيل.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (1) مدة الجولة: 5..240 دقيقة
--     نستخدم trigger لا CHECK: القيد CHECK يمنع أي UPDATE على جولة قديمة
--     مدتها > 240 (مثل إنهاء/حسم جولة)، بينما الـtrigger يسمح بتعديل بقية
--     الحقول ما دامت المدة نفسها لم تتغيّر.
-- ---------------------------------------------------------------------------
ALTER TABLE public.study_rounds
  DROP CONSTRAINT IF EXISTS study_rounds_duration_check;

DROP TRIGGER IF EXISTS trg_round_duration_cap ON public.study_rounds;

CREATE OR REPLACE FUNCTION public.enforce_round_duration_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.duration_minutes IS NULL THEN
    RETURN NEW;
  END IF;

  -- تعديل بقية الحقول على جولة قديمة بمدة خارج الحد: مسموح (المدة لم تتغيّر).
  IF TG_OP = 'UPDATE'
     AND NEW.duration_minutes IS NOT DISTINCT FROM OLD.duration_minutes THEN
    RETURN NEW;
  END IF;

  IF NEW.duration_minutes < 5 OR NEW.duration_minutes > 240 THEN
    RAISE EXCEPTION 'round_duration_out_of_range'
      USING HINT = 'مدة الجولة يجب أن تكون بين 5 و240 دقيقة (4 ساعات)';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_round_duration_cap
  BEFORE INSERT OR UPDATE ON public.study_rounds
  FOR EACH ROW EXECUTE FUNCTION public.enforce_round_duration_cap();

-- ---------------------------------------------------------------------------
-- (2) حد الجولات النشطة
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_active_rounds_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active integer;
BEGIN
  IF (
       TG_OP = 'INSERT'
       AND NEW.status IN ('pending', 'active')
     )
     OR (
       TG_OP = 'UPDATE'
       AND NEW.status = 'active'
       AND OLD.status IS DISTINCT FROM 'active'
     )
  THEN
    -- يمنع التزامن: طلبان في نفس اللحظة لا يستطيعان تجاوز الحد.
    PERFORM pg_advisory_xact_lock(hashtext('study_rounds_active_cap'));

    SELECT count(*) INTO v_active
    FROM public.study_rounds
    WHERE status = 'active'
      AND id <> NEW.id
      -- الجولة المنتهي وقتها لا تُحتسب «نشطة» (حتى لو لم تُحسَم بعد)،
      -- فتتحرر السعة تلقائياً بمجرد انتهاء زمنها.
      AND coalesce(scheduled_end_at, 'infinity') > now();

    IF v_active >= 3 THEN
      RAISE EXCEPTION 'too_many_active_rounds'
        USING HINT = 'توجد 3 جولات نشطة الآن — انتظر انتهاء إحداها ثم أنشئ جولتك';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_active_rounds_cap ON public.study_rounds;
CREATE TRIGGER trg_active_rounds_cap
  BEFORE INSERT OR UPDATE ON public.study_rounds
  FOR EACH ROW EXECUTE FUNCTION public.enforce_active_rounds_cap();
