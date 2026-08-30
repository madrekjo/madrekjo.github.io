import { useState, useEffect, forwardRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { containsBannedWord } from "@/lib/bannedWords";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Heart, MessageCircle, Trash2, Edit2, Send, CornerDownLeft, Pin, PinOff, Flag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import UserProfileDialog from "@/components/UserProfileDialog";
import RoundsBadge from "@/components/RoundsBadge";
import Lightbox from "@/components/Lightbox";
import ReportDialog from "@/components/ReportDialog";
import { formatDisplayName } from "@/lib/displayName";
import MentionInput, { extractMentions } from "@/components/MentionInput";
import { renderMentions } from "@/lib/mentions";
import { ShieldCheck } from "lucide-react";

const VerificationBadge = ({ gender, isAuthorAdmin }: { gender?: string | null; isAuthorAdmin: boolean }) => {
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

interface PostProps {
  post: {
    id: string;
    user_id: string;
    content: string;
    image_url: string | null;
    image_urls: string[] | null;
    video_url: string | null;
    created_at: string;
    profiles: { full_name: string; avatar_url: string | null; generation?: string | null; field?: string | null; gender?: string | null } | null;
    likes: { user_id: string }[];
    comments: {
      id: string;
      content: string;
      user_id: string;
      parent_comment_id: string | null;
      created_at: string;
      is_pinned: boolean;
      profiles: { full_name: string; avatar_url: string | null; generation?: string | null; field?: string | null; gender?: string | null } | null;
    }[];
  };
  onRefresh: () => void;
  highlight?: boolean;
}

const PostCard = forwardRef<HTMLDivElement, PostProps>(({ post, onRefresh, highlight }, ref) => {
  const { user, isAdmin, isModerator, profile } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [commentLikes, setCommentLikes] = useState<Record<string, { count: number; liked: boolean }>>({});
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [lightbox, setLightbox] = useState<{ src: string; images?: string[]; index?: number; type: "image" | "video" } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [authorIsAdmin, setAuthorIsAdmin] = useState(false);

  const canDelete = isAdmin || isModerator;
  const isOwner = user?.id === post.user_id;
  const isLiked = post.likes.some(l => l.user_id === user?.id);

  // Fetch author admin status
  useEffect(() => {
    const fetchAuthorRole = async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", post.user_id);
      setAuthorIsAdmin((data || []).some((r: any) => r.role === "admin"));
    };
    fetchAuthorRole();
  }, [post.user_id]);

  // Fetch comment likes
  useEffect(() => {
    const fetchCommentLikes = async () => {
      const commentIds = post.comments.map(c => c.id);
      if (commentIds.length === 0) return;
      const { data } = await supabase
        .from("comment_likes")
        .select("comment_id, user_id")
        .in("comment_id", commentIds);
      const map: Record<string, { count: number; liked: boolean }> = {};
      commentIds.forEach(cid => {
        const likes = data?.filter(l => l.comment_id === cid) || [];
        map[cid] = {
          count: likes.length,
          liked: user ? likes.some(l => l.user_id === user.id) : false,
        };
      });
      setCommentLikes(map);
    };
    fetchCommentLikes();
  }, [post.comments, user]);

  // Auto-open comments if highlighted
  useEffect(() => {
    if (highlight) setShowComments(true);
  }, [highlight]);

  const sortedComments = [...post.comments].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const topComments = sortedComments.filter(c => !c.parent_comment_id);
  const getReplies = (commentId: string) => sortedComments.filter(c => c.parent_comment_id === commentId);

  const handleLike = async () => {
    if (!user) return;
    if (profile?.is_banned) { toast.error("حسابك محظور، لا يمكنك التفاعل"); return; }
    if (isLiked) {
      await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", user.id);
    } else {
      await supabase.from("likes").insert({ post_id: post.id, user_id: user.id });
      if (post.user_id !== user.id) {
        await supabase.from("notifications").insert({ user_id: post.user_id, actor_id: user.id, type: "like", post_id: post.id });
      }
    }
    onRefresh();
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
    // Refresh likes locally
    const { data } = await supabase.from("comment_likes").select("comment_id, user_id").eq("comment_id", commentId);
    setCommentLikes(prev => ({
      ...prev,
      [commentId]: {
        count: data?.length || 0,
        liked: data?.some(l => l.user_id === user.id) || false,
      },
    }));
  };

  const handleComment = async () => {
    if (!user || !commentText.trim()) return;
    if (profile?.is_banned) { toast.error("حسابك محظور، لا يمكنك التعليق"); return; }
    if (containsBannedWord(commentText, isAdmin)) { toast.error("التعليق يحتوي على كلمات محظورة"); return; }
    const { data: insertedC, error } = await supabase.from("comments").insert({ post_id: post.id, user_id: user.id, content: commentText.trim() }).select("id");
    if (!error && insertedC?.[0]?.id) {
      const commentId = insertedC[0].id;
      const mentions = extractMentions(commentText);
      for (const mt of mentions) {
        if (!mt.userId || mt.userId === user.id) continue;
        await (supabase as any).from("post_mentions").insert({
          post_id: post.id, comment_id: commentId, actor_id: user.id, user_id: mt.userId,
          mentioned_name: mt.name, channel: (post as any).channel || "all",
        });
        await (supabase as any).from("notifications").insert({
          user_id: mt.userId, actor_id: user.id, type: "mention", post_id: post.id, comment_id: commentId,
        });
      }
    }
    if (post.user_id !== user.id) {
      await supabase.from("notifications").insert({ user_id: post.user_id, actor_id: user.id, type: "comment", post_id: post.id });
    }
    setCommentText("");
    onRefresh();
  };

  const handleReply = async (parentId: string) => {
    if (!user || !replyText.trim()) return;
    if (profile?.is_banned) { toast.error("حسابك محظور، لا يمكنك الرد"); return; }
    if (containsBannedWord(replyText, isAdmin)) { toast.error("الرد يحتوي على كلمات محظورة"); return; }
    const { data: insertedR, error } = await supabase.from("comments").insert({ post_id: post.id, user_id: user.id, content: replyText.trim(), parent_comment_id: parentId }).select("id");
    if (!error && insertedR?.[0]?.id) {
      const commentId = insertedR[0].id;
      const mentions = extractMentions(replyText);
      for (const mt of mentions) {
        if (!mt.userId || mt.userId === user.id) continue;
        await (supabase as any).from("post_mentions").insert({
          post_id: post.id, comment_id: commentId, actor_id: user.id, user_id: mt.userId,
          mentioned_name: mt.name, channel: (post as any).channel || "all",
        });
        await (supabase as any).from("notifications").insert({
          user_id: mt.userId, actor_id: user.id, type: "mention", post_id: post.id, comment_id: commentId,
        });
      }
    }
    const parentComment = post.comments.find(c => c.id === parentId);
    if (parentComment && parentComment.user_id !== user.id) {
      await supabase.from("notifications").insert({ user_id: parentComment.user_id, actor_id: user.id, type: "reply", post_id: post.id, comment_id: parentId });
    }
    setReplyText("");
    setReplyTo(null);
    onRefresh();
  };

  const handleDeletePost = async () => {
    await supabase.from("posts").update({ deleted_at: new Date().toISOString(), deleted_by: user?.id } as any).eq("id", post.id);
    onRefresh();
  };
  const handleEditPost = async () => {
    if (containsBannedWord(editContent, isAdmin)) { toast.error("المحتوى يحتوي على كلمات محظورة"); return; }
    await supabase.from("posts").update({ content: editContent.trim() }).eq("id", post.id);
    setEditing(false);
    onRefresh();
  };
  const handleDeleteComment = async (commentId: string) => {
    await supabase.from("comments").update({ deleted_at: new Date().toISOString(), deleted_by: user?.id } as any).eq("id", commentId);
    onRefresh();
  };
  const handleEditComment = async (commentId: string) => {
    if (!editCommentText.trim()) return;
    if (containsBannedWord(editCommentText, isAdmin)) { toast.error("التعليق يحتوي على كلمات محظورة"); return; }
    const { error } = await supabase.from("comments").update({ content: editCommentText.trim() }).eq("id", commentId);
    if (error) toast.error("فشل التعديل");
    else { setEditingCommentId(null); setEditCommentText(""); onRefresh(); }
  };
  const handlePinComment = async (commentId: string, currentlyPinned: boolean) => {
    const { error } = await supabase.from("comments").update({ is_pinned: !currentlyPinned } as any).eq("id", commentId);
    if (error) toast.error("فشل تثبيت التعليق");
    else toast.success(currentlyPinned ? "تم إلغاء التثبيت" : "تم تثبيت التعليق");
    onRefresh();
  };
  const handlePinPost = async () => {
    const isPinned = (post as any).is_pinned;
    const { error } = await supabase.from("posts").update({ is_pinned: !isPinned } as any).eq("id", post.id);
    if (error) toast.error("فشل تثبيت المنشور");
    else toast.success(isPinned ? "تم إلغاء تثبيت المنشور" : "تم تثبيت المنشور");
    onRefresh();
  };

  const renderCommentLike = (commentId: string) => {
    const cl = commentLikes[commentId] || { count: 0, liked: false };
    return (
      <button
        onClick={() => handleCommentLike(commentId)}
        className={`flex items-center gap-1 text-xs transition-colors ${cl.liked ? "text-destructive" : "text-muted-foreground hover:text-destructive"}`}
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
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => setProfileUserId(post.user_id)} className="shrink-0">
          <Avatar className="w-10 h-10 cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all">
            <AvatarImage src={post.profiles?.avatar_url || ""} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {post.profiles?.full_name?.charAt(0) || "م"}
            </AvatarFallback>
          </Avatar>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <button onClick={() => setProfileUserId(post.user_id)} className="font-semibold text-sm hover:underline text-right">
              {formatDisplayName(post.profiles)}
            </button>
            <VerificationBadge gender={post.profiles?.gender} isAuthorAdmin={authorIsAdmin} />
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
        <button onClick={handleLike} className={`flex items-center gap-1 text-sm transition-colors ${isLiked ? "text-destructive" : "text-muted-foreground hover:text-destructive"}`}>
          <Heart className={`w-5 h-5 ${isLiked ? "fill-current" : ""}`} />
          <span>{post.likes.length}</span>
        </button>
        <button onClick={() => setShowComments(!showComments)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors">
          <MessageCircle className="w-5 h-5" />
          <span>{post.comments.length}</span>
        </button>
        {user && !isOwner && (
          <button onClick={() => setReportOpen(true)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive transition-colors mr-auto" title="الإبلاغ">
            <Flag className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">إبلاغ</span>
          </button>
        )}
      </div>

      {/* Comments */}
      {showComments && (
        <div className="mt-3 border-t pt-3 space-y-3">
          {topComments.map(comment => (
            <div key={comment.id} className="space-y-2">
              <div className="flex gap-2">
                <button onClick={() => setProfileUserId(comment.user_id)} className="shrink-0">
                  <Avatar className="w-7 h-7 cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all">
                    <AvatarImage src={comment.profiles?.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {comment.profiles?.full_name?.charAt(0) || "م"}
                    </AvatarFallback>
                  </Avatar>
                </button>
                <div className={`flex-1 rounded-lg p-2 ${comment.is_pinned ? "bg-primary/10 border border-primary/20" : "bg-muted"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setProfileUserId(comment.user_id)} className="text-xs font-semibold hover:underline">
                        {formatDisplayName(comment.profiles)}
                      </button>
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
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingCommentId(comment.id); setEditCommentText(comment.content); }}>
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
                      <Textarea value={editCommentText} onChange={e => setEditCommentText(e.target.value)} className="text-sm min-h-[40px] resize-none" />
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => handleEditComment(comment.id)}>حفظ</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingCommentId(null); setEditCommentText(""); }}>إلغاء</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap break-words">{renderMentions(comment.content, setProfileUserId)}</p>
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
                  <button onClick={() => setProfileUserId(reply.user_id)} className="shrink-0">
                    <Avatar className="w-6 h-6 cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all">
                      <AvatarImage src={reply.profiles?.avatar_url || ""} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {reply.profiles?.full_name?.charAt(0) || "م"}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                  <div className="flex-1 bg-muted/50 rounded-lg p-2">
                    <div className="flex items-center justify-between">
                      <button onClick={() => setProfileUserId(reply.user_id)} className="text-xs font-semibold hover:underline flex items-center gap-1">
                        {formatDisplayName(reply.profiles)}
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
                    <p className="text-sm whitespace-pre-wrap break-words">{renderMentions(reply.content, setProfileUserId)}</p>
                    <div className="mt-1">
                      {renderCommentLike(reply.id)}
                    </div>
                  </div>
                </div>
              ))}

              {/* Reply input */}
              {replyTo === comment.id && (
                <div className="flex gap-2 mr-8 items-end">
                  <MentionInput
                    value={replyText}
                    onChange={setReplyText}
                    placeholder="اكتب ردك... (اكتب @ لمنشن)"
                    channel={(post as any).channel || "all"}
                    currentGender={user && (profile as any)?.gender}
                    minRows={1}
                    className="min-h-[40px] text-sm"
                  />
                  <Button size="icon" className="shrink-0" onClick={() => handleReply(comment.id)}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}

          {/* New comment */}
          {user && (
            <div className="flex gap-2 items-end">
              <MentionInput
                value={commentText}
                onChange={setCommentText}
                placeholder="اكتب تعليقاً... (اكتب @ لمنشن)"
                channel={(post as any).channel || "all"}
                currentGender={user && (profile as any)?.gender}
                minRows={1}
                className="min-h-[40px] text-sm"
              />
              <Button size="icon" className="shrink-0" onClick={handleComment} disabled={!commentText.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
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
