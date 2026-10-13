-- ============================================================================
-- تقوية الحظر الموحد بعد فحص أمني
-- ----------------------------------------------------------------------------
-- المشكلة: الجسر السابق (20261014000001) يطابق profiles.email، لكنّها NULL
-- لـ226 من 370 مستخدماً (منهم 8 من 22 محظوراً) لأن البروفايلات تُنشأ من
-- دوال الحافة بلا إيميل وhandle_new_user غير مرتبط بأي trigger. النتيجة:
-- is_global_banned ترجع false لهؤلاء فلا يُطردون من الأقسام ولا يُمنعون الدخول.
--
-- الحل:
--   1) is_global_banned تطابق الحظر عبر بريد auth.users المرجعي (لا profiles.email).
--   2) تعبئة الإيميلات الفارغة الحالية من auth.users.
--   3) trigger على profiles يملأ الإيميل تلقائياً لأي بروفايل جديد بلا إيميل.
--
-- ملاحظة: لم نربط handle_new_user على auth.users تجنّباً لإرجاع الأسماء إلى
-- «مستخدم جديد» لمستخدمي sync-chat-user (الدالة ترسل الاسم في name لا full_name).
-- يُشغَّل من Supabase SQL Editor (مرة واحدة).
-- ============================================================================

-- 1) مطابقة الحظر عبر auth.users (يصمد حتى لو كان profiles.email فارغاً)
CREATE OR REPLACE FUNCTION public.is_global_banned(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    -- أ) القائمة المركزية للحظر الموحد (تُدار من لوحة أدمن الشات)
    EXISTS (
      SELECT 1 FROM public.global_bans
      WHERE lower(email) = lower(p_email)
    )
    OR
    -- ب) الحظر العادي داخل الدردشة (profiles.is_banned) — نطابق عبر auth.users
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.user_id
      WHERE p.is_banned = true
        AND lower(u.email) = lower(p_email)
    );
$$;

REVOKE ALL ON FUNCTION public.is_global_banned(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_global_banned(text) TO anon, authenticated;

-- 2) تعبئة الإيميلات الفارغة الحالية
UPDATE public.profiles p
SET email = au.email
FROM auth.users au
WHERE p.user_id = au.id
  AND (p.email IS NULL OR p.email = '');

-- 3) تعبئة تلقائية لأي بروفايل جديد بلا إيميل
CREATE OR REPLACE FUNCTION public.fill_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email = '' THEN
    SELECT au.email INTO NEW.email FROM auth.users au WHERE au.id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_profile_email ON public.profiles;
CREATE TRIGGER trg_fill_profile_email
BEFORE INSERT OR UPDATE OF email ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.fill_profile_email();
