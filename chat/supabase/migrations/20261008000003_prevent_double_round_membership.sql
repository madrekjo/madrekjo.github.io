-- ============================================================================
-- 20261008000003 — جولة واحدة نشطة في الوقت نفسه (منع تعدد الجولات)
--
-- يُنفَّذ يدوياً من: Dashboard → SQL Editor (مشروع hvrtzzouasqseyswjcex)
--
-- المشكلة: كان بإمكان المستخدم الانضمام لجولتين نشطتين في نفس الوقت، فيُحتسب
--          وقته في كلتيهما ⇒ نقاط مضاعفة لنفس الدقيقة.
--
-- الحل: منع الانضمام (round_participants) ما دام للمستخدم جولة أخرى بحالة
--       pending/active — سواء كان مالكاً لها أو مشاركاً فيها. الجولات المنجزة
--       (completed) لا تحجب. هذا مطابق لسقف الإنشاء في 20261008000001.
--
-- ملاحظة: العميل (joinAndEnter) يفحص مسبقاً لإظهار رسالة واضحة، وهذا الـtrigger
--         هو الحاكم النهائي ضد أي مسار آخر (RPC, تبويبات متعددة، طلبات متزامنة).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_single_active_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.study_rounds r
     WHERE r.status IN ('pending', 'active')
       AND r.id <> NEW.round_id
       AND (
         r.user_id = NEW.user_id
         OR EXISTS (
           SELECT 1 FROM public.round_participants rp
            WHERE rp.round_id = r.id
              AND rp.user_id = NEW.user_id
         )
       )
  ) THEN
    RAISE EXCEPTION 'already_in_round'
      USING HINT = 'أنت منضم لجولة أخرى نشطة — اخرج منها أولاً';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_active_membership ON public.round_participants;
CREATE TRIGGER trg_single_active_membership
  BEFORE INSERT ON public.round_participants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_active_membership();

-- ----------------------------------------------------------------------------
-- join_round(): يميّز رفض التعدد 'busy' عن امتلاء السعة 'full'
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
  IF SQLERRM LIKE '%already_in_round%' THEN
    RETURN 'busy';
  END IF;
  RETURN 'error';
WHEN OTHERS THEN
  RETURN 'error';
END;
$$;

-- ============================================================================
-- استعلامات التحقق (بعد التنفيذ):
--
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.round_participants'::regclass AND NOT tgisinternal;
--   -- متوقّع: trg_round_capacity + trg_single_active_membership
-- ============================================================================
