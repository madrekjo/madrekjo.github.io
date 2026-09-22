-- ============================================================
-- بين السطور: إصلاح روابط صور البروفايل القديمة (منقوصة الحاوية)
--
-- الخلل: كانت الحاوية «avatars» تُحذف من رابط الصورة عند الرفع،
-- فتُخزَّن روابط مثل:
--   .../storage/v1/object/public/avatars/<الاسم>
-- بينما الصواب (لِما أن الملف محفوظ ضمن مجلد avatars/ داخل الحاوية):
--   .../storage/v1/object/public/avatars/avatars/<الاسم>
--
-- التشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ
-- (آمن إعادة التشغيل — لا يمسّ أي رابط صحيح).
-- ============================================================

update public.users
set avatar_url = replace(
      avatar_url,
      '/storage/v1/object/public/avatars/',
      '/storage/v1/object/public/avatars/avatars/'
    ),
    updated_at = now()
where avatar_url like '%/storage/v1/object/public/avatars/%'
  and avatar_url not like '%/storage/v1/object/public/avatars/avatars/%';