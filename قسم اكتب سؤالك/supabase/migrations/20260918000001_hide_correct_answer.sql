-- ============================================================
-- إخفاء الإجابة الصحيحة عن القرّاء — «اكتب سؤالك»
-- 2026-09-18
-- الإجابة الصحيحة كانت تُرسل مع كل سؤال لأي زائر (correct). بعد هذه
-- المهاجرة:
--   · لا يُرسل العمود correct في أي استعلام عام أبداً.
--   · عند الإجابة يُفحص صحتها حصراً عبر submit_answer في الخادم،
--     وَيُعاد للحاصل على الإجابة فقط (مفتاحها).
-- التشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ (إعادة تشغيله آمنة)
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_answer(
  p_question_id uuid,
  p_chosen text,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE(correct boolean, correct_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_correct_key text;
  v_attempts integer;
  v_previous_chosen text;
  v_now timestamptz := now();
BEGIN
  SELECT q.correct::text INTO v_correct_key
  FROM public.questions q
  WHERE q.id = p_question_id;

  IF v_correct_key IS NULL THEN
    -- سؤال غير موجود (أو محذوف) — لا نكشف شيئاً
    RETURN QUERY SELECT false, NULL::text;
    RETURN;
  END IF;

  IF p_chosen NOT IN ('أ', 'ب', 'ج', 'د') THEN
    RETURN QUERY SELECT false, v_correct_key;
    RETURN;
  END IF;

  -- تسجيل المحاولة (نفس سلوك recordAttempt القديم — الآن من داخل الخادم)
  -- لا يُميّز "المُجيب" سوى صاحب الحساب؛ من دون حساب تُسجَّل محاولة مجهولة
  -- حسب الجلسة نفسها (بدون معرف، تُتجاهل حتى لا تُرصد المفاتيح).
  IF p_user_id IS NOT NULL THEN
    SELECT aa.attempts, aa.chosen INTO v_attempts, v_previous_chosen
    FROM public.answer_attempts aa
    WHERE aa.user_id = p_user_id AND aa.question_id = p_question_id;

    IF v_attempts IS NULL THEN
      INSERT INTO public.answer_attempts
        (user_id, question_id, chosen, correct, attempts, updated_at)
      VALUES (p_user_id, p_question_id, p_chosen, p_chosen = v_correct_key, 1, v_now);
    ELSE
      UPDATE public.answer_attempts
      SET chosen = p_chosen,
          correct = (p_chosen = v_correct_key),
          attempts = v_attempts + 1,
          updated_at = v_now
      WHERE user_id = p_user_id AND question_id = p_question_id;
    END IF;
  END IF;

  RETURN QUERY SELECT (p_chosen = v_correct_key), v_correct_key;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_answer(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_answer(uuid, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_answer(uuid, text, uuid) TO authenticated;