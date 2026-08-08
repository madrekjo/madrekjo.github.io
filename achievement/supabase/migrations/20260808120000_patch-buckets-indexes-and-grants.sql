-- Patch migration: run on EXISTING database. No tables are dropped.
-- Adds the missing round-images bucket, makes support-attachments private,
-- secures function execution, and adds performance indexes.

INSERT INTO storage.buckets (id, name, public)
VALUES ('round-images', 'round-images', false)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET public = false
WHERE id = 'support-attachments';

REVOKE EXECUTE ON FUNCTION public.get_support_admin_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_support_admin_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_public_successful_tasks() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_successful_tasks(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_support_admin_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_admin_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_successful_tasks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_successful_tasks(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON public.tasks (user_id);
CREATE INDEX IF NOT EXISTS tasks_success_idx ON public.tasks (completed, is_success);
CREATE INDEX IF NOT EXISTS round_participants_round_id_idx ON public.round_participants (round_id);
CREATE INDEX IF NOT EXISTS round_participants_user_id_idx ON public.round_participants (user_id);

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE email = 'abdalrhmanmaaith24@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.users.id AND ur.role = 'admin'
  );
