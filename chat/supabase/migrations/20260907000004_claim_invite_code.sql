-- ============================================================================
-- تفعيل رمز الدعوة بعد تسجيل الدخول (المستخدم يسجّل دخوله أولاً ثم يحط الكود)
--   claim_invite_code(): للمستخدم المسجّل الدخول أن يربط حسابه بكود دعوة صديق،
--   عندها يُستنزف استخدام واحد من الكود وتصل مكافأة +25 للداعي فوراً (لأنه
--   فعلياً دخل وعمل في الشات وقدّم الكود).
-- يتطلب تشغيل 20260907000003 أولاً (create_my_invite_code + reward_inviter).
-- يُشغَّل عبر SQL Editor ولا يُشغل تلقائياً.
-- ============================================================================
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
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'login_required';
  END IF;

  -- 1) لا إعادة تفعيل: مستخدم مرتبط بدعوة مسبقاً لا يستطيع فعلها مرة أخرى
  SELECT * INTO v_prof FROM public.profiles WHERE user_id = v_user;
  IF FOUND AND ((v_prof.via_invite IS TRUE) OR v_prof.invited_code IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  -- 2) جلب الكود بقفل صف (استهلاك ذرّي)
  SELECT * INTO v_row FROM public.access_codes
  WHERE code = lpad(p_code, 6, '0')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_row.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF v_row.used_count >= v_row.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'used_up');
  END IF;

  -- 3) منع المكافأة الذاتية (المستخدم يستخدم كوده هو)
  IF v_row.created_by = v_user THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_claim');
  END IF;

  -- 4) استهلاك استخدام + ربط الدعوة بالحساب
  UPDATE public.access_codes SET used_count = used_count + 1 WHERE id = v_row.id;
  UPDATE public.profiles
  SET via_invite = true, invited_code = v_row.code
  WHERE user_id = v_user;

  -- 5) مكافأة الداعي +25 (فوراً — المستخدم دخل فعلياً وقدّم الكود)
  BEGIN
    PERFORM public.reward_inviter(v_row.code);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- لا نكسر التفعيل إن فشلت المكافأة
  END;

  RETURN jsonb_build_object('ok', true, 'inviter_id', v_row.created_by);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invite_code(p_code TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_invite_code(p_code TEXT) TO authenticated;