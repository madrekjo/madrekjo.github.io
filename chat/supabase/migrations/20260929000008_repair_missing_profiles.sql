-- ============================================================================
-- إصلاح الحسابات الي ما عندها صف في public.profiles
-- ---------------------------------------------------------------------------
-- السبب: حسابات أُنشئت بطريقة تجاوزت trigger handle_new_user، فصار لها صف في
--        auth.users بدون صف في profiles. يترتب عليها:
--          1) الاسم يظهر «مستخدم» (fallback الواجهة).
--          2) ما بيقدر يغيّر الاسم/الصورة/الجنس (UPDATE يطابق 0 صفوف بلا خطأ).
--          3) ما بيقدر يعلّق/ينشر — لأن posts/comments/suggestions فيها
--             FOREIGN KEY (user_id) REFERENCES public.profiles(user_id).
--          4) اللايك شغّال لأن reactions ما إلها FK على profiles.
--
-- هذا الملف self-contained: يصلح الموجود + يمنع تكرار العطل.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) استعادة كل حساب ناقص صف بروفايل، بالاسم المُخزَّن في metadata
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (
  user_id, full_name, avatar_url, gender, generation, via_invite, invited_code
)
SELECT
  u.id,
  COALESCE(
    NULLIF(btrim(COALESCE(m->>'full_name', '')), ''),
    NULLIF(btrim(COALESCE(m->>'name',      '')), ''),
    NULLIF(btrim(COALESCE(m->>'user_name', '')), ''),
    NULLIF(btrim(split_part(COALESCE(u.email, ''), '@', 1)), ''),
    'مستخدم'
  ),
  NULLIF(btrim(COALESCE(m->>'avatar_url', '')), ''),
  CASE WHEN m->>'gender'     IN ('male', 'female')          THEN m->>'gender'      ELSE NULL END,
  CASE WHEN m->>'generation' IN ('09', '10')                THEN m->>'generation'  ELSE NULL END,
  CASE WHEN lower(COALESCE(m->>'via_invite', '')) IN ('true', 't', '1', 'yes')
       THEN true ELSE false END,
  NULLIF(btrim(COALESCE(m->>'invited_code', '')), '')
FROM auth.users u
CROSS JOIN LATERAL (SELECT COALESCE(u.raw_user_meta_data, '{}'::jsonb) AS m) mm
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) تقرير سريع بعد الإصلاح (يجب أن يُرجع 0)
-- ---------------------------------------------------------------------------
-- SELECT count(*) AS still_missing
-- FROM auth.users u
-- LEFT JOIN public.profiles p ON p.user_id = u.id
-- WHERE p.user_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3) شبكة أمان: ensure_my_profile() تنشئ الصف الناقص عند أول دخول
--    (تُستدعى من الواجهة مرة واحدة إذا رجع maybeSingle() بلا بيانات)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_meta       jsonb := '{}'::jsonb;
  v_email      text;
  v_row        public.profiles;
  v_name       text;
  v_avatar     text;
  v_gender     text;
  v_generation text;
  v_via_invite boolean := false;
  v_invited    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  -- موجود مسبقاً: لا نفعل شيئاً
  SELECT * INTO v_row FROM public.profiles WHERE user_id = v_uid;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT COALESCE(u.raw_user_meta_data, '{}'::jsonb), u.email
    INTO v_meta, v_email
    FROM auth.users u
   WHERE u.id = v_uid;

  v_name := COALESCE(
    NULLIF(btrim(COALESCE(v_meta->>'full_name', '')), ''),
    NULLIF(btrim(COALESCE(v_meta->>'name',      '')), ''),
    NULLIF(btrim(COALESCE(v_meta->>'user_name', '')), ''),
    NULLIF(btrim(split_part(COALESCE(v_email, ''), '@', 1)), ''),
    'مستخدم'
  );
  v_avatar     := NULLIF(btrim(COALESCE(v_meta->>'avatar_url', '')), '');
  v_gender     := CASE WHEN v_meta->>'gender'     IN ('male', 'female') THEN v_meta->>'gender'     ELSE NULL END;
  v_generation := CASE WHEN v_meta->>'generation' IN ('09', '10')       THEN v_meta->>'generation' ELSE NULL END;
  v_via_invite := lower(COALESCE(v_meta->>'via_invite', '')) IN ('true', 't', '1', 'yes');
  v_invited    := NULLIF(btrim(COALESCE(v_meta->>'invited_code', '')), '');

  INSERT INTO public.profiles (
    user_id, full_name, avatar_url, gender, generation, via_invite, invited_code
  )
  VALUES (
    v_uid, v_name, v_avatar, v_gender, v_generation, v_via_invite, v_invited
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.profiles WHERE user_id = v_uid;
  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;
