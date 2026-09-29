-- ============================================================================
-- الجولة بالوقت: تدخل الجولة = تبدأ النقاط، وتستمر تلقائياً بلا نبض
-- ---------------------------------------------------------------------------
-- المطلوب: «بدي بس دخول للجولة، ولما يدخل كل ساعتين 20» — بلا طلبات كثيرة
-- على الموقع وبلا العدّاد ينقطع لمجرد تبديل التبويب أو تصفّح صفحة أخرى.
--
-- قبل: الخادم يحسب من فروق النبضات، وكل نبضة تدمج 120 ثانية فقط وأي غياب
--       أكبر من 300 ثانية يُعتبر انصرافاً ⇒ كان العميل مضطراً لإرسال نبضة
--       كل 30 ثانية (120 طلباً/ساعة) وإلا ضاع وقت الجولة.
--
-- بعد: الزمن المحتسب = (الآن - آخر مزامنة) مقصوصاً عند نهاية الجولة.
--       بلا سقف نبضة وبلا نافذة انصراف. العميل يحتاج طلباً واحداً عند الدخول
--       وعند فتح صفحة الجولات وعند العودة للتبويب، والباقي يحسبه الخادم.
--       20 نقطة كل ساعتين = نقطة كل 360 ثانية (ثابت listo من 00002).
-- ============================================================================

-- القيم القديمة صارت بلا معنى: لا شيء يقصّ الاحتساب anymore.
CREATE OR REPLACE FUNCTION public.round_beat_cap() RETURNS integer
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 31536000 $$;

CREATE OR REPLACE FUNCTION public.round_beat_liveness() RETURNS integer
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 31536000 $$;


-- ---------------------------------------------------------------------------
-- 1) round_heartbeat — «أنا داخل الجولة، أعطني ما استحقّه»
--    تُستدعى عند الدخول وعند فتح الصفحة وعند العودة للتبويب (ليس كل 30 ثانية).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.round_heartbeat(p_round_id uuid)
RETURNS TABLE(
  ok                      boolean,
  error_message           text,
  is_active               boolean,
  in_break                boolean,
  work_remaining_seconds  integer,
  break_remaining_seconds integer,
  total_work_seconds      integer,
  focus_seconds           integer,
  round_points            integer,
  new_balance             integer,
  next_point_in_seconds   integer,
  scheduled_end_at        timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_r        record;
  v_p        record;
  v_st       record;
  v_now      timestamptz := now();
  v_from     timestamptz;
  v_clip     timestamptz;
  v_delta    integer := 0;
  v_focus    integer := 0;
  v_awarded  integer := 0;
  v_total_points integer;
  v_pending  integer;
  v_gain     integer;
  v_balance  integer;
  v_new_balance integer;
  v_total_work integer;
  v_next_point integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'يجب تسجيل الدخول'::text, false, false,
                        0, 0, 0, 0, 0, 0, NULL::integer, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT * INTO v_r FROM public.study_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'الجولة غير موجودة'::text, false, false,
                        0, 0, 0, 0, 0, 0, NULL::integer, NULL::timestamptz;
    RETURN;
  END IF;

  IF NOT public.is_round_member(p_round_id, v_uid) THEN
    RETURN QUERY SELECT false, 'لست عضواً في هذه الجولة'::text, false, false,
                        0, 0, 0, 0, 0, 0, NULL::integer, v_r.scheduled_end_at;
    RETURN;
  END IF;

  v_total_work := GREATEST(COALESCE(v_r.duration_minutes, 0), 0) * 60;

  -- جولات قديمة بلا نهاية مجدولة: نصحّحها مرة واحدة
  IF v_r.status = 'active' AND v_r.started_at IS NOT NULL AND v_r.scheduled_end_at IS NULL THEN
    PERFORM set_config('app.round_internal', '1', true);
    UPDATE public.study_rounds
    SET scheduled_end_at = v_r.started_at + make_interval(secs => public.round_total_seconds(
          v_r.duration_minutes, v_r.break_enabled,
          v_r.break_interval_minutes, v_r.break_duration_minutes)::double precision)
    WHERE id = p_round_id;
    v_r.scheduled_end_at := v_r.started_at + make_interval(secs => public.round_total_seconds(
          v_r.duration_minutes, v_r.break_enabled,
          v_r.break_interval_minutes, v_r.break_duration_minutes)::double precision);
  END IF;

  -- أول استدعاء = لحظة الدخول إلى الجولة
  INSERT INTO public.round_presence (round_id, user_id, joined_at, last_seen_at)
  VALUES (p_round_id, v_uid, v_now, v_now)
  ON CONFLICT (round_id, user_id) DO NOTHING;

  SELECT * INTO v_p FROM public.round_presence
   WHERE round_id = p_round_id AND user_id = v_uid FOR UPDATE;

  v_focus   := COALESCE(v_p.focus_seconds, 0);
  v_awarded := COALESCE(v_p.points_awarded, 0);
  v_from    := COALESCE(v_p.last_seen_at, v_p.joined_at, v_now);
  v_clip    := v_now;
  IF v_r.scheduled_end_at IS NOT NULL AND v_clip > v_r.scheduled_end_at THEN
    v_clip := v_r.scheduled_end_at;   -- لا يتجاوز نهاية الجولة أبداً
  END IF;

  -- ★ كل الزمن بين آخر مزامنة والآن يُحتسب (حتى الاستراحات).
  --   لا سقف نبضة ولا نافذة انصراف: تبديل التبويب أو التنقّل بالموقع
  --   أو حتى إغلاق المتصفح لسا لا يقطع الاحتساب قبل نهاية الجولة.
  IF v_r.status = 'active' AND v_r.started_at IS NOT NULL AND v_clip > v_from THEN
    v_delta := EXTRACT(EPOCH FROM (v_clip - v_from))::bigint::integer;
    v_focus := v_focus + v_delta;
  END IF;

  -- last_seen_at = الآن ⇒ أي فائض محسوب هنا ولا يُعاد احتسابه لاحقاً
  UPDATE public.round_presence
  SET last_seen_at  = v_now,
      focus_seconds = v_focus,
      beats         = COALESCE(beats, 0) + 1
  WHERE round_id = p_round_id AND user_id = v_uid;

  -- النقاط: 20 كل ساعتين (360 ثانية لكل نقطة)، سقف 200
  PERFORM public.round_apply_daily_reset(v_uid);

  SELECT balance INTO v_balance FROM public.user_points WHERE user_id = v_uid FOR UPDATE;
  IF v_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance, daily_reset_at)
    VALUES (v_uid, public.round_base_balance(), now())
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_balance FROM public.user_points WHERE user_id = v_uid FOR UPDATE;
  END IF;

  v_total_points := v_focus / public.round_seconds_per_point();
  v_pending      := v_total_points - v_awarded;
  v_gain         := LEAST(GREATEST(v_pending, 0),
                          GREATEST(public.round_max_balance() - v_balance, 0));
  v_new_balance  := v_balance + v_gain;

  IF v_gain > 0 THEN
    v_awarded := v_awarded + v_gain;
    UPDATE public.user_points
       SET balance = v_new_balance, updated_at = now()
     WHERE user_id = v_uid;

    INSERT INTO public.point_transactions
      (user_id, amount, balance_after, transaction_type, source, metadata)
    VALUES
      (v_uid, v_gain, v_new_balance, 'round_reward', 'system',
        jsonb_build_object(
          'round_id',        p_round_id,
          'focus_seconds',   v_focus,
          'credited_delta',  v_delta,
          'pending_points',  v_pending));
  END IF;

  UPDATE public.round_presence SET points_awarded = v_awarded
   WHERE round_id = p_round_id AND user_id = v_uid;

  IF v_pending <= 0 OR v_balance >= public.round_max_balance() THEN
    v_next_point := NULL;
  ELSE
    v_next_point := public.round_seconds_per_point()
                    - (v_focus % public.round_seconds_per_point());
  END IF;

  SELECT * INTO v_st FROM public.round_state_at(
    v_r.started_at, v_r.duration_minutes,
    v_r.break_enabled, v_r.break_interval_minutes, v_r.break_duration_minutes,
    LEAST(v_now, COALESCE(v_r.scheduled_end_at, v_now))
  );

  RETURN QUERY SELECT true, NULL::text, true,
                      v_st.in_break,
                      v_st.work_remaining,
                      v_st.break_remaining,
                      v_total_work,
                      v_focus,
                      v_awarded,
                      v_new_balance,
                      v_next_point,
                      v_r.scheduled_end_at;
END;
$$;


-- ---------------------------------------------------------------------------
-- 2) التسوية: تُختم نقاط كل مشارك حتى لحظة الإنهاء (حتى لو لم تفتح صفحته)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.round_settle_internal(
  p_round_id uuid,
  p_actor    uuid,
  p_system   boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_r record;
  v_p record;
  v_now timestamptz := now();
  v_actor uuid := COALESCE(p_actor, auth.uid());
  v_count integer := 0;
  v_from timestamptz;
  v_clip timestamptz;
  v_delta integer := 0;
  v_focus integer := 0;
  v_awarded integer := 0;
  v_total integer;
  v_pending integer;
  v_gain integer;
  v_balance integer;
  v_new_balance integer;
BEGIN
  SELECT * INTO v_r FROM public.study_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF NOT COALESCE(p_system, false) THEN
    IF v_r.user_id IS DISTINCT FROM v_actor
       AND NOT public.has_role(v_actor, 'admin')
       AND NOT public.has_role(v_actor, 'moderator') THEN
      RAISE EXCEPTION 'not_round_owner' USING HINT = 'مالك الجولة أو الطاقم فقط';
    END IF;
  END IF;

  -- ★ ختام النقاط لكل مشارك: من آخر مزامنة حتى min(الآن، نهاية الجولة)
  FOR v_p IN
    SELECT * FROM public.round_presence
     WHERE round_id = p_round_id
     FOR UPDATE
  LOOP
    v_from := COALESCE(v_p.last_seen_at, v_p.joined_at, v_now);
    v_clip := LEAST(v_now, COALESCE(v_r.scheduled_end_at, v_now));

    v_focus   := COALESCE(v_p.focus_seconds, 0);
    v_awarded := COALESCE(v_p.points_awarded, 0);

    IF v_r.status = 'active' AND v_r.started_at IS NOT NULL AND v_clip > v_from THEN
      v_delta := EXTRACT(EPOCH FROM (v_clip - v_from))::bigint::integer;
      v_focus := v_focus + v_delta;
    END IF;

    PERFORM public.round_apply_daily_reset(v_p.user_id);

    SELECT balance INTO v_balance
      FROM public.user_points WHERE user_id = v_p.user_id FOR UPDATE;
    IF v_balance IS NULL THEN
      INSERT INTO public.user_points (user_id, balance, daily_reset_at)
      VALUES (v_p.user_id, public.round_base_balance(), now())
      ON CONFLICT (user_id) DO NOTHING;
      SELECT balance INTO v_balance
        FROM public.user_points WHERE user_id = v_p.user_id FOR UPDATE;
    END IF;

    v_total   := v_focus / public.round_seconds_per_point();
    v_pending := v_total - v_awarded;
    v_gain    := LEAST(GREATEST(v_pending, 0),
                        GREATEST(public.round_max_balance() - v_balance, 0));
    v_new_balance := v_balance + v_gain;

    IF v_gain > 0 THEN
      v_awarded := v_awarded + v_gain;
      UPDATE public.user_points
         SET balance = v_new_balance, updated_at = now()
       WHERE user_id = v_p.user_id;

      INSERT INTO public.point_transactions
        (user_id, amount, balance_after, transaction_type, source, metadata)
      VALUES
        (v_p.user_id, v_gain, v_new_balance, 'round_reward', 'system',
          jsonb_build_object(
            'round_id',       p_round_id,
            'focus_seconds',  v_focus,
            'credited_delta', v_delta,
            'settle_final',   true));
    END IF;

    UPDATE public.round_presence
       SET focus_seconds  = v_focus,
           points_awarded = v_awarded,
           last_seen_at   = v_clip
     WHERE round_id = p_round_id AND user_id = v_p.user_id;
  END LOOP;

  PERFORM set_config('app.round_internal', '1', true);

  UPDATE public.study_rounds
  SET status   = 'completed',
      ended_at = COALESCE(ended_at, LEAST(v_now, COALESCE(scheduled_end_at, v_now))),
      settled  = true
  WHERE id = p_round_id;

  INSERT INTO public.round_settlements (round_id, user_id, focus_seconds, points_awarded)
  SELECT rp.round_id, rp.user_id, rp.focus_seconds, rp.points_awarded
  FROM public.round_presence rp
  WHERE rp.round_id = p_round_id
  ON CONFLICT (round_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3) الصلاحيات
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.round_heartbeat(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.round_settle_internal(uuid, uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.round_heartbeat(uuid) TO authenticated;
