-- ============================================================================
-- 20261008000004 — التصويتات في الدردشة (Poll message)
--
-- يُنفَّذ يدوياً من: Dashboard → SQL Editor (مشروع hvrtzzouasqseyswjcex)
--
-- الميزة: رسالة تصويت داخل الدردشة (سؤال + خيارات متعددة، اختيار واحد).
--   • الإنشاء: المالك (owner) والأدمن (admin) فقط — عبر RPC create_poll.
--   • التصويت: كل المستخدمين المسجّلين (صوت واحد لكل مستخدم، قابل للتغيير).
--   • التصويت يُخزَّن كمنشور عادي (posts) + صف في polls مرتبط به، فتظهر
--     الرسالة في نفس الفيد وتخضع لنفس منطق القنوات.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) الجداول
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.polls (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL UNIQUE REFERENCES public.posts(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question   text NOT NULL,
  closed     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.poll_options (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id  uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  text     text NOT NULL
);

-- اختيار واحد: مفتاح أساسي (poll_id, user_id) يمنع أكثر من صوت لكل مستخدم.
CREATE TABLE IF NOT EXISTS public.poll_votes (
  poll_id    uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_id  uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_polls_post        ON public.polls (post_id);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON public.poll_options (poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll   ON public.poll_votes (poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON public.poll_votes (option_id);

-- ----------------------------------------------------------------------------
-- 2) RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.polls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes   ENABLE ROW LEVEL SECURITY;

-- القراءة للجميع (مثل منشورات الدردشة).
DROP POLICY IF EXISTS "Polls viewable by everyone" ON public.polls;
CREATE POLICY "Polls viewable by everyone" ON public.polls
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Poll options viewable by everyone" ON public.poll_options;
CREATE POLICY "Poll options viewable by everyone" ON public.poll_options
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Poll votes viewable by everyone" ON public.poll_votes;
CREATE POLICY "Poll votes viewable by everyone" ON public.poll_votes
  FOR SELECT USING (true);

-- الإنشاء: المالك والأدمن فقط (الـRPC أيضاً يحرس، وهذا للحماية على الطريق المباشر).
DROP POLICY IF EXISTS "Owner and admin create polls" ON public.polls;
CREATE POLICY "Owner and admin create polls" ON public.polls
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role)
              OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Owner and admin create poll options" ON public.poll_options;
CREATE POLICY "Owner and admin create poll options" ON public.poll_options
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role)
              OR public.has_role(auth.uid(), 'admin'::app_role));

-- التصويت: كل مستخدم مصادَق على صوته فقط (إدراج/تعديل/حذف).
DROP POLICY IF EXISTS "Users insert own poll votes" ON public.poll_votes;
CREATE POLICY "Users insert own poll votes" ON public.poll_votes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own poll votes" ON public.poll_votes;
CREATE POLICY "Users update own poll votes" ON public.poll_votes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own poll votes" ON public.poll_votes;
CREATE POLICY "Users delete own poll votes" ON public.poll_votes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3) حراسة الصوت: الخيار يتبع نفس التصويت، والتصويت مفتوح
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_poll_vote_valid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.poll_options o
     WHERE o.id = NEW.option_id AND o.poll_id = NEW.poll_id
  ) THEN
    RAISE EXCEPTION 'invalid_option'
      USING HINT = 'الخيار لا يتبع هذا التصويت';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.polls p
     WHERE p.id = NEW.poll_id AND p.closed = true
  ) THEN
    RAISE EXCEPTION 'poll_closed'
      USING HINT = 'انتهى هذا التصويت';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_poll_vote_valid ON public.poll_votes;
CREATE TRIGGER trg_poll_vote_valid
  BEFORE INSERT OR UPDATE ON public.poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_poll_vote_valid();

-- ----------------------------------------------------------------------------
-- 4) create_poll(): إنشاء منشور + تصويت + خيارات في معاملة واحدة.
--    المالك/الأدمن فقط. المنشور يُنشر مباشرة (بلا مراجعة) لأن المنشئ طاقم.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_poll(
  p_content text,
  p_channel text,
  p_options text[]
)
RETURNS TABLE(id uuid, status text, error_message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_post_id uuid := gen_random_uuid();
  v_poll_id uuid := gen_random_uuid();
  v_content text;
  v_channel text;
  v_opts    text[];
  v_opt     text;
  v_pos     integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'يجب تسجيل الدخول'::text; RETURN;
  END IF;

  IF NOT (public.has_role(v_uid, 'owner'::app_role)
          OR public.has_role(v_uid, 'admin'::app_role)) THEN
    RETURN QUERY SELECT NULL, NULL, 'إنشاء التصويت مقصور على المالك والأدمن'::text; RETURN;
  END IF;

  v_content := left(btrim(coalesce(nullif(p_content, ''), '')), 300);
  IF char_length(v_content) < 1 THEN
    RETURN QUERY SELECT NULL, NULL, 'اكتب سؤال التصويت أولاً'::text; RETURN;
  END IF;

  v_channel := coalesce(nullif(btrim(coalesce(p_channel, '')), ''), 'all');
  IF v_channel NOT IN ('all', 'male', 'female', '09', '10') THEN
    RETURN QUERY SELECT NULL, NULL, 'قناة غير معروفة'::text; RETURN;
  END IF;

  -- خيارات: تقليم، إسقاط الفراغات، الحفاظ على الترتيب (2 إلى 10 خيارات).
  SELECT array_agg(o ORDER BY ord) INTO v_opts FROM (
    SELECT left(btrim(x), 120) AS o, ord
      FROM unnest(coalesce(p_options, '{}'::text[])) WITH ORDINALITY AS t(x, ord)
     WHERE btrim(coalesce(x, '')) <> ''
  ) s;

  IF v_opts IS NULL OR array_length(v_opts, 1) < 2 THEN
    RETURN QUERY SELECT NULL, NULL, 'أضف خيارين على الأقل'::text; RETURN;
  END IF;
  IF array_length(v_opts, 1) > 10 THEN
    v_opts := v_opts[1:10];
  END IF;

  INSERT INTO public.posts (id, user_id, content, channel, status)
  VALUES (v_post_id, v_uid, v_content, v_channel, 'approved');

  INSERT INTO public.polls (id, post_id, created_by, question)
  VALUES (v_poll_id, v_post_id, v_uid, v_content);

  FOREACH v_opt IN ARRAY v_opts LOOP
    INSERT INTO public.poll_options (poll_id, position, text)
    VALUES (v_poll_id, v_pos, v_opt);
    v_pos := v_pos + 1;
  END LOOP;

  RETURN QUERY SELECT v_post_id, 'approved'::text, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.create_poll(text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_poll(text, text, text[]) TO authenticated;

-- ============================================================================
-- استعلامات التحقق (بعد التنفيذ):
--
--   SELECT tablename FROM pg_tables
--    WHERE tablename IN ('polls','poll_options','poll_votes');
--   -- متوقّع: 3 صفوف
--
--   SELECT polname FROM pg_policies WHERE tablename = 'poll_votes';
--   -- متوقّع: 4 سياسات (SELECT/INSERT/UPDATE/DELETE)
-- ============================================================================
