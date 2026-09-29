-- ============================================================================
--  تفريغ «أنا مجهول» — بداية نظيفة، بدون حذف أي جدول
-- ============================================================================
--  شغّله يدوياً: Supabase → SQL Editor. (ليس ترحيلاً، لا يُنفَّذ تلقائياً)
--
--  ثلاث ضمانات:
--    1) لا يُحذف أي جدول. البنية والسياسات والتريغرات والدوال تبقى كما هي.
--    2) لا شيء يضيع. قبل أي تفريغ تُنسخ البيانات كاملة إلى جداول
--       _bk_<التاريخ>_<الجدول>، فإذا غيّرت رأيك ترجعها بأمر واحد.
--    3) الأدمن لا يُمَس. admin_devices و user_roles خارج قائمة التفريغ
--       بالكامل، ولا يوجد أي FK يشير إليهما فلا يمكن أن يمسهما CASCADE.
--
--  ما لا يفعله هذا الملف عمداً:
--    • لا يمسّ Storage: الصور والملفات تبقى على روابطها. حذف صفّ من
--      قاعدة البيانات لا يحرّر مساحة القرص أصلاً.
--    • لا يمسّ إعدادات الموقع ولا بثّ ولا أوزان نظام الحظر.
--
--  التشغيل مرّتين:
--    1) أزل علامة -- من سطر التنفيذ الجيد أدناه لتتوقّع_preview فقط.
--    2) بعد ما ترى الأرقام وتوافق، نفّذ النسخة الحقيقية في الأسفل.
-- ============================================================================


-- ============================================================================
--  أولاً: معاينة — كم سيُحذف من كل جدول (لا يكتب شيئاً)
-- ============================================================================
SELECT 'posts'              AS جدول, count(*) AS عدد FROM public.posts
UNION ALL SELECT 'comments',            count(*) FROM public.comments
UNION ALL SELECT 'post_likes',          count(*) FROM public.post_likes
UNION ALL SELECT 'post_edits',          count(*) FROM public.post_edits
UNION ALL SELECT 'comment_edits',       count(*) FROM public.comment_edits
UNION ALL SELECT 'reports',             count(*) FROM public.reports
UNION ALL SELECT 'chat_posts',          count(*) FROM public.chat_posts
UNION ALL SELECT 'chat_comments',       count(*) FROM public.chat_comments
UNION ALL SELECT 'chat_likes',          count(*) FROM public.chat_likes
UNION ALL SELECT 'chat_post_mutes',     count(*) FROM public.chat_post_mutes
UNION ALL SELECT 'chat_messages',       count(*) FROM public.chat_messages
UNION ALL SELECT 'device_names',        count(*) FROM public.device_names
UNION ALL SELECT 'device_presence',     count(*) FROM public.device_presence
UNION ALL SELECT 'device_fingerprints', count(*) FROM public.device_fingerprints
UNION ALL SELECT 'device_signatures',   count(*) FROM public.device_signatures
UNION ALL SELECT 'device_notes',        count(*) FROM public.device_notes
UNION ALL SELECT 'device_warnings',     count(*) FROM public.device_warnings
UNION ALL SELECT 'device_aliases',      count(*) FROM public.device_aliases
UNION ALL SELECT 'blocked_devices',     count(*) FROM public.blocked_devices
UNION ALL SELECT 'ban_fingerprint_profiles', count(*) FROM public.ban_fingerprint_profiles
UNION ALL SELECT 'ban_audit_log',       count(*) FROM public.ban_audit_log
UNION ALL SELECT 'ban_challenges',      count(*) FROM public.ban_challenges
UNION ALL SELECT 'banned_signatures',   count(*) FROM public.banned_signatures
UNION ALL SELECT 'banned_fingerprints', count(*) FROM public.banned_fingerprints
ORDER BY 1;

-- هذه لا تُمَس، للتأكد قبل وبعد:
SELECT 'admin_devices (لا يُمَس)' AS جدول, count(*) AS عدد FROM public.admin_devices
UNION ALL SELECT 'user_roles  (لا يُمَس)', count(*) FROM public.user_roles
UNION ALL SELECT 'site_settings(لا يُمَس)', count(*) FROM public.site_settings;


-- ============================================================================
--  ثانياً: التفريغ الحقيقي
--  ─────────────────────────────────────────────────────────────────────────
--  ⚠️  هذا الجزء يحذف بيانات فعلاً. راجع أرقام المعاينة أولاً.
--  البيانات كلها تُنسخ إلى جداول _bk_ قبل الحذف، فالتراجع ممكن في أي وقت.
--  للتنفيذ: احذف علامة -- من سطور الكتلة التالية (من DO $$ حتى END $$;).
-- ============================================================================

-- DO $$
-- DECLARE
--   v_tag  text := to_char(now(), 'YYYYMMDD');
--   v_done int := 0;
--   r      record;
--   v_keep text[] := ARRAY[
--     'admin_devices', 'user_roles', 'site_settings',
--     'broadcasts', 'ban_scoring_config'
--   ];
--   -- ترتيب حذف: الأبناء قبل الآباء. كل FK في المخطط ON DELETE CASCADE،
--   -- لكن الحذف الصريح أوضح وأأمن إن تغيّرت المخططات يوماً.
--   v_order text[] := ARRAY[
--     'comment_edits', 'post_edits', 'post_likes', 'comments', 'reports', 'posts',
--     'chat_comments', 'chat_likes', 'chat_post_mutes', 'chat_messages', 'chat_posts',
--     'ban_audit_log', 'ban_challenges', 'ban_fingerprint_profiles',
--     'banned_signatures', 'banned_fingerprints', 'blocked_devices',
--     'device_names', 'device_notes', 'device_warnings',
--     'device_signatures', 'device_fingerprints', 'device_presence', 'device_aliases'
--   ];
--   v_t text;
-- BEGIN
--   -- 0) حارس: لا يجوز تفريغ أي جدول محمي
--   FOREACH v_t IN ARRAY v_order LOOP
--     IF v_t = ANY(v_keep) THEN
--       RAISE EXCEPTION 'محاولة تفريغ جدول محمي: %', v_t;
--     END IF;
--   END LOOP;
--
--   -- 1) نسخة احتياطية كاملة قبل أي حذف
--   FOREACH v_t IN ARRAY v_order LOOP
--     IF to_regclass('public.' || v_t) IS NULL THEN
--       RAISE NOTICE 'تخطّي % — الجدول غير موجود', v_t;
--       CONTINUE;
--     END IF;
--     EXECUTE format('DROP TABLE IF EXISTS public._bk_%I', v_t || '_' || v_tag);
--     EXECUTE format('CREATE TABLE public._bk_%I AS TABLE public.%I', v_t || '_' || v_tag, v_t);
--     GET DIAGNOSTICS v_done = ROW_COUNT;
--     RAISE NOTICE 'نسخة احتياطية: _bk_%_ (%) صف', v_t || '_' || v_tag, v_done;
--   END LOOP;
--
--   -- 2) التفريغ
--   FOREACH v_t IN ARRAY v_order LOOP
--     IF to_regclass('public.' || v_t) IS NULL THEN CONTINUE; END IF;
--     EXECUTE format('DELETE FROM public.%I', v_t);
--     GET DIAGNOSTICS v_done = ROW_COUNT;
--     RAISE NOTICE 'أُفرغ % — حُذف % صف', v_t, v_done;
--   END LOOP;
--
--   -- 3) ترقيم المجهول يبدأ من 1 من جديد
--   IF to_regclass('public.device_aliases') IS NOT NULL THEN
--     BEGIN
--       EXECUTE 'ALTER TABLE public.device_aliases ALTER COLUMN number RESTART WITH 1';
--       RAISE NOTICE 'أُعيد ترقيم الأجهزة المجهولة من 1';
--     EXCEPTION WHEN OTHERS THEN
--       RAISE NOTICE 'تعذّرت إعادة الترقيم (غير مهم): %', SQLERRM;
--     END;
--   END IF;
--
--   RAISE NOTICE '';
--   RAISE NOTICE 'اكتمل التفريغ. الأدمن لم يُمَس. الاسترجاع:';
--   RAISE NOTICE '  INSERT INTO public.<جدول> SELECT * FROM public._bk_<جدول>_%;', v_tag;
-- END $$;


-- ============================================================================
--  رابعاً: بعد التنفيذ — تأكد
-- ============================================================================
-- SELECT count(*) AS منشورات_متبقية FROM public.posts;
-- SELECT count(*) AS مستخدمون_متبقون   FROM public.device_aliases;
-- SELECT count(*) AS محظورون_متبقون    FROM public.blocked_devices;
-- SELECT * FROM public.admin_devices;      -- يجب أن يبقى كما هو
-- SELECT * FROM public.site_settings;      -- يجب أن يبقى كما هو
