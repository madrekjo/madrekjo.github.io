-- =====================================================
-- قسم «اكتب سؤالك» — مدارك جو
-- تفعيل حسابات الضيف (بدون كلمة مرور)
-- التنفيذ يدوياً في Supabase → SQL Editor
-- =====================================================

-- التطبيق يوقع كل زائر حساب ضيف مجاني حتى يُنشر سؤاله (RLS: auth.uid() = author_id)
-- إن كان التفعيل يدعم auth.config نفّذه هناك، وإلا فعّل من اللوحة:
--   Authentication → Sign In / Providers → Anonymous sign-ins (ON)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'config'
      and column_name = 'anon_sign_in_enabled'
  ) then
    update auth.config set anon_sign_in_enabled = true;
    raise notice 'حسابات الضيف مفعّلة عبر auth.config';
  else
    raise notice 'auth.config لا يدعمها — فعّلها من اللوحة: Authentication → Sign In / Providers → Anonymous';
  end if;
end $$;