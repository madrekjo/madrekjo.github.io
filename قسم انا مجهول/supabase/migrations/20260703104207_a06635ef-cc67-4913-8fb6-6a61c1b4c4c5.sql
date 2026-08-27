
-- 1. Fix mutable search_path on validate_attachments
CREATE OR REPLACE FUNCTION public.validate_attachments()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
  a jsonb;
  u text;
BEGIN
  IF NEW.attachments IS NULL OR jsonb_typeof(NEW.attachments) <> 'array' THEN
    NEW.attachments := '[]'::jsonb;
    RETURN NEW;
  END IF;
  IF jsonb_array_length(NEW.attachments) > 10 THEN
    RAISE EXCEPTION 'too many attachments';
  END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(NEW.attachments) LOOP
    u := a->>'url';
    IF u IS NULL OR u !~ '^https?://[a-zA-Z0-9.-]+/storage/v1/object/public/attachments/' THEN
      RAISE EXCEPTION 'invalid attachment url';
    END IF;
  END LOOP;
  RETURN NEW;
END
$function$;

-- 2. Revoke EXECUTE from PUBLIC/anon/authenticated on all SECURITY DEFINER functions.
--    Trigger-only functions need no grants (triggers ignore EXECUTE grants and run as function owner).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.posts_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.comments_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_posts_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_comments_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_post_edit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_comment_edit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_attachments() FROM PUBLIC, anon, authenticated;

-- 3. RPC functions callable from the client: revoke from PUBLIC, grant only to the
--    roles that must call them. has_role is used inside RLS expressions so both
--    anon and authenticated need EXECUTE for policies to evaluate.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;

-- Admin-only RPCs: only signed-in admins should call these; the function itself checks the role.
REVOKE EXECUTE ON FUNCTION public.get_device_dossier(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_device_dossier(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_device_label(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_device_label(text, text) TO authenticated;

-- Device-scoped RPCs the anonymous client needs (edits, unlikes, alias, heartbeat).
-- These stay SECURITY DEFINER because RLS on the underlying tables has no
-- device-scoped UPDATE/DELETE policy for anon; the functions do their own
-- device_id ownership check. Restrict to anon+authenticated (deny PUBLIC).
REVOKE EXECUTE ON FUNCTION public.edit_post(uuid, text, text)         FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.edit_post(uuid, text, text)         TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.edit_comment(uuid, text, text)      FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.edit_comment(uuid, text, text)      TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.edit_chat_post(uuid, text, text)    FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.edit_chat_post(uuid, text, text)    TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.edit_chat_comment(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.edit_chat_comment(uuid, text, text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unlike_post(uuid, text)             FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.unlike_post(uuid, text)             TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unlike_chat_post(uuid, text)        FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.unlike_chat_post(uuid, text)        TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_anon_number(text)            FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.assign_anon_number(text)            TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.heartbeat_device(text, integer)     FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.heartbeat_device(text, integer)     TO anon, authenticated;
