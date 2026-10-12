-- ============================================================================
-- إصلاح ملاحظات Supabase Security Linter (تقرير فحص الأمان)
-- التاريخ: 2026-10-12
-- المشروع: hvrtzzouasqseyswjcex
--
-- يُنفَّذ يدوياً من: Supabase Dashboard -> SQL Editor
-- آمن وقابل للتراجع (راجع قسم التراجع في الأسفل).
--
-- يعالج:
--   1) function_search_path_mutable   (تثبيت search_path لـ 12 دالة)
--   2) public_bucket_allows_listing   (إزالة سياسة سرد الملفات لـ 3 دلاء)
--   3) anon_security_definer_function_executable (سحب EXECUTE عن anon
--      من دوال الإدارة/الخطرة فقط — لا تمسّ دوال تسجيل الدخول والقراءة العامة)
-- ملاحظة: auth_leaked_password_protection إعداده من الواجهة:
--   Authentication -> Settings -> Enable "Leaked password protection"
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) تثبيت search_path (يمنع اختطاف مسار البحث)
--    القيمة تُطابق المسار الافتراضي في Supabase (public + extensions).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'set_posts_channel',
        '_posts_affects_feed',
        'block_owner_tamper_drop',
        'block_owner_tamper_ddl',
        'round_beat_cap',
        'round_beat_liveness',
        'round_seconds_per_point',
        'round_max_balance',
        'round_base_balance',
        'round_total_seconds',
        'round_focus_seconds',
        'round_state_at'
      ])
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 2) إزالة سياسات السرد الواسعة على دلاء التخزين العامّة
--    (الوصول للصور عبر الروابط العامّة لا يحتاج هذه السياسة،
--     والكود لا يستخدم .list() مطلقاً)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Post media is publicly accessible"      ON storage.objects;
DROP POLICY IF EXISTS "Schedule images publicly viewable"      ON storage.objects;


-- ---------------------------------------------------------------------------
-- 3) سحب صلاحية التنفيذ عن الزوّار (anon) من دوال الإدارة/الخطرة فقط.
--    القائمة محدّدة ومحافظة: لا تتضمّن أي دالة تُنادى قبل تسجيل الدخول
--    (claim_invite_code / consume_access_code / check_banned_words / ...).
--    استدعاءات هذه الدوال من داخل دوال أخرى (SECURITY DEFINER) لا تتأثر.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        -- إدارة المستخدمين/الأدوار
        'admin_adjust_points',
        'admin_delete_user',
        'admin_points_map',
        'admin_reset_wheel',
        'transfer_ownership',
        -- الإشراف على المنشورات
        'approve_post',
        'reject_post',
        'set_post_review_status',
        'get_pending_posts',
        'hard_delete_post',
        'hard_delete_comment',
        -- النقاط والجوائز
        'grant_points',
        'spend_points',
        'get_user_points',
        'get_wheel_status',
        'spin_wheel',
        'initialize_user_points',
        'daily_reset_points',
        'nightly_points_reset',
        'cleanup_old_point_transactions',
        -- أكواد الوصول (إنشاؤها/إبطالها إدارة؛ أما استخدامها فمتروك للزوّار)
        'create_access_code',
        'revoke_access_code',
        'refund_access_code',
        'list_access_codes',
        -- التواصل مع المالك
        'send_owner_communication',
        'reply_owner_communication',
        'delete_owner_communication',
        'complete_owner_task',
        -- البريد
        'get_user_email',
        'resolve_user_ids_by_email',
        -- المهام الاجتماعية (الإدارة)
        'create_social_task',
        'complete_social_task',
        'delete_social_task',
        'verify_social_task',
        -- الجولات (إنشاء/تصفية)
        'settle_round',
        'start_round',
        'round_settle_internal',
        'round_apply_daily_reset',
        'reward_round_time',
        'log_round_creation',
        -- صيانة دورية (cron)
        'auto_settle_due_rounds',
        'delete_old_comments',
        'delete_old_posts',
        'delete_old_rounds'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;


-- ============================================================================
-- التراجع (إن احتجت العودة) — مثال:
--   GRANT EXECUTE ON FUNCTION public.spin_wheel() TO anon;
--   GRANT EXECUTE ON FUNCTION public.grant_points(uuid, integer, text) TO anon;
--   CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
--     FOR SELECT USING (bucket_id = 'avatars');
--   ALTER FUNCTION public.round_state_at(...) RESET search_path;
-- ============================================================================
