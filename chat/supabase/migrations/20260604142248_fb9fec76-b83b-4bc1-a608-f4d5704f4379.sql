
-- Helper: is current user banned (full or chat)
CREATE OR REPLACE FUNCTION public.is_user_banned()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(is_banned, false) FROM public.profiles WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_user_chat_banned()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(is_banned, false) OR COALESCE(chat_banned, false)
    OR COALESCE(timeout_until > now(), false)
  FROM public.profiles WHERE user_id = auth.uid();
$$;

-- Trigger fn: block banned users from writing content
CREATE OR REPLACE FUNCTION public.enforce_ban_on_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_user_banned() THEN
    RAISE EXCEPTION 'user_banned';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_chat_ban_on_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_user_chat_banned() THEN
    RAISE EXCEPTION 'user_chat_banned';
  END IF;
  RETURN NEW;
END $$;

-- Trigger fn: banned word filter (admins exempt)
CREATE OR REPLACE FUNCTION public.check_banned_words()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  txt text := lower(COALESCE(NEW.content, ''));
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF txt = '' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.banned_words WHERE position(lower(word) IN txt) > 0) THEN
    RAISE EXCEPTION 'content_contains_banned_word';
  END IF;
  RETURN NEW;
END $$;

-- Attach ban-enforcement triggers
DROP TRIGGER IF EXISTS trg_ban_posts ON public.posts;
CREATE TRIGGER trg_ban_posts BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.enforce_chat_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_comments ON public.comments;
CREATE TRIGGER trg_ban_comments BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.enforce_chat_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_likes ON public.likes;
CREATE TRIGGER trg_ban_likes BEFORE INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_comment_likes ON public.comment_likes;
CREATE TRIGGER trg_ban_comment_likes BEFORE INSERT ON public.comment_likes FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_changes ON public.changes_messages;
CREATE TRIGGER trg_ban_changes BEFORE INSERT ON public.changes_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_round_chat ON public.round_chat;
CREATE TRIGGER trg_ban_round_chat BEFORE INSERT ON public.round_chat FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_schedule_comments ON public.schedule_comments;
CREATE TRIGGER trg_ban_schedule_comments BEFORE INSERT ON public.schedule_comments FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_suggestions ON public.suggestions;
CREATE TRIGGER trg_ban_suggestions BEFORE INSERT ON public.suggestions FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_round_meeting_messages ON public.round_meeting_messages;
CREATE TRIGGER trg_ban_round_meeting_messages BEFORE INSERT ON public.round_meeting_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

DROP TRIGGER IF EXISTS trg_ban_support ON public.support_messages;
CREATE TRIGGER trg_ban_support BEFORE INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_ban_on_write();

-- Attach banned-word triggers to text content tables
DROP TRIGGER IF EXISTS trg_words_posts ON public.posts;
CREATE TRIGGER trg_words_posts BEFORE INSERT OR UPDATE OF content ON public.posts FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();

DROP TRIGGER IF EXISTS trg_words_comments ON public.comments;
CREATE TRIGGER trg_words_comments BEFORE INSERT OR UPDATE OF content ON public.comments FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();

DROP TRIGGER IF EXISTS trg_words_changes ON public.changes_messages;
CREATE TRIGGER trg_words_changes BEFORE INSERT ON public.changes_messages FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();

DROP TRIGGER IF EXISTS trg_words_round_chat ON public.round_chat;
CREATE TRIGGER trg_words_round_chat BEFORE INSERT ON public.round_chat FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();

DROP TRIGGER IF EXISTS trg_words_schedule_comments ON public.schedule_comments;
CREATE TRIGGER trg_words_schedule_comments BEFORE INSERT ON public.schedule_comments FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();

DROP TRIGGER IF EXISTS trg_words_suggestions ON public.suggestions;
CREATE TRIGGER trg_words_suggestions BEFORE INSERT ON public.suggestions FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();

DROP TRIGGER IF EXISTS trg_words_round_meeting_messages ON public.round_meeting_messages;
CREATE TRIGGER trg_words_round_meeting_messages BEFORE INSERT ON public.round_meeting_messages FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();
