-- ============================================================================
-- تفعيل Realtime لجدول الإشعارات (بلا توقيت — الرقم يصل فوراً)
-- rpc: Supabase → Project Settings → Realtime → شامل الـ publication
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;