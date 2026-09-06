-- حذف شات البريك من الجولات نهائياً (أزيل من الواجهة أيضاً).

-- إزالة الـ triggers قبل حذف الجدول
DROP TRIGGER IF EXISTS trg_ban_round_chat ON public.round_chat;
DROP TRIGGER IF EXISTS trg_words_round_chat ON public.round_chat;
DROP TRIGGER IF EXISTS trg_notify_round_chat ON public.round_chat;
DROP TRIGGER IF EXISTS trg_round_chat_disallow_generations ON public.round_chat;

-- إزالة الـ policies
DROP POLICY IF EXISTS "Round members can view chat" ON public.round_chat;
DROP POLICY IF EXISTS "Round members or staff can view chat" ON public.round_chat;
DROP POLICY IF EXISTS "Round members can send" ON public.round_chat;
DROP POLICY IF EXISTS "Owner or admin/mod or self can delete" ON public.round_chat;

-- إزالة من realtime
ALTER PUBLICATION supabase_realtime DROP TABLE public.round_chat;

-- تنظيف مرجع الشات من وظيفة تنظيف الجولات القديمة
CREATE OR REPLACE FUNCTION public.delete_old_rounds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.round_participants WHERE round_id IN (SELECT id FROM public.study_rounds WHERE created_at < now() - INTERVAL '10 days');
  DELETE FROM public.round_completions WHERE round_id IN (SELECT id FROM public.study_rounds WHERE created_at < now() - INTERVAL '10 days');
  DELETE FROM public.study_rounds WHERE created_at < now() - INTERVAL '10 days';
END;
$function$;

-- حذف الجدول
DROP TABLE IF EXISTS public.round_chat;