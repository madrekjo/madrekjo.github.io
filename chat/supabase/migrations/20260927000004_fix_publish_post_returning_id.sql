-- ============================================================
-- 20260927000004_fix_publish_post_returning_id.sql
-- إصلاح: "column reference \"id\" is ambiguous" عند النشر على الجميع.
-- السبب: RETURNING id اصطدام مع معامل الخرج id في RETURNS TABLE(...).
-- الحل: توليد البطاقة gen_random_uuid() مسبقاً وتمريرها في الإدخال،
-- بلا RETURNING.
-- آمن إعادة التشغيل.
-- ============================================================

CREATE OR REPLACE FUNCTION public.publish_post(
  p_content text,
  p_channel text,
  p_image_url text DEFAULT NULL,
  p_image_urls text[] DEFAULT NULL,
  p_video_url text DEFAULT NULL
)
RETURNS TABLE(id uuid, status text, error_message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_staff boolean := false;
  v_needs_review boolean := false;
  v_locked boolean := false;
  v_cost integer := 5;
  v_spend record;
  v_content text;
  v_channel text;
  v_post_id uuid := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'يجب تسجيل الدخول'::text; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = v_uid
             AND (p.chat_banned = true OR p.is_banned = true)) THEN
    RETURN QUERY SELECT NULL, NULL, 'لا يمكنك النشر — حسابك محظور'::text; RETURN;
  END IF;

  v_content := left(btrim(coalesce(nullif(p_content, ''), '')), 2000);
  IF char_length(v_content) < 1 THEN
    RETURN QUERY SELECT NULL, NULL, 'اكتب نص المنشور أولاً'::text; RETURN;
  END IF;

  v_channel := coalesce(nullif(btrim(coalesce(p_channel, '')), ''), 'all');
  IF v_channel NOT IN ('all', 'male', 'female', '09', '10') THEN
    RETURN QUERY SELECT NULL, NULL, 'قناة غير معروفة'::text; RETURN;
  END IF;

  IF public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'moderator')
     OR public.has_role(v_uid, 'supervisor') THEN
    v_staff := true;
  ELSE
    IF v_channel = 'all' THEN v_needs_review := true; END IF;
    SELECT (EXISTS (SELECT 1 FROM public.channel_settings cs WHERE cs.channel = v_channel AND cs.enabled = false)
            OR EXISTS (SELECT 1 FROM public.section_locks sl
                       WHERE sl.section = CASE v_channel WHEN 'all' THEN 'chat_all'
                                                     WHEN '09' THEN 'chat_09'
                                                     WHEN '10' THEN 'chat_10' ELSE '' END
                         AND sl.locked = true
                         AND (sl.locked_until IS NULL OR sl.locked_until > now())))
    INTO v_locked;
    IF v_locked THEN
      RETURN QUERY SELECT NULL, NULL, 'هذه القناة مقفلة حالياً من قبل الإدارة — لا يمكن النشر فيها'::text; RETURN;
    END IF;
  END IF;

  IF NOT v_staff THEN
    IF position('[user:everyone]' in v_content) > 0 THEN v_cost := 10; END IF;
    SELECT * INTO v_spend FROM public.spend_points(v_cost, 'post', 'chat',
      jsonb_build_object('content_prefix', left(v_content, 60)));
    IF NOT v_spend.success THEN
      RETURN QUERY SELECT NULL, NULL, coalesce(v_spend.error_message, 'لا نقاط كافية')::text; RETURN;
    END IF;
  END IF;

  INSERT INTO public.posts (id, user_id, content, image_url, image_urls, video_url, channel, status)
  VALUES (v_post_id, v_uid, v_content,
          NULLIF(left(coalesce(p_image_url, ''), 500), ''),
          CASE WHEN coalesce(array_length(p_image_urls, 1), 0) > 0 THEN p_image_urls ELSE NULL END,
          NULLIF(left(coalesce(p_video_url, ''), 500), ''),
          v_channel,
          CASE WHEN v_needs_review THEN 'pending' ELSE 'approved' END);

  RETURN QUERY SELECT v_post_id, CASE WHEN v_needs_review THEN 'pending' ELSE 'approved' END, NULL::text;
END;
$$;