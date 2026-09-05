import { supabase } from "@/integrations/supabase/client";
import { readGateway } from "@/lib/readGateway";

/**
 * تعليقات منشور واحد "عند الطلب" (Lazy):
 * تُقرأ عبر البوابة `/comments?post_id=...` (مخزّنة في KV لمدة 5 دقائق) —
 * وعندما تغيب البوابة أو تفشل نتراجع مباشرةً إلى Supabase بنفس استعلامات
 * المسار القديم. بذلك لا يُجلب الفيد أجسام التعليقات إطلاقاً، وأي مستخدم يفتح
 * منشوراً يشارك نفس القراءة من القاعدة.
 */

export interface PostCommentProfile {
  full_name: string | null;
  avatar_url: string | null;
  generation?: string | null;
  field?: string | null;
  gender?: string | null;
}

export interface PostComment {
  id: string;
  content: string;
  user_id: string;
  parent_comment_id: string | null;
  created_at: string;
  is_pinned: boolean;
  profiles: PostCommentProfile | null;
}

export interface PostCommentsBundle {
  comments: PostComment[];
  commentLikes: Record<string, { count: number; liked: boolean }>;
}

interface GatewayCommentsBundle {
  comments: PostComment[];
  commentLikes: { comment_id: string; user_id: string }[];
  profiles: Record<string, PostCommentProfile | undefined>;
}

export async function loadPostComments(userId: string, postId: string): Promise<PostCommentsBundle> {
  if (!userId || !postId) return { comments: [], commentLikes: {} };

  // البوابة أولاً (تحمل Auth صامت إذا لزم — المسار عام مثل /config).
  const bundle = await readGateway<GatewayCommentsBundle>(
    `/comments?post_id=${encodeURIComponent(postId)}`
  );
  if (bundle && Array.isArray(bundle.comments)) {
    return composeComments(bundle.comments, bundle.commentLikes || [], bundle.profiles || {}, userId);
  }

  // تراجع مباشر بصلاحيات RLS للمستخدم نفسه (نفس استعلام المسار القديم تماماً).
  const { data: commentRows, error } = await supabase
    .from("comments")
    .select("id, post_id, content, user_id, parent_comment_id, created_at, is_pinned, profiles:profiles!comments_user_id_profiles_fkey(full_name, avatar_url, generation, field, gender)")
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const baseRows = (commentRows || []) as unknown as PostComment[];
  const ids = baseRows.map((c) => c.id);
  const [likesRes] = ids.length
    ? await Promise.all([
        supabase.from("comment_likes").select("comment_id, user_id").in("comment_id", ids),
      ])
    : [{ data: [] }];

  const profileMap: Record<string, PostCommentProfile | undefined> = {};
  baseRows.forEach((c) => { profileMap[c.user_id] = c.profiles || undefined; });

  return composeComments(
    baseRows,
    (likesRes.data || []) as { comment_id: string; user_id: string }[],
    profileMap,
    userId
  );
}

function composeComments(
  rows: PostComment[],
  likeRows: { comment_id: string; user_id: string }[],
  profileMap: Record<string, PostCommentProfile | undefined>,
  userId: string
): PostCommentsBundle {
  const comments: PostComment[] = rows.map((c) => ({
    id: c.id,
    content: c.content,
    user_id: c.user_id,
    parent_comment_id: c.parent_comment_id,
    created_at: c.created_at,
    is_pinned: !!c.is_pinned,
    profiles: profileMap[c.user_id] ?? c.profiles ?? null,
  }));

  const commentLikes: Record<string, { count: number; liked: boolean }> = {};
  comments.forEach((c) => {
    const likes = likeRows.filter((l) => l.comment_id === c.id);
    commentLikes[c.id] = {
      count: likes.length,
      liked: userId ? likes.some((l) => l.user_id === userId) : false,
    };
  });

  return { comments, commentLikes };
}