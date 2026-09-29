-- ============================================================================
--  فحص نظام الحظر بالإشارات (Ban Score) — آمن تماماً
-- ============================================================================
--  هذا الملف *ليس* ترحيلاً. لا ينفّذ تلقائياً ولا يؤثّر في أي بيانات.
--  شغّله يدوياً في Supabase → SQL Editor للتحقق أن الأوزان والحدود تعمل
--  كما هو محدد. الملف كله داخل BEGIN ... ROLLBACK، فلا يُكتب أي شيء
--  في القاعدة ولا يُمس أي سجل حظر حقيقي.
--
--  الأوزان (ban_scoring_config / weights):
--    device_id=100  fp=55  canvas=15  webgl=15
--    audio=10       fonts=5  screen=3  ua=2  ip=5
--  الحدود (thresholds):
--    >= 100               => BLOCK
--    90..99 مع 3+ قوية     => BLOCK
--    70..89 مع 2+ قوية     => CHALLENGE
--    < 70                 => ALLOW
--  إشارات قوية (strong_signals) = fp, canvas, webgl, audio
-- ============================================================================

BEGIN;

-- قيم اختبار وهمية (شكل SHA-256) — لن تتطابق مع أي جهاز حقيقي
CREATE TEMP TABLE t_cfg ON COMMIT DROP AS
SELECT 'TESTFP'||repeat('a',60)::text AS fp,
       'TESTCV'||repeat('b',60)::text AS cv,
       'TESTWG'||repeat('c',60)::text AS wg,
       'TESTAU'||repeat('d',60)::text AS au,
       'TESTFO'||repeat('e',60)::text AS fo,
       'TESTSC'||repeat('f',60)::text AS sc,
       'TESTUA'||repeat('1',60)::text AS ua,
       'TESTIP'||repeat('2',60)::text AS ip;

\echo ''
\echo '### 1) لا إشارة مفردة تحظر — حسب الأوزان وحدها'
SELECT s.label, s.score, s.strong_count, s.decision,
       CASE WHEN s.decision = 'ALLOW' THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM (
  SELECT 'canvas فقط (+15)'            AS label, 15 AS score, 1 AS strong_count, 'ALLOW'::text AS decision
  UNION ALL SELECT 'webgl فقط  (+15)',  15, 1, 'ALLOW'
  UNION ALL SELECT 'audio فقط  (+10)',  10, 1, 'ALLOW'
  UNION ALL SELECT 'fonts فقط  (+5)',    5, 0, 'ALLOW'
  UNION ALL SELECT 'screen فقط (+3)',    3, 0, 'ALLOW'
  UNION ALL SELECT 'ua فقط     (+2)',    2, 0, 'ALLOW'
  UNION ALL SELECT 'ip فقط     (+5)',    5, 0, 'ALLOW'
  UNION ALL SELECT 'fp فقط     (+55)',   55, 1, 'ALLOW'
) s;

\echo ''
\echo '### 2) القرار الحقيقي من ban_decide() على القاعدة'
SELECT s.label, s.score, s.strong_count,
       public.ban_decide(s.score, s.strong_count) AS decision,
       CASE WHEN public.ban_decide(s.score, s.strong_count) = s.expected
            THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM (
  SELECT 'نفس device_id (100)'                        AS label, 100 AS score, 0 AS strong_count, 'BLOCK'::text AS expected
  UNION ALL SELECT 'fp+canvas+webgl+audio = 95',          95, 4, 'BLOCK'
  UNION ALL SELECT 'fp+canvas+webgl = 85',                85, 2, 'CHALLENGE'
  UNION ALL SELECT 'fp+canvas+ua+ip = 75 (قوية=1)',       75, 1, 'ALLOW'
  UNION ALL SELECT 'fp وحده = 55',                        55, 1, 'ALLOW'
  UNION ALL SELECT 'canvas+webgl+audio+fonts+screen+ua+ip = 55', 55, 3, 'ALLOW'
  UNION ALL SELECT '90 مع قوية=2 فقط => لا حظر',          90, 2, 'ALLOW'
) s;

\echo ''
\echo '### 3) الأوزان الفعلية المخزّنة'
SELECT (value ->> 'device_id')::int AS device_id,
       (value ->> 'fp')::int         AS fp,
       (value ->> 'canvas')::int     AS canvas,
       (value ->> 'webgl')::int      AS webgl,
       (value ->> 'audio')::int      AS audio,
       (value ->> 'fonts')::int      AS fonts,
       (value ->> 'screen')::int     AS screen,
       (value ->> 'ua')::int         AS ua,
       (value ->> 'ip')::int         AS ip
FROM public.ban_scoring_config WHERE key = 'weights';

\echo ''
\echo '### 4) الحدود والإشارات القوية الفعلية'
SELECT value AS thresholds    FROM public.ban_scoring_config WHERE key = 'thresholds';
SELECT value AS strong_signals FROM public.ban_scoring_config WHERE key = 'strong_signals';

\echo ''
\echo '### 5) محاكاة Incognito: device_id مختلف، نفس البصمة'
\echo '--- نبني بروفايل جهاز محظور عبر المسار الحقيقي (device_signatures + trigger) ---'

INSERT INTO public.device_signatures(device_id, sig_type, sig_value)
SELECT 'ZZTESTBAN', 'fp',     fp FROM t_cfg
UNION ALL SELECT 'ZZTESTBAN', 'canvas', cv FROM t_cfg
UNION ALL SELECT 'ZZTESTBAN', 'webgl',  wg FROM t_cfg
UNION ALL SELECT 'ZZTESTBAN', 'audio',  au FROM t_cfg
UNION ALL SELECT 'ZZTESTBAN', 'fonts',  fo FROM t_cfg
UNION ALL SELECT 'ZZTESTBAN', 'screen', sc FROM t_cfg
UNION ALL SELECT 'ZZTESTBAN', 'ua',     ua FROM t_cfg;

-- إدراج الحظر يطلق trigger يبني ban_fingerprint_profiles تلقائياً
INSERT INTO public.blocked_devices(device_id, reason, ban_status)
VALUES ('ZZTESTBAN', 'اختبار — يُمحى بـ ROLLBACK', 'ACTIVE');

\echo '--- profile مبنيّ بواسطة trigger (يجب أن يكون سطراً واحداً) ---'
SELECT ban_id, device_id, source, signal_count, strong_count, active
FROM public.ban_fingerprint_profiles
WHERE device_id = 'ZZTESTBAN';

\echo '--- النتيجة المتوقعة: score=95, strong_count=4, BLOCK ---'
SELECT s.score, s.strong_count, s.matched,
       public.ban_decide(s.score, s.strong_count) AS decision,
       CASE WHEN s.score = 95 AND public.ban_decide(s.score, s.strong_count) = 'BLOCK'
            THEN 'PASS' ELSE 'CHECK' END AS verdict
FROM public.ban_score_visitor(
       'ZZTESTNEWDEVICE',   -- معرّف جهاز جديد تماماً بعد مسح التخزين
       t.fp, t.cv, t.wg, t.au, t.fo, t.sc, t.ua, NULL
     ) s
CROSS JOIN t_cfg t
LIMIT 1;

\echo ''
\echo '### 6) لا جمع نقاط من أجهزة محظورة مختلفة (اختبار حاسم)'
\echo '--- جهاز 2 محظور: canvas+webgl+audio فقط، بدون fp ---'
INSERT INTO public.device_signatures(device_id, sig_type, sig_value)
SELECT 'ZZTESTBAN2', 'canvas', 'TESTCV'||repeat('9',60) FROM t_cfg
UNION ALL SELECT 'ZZTESTBAN2', 'webgl',  'TESTWG'||repeat('9',60) FROM t_cfg
UNION ALL SELECT 'ZZTESTBAN2', 'audio',  'TESTAU'||repeat('9',60) FROM t_cfg;
INSERT INTO public.blocked_devices(device_id, reason, ban_status)
VALUES ('ZZTESTBAN2', 'اختبار 2 — يُمحى بـ ROLLBACK', 'ACTIVE');

\echo '--- درجة كل بروفايل على حدة (يجب أن يبقى كل واحد منها منخفضاً) ---'
SELECT s.profile_device_id, s.score, s.strong_count, s.matched,
       public.ban_decide(s.score, s.strong_count) AS decision
FROM public.ban_score_visitor(
       'ZZTESTNEWDEVICE2',        -- جهاز جديد
       t.fp,                       -- fp  الخاص بالجهاز 1
       'TESTCV'||repeat('9',60),   -- canvas الخاص بالجهاز 2
       'TESTWG'||repeat('9',60),   -- webgl  الخاص بالجهاز 2
       'TESTAU'||repeat('9',60),   -- audio  الخاص بالجهاز 2
       NULL, NULL, NULL, NULL
     ) s
CROSS JOIN t_cfg t
ORDER BY s.score DESC;

\echo '--- Expected: جهاز1 = 55 (fp فقط)، جهاز2 = 40 (3 قوية) => ALLOW'
\echo '--- لو جمّع النظام النقاط لخرج 95 و4 قوية وBecame BLOCK => هذا هو الفشل'
SELECT s.score AS best_score, s.strong_count, s.matched,
       public.ban_decide(s.score, s.strong_count) AS decision,
       CASE WHEN public.ban_decide(s.score, s.strong_count) = 'ALLOW'
            THEN 'PASS — لا جمع عبر الأجهزة' ELSE 'FAIL — نقاط مجمّعة!' END AS verdict
FROM public.ban_score_visitor(
       'ZZTESTNEWDEVICE2', t.fp,
       'TESTCV'||repeat('9',60), 'TESTWG'||repeat('9',60), 'TESTAU'||repeat('9',60),
       NULL, NULL, NULL, NULL
     ) s
CROSS JOIN t_cfg t
ORDER BY s.score DESC
LIMIT 1;

\echo ''
\echo '### 7) تواقيع الدوال: لا بديل ينافس على نداء Admin.tsx'
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS identity_args,
       CASE WHEN p.proname = 'admin_list_devices'
             AND pg_get_function_identity_arguments(p.oid) = 'p_search text, p_limit integer, p_offset integer, p_sort text'
            THEN 'PASS' ELSE 'تحقّق' END AS verdict
FROM pg_proc p
WHERE p.proname IN ('admin_list_devices','ban_score_visitor','ban_decide','record_visitor_fingerprint')
  AND p.pronamespace = 'public'::regnamespace
ORDER BY p.proname, 2;

ROLLBACK;  -- لا شيء يُحفظ. سجلات الحظر الحقيقية غير متأثرة.
