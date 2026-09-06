-- ============================================================================
-- التفاعلات مع المنشورات (مثل فيسبوك) — إيموجي بدل لايك فقط
--   1) عمود type في likes يحدد نوع التفاعل لكل مستخدم (مفتاح → إيموجي في الواجهة)
--   2) قيد على القيم المسموحة + سياسة UPDATE كي يغيّر العضو تفاعله
-- المقايضات: UNIQUE(post_id, user_id) القائم = تفاعل واحد لكل مستخدم لكل منشور
-- (اختيار إيموجي جديد يغيّر القديم — تماماً مثل فيسبوك).
-- يُشغَّل عبر SQL Editor ولا يُشغل تلقائياً.
-- ============================================================================

-- 1) عمود نوع التفاعل (القيمة الافتراضية like ← كل اللايكات الحالية تبقى أعجبني)
ALTER TABLE public.likes
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'like';

-- 2) قيد القيم المسموحة (منع أي مفتاح خارجي غير معروف في الواجهة)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'likes_type_check'
  ) THEN
    ALTER TABLE public.likes
      ADD CONSTRAINT likes_type_check
      CHECK (type IN ('like', 'love', 'haha', 'wow', 'sad', 'angry'));
  END IF;
END;
$$;

-- 3) سياسة UPDATE: العضو يغيّر تفاعله (حذف + إدراج كانت سابقة، الآن تعديل مباشر)
DROP POLICY IF EXISTS "Users can change own reactions" ON public.likes;
CREATE POLICY "Users can change own reactions" ON public.likes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);