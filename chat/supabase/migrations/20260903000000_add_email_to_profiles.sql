-- ============================================================================
-- Migration: إضافة عمود البريد الإلكتروني لجدول المستخدمين
-- غيّر الاسم الافتراضي "مستخدم جديد" واعمله يظهر الإيميل تحت كل مستخدم
-- ============================================================================

-- 1) إضافة عمود email إلى جدول profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2) ملء الإيميلات الحالية من auth.users
UPDATE public.profiles p
SET email = au.email
FROM auth.users au
WHERE p.user_id = au.id
  AND p.email IS NULL;

-- 3) تعبئة الإيميلات للمستخدمين الجدد تلقائياً عند إنشاء الحساب
-- نعدّل الدالة handle_new_user لإضافة الإيميل
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url, email)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.email = 'abdalrhmanmaaith24@gmail.com' THEN 'Admin Abdalrhman ✅'
      ELSE COALESCE(NEW.raw_user_meta_data->>'full_name', 'مستخدم جديد')
    END,
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email
  );
  IF NEW.email = 'abdalrhmanmaaith24@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4) تعبئة أي مستخدمين فاضيين بالإيميل (احتياطي)
UPDATE public.profiles p
SET email = au.email
FROM auth.users au
WHERE p.user_id = au.id
  AND (p.email IS NULL OR p.email = '');
