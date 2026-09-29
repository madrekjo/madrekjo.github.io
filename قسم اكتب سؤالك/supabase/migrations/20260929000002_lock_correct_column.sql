-- ============================================================
-- قفل عمود correct في «اكتب سؤالك» — تكملة لـ S5
-- 2026-09-29
-- المهاجرة السابقة (20260918000001) أنشأت دالة submit_answer
-- وأخفت العمود عن استعلامات التطبيق العامة، لكنها تركت
-- صلاحيات القراءة الافتراضية على الجدول مفتوحة — أي أن أي زائر
-- يقدر يقرأ الإجابات الصحيحة قبل الإجابة عبر طلب REST مباشر:
--   GET /rest/v1/questions?select=id,correct
--
-- بعد هذه المهاجرة:
--   · لا يستطيع anon/authenticated قراءة عمود correct إطلاقاً.
--   · استعلامات التطبيق العامة (بدون correct) تبقى تعمل.
--   · دالة submit_answer تبقى تعمل لأنها SECURITY DEFINER
--     (تنفّذ بصلاحيات المالك، متجاوزةً RLS وصلاحيات الأعمدة).
--
-- التشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ
--          (إعادة تشغيله آمنة)
-- ============================================================

-- 1) سحب صلاحية العمود على مستوى الجدول أولاً
--    (.PostgREST يعتمد على صلاحية الجدول، فسحبها أضمن)
REVOKE SELECT ON public.questions FROM anon, authenticated;

-- 2) إعادة منح كل الأعمدة عدا correct
GRANT  SELECT (id, author_id, question, image_url, options, field, subject,
               grade, ayah, reactions, answers_count, created_at)
    ON public.questions TO anon, authenticated;

-- 3) سحب صريح على correct (يُطغى على صلاحية الجدول)
REVOKE SELECT (correct) ON public.questions FROM anon, authenticated;

-- ============================================================
-- التحقق بعد التشغيل (كلها يجب أن ترجع [])
--
--   curl "$URL/rest/v1/questions?select=id,correct&limit=1" \
--        -H "apikey: $ANON_KEY"
--
--   SELECT correct FROM questions LIMIT 1;   -- عبر anon → يجب أن تفشل
-- ============================================================
