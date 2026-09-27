-- تفعيل Realtime لجدول البث: وصول فوري للتنبيهات بلا استطلاع دوري من القاعدة.
-- التنفيذ: Supabase Dashboard → SQL Editor → Run (يدوياً من المالك).
-- ملاحظة: ينفذ بعد 0009 و0010.

ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcasts;