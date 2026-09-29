-- =============================================================
-- 20260929000001_rounds_real_scoring.sql
-- إعادة بناء نظام الجولات + النقاط ليصبح "حقيقياً" وخادمياً بالكامل.
--
-- المشكلة التي تم الإبلاغ عنها (نقاط عشوائية / الجولات مبطّلة):
--
--  (1) reward_round_time كانت تحسب المدة من طابع زمني يرسله المتصفح:
--        p_ended_at = new Date().toISOString()
--      أي مستخدم كان يرسل تاريخاً مستقبلياً ويحصل على +100 فوراً
--      بدون دقيقة دراسة واحدة.  ← مصدر "النقاط العشوائية" الأول.
--
--  (2) points_earned المُعادة = blocks*10 بينما الرصيد يُقصّ عند 100:
--        رصيد 95 + بلوكين = يقول "20 نقطة" ويضيف 5 فقط.
--      و point_transactions كان يسجّل 20 → السجل دائماً يكذب.
--      ← المصدر الثاني: الرقم المعروض ≠ ما استلمته فعلاً.
--
--  (3) الحضور غير مقيس إطلاقاً: ضغطة واحدة على "دخول" تكفي،
--      ثم إغلاق التبويب، ثم المكافأة بعد "ساعتين" من ساعة المتصفح.
--
--  (4) last_rewarded_round_at طابع واحد عالمي لكل جولات المستخدم،
--      فتداخلت الجولات مع بعضها ونتائج عشوائية.
--
--  (5) المتصفح نفسه كان يُنهي الجولة (ended_at = ساعة محلية)،
--      فتبقى الجولة "نشطة" للأبد عند غير صاحبها.
--
--  (6) التجديد اليومي كان يمسح الرصيد إلى 50 بلا سطر في السجل،
--      فتفقد نقاطك المكتسبة بلا تفسير.
--
-- ---------------------------------------------------------------
-- الحل: الخادم يملك (الوقت + الحضور + المال). المتصفح يقول فقط
--       "أنا حاضر الآن، والتبويب مفتوح" ولا يقرّر شيئاً.
--
--   • نبضة حضور round_heartbeat كل 30 ثانية (التبويب مرئي فقط).
--     الخادم يحسبها من now()، يقصّ كل نبضة على 120 ثانية،
--     ويمنع أي إدماج إن كان الغياب > 300 ثانية.
--     ⇒ لا يمكن اختلاق وقت، ولا جمع ساعات من "التجمع".
--
--   • النقاط دالة حتمية على الثواني المتحقَّقة:
--     نقطة واحدة لكل 20 دقيقة عمل مؤكَّدة (البريكات لا تُحتسب).
--
--   • ما يُمنح فعلاً = الفرق الحقيقي في الرصيد بعد سقف 100،
--     وهو نفس الرقم الذي يُسجَّل في point_transactions
--     ويُعاد للواجهة.  ⇒ لا تضخيم ولا تضارب.
--
--   • سجل لكل جولة (round_settlements) + سجل حضور (round_presence).
--
--   • بدء/إنهاء الجولة من الخادم (start_round / settle_round)
--     ومجدول البريكات يُحسب مرة واحدة ويُخزَّن (scheduled_end_at).
--
-- آمن إعادة التشغيل (idempotent).
-- =============================================================

-- ------------------------------------------------------------------
-- 0) ثوابت النظام
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.round_base_balance() RETURNS integer
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 50 $$;

CREATE OR REPLACE FUNCTION public.round_max_balance() RETURNS integer
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 100 $$;

-- نقطة واحدة كل 20 دقيقة عمل متحقَّقة
CREATE OR REPLACE FUNCTION public.round_seconds_per_point() RETURNS integer
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 1200 $$;

-- أقصى ثوانٍ تُدمج في نبضة واحدة (حماية من التبويب المجمّد)
CREATE OR REPLACE FUNCTION public.round_beat_cap() RETURNS integer
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 120 $$;

-- بعد هذا الغياب = عودة جديدة، ولا يُحتسب أي فاصل
CREATE OR REPLACE FUNCTION public.round_beat_liveness() RETURNS integer
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 300 $$;


-- ------------------------------------------------------------------
-- 1) الجداول
-- ------------------------------------------------------------------
-- سجل الحضور: كم ثانية عمل حقيقية تحقّقت لكل مستخدم في كل جولة
CREATE TABLE IF NOT EXISTS public.round_presence (
  round_id       uuid NOT NULL REFERENCES public.study_rounds(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  focus_seconds  integer NOT NULL DEFAULT 0,
  points_awarded integer NOT NULL DEFAULT 0,
  beats          integer NOT NULL DEFAULT 0,
  PRIMARY KEY (round_id, user_id)
);

-- سجل التسوية: يُثبَّت مرة واحدة عند إنهاء الجولة (لا يُعاد awarding)
CREATE TABLE IF NOT EXISTS public.round_settlements (
  round_id       uuid NOT NULL REFERENCES public.study_rounds(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  focus_seconds  integer NOT NULL DEFAULT 0,
  points_awarded integer NOT NULL DEFAULT 0,
  settled_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, user_id)
);

ALTER TABLE public.study_rounds
  ADD COLUMN IF NOT EXISTS scheduled_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_round_presence_user  ON public.round_presence (user_id);
CREATE INDEX IF NOT EXISTS idx_round_presence_round ON public.round_presence (round_id);
CREATE INDEX IF NOT EXISTS idx_round_settlements_user ON public.round_settlements (user_id);
CREATE INDEX IF NOT EXISTS idx_study_rounds_scheduled_end ON public.study_rounds (scheduled_end_at)
  WHERE status = 'active';

-- RLS: قراءة فقط. كل الكتابة عبر RPC (SECURITY DEFINER).
ALTER TABLE public.round_presence    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Round presence readable by members" ON public.round_presence;
CREATE POLICY "Round presence readable by members" ON public.round_presence
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_round_member(round_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
  );

DROP POLICY IF EXISTS "Round settlements readable by members" ON public.round_settlements;
CREATE POLICY "Round settlements readable by members" ON public.round_settlements
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_round_member(round_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
  );
-- لا توجد policies للإدراج/التعديل/الحذف → لا كتابة مباشرة من العميل.


-- ------------------------------------------------------------------
-- 2) جدولة الجولة — مصدر واحد للحقيقة
--    duration_minutes = صافي وقت العمل. البريكات فوقه ولا تُحتسب.
--    مثال: 60د / بريك 5د كل 25د  ->  عمل 60د + بريكان (25, 50) = 70د
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.round_total_seconds(
  p_duration_minutes        integer,
  p_break_enabled           boolean,
  p_break_interval_minutes  integer,
  p_break_duration_minutes  integer
) RETURNS integer
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  v_d integer := GREATEST(COALESCE(p_duration_minutes, 0), 0) * 60;
  v_i integer;
  v_b integer;
  v_breaks integer := 0;
BEGIN
  IF NOT COALESCE(p_break_enabled, false)
     OR COALESCE(p_break_interval_minutes, 0) <= 0
     OR COALESCE(p_break_duration_minutes, 0) <= 0
     OR v_d <= 0 THEN
    RETURN v_d;
  END IF;

  v_i := p_break_interval_minutes * 60;
  v_b := p_break_duration_minutes * 60;

  IF v_d > v_i THEN
    v_breaks := (v_d - v_i) / (v_i + v_b) + 1;
  END IF;

  RETURN v_d + v_breaks * v_b;
END;
$$;

-- عدد ثواني [p_from, p_to) التي تقع داخل مقاطع العمل فقط
CREATE OR REPLACE FUNCTION public.round_focus_seconds(
  p_started_at              timestamptz,
  p_duration_minutes        integer,
  p_break_enabled           boolean,
  p_break_interval_minutes  integer,
  p_break_duration_minutes  integer,
  p_from                    timestamptz,
  p_to                      timestamptz
) RETURNS integer
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  v_total      integer := GREATEST(COALESCE(p_duration_minutes, 0), 0) * 60;
  v_breaks_on  boolean  := COALESCE(p_break_enabled, false)
                          AND COALESCE(p_break_interval_minutes, 0) > 0
                          AND COALESCE(p_break_duration_minutes, 0) > 0;
  v_i integer;
  v_b integer := COALESCE(p_break_duration_minutes, 0) * 60;
  v_work_left integer;
  v_chunk integer;
  v_cursor timestamptz;
  v_seg_start timestamptz;
  v_seg_end timestamptz;
  v_focus integer := 0;
BEGIN
  IF v_total <= 0 OR p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RETURN 0;
  END IF;

  v_i := CASE WHEN v_breaks_on
              THEN p_break_interval_minutes * 60
              ELSE v_total END;      -- بدون بريك = مقطع عمل واحد

  v_work_left := v_total;
  v_cursor := p_started_at;

  WHILE v_work_left > 0 LOOP
    -- مقطع عمل
    v_chunk := LEAST(v_work_left, v_i);
    v_seg_start := v_cursor;
    v_seg_end := v_seg_start + make_interval(secs => v_chunk::double precision);
    v_focus := v_focus + GREATEST(
      EXTRACT(EPOCH FROM (LEAST(v_seg_end, p_to) - GREATEST(v_seg_start, p_from)))::bigint,
      0
    )::integer;
    v_cursor := v_seg_end;
    v_work_left := v_work_left - v_chunk;

    -- مقطع بريك (لا يُحتسب عملاً)
    IF v_breaks_on AND v_work_left > 0 THEN
      v_cursor := v_cursor + make_interval(secs => v_b::double precision);
    END IF;
  END LOOP;

  RETURN LEAST(v_focus, v_total);
END;
$$;

-- حالة الجولة عند لحظة معيّنة: (في بريك؟، عمل متبقٍ، بريك متبقٍ)
--   work_remaining = كل العمل المتبقي في الجولة، في كل الحالات
--   (داخل مقطع العمل = المتبقي من المقطع + ما بعده، وداخل البريك = المتبقي كله)
CREATE OR REPLACE FUNCTION public.round_state_at(
  p_started_at              timestamptz,
  p_duration_minutes        integer,
  p_break_enabled           boolean,
  p_break_interval_minutes  integer,
  p_break_duration_minutes  integer,
  p_at                      timestamptz
)
RETURNS TABLE(in_break boolean, work_remaining integer, break_remaining integer)
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  v_total      integer := GREATEST(COALESCE(p_duration_minutes, 0), 0) * 60;
  v_breaks_on  boolean  := COALESCE(p_break_enabled, false)
                          AND COALESCE(p_break_interval_minutes, 0) > 0
                          AND COALESCE(p_break_duration_minutes, 0) > 0;
  v_i integer;
  v_b integer := COALESCE(p_break_duration_minutes, 0) * 60;
  v_work_left integer;
  v_chunk integer;
  v_cursor timestamptz;
  v_seg_end timestamptz;
BEGIN
  in_break := false;
  work_remaining := v_total;
  break_remaining := 0;

  IF v_total <= 0 OR p_started_at IS NULL OR p_at IS NULL OR p_at <= p_started_at THEN
    RETURN;
  END IF;

  v_i := CASE WHEN v_breaks_on THEN p_break_interval_minutes * 60 ELSE v_total END;
  v_work_left := v_total;
  v_cursor := p_started_at;

  WHILE v_work_left > 0 LOOP
    v_chunk := LEAST(v_work_left, v_i);
    v_seg_end := v_cursor + make_interval(secs => v_chunk::double precision);

    IF p_at < v_seg_end THEN
      -- كل العمل المتبقي = ما في هذا المقطع + ما بعده
      work_remaining := GREATEST(
        v_work_left - (EXTRACT(EPOCH FROM (p_at - v_cursor))::integer),
        0);
      RETURN;
    END IF;

    v_cursor := v_seg_end;
    v_work_left := v_work_left - v_chunk;

    IF v_breaks_on AND v_work_left > 0 THEN
      v_seg_end := v_cursor + make_interval(secs => v_b::double precision);
      IF p_at < v_seg_end THEN
        in_break := true;
        work_remaining := v_work_left;
        break_remaining := (EXTRACT(EPOCH FROM (v_seg_end - p_at)))::integer;
        RETURN;
      END IF;
      v_cursor := v_seg_end;
    END IF;
  END LOOP;

  work_remaining := 0;
END;
$$;


-- ------------------------------------------------------------------
-- 3) منع التلاعب بتوقيت الجولة من العميل
--    الحقول الحسّاسة لا تُقبل إلا من داخل الـ RPC.
--
--    SECURITY DEFINER شرط هنا: round_settle_internal غير ممنوح لـ PUBLIC،
--    وبلا ذلك يفشل النداء بصلاحية. أما فحص الملكية فيبقى داخل
--    round_settle_internal عبر auth.uid() (وهو قائم على الجلسة لا على الدور).
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_round_timing() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.round_internal', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  -- تعطيل أي محاولة عبثية مباشرة
  IF NEW.scheduled_end_at IS DISTINCT FROM OLD.scheduled_end_at
     OR NEW.settled IS DISTINCT FROM OLD.settled THEN
    RAISE EXCEPTION 'round_timing_locked'
      USING HINT = 'استخدم start_round / settle_round';
  END IF;

  -- إغلاق قادم من عميل قديم: نصحّحه بدل رفضه.
  --   p_system = false ⇒ تُفحص الملكية (مالك الجولة أو الأدمن/المشرف).
  --   نُعيد NULL أي نُحيط طلب العميل: لو عديناRETURN NEW لكتَب
  --   ended_at من ساعة المتصفح فوق ما ثبّته الخادم للتو (خطأ 5 يعود).
  IF NEW.status = 'completed' AND OLD.status = 'active'
     AND NEW.ended_at IS DISTINCT FROM OLD.ended_at THEN
    BEGIN
      PERFORM public.round_settle_internal(NEW.id, auth.uid(), false);
    EXCEPTION WHEN OTHERS THEN
      -- ليس مالكاً/طاقماً: نترك UPDATE يمر ليرفضه RLS أو أي قيد آخر
      RETURN NEW;
    END;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_round_timing ON public.study_rounds;
CREATE TRIGGER trg_guard_round_timing
  BEFORE UPDATE ON public.study_rounds
  FOR EACH ROW EXECUTE FUNCTION public.guard_round_timing();


-- ------------------------------------------------------------------
-- 4) التسوية الداخلية (الملك والمشرف فقط إن لم تكن system)
--    النقاط تُمنح بالنبضة أثناء الجولة، والتسوية هنا تجمّد السجل فقط
--    ⇒ لا يوجد أي احتمال لمكافأة مزدوجة.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.round_settle_internal(
  p_round_id uuid,
  p_actor    uuid,
  p_system   boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_r record;
  v_now timestamptz := now();
  v_actor uuid := COALESCE(p_actor, auth.uid());
  v_count integer := 0;
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

  PERFORM set_config('app.round_internal', '1', true);

  UPDATE public.study_rounds
  SET status       = 'completed',
      ended_at     = COALESCE(ended_at, LEAST(v_now, scheduled_end_at)),
      settled      = true
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


-- ------------------------------------------------------------------
-- 5) start_round — المالك/الأدمن يبدأ، والخادم يحسب الجدول
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_round(p_round_id uuid)
RETURNS TABLE(ok boolean, error_message text, started_at timestamptz, scheduled_end_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_r record;
  v_now timestamptz := now();
  v_end timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'يجب تسجيل الدخول'::text, NULL, NULL; RETURN;
  END IF;

  SELECT * INTO v_r FROM public.study_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'الجولة غير موجودة'::text, NULL, NULL; RETURN;
  END IF;

  IF v_r.user_id IS DISTINCT FROM v_uid
     AND NOT public.has_role(v_uid, 'admin')
     AND NOT public.has_role(v_uid, 'moderator') THEN
    RETURN QUERY SELECT false, 'فقط صاحب الجولة أو الإدارة يبدأها'::text, NULL, NULL; RETURN;
  END IF;

  -- إعادة تشغيل؟ نُبقي الجدول الأصلي حتى لا تتضاعف المدة
  IF v_r.status = 'active' AND v_r.started_at IS NOT NULL THEN
    RETURN QUERY SELECT true, NULL::text, v_r.started_at, v_r.scheduled_end_at; RETURN;
  END IF;

  IF v_r.status = 'completed' THEN
    RETURN QUERY SELECT false, 'انتهت هذه الجولة مسبقاً'::text, NULL, NULL; RETURN;
  END IF;

  v_end := v_now + make_interval(secs => public.round_total_seconds(
           v_r.duration_minutes, v_r.break_enabled,
           v_r.break_interval_minutes, v_r.break_duration_minutes
         )::double precision);

  PERFORM set_config('app.round_internal', '1', true);
  UPDATE public.study_rounds
  SET status           = 'active',
      started_at       = v_now,
      scheduled_end_at = v_end,
      settled          = false
  WHERE id = p_round_id;

  RETURN QUERY SELECT true, NULL::text, v_now, v_end;
END;
$$;


-- ------------------------------------------------------------------
-- 6) settle_round — إنهاء يدوي (مالك/أدمن) مع ملخص الحضور
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_round(p_round_id uuid)
RETURNS TABLE(ok boolean, error_message text, participants integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'يجب تسجيل الدخول'::text, 0; RETURN;
  END IF;

  BEGIN
    v_n := public.round_settle_internal(p_round_id, v_uid, false);
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 'فشل إنهاء الجولة'::text, 0; RETURN;
  END;

  RETURN QUERY SELECT true, NULL::text, v_n;
END;
$$;


-- ------------------------------------------------------------------
-- 7) round_heartbeat — قلب النظام
--    يستدعيه المتصفح كل 30 ثانية والتبويب مرئي فقط.
--    الخادم هو من يحسب كل شيء من now().
-- ------------------------------------------------------------------
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
  v_to       timestamptz;
  v_clip     timestamptz;
  v_gap      integer := 0;
  v_window   integer := 0;
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
                        0, 0, 0, 0, 0, 0, NULL, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT * INTO v_r FROM public.study_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'الجولة غير موجودة'::text, false, false,
                        0, 0, 0, 0, 0, 0, NULL, NULL::timestamptz;
    RETURN;
  END IF;

  IF NOT public.is_round_member(p_round_id, v_uid) THEN
    RETURN QUERY SELECT false, 'لست عضواً في هذه الجولة'::text, false, false,
                        0, 0, 0, 0, 0, 0, NULL, v_r.scheduled_end_at;
    RETURN;
  END IF;

  v_total_work := GREATEST(COALESCE(v_r.duration_minutes, 0), 0) * 60;

  -- الجولات القديمة بلا جدول محسوب: نصحّحها مرة واحدة
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

  -- إنشاء سجل الحضور (لا يُحتسب أي وقت قبل أول نبضة لاحقة)
  INSERT INTO public.round_presence (round_id, user_id, joined_at, last_seen_at)
  VALUES (p_round_id, v_uid, v_now, v_now)
  ON CONFLICT (round_id, user_id) DO NOTHING;

  SELECT * INTO v_p FROM public.round_presence
   WHERE round_id = p_round_id AND user_id = v_uid FOR UPDATE;

  v_focus   := COALESCE(v_p.focus_seconds, 0);
  v_awarded := COALESCE(v_p.points_awarded, 0);
  v_from    := COALESCE(v_p.last_seen_at, v_now);
  v_to      := v_now;
  v_clip    := v_to;
  IF v_r.scheduled_end_at IS NOT NULL AND v_clip > v_r.scheduled_end_at THEN
    v_clip := v_r.scheduled_end_at;
  END IF;

  -- ------------------------------------------------- احتساب الحضور
  --   النافذة الأخيرة قبل نهاية الجولة تُحتسب هنا قبل الإقفال،
  --   وإلا ضاعت حتى 120 ثانية (سقف النبضة) بلا سبب.
  --   (v_clip مقصوص عند scheduled_end_at فلا يمكن تجاوز النهاية)
  IF v_r.status = 'active' AND v_r.started_at IS NOT NULL THEN
    v_gap := GREATEST(EXTRACT(EPOCH FROM (v_clip - v_from))::bigint, 0)::integer;

    -- الراحة (> 300 ث) = مستخدم غادر: نبدأ نافذة جديدة من الصفر
    IF v_gap > 0 AND v_gap <= public.round_beat_liveness() THEN
      v_window := public.round_focus_seconds(
        v_r.started_at, v_r.duration_minutes,
        v_r.break_enabled, v_r.break_interval_minutes, v_r.break_duration_minutes,
        v_from, v_clip);

      IF v_window > 0 THEN
        v_delta := LEAST(v_window, public.round_beat_cap());
        v_focus := v_focus + v_delta;
      END IF;
    END IF;
  END IF;

  -- last_seen_at = الآن (وليس v_from + delta) ⇒ أي فائض فوق السقف
  -- يُسقَط عمداً ولا يمكن اختلاقه لاحقاً.
  UPDATE public.round_presence
  SET last_seen_at  = v_to,
      focus_seconds = v_focus,
      beats         = COALESCE(beats, 0) + 1
  WHERE round_id = p_round_id AND user_id = v_uid;

  -- ------------------------------------------------- النقاط (حتمية)
  -- يوم كامل يمر أثناء الجلسة ⇒ يُطبَّق التجديد قبل الحساب،
  -- وإلا احتُسبت نقاط اليوم الجديد على رصيد الأمس.
  PERFORM public.round_apply_daily_reset(v_uid);

  SELECT balance INTO v_balance FROM public.user_points WHERE user_id = v_uid FOR UPDATE;
  IF v_balance IS NULL THEN
    INSERT INTO public.user_points (user_id, balance)
    VALUES (v_uid, public.round_base_balance())
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_balance FROM public.user_points WHERE user_id = v_uid FOR UPDATE;
  END IF;

  v_total_points := v_focus / public.round_seconds_per_point();
  v_pending      := v_total_points - v_awarded;

  -- ما يُمنح فعلاً = الفرق الحقيقي بعد سقف 100 (لا تضخيم)
  v_gain        := LEAST(GREATEST(v_pending, 0),
                         GREATEST(public.round_max_balance() - v_balance, 0));
  v_new_balance := v_balance + v_gain;

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
          'gap_seconds',     v_gap,
          'pending_points',  v_pending));
  END IF;

  UPDATE public.round_presence SET points_awarded = v_awarded
   WHERE round_id = p_round_id AND user_id = v_uid;

  IF v_pending <= 0 OR v_balance >= public.round_max_balance() THEN
    v_next_point := NULL;                       -- ما زال مفعّلاً أو عند السقف
  ELSE
    v_next_point := public.round_seconds_per_point()
                    - (v_focus % public.round_seconds_per_point());
  END IF;

  -- ------------------------------------------------- حالة المؤقّت
  SELECT * INTO v_st FROM public.round_state_at(
    v_r.started_at, v_r.duration_minutes,
    v_r.break_enabled, v_r.break_interval_minutes, v_r.break_duration_minutes,
    LEAST(v_to, v_r.scheduled_end_at)
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


-- ------------------------------------------------------------------
-- 8) reward_round_time — نفس التوقيع، لكن بدون أي ثقة بالعميل
--    الطابعان p_started_at / p_ended_at يُتجاهلان تماماً.
--    لا نقاط بلا سجل حضور حقيقي.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reward_round_time(
  p_round_id uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz
)
RETURNS TABLE(success boolean, new_balance integer, points_earned integer, error_message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_presence record;
  v_balance integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, 'يجب تسجيل الدخول'::text; RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.study_rounds WHERE id = p_round_id) THEN
    RETURN QUERY SELECT false, 0, 0, 'الجولة غير موجودة'::text; RETURN;
  END IF;

  -- لا يمكن الحصول على نقطة واحدة بلا نبضة حضور حقيقية
  SELECT * INTO v_presence FROM public.round_presence
   WHERE round_id = p_round_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0,
      'لم يُسجَّل حضورك في هذه الجولة — لا نقاط بلا تواجد فعلي'::text;
    RETURN;
  END IF;

  -- النقاط مُنحت أصلاً أثناء الجولة عبر round_heartbeat.
  -- هنا نُبلغ بالرقم الحقيقي المكتسب فقط (لا إعادة awarding، لا تضخيم).
  SELECT balance INTO v_balance FROM public.user_points WHERE user_id = v_uid;
  v_balance := COALESCE(v_balance, public.round_base_balance());

  RETURN QUERY SELECT true, v_balance,
    COALESCE(v_presence.points_awarded, 0), NULL::text;
END;
$$;


-- ------------------------------------------------------------------
-- 9) لوحة الحضور (تظهر للعامل والمشارك) — إثبات أن النقاط حقيقية
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.round_leaderboard(p_round_id uuid)
RETURNS TABLE(
  user_id uuid, full_name text, avatar_url text,
  focus_seconds integer, focus_minutes integer, points_awarded integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_round_member(p_round_id, auth.uid()) THEN
    RETURN;                                    -- لا تسريب
  END IF;

  RETURN QUERY
  SELECT rp.user_id,
         COALESCE(pr.full_name, 'مستخدم'),
         pr.avatar_url,
         rp.focus_seconds,
         (rp.focus_seconds / 60)::integer,
         rp.points_awarded
  FROM public.round_presence rp
  LEFT JOIN public.profiles pr ON pr.user_id = rp.user_id
  WHERE rp.round_id = p_round_id
  ORDER BY rp.focus_seconds DESC, rp.points_awarded DESC;
END;
$$;


-- ------------------------------------------------------------------
-- 10) التجديد اليومي — دالة مشتركة بين القراءة والنبضة
--     (كان 23 ساعة ⇒ "اليوم" فعلياً 23، وبلا سطر في السجل ⇒
--      نقاطك تختفي بلا تفسير — خطآن كانا في الكود القديم)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.round_apply_daily_reset(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_reset   timestamptz;
  v_new     integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT balance, daily_reset_at INTO v_balance, v_reset
    FROM public.user_points WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_points (user_id, balance)
    VALUES (p_user_id, public.round_base_balance())
    ON CONFLICT (user_id) DO NOTHING;
    RETURN public.round_base_balance();
  END IF;

  v_new := v_balance;
  IF v_balance <> public.round_base_balance()
     AND (v_reset IS NULL OR v_reset < now() - INTERVAL '24 hours') THEN
    v_new := public.round_base_balance();
    UPDATE public.user_points
       SET balance = v_new, daily_reset_at = now(), updated_at = now()
     WHERE user_id = p_user_id;

    -- سطر في السجل حتى لا تختفي النقاط بلا تفسير
    INSERT INTO public.point_transactions
      (user_id, amount, balance_after, transaction_type, source, metadata)
    VALUES
      (p_user_id, v_new - v_balance, v_new,
       'daily_reset', 'system',
       jsonb_build_object('previous_balance', v_balance, 'previous_reset_at', v_reset));
  END IF;

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_points()
RETURNS TABLE(balance INTEGER, daily_reset_at TIMESTAMPTZ, last_rewarded_round_at TIMESTAMPTZ, next_reward_hours_left NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_balance INTEGER;
  v_daily_reset TIMESTAMPTZ;
  v_last_reward TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT NULL::INTEGER, NULL, NULL, NULL::NUMERIC;
    RETURN;
  END IF;

  PERFORM public.round_apply_daily_reset(v_uid);

  SELECT up.balance, up.daily_reset_at, up.last_rewarded_round_at
  INTO v_balance, v_daily_reset, v_last_reward
  FROM public.user_points up WHERE up.user_id = v_uid;

  RETURN QUERY SELECT v_balance, v_daily_reset, v_last_reward, NULL::NUMERIC;
END;
$$;


-- ------------------------------------------------------------------
-- 11) تنظيف: إلغاء تتبّع المكافأة القديمة (نظام النبضة استبدلها)
--     لئلا تظهر رسالة "المكافأة التالية بعد كذا" بلا معنى.
-- ------------------------------------------------------------------
UPDATE public.user_points SET last_rewarded_round_at = NULL
 WHERE last_rewarded_round_at IS NOT NULL;

-- الجولات القديمة النشطة: امنحها جدولاً محسوباً حتى لا تعلق
UPDATE public.study_rounds
SET scheduled_end_at = started_at + make_interval(secs => public.round_total_seconds(
      duration_minutes, break_enabled, break_interval_minutes, break_duration_minutes
    )::double precision)
WHERE status = 'active' AND started_at IS NOT NULL AND scheduled_end_at IS NULL;


-- ------------------------------------------------------------------
-- 12) الصلاحيات
--     round_settle_internal و round_apply_daily_reset يبقيان
--     غير ممنوحين لـ PUBLIC: يُستدعيان فقط من داخل دوال SECURITY DEFINER.
-- ------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.round_settle_internal(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.round_apply_daily_reset(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.round_heartbeat(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_round(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_round(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.round_leaderboard(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reward_round_time(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_points() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.round_heartbeat(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_round(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_round(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.round_leaderboard(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.reward_round_time(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_points()           TO authenticated;

-- الدوال المساعدة: قراءة فقط
GRANT EXECUTE ON FUNCTION public.round_total_seconds(integer, boolean, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.round_focus_seconds(timestamptz, integer, boolean, integer, integer, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.round_state_at(timestamptz, integer, boolean, integer, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.round_seconds_per_point() TO authenticated;
GRANT EXECUTE ON FUNCTION public.round_beat_cap()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.round_beat_liveness()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.round_base_balance()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.round_max_balance()        TO authenticated;

-- ---- تأكيد (يظهر بالـ SQL Editor) ----
SELECT COUNT(*) AS rounds_active
  FROM public.study_rounds WHERE status = 'active' AND scheduled_end_at IS NOT NULL;

SELECT COUNT(*) AS presence_rows FROM public.round_presence;
SELECT COUNT(*) AS settlement_rows FROM public.round_settlements;
