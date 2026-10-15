-- ============================================================
-- «المهام القادمة» — جدولة مهمة في وقت محدّد لقسم الإنجاز
-- المشروع: الإنجاز (itflhfhsfzrdfpxvlzrv)
-- طريقة التنفيذ: Supabase Dashboard → SQL Editor → لصق الملف → Run
-- ============================================================

-- 1) جدول المهام المجدولة
CREATE TABLE IF NOT EXISTS public.scheduled_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  category public.task_category NOT NULL DEFAULT 'daily',
  duration integer NOT NULL DEFAULT 0,
  is_stopwatch boolean NOT NULL DEFAULT false,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'started', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) فهرس للاستعلام السريع حسب المستخدم والوقت
CREATE INDEX IF NOT EXISTS scheduled_tasks_user_time_idx
  ON public.scheduled_tasks (user_id, scheduled_at);

-- 3) الصلاحيات
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_tasks TO authenticated;
GRANT ALL ON public.scheduled_tasks TO service_role;

-- 4) أمان الصفوف: كل مستخدم يتحكم بمهامه المجدولة فقط
ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own scheduled tasks" ON public.scheduled_tasks;
CREATE POLICY "Users manage own scheduled tasks"
  ON public.scheduled_tasks
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
