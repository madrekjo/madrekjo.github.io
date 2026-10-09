import { useState, useEffect, useCallback, useMemo, useRef, forwardRef, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { containsBannedWord } from "@/lib/bannedWords";
import { invalidateTable } from "@/lib/invalidation";
import { loadPostComments, type PostComment } from "@/lib/postComments";
import { loadAdminUserIds, loadOwnerUserIds, loadRoseUserIds, loadShineUserIds, loadSocialAdminIds } from "@/lib/appCache";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Heart, MessageCircle, Trash2, Edit2, Send, CornerDownLeft, Pin, PinOff, Flag, Loader2, Image as ImageIcon, X } from "lucide-react";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { compressMedia, MAX_IMAGE_BYTES } from "@/lib/mediaCompression";
import { usePoints } from "@/contexts/PointsContext";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import UserProfileDialog from "@/components/UserProfileDialog";
import RoundsBadge from "@/components/RoundsBadge";
import PollView from "@/components/PollView";
import type { PollData } from "@/lib/polls";
import Lightbox from "@/components/Lightbox";
import ReportDialog from "@/components/ReportDialog";
import { formatDisplayName } from "@/lib/displayName";
import MentionInput from "@/components/MentionInput";
import { hasBulkMention, mentionCostFor, renderMentions, submitMentions } from "@/lib/mentions";
import { ShieldCheck, Crown, Instagram } from "lucide-react";
import { REACTIONS, reactionEmoji } from "@/lib/reactions";

const SocialBadge = ({ social }: { social: boolean }) => {
  if (!social) return null;
  return <span title="مسؤول السوشيال ميديا" className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-orange-500 border border-orange-300/70 shrink-0 shadow-[0_0_6px_rgba(249,115,22,0.8)]"><Instagram className="w-2 h-2 text-white" /></span>;
};

const VerificationBadge = ({ gender, isAuthorAdmin, isAuthorOwner, isAuthorSocial }: { gender?: string | null; isAuthorAdmin: boolean; isAuthorOwner?: boolean; isAuthorSocial?: boolean }) => {
  if (isAuthorOwner) {
    return <span title="المالك" className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-600 border border-yellow-200/60 shrink-0 shadow-[0_0_6px_rgba(251,191,36,0.8)]"><Crown className="w-2.5 h-2.5 text-white" /></span>;
  }
  if (isAuthorSocial) {
    return <span title="مسؤول السوشيال ميديا" className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-500 border border-orange-300/70 shrink-0 shadow-[0_0_6px_rgba(249,115,22,0.8)]"><Instagram className="w-2.5 h-2.5 text-white" /></span>;
  }
  if (isAuthorAdmin) {
    return <span title="مدير" className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500 shrink-0"><ShieldCheck className="w-3 h-3 text-white" /></span>;
  }
  if (gender === "male") {
    return <span title="طالب" className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-500 shrink-0" />;
  }
  if (gender === "female") {
    return <span title="طالبة" className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-pink-500 shrink-0" />;
  }
  return null;
};

/** حلقة ملونة حول الصورة للرتب المميزة:
 * المالك (ذهبي gold) + المستخدمون الورديون (rose) + ذوو الوميض الذهبي (shine)
 * + مسؤولو السوشيال ميديا (ألوان انستغرام insta). */
const Halo = ({ tone, children }: { tone: "gold" | "rose" | "shine" | "insta" | null; children: ReactNode }) => {
  if (!tone) return <>{children}</>;
  const cls =
    tone === "shine"
      ? "halo-shine halo-shine-glow ring-1 ring-yellow-200/80"
      : tone === "rose"
      ? "bg-gradient-to-br from-pink-300 via-rose-400 to-pink-600 shadow-[0_0_14px_rgba(244,114,182,0.65)] ring-1 ring-pink-200/70 group-hover:shadow-[0_0_20px_rgba(244,114,182,0.9)]"
      : tone === "insta"
      ? "bg-orange-500 shadow-[0_0_14px_rgba(249,115,22,0.65)] ring-1 ring-orange-300/70 group-hover:shadow-[0_0_20px_rgba(249,115,22,0.9)]"
      : "bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-600 shadow-[0_0_14px_rgba(251,191,36,0.65)] ring-1 ring-yellow-200/70 group-hover:shadow-[0_0_20px_rgba(251,191,36,0.9)]";
  return (
    <span className={`block rounded-full p-[2px] ${cls} transition-all`}>
      {children}
    </span>
  );
};

interface PostProps {
  post: {
    id: string;
    user_id: string;
    content: string;
    image_url: string | null;
    image_urls: string[] | null;
    video_url: string | null;
    created_at: string;
    status?: string | null;
    profiles: { full_name: string; avatar_url: string | null; generation?: string | null; field?: string | null; gender?: string | null } | null;
    likes: { user_id: string; type: string }[];
    comments: PostComment[];
    /** عدد التعليقات — من الفيد الرفيع (المنشورات الحية لا تحمل أجسام التعليقات). */
    commentCount?: number;
    /** تصويت مرفق بالمنشور (إن وُجد). */
    poll?: PollData | null;
  };
  onRefresh: () => void;
  /** تغيير محلي فوري لحالة تفاعل المنشور عند المتصل (بدون إعادة جلب).
   * reaction: نوع التفاعل الجديد، أو null عند إزالته. */
  onLikeChanged?: (postId: string, reaction: string | null) => void;
  /** تسجيل صوت على تصويت هذا المنشور. */
  onPollVote?: (postId: string, pollId: string, optionId: string) => void;
  highlight?: boolean;
  authorIsAdmin?: boolean;
  authorIsOwner?: boolean;
}

const PostCard = forwardRef<HTMLDivElement, PostProps>(({ post, onRefresh, onLikeChanged, onPollVote, highlight, authorIsAdmin: authorIsAdminProp, authorIsOwner: authorIsOwnerProp }, ref) => {
  const { user, isAdmin, isModerator, profile, isStaff } = useAuth();
  const { spend, getCost, balance } = usePoints();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [commentLikes, setCommentLikes] = useState<Record<string, { count: number; liked: boolean }>>({});
  // تعليقات كسولة — تُحمَّل عند فتح لوحة التعليقات فقط (ليست في أجسام الفيد).
  const [loadedComments, setLoadedComments] = useState<PostComment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [localCount, setLocalCount] = useState(post.commentCount ?? post.comments.length);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  // مرفق صورة/الغيف: للتعليق الجديد والرد الجديد (ملف واحد لكل واحد).
  const [commentImage, setCommentImage] = useState<File | null>(null);
  const [commentPreview, setCommentPreview] = useState<string | null>(null);
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [replyPreview, setReplyPreview] = useState<string | null>(null);
  const [editCommentRemoveImage, setEditCommentRemoveImage] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (commentPreview) URL.revokeObjectURL(commentPreview); }, [commentPreview]);
  useEffect(() => () => { if (replyPreview) URL.revokeObjectURL(replyPreview); }, [replyPreview]);
  const [lightbox, setLightbox] = useState<{ src: string; images?: string[]; index?: number; type: "image" | "video" } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [authorIsAdmin, setAuthorIsAdmin] = useState(authorIsAdminProp ?? false);
  const [ownerIds, setOwnerIds] = useState<Set<string>>(new Set());
  const authorIsOwner = ownerIds.has(post.user_id);
  const [roseIds, setRoseIds] = useState<Set<string>>(new Set());
  const [shineIds, setShineIds] = useState<Set<string>>(new Set());
  const [socialIds, setSocialIds] = useState<Set<string>>(new Set());
  // لون الهالة: ذهبي للمالك، ألوان انستغرام لمسؤول السوشيال، وميض ذهبي (shine)، وردي للورديين.
  const haloOf = useCallback(
    (uid: string): "gold" | "rose" | "shine" | "insta" | null =>
      ownerIds.has(uid) ? "gold" : socialIds.has(uid) ? "insta" : shineIds.has(uid) ? "shine" : roseIds.has(uid) ? "rose" : null,
    [ownerIds, roseIds, shineIds, socialIds]
  );
  const postHalo = haloOf(post.user_id);
  const [showLikers, setShowLikers] = useState(false);
  const [likersData, setLikersData] = useState<{ user_id: string; full_name: string | null; avatar_url: string | null; gender?: string | null; type?: string }[] | null>(null);
  const [likersLoading, setLikersLoading] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);

  const canDelete = isAdmin || isModerator;
  const isOwner = user?.id === post.user_id;
  const myReaction = post.likes.find(l => l.user_id === user?.id)?.type ?? null;

  // توزيع التفاعلات حسب النوع (للعرض المختصر المثل فيسبوك: أعلى 3 إيموجيات)
  const reactionCounts = useMemo(() => {
    const m = new Map<string, number>();
    post.likes.forEach(l => {
      const t = l.type || "like";
      m.set(t, (m.get(t) || 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [post.likes]);
  const breakdownTop = reactionCounts.slice(0, 3);

  useEffect(() => {
    const loadSets = async () => {
      // المجموعات الثلاث تُحمَّل دائماً من الكاش حتى تظهر الهالة في التعليقات والردود
      // للمالكين والورديين واللآمعين — لا نكتفي بالـ prop الخاص بالمنشور فقط.
      const [adminSet, ownerSet, roseSet, shineSet, socialSet] = await Promise.all([
        loadAdminUserIds(),
        loadOwnerUserIds(),
        loadRoseUserIds(),
        loadShineUserIds(),
        loadSocialAdminIds(),
      ]);
      setAuthorIsAdmin(authorIsAdminProp !== undefined ? authorIsAdminProp : adminSet.has(post.user_id));
      setOwnerIds(ownerSet);
      setRoseIds(roseSet);
      setShineIds(shineSet);
      setSocialIds(socialSet);
    };
    loadSets();
  }, [post.user_id, authorIsAdminProp, authorIsOwnerProp]);

  // اسم المالك يظهر الاسم فقط (بدون حقل/جيل) — ميزة حصرية للمالك.
  const ownerName = useCallback((profile: { full_name?: string | null; generation?: string | null; field?: string | null } | null | undefined, uid?: string | null) =>
    formatDisplayName(profile, undefined, !!uid && ownerIds.has(uid)), [ownerIds]);

  const reloadComments = useCallback(async () => {
    if (!user) { setCommentsLoaded(true); return; }
    setCommentsLoading(true);
    try {
      const bundle = await loadPostComments(user.id, post.id);
      setLoadedComments(bundle.comments);
      setCommentLikes(bundle.commentLikes);
      setLocalCount(bundle.comments.length);
    } catch {
      toast.error("تعذر تحميل التعليقات");
    } finally {
      setCommentsLoading(false);
      setCommentsLoaded(true);
    }
  }, [user, post.id]);

  // تحميل كسول: عند فتح لوحة التعليقات وعدم وجود تعليقات محمّلة بعد.
  useEffect(() => {
    if (showComments && !commentsLoaded && !commentsLoading) {
      void reloadComments();
    }
  }, [showComments, commentsLoaded, commentsLoading, reloadComments]);

  // Auto-open comments if highlighted
  useEffect(() => {
    if (highlight) setShowComments(true);
  }, [highlight]);

  const sortedComments = [...loadedComments].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const topComments = sortedComments.filter(c => !c.parent_comment_id);
  const getReplies = (commentId: string) => sortedComments.filter(c => c.parent_comment_id === commentId);

  const handleReact = async (type: string) => {
    if (!user) return;
    if (profile?.is_banned) { toast.error("حسابك محظور، لا يمكنك التفاعل"); return; }
    const my = post.likes.find(l => l.user_id === user.id)?.type ?? null;
    try {
      if (my === type) {
        // ضغط نفس التفاعل مرة أخرى = إزالة
        await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", user.id);
        onLikeChanged?.(post.id, null);
      } else {
        const exists = post.likes.some(l => l.user_id === user.id);
        if (exists) {
          // تفاعل جديد يحل محل القديم (مثل فيسبوك)
          await supabase.from("likes").update({ type }).eq("post_id", post.id).eq("user_id", user.id);
        } else {
          await supabase.from("likes").insert({ post_id: post.id, user_id: user.id, type });
          if (post.user_id !== user.id) {
            await supabase.from("notifications").insert({ user_id: post.user_id, actor_id: user.id, type: "like", post_id: post.id });
          }
        }
        onLikeChanged?.(post.id, type);
      }
    } catch {
      toast.error("فشل تحديث التفاعل");
    }
    void invalidateTable("likes");
  };

  const toggleLikers = async () => {
    if (!isAdmin && !isModerator) return;
    if (showLikers) { setShowLikers(false); return; }
    setShowLikers(true);
    if (likersData !== null) return;
    if (post.likes.length === 0) { setLikersData([]); return; }
    setLikersLoading(true);
    const ids = Array.from(new Set(post.likes.map(l => l.user_id)));
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url, gender")
      .in("user_id", ids);
    const map: Record<string, any> = {};
    (data || []).forEach((p: any) => { map[p.user_id] = p; });
    setLikersData(post.likes.map(l => ({ ...(map[l.user_id] || { user_id: l.user_id, full_name: null, avatar_url: null, gender: null }), type: l.type || "like" })));
    setLikersLoading(false);
  };

  const handleCommentLike = async (commentId: string) => {
    if (!user) return;
    if (profile?.is_banned) { toast.error("حسابك محظور"); return; }
    const current = commentLikes[commentId];
    if (current?.liked) {
      await supabase.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", user.id);
    } else {
      await supabase.from("comment_likes").insert({ comment_id: commentId, user_id: user.id });
    }
    void invalidateTable("comment_likes");
    // تحديث محلي فوري — بلا إعادة جلب comment_likes من القاعدة
    setCommentLikes(prev => ({
      ...prev,
      [commentId]: {
        count: Math.max(0, (prev[commentId]?.count || 0) + (current?.liked ? -1 : 1)),
        liked: !current?.liked,
      },
    }));
  };

  // مرفق تعليق واحد: ضغط الصور العادية وتجاوز الـGIF (يبقى متحركاً) ثم رفع Cloudinary.
  const uploadCommentImage = async (file: File): Promise<string> => {
    const compressed = await compressMedia(file);
    if (compressed.size > MAX_IMAGE_BYTES) throw new Error("too_large");
    return await uploadToCloudinary(compressed);
  };

  const pickCommentImage = (file: File | undefined, kind: "comment" | "reply") => {
    if (!file) return;
    if (file.type !== "image/gif" && !file.name.toLowerCase().endsWith(".gif")) {
      toast.error("التعليقات تقبل GIF فقط");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES * 4) { toast.error("حجم الملف كبير جداً — الحد 5MB"); return; }
    const preview = URL.createObjectURL(file);
    if (kind === "comment") { setCommentImage(file); setCommentPreview(preview); }
    else { setReplyImage(file); setReplyPreview(preview); }
  };

  const handleComment = async () => {
    const hasImage = !!commentImage;
    if (!user || sendingComment || (!commentText.trim() && !hasImage)) return;
    if (profile?.is_banned) { toast.error("حسابك محظور، لا يمكنك التعليق"); return; }
    if (commentText.trim() && containsBannedWord(commentText, isAdmin)) { toast.error("التعليق يحتوي على كلمات محظورة"); return; }
    // فحص النقاط
    const hasBulk = hasBulkMention(commentText);
    const commentCost = mentionCostFor(commentText, getCost("comment"));
    if (!isStaff && balance < commentCost) {
      toast.error(`تحتاج ${commentCost} نقطة لإضافة تعليق. رصيدك الحالي: ${balance}`);
      return;
    }
    setSendingComment(true);
    try {
      let imageUrl: string | null = null;
      if (commentImage) {
        try { imageUrl = await uploadCommentImage(commentImage); }
        catch { toast.error("تعذر رفع GIF — الحد 5MB"); return; }
      }
      const payload = {
        post_id: post.id,
        user_id: user.id,
        content: commentText.trim(),
        ...(imageUrl ? { image_url: imageUrl } : {}),
      };
      const { data: insertedC, error } = await supabase.from("comments").insert(payload).select("id");
      if (error || !insertedC?.[0]?.id) {
        toast.error(
          error?.message?.includes("image_url")
            ? "المرفقات غير مفعّلة بعد — شغّل migration التعليقات في SQL Editor"
            : "فشل إرسال التعليق"
        );
        return;
      }
      const commentId = insertedC[0].id;
      await submitMentions(supabase, { postId: post.id, commentId, actorId: user.id, text: commentText, channel: (post as any).channel || "all" });
      // خصم النقاط بعد التعليق الناجح
      if (!isStaff) {
        await spend(commentCost, hasBulk ? "everyone" : "comment", "chat", { postId: post.id, commentId });
      }
      if (post.user_id !== user.id) {
        await supabase.from("notifications").insert({ user_id: post.user_id, actor_id: user.id, type: "comment", post_id: post.id });
      }
      setCommentText(""); setCommentImage(null); setCommentPreview(null);
      void invalidateTable("comments");
      setLocalCount(n => n + 1);
      void reloadComments();
    } finally {
      setSendingComment(false);
    }
  };

  const handleReply = async (parentId: string) => {
    const hasImage = !!replyImage;
    if (!user || sendingComment || (!replyText.trim() && !hasImage)) return;
    if (profile?.is_banned) { toast.error("حسابك محظور، لا يمكنك الرد"); return; }
    if (replyText.trim() && containsBannedWord(replyText, isAdmin)) { toast.error("الرد يحتوي على كلمات محظورة"); return; }
    // فحص النقاط
    const hasBulkReply = hasBulkMention(replyText);
    const replyCost = mentionCostFor(replyText, getCost("comment"));
    if (!isStaff && balance < replyCost) {
      toast.error(`تحتاج ${replyCost} نقطة لإضافة رد. رصيدك الحالي: ${balance}`);
      return;
    }
    setSendingComment(true);
    try {
      let imageUrl: string | null = null;
      if (replyImage) {
        try { imageUrl = await uploadCommentImage(replyImage); }
        catch { toast.error("تعذر رفع GIF — الحد 5MB"); return; }
      }
      const payload = {
        post_id: post.id,
        user_id: user.id,
        content: replyText.trim(),
        parent_comment_id: parentId,
        ...(imageUrl ? { image_url: imageUrl } : {}),
      };
      const { data: insertedR, error } = await supabase.from("comments").insert(payload).select("id");
      if (error || !insertedR?.[0]?.id) {
        toast.error(
          error?.message?.includes("image_url")
            ? "المرفقات غير مفعّلة بعد — شغّل migration التعليقات في SQL Editor"
            : "فشل إرسال الرد"
        );
        return;
      }
      const commentId = insertedR[0].id;
      await submitMentions(supabase, { postId: post.id, commentId, actorId: user.id, text: replyText, channel: (post as any).channel || "all" });
      // خصم النقاط بعد الرد الناجح
      if (!isStaff) {
        await spend(replyCost, hasBulkReply ? "everyone" : "comment", "chat", { postId: post.id, commentId });
      }
      const parentComment = loadedComments.find(c => c.id === parentId);
      if (parentComment && parentComment.user_id !== user.id) {
        await supabase.from("notifications").insert({ user_id: parentComment.user_id, actor_id: user.id, type: "reply", post_id: post.id, comment_id: parentId });
      }
      setReplyText(""); setReplyImage(null); setReplyPreview(null);
      setReplyTo(null);
      void invalidateTable("comments");
      setLocalCount(n => n + 1);
      void reloadComments();
    } finally {
      setSendingComment(false);
    }
  };

  const handleDeletePost = async () => {
    await supabase.from("posts").update({ deleted_at: new Date().toISOString(), deleted_by: user?.id } as any).eq("id", post.id);
    void invalidateTable("posts");
    onRefresh();
  };
  const handleEditPost = async () => {
    if (containsBannedWord(editContent, isAdmin)) { toast.error("المحتوى يحتوي على كلمات محظورة"); return; }
    await supabase.from("posts").update({ content: editContent.trim() }).eq("id", post.id);
    void invalidateTable("posts");
    setEditing(false);
    onRefresh();
  };
  const handleDeleteComment = async (commentId: string) => {
    await supabase.from("comments").update({ deleted_at: new Date().toISOString(), deleted_by: user?.id } as any).eq("id", commentId);
    void invalidateTable("comments");
    setLoadedComments(prev => prev.filter(c => c.id !== commentId));
    setLocalCount(n => Math.max(0, n - 1));
  };
  const handleEditComment = async (commentId: string) => {
    const target = loadedComments.find(c => c.id === commentId);
    const keepsImage = !!target?.image_url && !editCommentRemoveImage;
    if (!editCommentText.trim() && !keepsImage) return;
    if (editCommentText.trim() && containsBannedWord(editCommentText, isAdmin)) { toast.error("التعليق يحتوي على كلمات محظورة"); return; }
    const payload: { content: string; image_url?: string | null } = { content: editCommentText.trim() };
    if (editCommentRemoveImage) payload.image_url = null;
    const { error } = await supabase.from("comments").update(payload).eq("id", commentId);
    if (error) toast.error("فشل التعديل");
    else {
      setLoadedComments(prev => prev.map(c => c.id === commentId
        ? { ...c, content: payload.content, image_url: editCommentRemoveImage ? null : c.image_url }
        : c));
      setEditingCommentId(null); setEditCommentText(""); setEditCommentRemoveImage(false); void invalidateTable("comments");
    }
  };
  const handlePinComment = async (commentId: string, currentlyPinned: boolean) => {
    const { error } = await supabase.from("comments").update({ is_pinned: !currentlyPinned } as any).eq("id", commentId);
    if (error) toast.error("فشل تثبيت التعليق");
    else toast.success(currentlyPinned ? "تم إلغاء التثبيت" : "تم تثبيت التعليق");
    void invalidateTable("comments");
    setLoadedComments(prev => prev.map(c => c.id === commentId ? { ...c, is_pinned: !currentlyPinned } : c));
  };
  const handlePinPost = async () => {
    const isPinned = (post as any).is_pinned;
    const { error } = await supabase.from("posts").update({ is_pinned: !isPinned } as any).eq("id", post.id);
    if (error) toast.error("فشل تثبيت المنشور");
    else toast.success(isPinned ? "تم إلغاء تثبيت المنشور" : "تم تثبيت المنشور");
    void invalidateTable("posts");
    onRefresh();
  };

  const renderCommentLike = (commentId: string) => {
    const cl = commentLikes[commentId] || { count: 0, liked: false };
    return (
      <button
        onClick={() => handleCommentLike(commentId)}
        className={`flex items-center gap-1 text-xs transition-colors touch-manipulation select-none ${cl.liked ? "text-destructive" : "text-muted-foreground hover:text-destructive"}`}
      >
        <Heart className={`w-3.5 h-3.5 ${cl.liked ? "fill-current" : ""}`} />
        {cl.count > 0 && <span>{cl.count}</span>}
      </button>
    );
  };

  return (
    <div
      ref={ref}
      className={`bg-card border rounded-xl p-4 animate-fade-in transition-all ${(post as any).is_pinned ? "border-primary/40 ring-1 ring-primary/20" : ""} ${highlight ? "ring-2 ring-primary/50" : ""}`}
    >
      {(post as any).is_pinned && (
        <div className="flex items-center gap-1 text-primary text-xs font-medium mb-2">
          <Pin className="w-3 h-3" /> منشور مثبت
        </div>
      )}
      {(post as any).status === "pending" && isOwner && !isAdmin && !isModerator && (
        <div className="flex items-center gap-1.5 text-amber-600 bg-amber-500/10 text-xs font-medium rounded-lg px-2 py-1.5 mb-2">
          <Loader2 className="w-3 h-3 animate-spin" /> بانتظار موافقة الإدارة — سيظهر للجميع بعد المراجعة
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => setProfileUserId(post.user_id)} className="shrink-0 group">
          {postHalo ? (
            <Halo tone={postHalo}>
              <Avatar className="w-10 h-10 cursor-pointer transition-all">
                <AvatarImage src={post.profiles?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {post.profiles?.full_name?.charAt(0) || "م"}
                </AvatarFallback>
              </Avatar>
            </Halo>
          ) : (
            <Avatar className="w-10 h-10 cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all">
              <AvatarImage src={post.profiles?.avatar_url || ""} />
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                {post.profiles?.full_name?.charAt(0) || "م"}
              </AvatarFallback>
            </Avatar>
          )}
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <button onClick={() => setProfileUserId(post.user_id)} className="font-semibold text-sm hover:underline text-right">
              {ownerName(post.profiles, post.user_id)}
            </button>
            <VerificationBadge gender={post.profiles?.gender} isAuthorAdmin={authorIsAdmin} isAuthorOwner={authorIsOwner} isAuthorSocial={socialIds.has(post.user_id)} />
            <RoundsBadge userId={post.user_id} />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: ar })}
          </p>
        </div>
        {(isOwner || canDelete || isAdmin) && (
          <div className="flex gap-1">
            {isAdmin && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePinPost} title={(post as any).is_pinned ? "إلغاء التثبيت" : "تثبيت المنشور"}>
                {(post as any).is_pinned ? <PinOff className="w-4 h-4 text-primary" /> : <Pin className="w-4 h-4" />}
              </Button>
            )}
            {isOwner && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(!editing); setEditContent(post.content); }}>
                <Edit2 className="w-4 h-4" />
              </Button>
            )}
            {(isOwner || canDelete) && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={handleDeletePost}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {editing ? (
        <div className="mb-3 space-y-2">
          <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="resize-none" />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleEditPost}>حفظ</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>إلغاء</Button>
          </div>
        </div>
      ) : (
        <p className="mb-3 whitespace-pre-wrap">{renderMentions(post.content, setProfileUserId)}</p>
      )}

      {/* Poll */}
      {post.poll && (
        <PollView
          poll={post.poll}
          onVote={(optionId) => onPollVote?.(post.id, post.poll!.id, optionId)}
        />
      )}

      {/* Media */}
      {(post.image_urls && post.image_urls.length > 0) ? (
        <div className={`grid gap-2 mb-3 ${post.image_urls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {post.image_urls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`صورة ${i + 1}`}
              className={`rounded-lg object-cover cursor-zoom-in ${post.image_urls!.length === 1 ? "max-h-96 w-full" : "h-48 w-full"}`}
              onClick={() => setLightbox({ src: url, images: post.image_urls!, index: i, type: "image" })}
            />
          ))}
        </div>
      ) : post.image_url ? (
        <img
          src={post.image_url}
          alt="صورة المنشور"
          className="rounded-lg mb-3 max-h-96 w-full object-cover cursor-zoom-in"
          onClick={() => setLightbox({ src: post.image_url!, type: "image" })}
        />
      ) : null}
      {post.video_url && (
        <div className="relative mb-3">
          <video src={post.video_url} controls className="rounded-lg max-h-96 w-full" />
          <button
            onClick={() => setLightbox({ src: post.video_url!, type: "video" })}
            className="absolute top-2 left-2 bg-black/60 text-white text-xs rounded-md px-2 py-1 hover:bg-black/80"
          >
            تكبير
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 border-t pt-3">
        <div className="relative">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReactionsOpen(o => !o)}
              className={`flex items-center gap-1 text-sm transition-colors touch-manipulation select-none ${myReaction ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
              title="تفاعل مع المنشور"
            >
              {myReaction ? (
                <span className="text-xl leading-none">{reactionEmoji(myReaction)}</span>
              ) : (
                <Heart className="w-5 h-5" />
              )}
            </button>

            {post.likes.length > 0 && (
              <div className="flex items-center gap-1.5">
                {breakdownTop.map(([type, n]) => (
                  <span key={type} className="text-[11px] text-muted-foreground flex items-center gap-0.5" title={reactionEmoji(type)}>
                    {reactionEmoji(type)}
                    <span className="font-semibold">{n}</span>
                  </span>
                ))}
                <button
                  onClick={toggleLikers}
                  className={`text-sm font-semibold transition-colors ${
                    (isAdmin || isModerator)
                      ? `${showLikers ? "text-primary" : "text-muted-foreground hover:text-primary"} cursor-pointer`
                      : "text-muted-foreground cursor-default"
                  }`}
                  title={(isAdmin || isModerator) ? "من تفاعل" : undefined}
                >
                  {post.likes.length}
                </button>
              </div>
            )}
          </div>

          {/* منتقي الإيموجي (مثل فيسبوك) */}
          {reactionsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setReactionsOpen(false)} />
              <div className="absolute z-50 bottom-full mb-2 -left-1 flex items-center gap-0.5 bg-card border rounded-full px-2 py-1.5 shadow-lg">
                {REACTIONS.map(r => (
                  <button
                    key={r.key}
                    onClick={() => { void handleReact(r.key); setReactionsOpen(false); }}
                    className={`text-2xl leading-none transition-transform active:scale-125 touch-manipulation select-none ${myReaction === r.key ? "ring-2 ring-primary/50 rounded-full" : ""}`}
                    title={r.label}
                  >
                    {r.emoji}
                  </button>
                ))}
                {myReaction && (
                  <button
                    onClick={() => { void handleReact(myReaction); setReactionsOpen(false); }}
                    className="text-lg leading-none opacity-40 hover:opacity-100 transition-opacity px-1"
                    title="إزالة التفاعل"
                  >
                    ✕
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        <button onClick={() => setShowComments(!showComments)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors">
          <MessageCircle className="w-5 h-5" />
          <span>{localCount}</span>
        </button>
        {user && !isOwner && (
          <button onClick={() => setReportOpen(true)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive transition-colors mr-auto" title="الإبلاغ">
            <Flag className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">إبلاغ</span>
          </button>
        )}
      </div>

      {/* Likers list (admins/moderators only) */}
      {showLikers && (isAdmin || isModerator) && (
        <div className="mt-3 border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            المعجبون ({post.likes.length})
          </p>
          {likersLoading ? (
            <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
          ) : (likersData || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد معجبون</p>
          ) : (
            <ul className="space-y-1">
              {(likersData || []).map((l) => (
                <li key={l.user_id} className="flex items-center gap-2">
                  <button
                    onClick={() => setProfileUserId(l.user_id)}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <Avatar className="w-6 h-6">
                      <AvatarImage src={l.avatar_url || ""} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {l.full_name?.charAt(0) || "م"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">
                      {ownerName(l, l.user_id)}
                    </span>
                    {l.gender === "male" && <span className="inline-flex items-center justify-center w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />}
                    {l.gender === "female" && <span className="inline-flex items-center justify-center w-2.5 h-2.5 rounded-full bg-pink-500 shrink-0" />}
                    {l.type && <span className="text-base leading-none mr-1" title={reactionEmoji(l.type)}>{reactionEmoji(l.type)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Comments */}
      {showComments && (
        <div className="mt-3 border-t pt-3 space-y-3">
          {commentsLoading && loadedComments.length === 0 ? (
            <p className="text-sm text-muted-foreground">جارٍ تحميل التعليقات...</p>
          ) : (
            <>
          {topComments.map(comment => (
            <div key={comment.id} className="space-y-2">
              <div className="flex gap-2">
                <button onClick={() => setProfileUserId(comment.user_id)} className="shrink-0 group">
                  <Halo tone={haloOf(comment.user_id)}>
                    <Avatar className="w-7 h-7 cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all">
                      <AvatarImage src={comment.profiles?.avatar_url || ""} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {comment.profiles?.full_name?.charAt(0) || "م"}
                      </AvatarFallback>
                    </Avatar>
                  </Halo>
                </button>
                <div className={`flex-1 rounded-lg p-2 ${comment.is_pinned ? "bg-primary/10 border border-primary/20" : "bg-muted"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setProfileUserId(comment.user_id)} className="text-xs font-semibold hover:underline">
                        {ownerName(comment.profiles, comment.user_id)}
                      </button>
                      <SocialBadge social={socialIds.has(comment.user_id)} />
                      {comment.profiles?.gender === "male" && <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-blue-500 shrink-0" />}
                      {comment.profiles?.gender === "female" && <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-pink-500 shrink-0" />}
                      <RoundsBadge userId={comment.user_id} />
                      {comment.is_pinned && (
                        <span className="text-xs text-primary flex items-center gap-0.5">
                          <Pin className="w-3 h-3" /> مثبت
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: ar })}
                      </span>
                      {isAdmin && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handlePinComment(comment.id, comment.is_pinned)} title={comment.is_pinned ? "إلغاء التثبيت" : "تثبيت"}>
                          {comment.is_pinned ? <PinOff className="w-3 h-3 text-primary" /> : <Pin className="w-3 h-3" />}
                        </Button>
                      )}
                      {user?.id === comment.user_id && editingCommentId !== comment.id && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingCommentId(comment.id); setEditCommentText(comment.content); setEditCommentRemoveImage(false); }}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                      )}
                      {(user?.id === comment.user_id || canDelete) && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteComment(comment.id)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {editingCommentId === comment.id ? (
                    <div className="space-y-1 mt-1">
                      {comment.image_url && !editCommentRemoveImage && (
                        <div className="relative inline-block">
                          <img src={comment.image_url} alt="مرفق" className="h-16 rounded-md border object-cover" />
                          <button
                            type="button"
                            title="إزالة الصورة"
                            onClick={() => setEditCommentRemoveImage(true)}
                            className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center hover:opacity-80"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      <Textarea value={editCommentText} onChange={e => setEditCommentText(e.target.value)} className="text-sm min-h-[40px] resize-none" />
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => handleEditComment(comment.id)}>حفظ</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingCommentId(null); setEditCommentText(""); setEditCommentRemoveImage(false); }}>إلغاء</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {comment.content && (
                        <p className="text-sm whitespace-pre-wrap break-words">{renderMentions(comment.content, setProfileUserId)}</p>
                      )}
                      {comment.image_url && (
                        <img
                          src={comment.image_url}
                          alt="صورة في التعليق"
                          loading="lazy"
                          className="mt-1 rounded-md max-h-64 w-auto max-w-full object-cover cursor-zoom-in"
                          onClick={() => setLightbox({ src: comment.image_url!, images: [comment.image_url!], index: 0, type: "image" })}
                        />
                      )}
                    </>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {renderCommentLike(comment.id)}
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                    >
                      رد
                    </button>
                  </div>
                </div>
              </div>

              {/* Replies */}
              {getReplies(comment.id).map(reply => (
                <div key={reply.id} className="flex gap-2 mr-8">
                  <CornerDownLeft className="w-4 h-4 text-muted-foreground mt-2 shrink-0" />
                  <button onClick={() => setProfileUserId(reply.user_id)} className="shrink-0 group">
                  <Halo tone={haloOf(reply.user_id)}>
                    <Avatar className="w-6 h-6 cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all">
                      <AvatarImage src={reply.profiles?.avatar_url || ""} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {reply.profiles?.full_name?.charAt(0) || "م"}
                      </AvatarFallback>
                    </Avatar>
                  </Halo>
                </button>
                  <div className="flex-1 bg-muted/50 rounded-lg p-2">
                    <div className="flex items-center justify-between">
                      <button onClick={() => setProfileUserId(reply.user_id)} className="text-xs font-semibold hover:underline flex items-center gap-1">
                        {ownerName(reply.profiles, reply.user_id)}
                        <SocialBadge social={socialIds.has(reply.user_id)} />
                        {reply.profiles?.gender === "male" && <span className="inline-flex items-center justify-center w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />}
                        {reply.profiles?.gender === "female" && <span className="inline-flex items-center justify-center w-2.5 h-2.5 rounded-full bg-pink-500 shrink-0" />}
                        <RoundsBadge userId={reply.user_id} />
                      </button>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true, locale: ar })}
                        </span>
                        {(user?.id === reply.user_id || canDelete) && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteComment(reply.id)}>
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {reply.content && (
                      <p className="text-sm whitespace-pre-wrap break-words">{renderMentions(reply.content, setProfileUserId)}</p>
                    )}
                    {reply.image_url && (
                      <img
                        src={reply.image_url}
                        alt="صورة في الرد"
                        loading="lazy"
                        className="mt-1 rounded-md max-h-64 w-auto max-w-full object-cover cursor-zoom-in"
                        onClick={() => setLightbox({ src: reply.image_url!, images: [reply.image_url!], index: 0, type: "image" })}
                      />
                    )}
                    <div className="mt-1">
                      {renderCommentLike(reply.id)}
                    </div>
                  </div>
                </div>
              ))}

              {/* Reply input */}
              {replyTo === comment.id && (
                <div className="flex gap-2 mr-8 items-end">
                  <div className="flex-1 space-y-1">
                    {replyPreview && (
                      <div className="relative inline-block">
                        <img src={replyPreview} alt="معاينة المرفق" className="h-16 rounded-md border object-cover" />
                        <button
                          type="button"
                          title="إزالة المرفق"
                          onClick={() => { setReplyImage(null); setReplyPreview(null); }}
                          className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center hover:opacity-80"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="إرفاق GIF" onClick={() => replyFileRef.current?.click()}>
                        <ImageIcon className="w-4 h-4" />
                      </Button>
                      <MentionInput
                        value={replyText}
                        onChange={setReplyText}
                        placeholder="اكتب ردك... (اكتب @ لمنشن)"
                        channel={(post as any).channel || "all"}
                        currentGender={user && (profile as any)?.gender}
                        isAdmin={isAdmin}
                        minRows={1}
                        className="min-h-[40px] text-sm"
                      />
                    </div>
                  </div>
                  <Button size="icon" className="shrink-0" onClick={() => handleReply(comment.id)} disabled={sendingComment || (!replyText.trim() && !replyImage)}>
                    {sendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                  <input
                    ref={replyFileRef}
                    type="file"
                    accept="image/gif"
                    className="hidden"
                    onChange={e => { pickCommentImage(e.target.files?.[0], "reply"); e.target.value = ""; }}
                  />
                </div>
              )}
            </div>
          ))}

          {/* New comment */}
          {user && (
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                {commentPreview && (
                  <div className="relative inline-block">
                    <img src={commentPreview} alt="معاينة المرفق" className="h-16 rounded-md border object-cover" />
                    <button
                      type="button"
                      title="إزالة المرفق"
                      onClick={() => { setCommentImage(null); setCommentPreview(null); }}
                      className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center hover:opacity-80"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="إرفاق GIF" onClick={() => commentFileRef.current?.click()}>
                    <ImageIcon className="w-4 h-4" />
                  </Button>
                  <MentionInput
                    value={commentText}
                    onChange={setCommentText}
                    placeholder="اكتب تعليقاً... (اكتب @ لمنشن)"
                    channel={(post as any).channel || "all"}
                    currentGender={user && (profile as any)?.gender}
                    isAdmin={isAdmin}
                    minRows={1}
                    className="min-h-[40px] text-sm"
                  />
                </div>
              </div>
              <Button size="icon" className="shrink-0" onClick={handleComment} disabled={sendingComment || (!commentText.trim() && !commentImage)}>
                {sendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
              <input
                ref={commentFileRef}
                type="file"
                accept="image/gif"
                className="hidden"
                onChange={e => { pickCommentImage(e.target.files?.[0], "comment"); e.target.value = ""; }}
              />
            </div>
          )}
            </>
          )}
        </div>
      )}

      <UserProfileDialog
        userId={profileUserId}
        open={!!profileUserId}
        onOpenChange={(o) => { if (!o) setProfileUserId(null); }}
      />

      <Lightbox
        src={lightbox?.src || null}
        images={lightbox?.images}
        initialIndex={lightbox?.index || 0}
        type={lightbox?.type || "image"}
        onClose={() => setLightbox(null)}
      />

      <ReportDialog postId={post.id} open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
});

PostCard.displayName = "PostCard";

export default PostCard;
