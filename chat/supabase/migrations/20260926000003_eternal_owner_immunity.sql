-- ============================================================================
-- SUPABASE SQL EDITOR — شغّل هذا الملف يدوياً
-- المشروع الحي: chat (hvrtzzouasqseyswjcex)
-- الرابط: https://supabase.com/dashboard/project/hvrtzzouasqseyswjcex/sql-editor
-- ============================================================================
-- حصانة مالكية دائمة للجراح (abdalrahmanjarrah94@gmail.com):
--   رتبة "owner" لحساب جراح لا تُحذف ولا تُعدَّل ولا يُعطَّل نظام حمايتها —
--   حتى من SQL مباشرة. ثلاث طبقات:
--
--   (طبقة 1) trg_lock_eternal_owner (BEFORE DELETE/UPDATE/TRUNCATE):
--            أي محاولة لمس صف (جراح, owner) → خطأ يُلغي العملية كلها.
--   (طبقة 2) trg_reassert_eternal_owner (AFTER DELETE/UPDATE/TRUNCATE):
--            شبكة أمان — إن نجح أي حذف رغم ذلك يُعاد إدخال الصف فوراً.
--   (طبقة 3) event triggers: أي DDL يُحاول إسقاط/تعطيل محميات المالك
--            (DROP TRIGGER/FUNCTION/TABLE أو ALTER…DISABLE TRIGGER)
--            → يُمنع مع إرجاع العملية.
--
-- ⚠️ مفتاح الصيانة: ملفات مستقبلية للمالك نفسه، إن احتاجت تعديل هذه الحماية،
--    تضاف داخل الاستعلام:   __OWNDEF__
--    (بدونها يُرفض أي مساس بالمحمية — تماماً كما رُصد).
-- ============================================================================

-- هوية جراح الثابتة (لا تتأثر بتغيير البريد):
--   b5177f22-2240-494e-b84d-d2b44dac84b7

-- ============================================================
-- الطبقة 1: قفل الصف
-- ============================================================
CREATE OR REPLACE FUNCTION public.lock_eternal_owner_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE')
     AND OLD.user_id = 'b5177f22-2240-494e-b84d-d2b44dac84b7'
     AND OLD.role = 'owner'::public.app_role THEN
    RAISE EXCEPTION 'حساب المالك الجراح محمي، لا يمكن تعديل رتبته أو حذفها';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

-- ============================================================
-- الطبقة 2: إعادة التأكيد (شبكة أمان)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reassert_eternal_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES ('b5177f22-2240-494e-b84d-d2b44dac84b7', 'owner'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NULL;
END $$;

-- الطبقة 2/ب: منع TRUNCATE على الجدول
CREATE OR REPLACE FUNCTION public.block_eternal_owner_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'لا يمكن تفريغ جدول الرتب — حماية المالك';
END $$;

DROP TRIGGER IF EXISTS trg_lock_eternal_owner ON public.user_roles;
CREATE TRIGGER trg_lock_eternal_owner
  BEFORE DELETE OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.lock_eternal_owner_row();

DROP TRIGGER IF EXISTS trg_reassert_eternal_owner ON public.user_roles;
CREATE TRIGGER trg_reassert_eternal_owner
  AFTER DELETE OR UPDATE ON public.user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION public.reassert_eternal_owner();

DROP TRIGGER IF EXISTS trg_block_owner_truncate ON public.user_roles;
CREATE TRIGGER trg_block_owner_truncate
  BEFORE TRUNCATE ON public.user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION public.block_eternal_owner_truncate();

-- ============================================================
-- الطبقة 3: حماية DDL (إسقاط/تعطيل المحميات نفسها)
-- ============================================================
CREATE OR REPLACE FUNCTION public.block_owner_tamper_drop()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  v_q TEXT := current_query();
BEGIN
  -- مفتاح الصيانة الرسمي (المالك فقط)
  IF v_q LIKE '%__OWNDEF__%' THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF r.object_type IN ('trigger', 'function', 'table', 'schema', 'event trigger')
       AND (
            r.object_identity ILIKE '%eternal_owner%'
            OR r.object_identity ILIKE '%protect_owner_roles%'
            OR r.object_identity = 'public.user_roles'
            OR r.object_identity ILIKE 'public.user_roles%'
            OR r.object_identity ILIKE '%block_owner_tamper%'
       )
    THEN
      RAISE EXCEPTION 'محميات المالك محمية — لا يمكن إسقاطها (غطّ كل قواعد الحماية)';
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.block_owner_tamper_ddl()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_q TEXT := current_query();
BEGIN
  IF v_q LIKE '%__OWNDEF__%' THEN
    RETURN;
  END IF;

  IF tg_tag IN ('ALTER TABLE', 'DROP TABLE', 'DROP FUNCTION', 'DROP TRIGGER',
                'DROP EVENT TRIGGER', 'DROP SCHEMA')
     AND (
          (v_q ILIKE '%disable%trigger%' AND v_q ILIKE '%eternal_owner%')
          OR (v_q ILIKE '%disable%trigger%' AND v_q ILIKE '%user_roles%')
          OR (v_q ILIKE '%disable%trigger%' AND v_q ILIKE '%protect_owner_roles%')
          OR v_q ILIKE '%drop%schema public%'
          OR v_q ILIKE '%drop%user_roles%'
     )
  THEN
    RAISE EXCEPTION 'محميات المالك محمية — لا يمكن تعطيل/إسقاط في هذه القاعدة';
  END IF;
END $$;

DROP EVENT TRIGGER IF EXISTS trg_block_owner_tamper_drop;
DROP EVENT TRIGGER IF EXISTS trg_block_owner_tamper_ddl;
CREATE EVENT TRIGGER trg_block_owner_tamper_drop
  ON sql_drop
  EXECUTE FUNCTION public.block_owner_tamper_drop();
CREATE EVENT TRIGGER trg_block_owner_tamper_ddl
  ON ddl_command_start
  EXECUTE FUNCTION public.block_owner_tamper_ddl();

-- ============================================================
-- تأكيد
-- ============================================================
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%eternal_owner%' OR tgname LIKE '%block_owner_truncate%';
SELECT evtname FROM pg_event_trigger WHERE evtname LIKE 'trg_block_owner_tamper%';
SELECT u.email, ur.role FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.user_id = 'b5177f22-2240-494e-b84d-d2b44dac84b7';