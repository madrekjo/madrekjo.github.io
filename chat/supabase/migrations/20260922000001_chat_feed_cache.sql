-- ============================================================
-- كاش القاعدة — الدردشة
-- كاش مصغَّر جاهز للفيد + عداد تغيير (stamp)
--
-- الفكرة:
--   1) chat_content_stamp : عداد يرتفع تلقائياً مع أي تغيير مؤثّر على الفيد
--      (منشور/إعجاب/تعليق/تغيير بروفايل ظاهر/حذف). التطبيق يتذكّر آخر
--      stamp قرأه؛ فإن لم يتغير يكتفي برسالة "لا شيء تغير" بالبايتات.
--   2) chat_feed_cache : فيد مضغوط جاهز لكل قناة (50 منشور بأعمدة
--      رفيعة + البروفايلات المعنية + عدادات التعليقات والإعجابات)
--      يُبنى عند القراءة الأولى ثم يُعيد استخدامه حتى يرتفع الـ stamp.
--   3) get_chat_feed(p_channel, p_from_stamp) : نقطة القراءة الوحيدة.
--
-- ملاحظات:
--   - الفيد العام يتضمن المعلَّقة الموافَقة فقط (status='approved')
--     لأن رؤية pending تختلف من شخص لآخر (الطاقم/المشرفون) — تبقى
--     قراءاتهم على المسار المباشر الحالي (قليلون، لا يُحدث فرقاً).
--   - كل الدوال SECURITY DEFINER (تجمع عبر المستخدمين) وتُمنح للمُصادَقين فقط.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chat_content_stamp (
  id         int         PRIMARY KEY DEFAULT 1,
  stamp      bigint      NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_content_stamp_single_row CHECK (id = 1)
);

INSERT INTO public.chat_content_stamp (id, stamp) VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.chat_feed_cache (
  channel    text        PRIMARY KEY,
  payload    jsonb       NOT NULL,
  stamp      bigint      NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- bump: يرفع العداد بعد أي تغيير مؤثّر (يفرغ كاش الفيد تلقائياً عند القراءة)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.bump_chat_content_stamp();
CREATE OR REPLACE FUNCTION public.bump_chat_content_stamp()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_content_stamp
     SET stamp = stamp + 1, updated_at = now()
   WHERE id = 1;
END;
$$;

-- posts: أي تغيير يمس الفيد (إدراج/حذف/تثبيت/قناة/حالة/محتوى/حذف ناعم)
CREATE OR REPLACE FUNCTION public.trg_bump_posts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.bump_chat_content_stamp();
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_bump_posts ON public.posts;
CREATE TRIGGER trg_bump_posts
  AFTER INSERT OR UPDATE OR DELETE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_posts();

-- likes: إعجاب/إلغاء
CREATE OR REPLACE FUNCTION public.trg_bump_likes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.bump_chat_content_stamp();
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_bump_likes ON public.likes;
CREATE TRIGGER trg_bump_likes
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_likes();

-- comments: إضافة/حذف ناعم (يغيّر عدد التعليقات)
CREATE OR REPLACE FUNCTION public.trg_bump_comments()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  PERFORM public.bump_chat_content_stamp();
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_bump_comments ON public.comments;
CREATE TRIGGER trg_bump_comments
  AFTER INSERT OR UPDATE OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_comments();

-- comment_likes: يحسب في تحديث عدادات الإعجابات داخل المنشور المعروض
CREATE OR REPLACE FUNCTION public.trg_bump_comment_likes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.bump_chat_content_stamp();
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_bump_comment_likes ON public.comment_likes;
CREATE TRIGGER trg_bump_comment_likes
  AFTER INSERT OR DELETE ON public.comment_likes
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_comment_likes();

-- profiles: فقط ما يظهر في الفيد (الاسم/الصورة/الحظر) — نتجاهل نبضة الظهور
CREATE OR REPLACE FUNCTION public.trg_bump_profiles()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'UPDATE'
      AND NEW.full_name   IS NOT DISTINCT FROM OLD.full_name
      AND NEW.avatar_url  IS NOT DISTINCT FROM OLD.avatar_url
      AND NEW.is_banned   IS NOT DISTINCT FROM OLD.is_banned
      AND NEW.chat_banned IS NOT DISTINCT FROM OLD.chat_banned) THEN
    RETURN NEW;
  END IF;
  PERFORM public.bump_chat_content_stamp();
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_bump_profiles ON public.profiles;
CREATE TRIGGER trg_bump_profiles
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_profiles();

-- ------------------------------------------------------------
-- بناء الفيد المضغوط لقناة معيّنة (إعادة بناء عند الحاجة)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._build_chat_feed_v1(p_channel text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_channel text := coalesce(nullif(btrim(coalesce(p_channel, '')), ''), 'all');
  v_channel_sql text;
  v_posts jsonb;
  v_profiles jsonb;
  v_comment_counts jsonb;
  v_like_counts jsonb;
BEGIN
  IF v_channel NOT IN ('all', 'male', 'female', '09', '10') THEN v_channel := 'all'; END IF;

  IF v_channel = 'all' THEN
    v_channel_sql := '((p.channel IS NULL OR p.channel = ''all''))';
  ELSE
    v_channel_sql := format('(p.channel = %L)', v_channel);
  END IF;

  -- المنشورات الرفيعة (50)
  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(r ORDER BY r.is_pinned DESC, r.created_at DESC), '[]'::jsonb)
    FROM (
      SELECT p.id::text, p.user_id::text,
             left(coalesce(p.content, ''), 140) AS content,
             p.image_url, p.video_url,
             to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
             to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
             coalesce(p.is_pinned, false) AS is_pinned,
             coalesce(p.channel, 'all') AS channel,
             p.status
      FROM public.posts p
      WHERE p.deleted_at IS NULL AND p.status = 'approved'
        AND %s
      ORDER BY p.is_pinned DESC, p.created_at DESC
      LIMIT 50
    ) r
   $q$, v_channel_sql) INTO v_posts;

  -- البروفايلات المعنية
  SELECT coalesce(jsonb_object_agg(prof.user_id::text, jsonb_build_object(
           'full_name', prof.full_name, 'avatar_url', prof.avatar_url,
           'generation', prof.generation, 'field', prof.field, 'gender', prof.gender
         )), '{}'::jsonb)
    INTO v_profiles
  FROM public.profiles prof
  JOIN (SELECT DISTINCT (el->>'user_id')::uuid AS uid FROM jsonb_array_elements(v_posts) el) u
    ON u.uid = prof.user_id;

  -- عدد التعليقات لكل منشور
  SELECT coalesce(jsonb_object_agg(c.post_id::text, c.cnt), '{}'::jsonb)
    INTO v_comment_counts
  FROM (
    SELECT cc.post_id, count(*) AS cnt
    FROM public.comments cc
    JOIN (SELECT (el->>'id')::uuid AS pid FROM jsonb_array_elements(v_posts) el) pids
      ON pids.pid = cc.post_id
    WHERE cc.deleted_at IS NULL
    GROUP BY cc.post_id
  ) c;

  -- عدد الإعجابات لكل منشور
  SELECT coalesce(jsonb_object_agg(l.post_id::text, l.cnt), '{}'::jsonb)
    INTO v_like_counts
  FROM (
    SELECT l.post_id, count(*) AS cnt
    FROM public.likes l
    JOIN (SELECT (el->>'id')::uuid AS pid FROM jsonb_array_elements(v_posts) el) pids
      ON pids.pid = l.post_id
    GROUP BY l.post_id
  ) l;

  RETURN jsonb_build_object(
    'posts', v_posts,
    'profiles', v_profiles,
    'commentCounts', v_comment_counts,
    'likeCounts', v_like_counts
  );
END;
$$;

-- ------------------------------------------------------------
-- نقطة القراءة: stamp مقابل payload (الطرف الخفيف للتطبيق)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_chat_feed(p_channel text, p_from_stamp bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_channel text := coalesce(nullif(btrim(coalesce(p_channel, '')), ''), 'all');
  v_stamp bigint;
  v_cached_stamp bigint;
  v_payload jsonb;
  v_row_exists boolean;
BEGIN
  IF v_channel NOT IN ('all', 'male', 'female', '09', '10') THEN v_channel := 'all'; END IF;

  SELECT stamp INTO v_stamp FROM public.chat_content_stamp WHERE id = 1;
  IF v_stamp IS NULL THEN
    INSERT INTO public.chat_content_stamp (id, stamp) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
    v_stamp := 0;
  END IF;

  -- لم يتغير شيء منذ آخر قراءة → رد صغير جداً
  IF p_from_stamp IS NOT NULL AND p_from_stamp = v_stamp THEN
    RETURN jsonb_build_object('changed', false, 'stamp', v_stamp);
  END IF;

  SELECT payload, stamp::bigint
    INTO v_payload, v_cached_stamp
    FROM public.chat_feed_cache WHERE channel = v_channel;

  IF v_payload IS NULL OR v_cached_stamp IS DISTINCT FROM v_stamp THEN
    v_payload := public._build_chat_feed_v1(v_channel);
    INSERT INTO public.chat_feed_cache (channel, payload, stamp, updated_at)
    VALUES (v_channel, v_payload, v_stamp, now())
    ON CONFLICT (channel)
    DO UPDATE SET payload = EXCLUDED.payload, stamp = EXCLUDED.stamp, updated_at = now();
  END IF;

  RETURN jsonb_build_object('changed', true, 'stamp', v_stamp, 'channel', v_channel, 'payload', v_payload);
END;
$$;

REVOKE ALL ON FUNCTION public.get_chat_feed(text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_feed(text, bigint) TO authenticated;

-- RLS على جدولي الكاش: قراءة عامة للجميع (بيانات عامة/عدادات فقط)
ALTER TABLE public.chat_content_stamp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_feed_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Any authenticated can read chat cache" ON public.chat_content_stamp;
DROP POLICY IF EXISTS "Any authenticated can read feed cache" ON public.chat_feed_cache;
CREATE POLICY "Any authenticated can read chat cache"
  ON public.chat_content_stamp FOR SELECT TO authenticated USING (true);
CREATE POLICY "Any authenticated can read feed cache"
  ON public.chat_feed_cache FOR SELECT TO authenticated USING (true);