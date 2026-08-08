import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { containsBannedWord } from "@/lib/bannedWords";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Send, Loader2, Shield, Trash2, Heart, Pin, PinOff, MessageCircle, Pencil, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface SuggestionReply {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  profiles: { full_name: string; avatar_url: string | null } | null;
}

interface Suggestion {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  is_pinned: boolean;
  profiles: { full_name: string; avatar_url: string | null } | null;
  suggestion_replies: SuggestionReply[];
  suggestion_likes: { user_id: string }[];
}

const Suggestions = () => {
  const { user, isAdmin } = useAuth();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [content, setContent] = useState("");
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [replyLikes, setReplyLikes] = useState<Record<string, { count: number; liked: boolean }>>({});
  const [showReplies, setShowReplies] = useState<Set<string>>(new Set());
  const [editingReply, setEditingReply] = useState<string | null>(null);
  const [editReplyText, setEditReplyText] = useState("");

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    try {
      const { data, error } = await supabase
        .from("suggestions")
        .select(`
          *,
          profiles!suggestions_user_id_profiles_fkey(full_name, avatar_url),
          suggestion_replies(id, content, user_id, created_at, profiles:profiles!suggestion_replies_user_id_profiles_fkey(full_name, avatar_url)),
          suggestion_likes(user_id)
        `)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      if (data) {
        const sorted = (data as unknown as Suggestion[]).sort((a, b) => {
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        setSuggestions(sorted);

        const allReplyIds = sorted.flatMap(s => s.suggestion_replies.map(r => r.id));
        if (allReplyIds.length > 0) {
          const { data: likesData } = await supabase
            .from("suggestion_reply_likes")
            .select("reply_id, user_id")
            .in("reply_id", allReplyIds);
          const likesMap: Record<string, { count: number; liked: boolean }> = {};
          allReplyIds.forEach(rid => {
            const replyLikesArr = likesData?.filter(l => l.reply_id === rid) || [];
            likesMap[rid] = { count: replyLikesArr.length, liked: user ? replyLikesArr.some(l => l.user_id === user.id) : false };
          });
          setReplyLikes(likesMap);
        }
      }
    } catch (err) {
      console.error("Failed to load suggestions", err);
      toast.error("تعذر تحميل الاقتراحات");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !content.trim()) return;
    if (containsBannedWord(content, isAdmin)) {
      toast.error("المحتوى يحتوي على كلمات محظورة");
      return;
    }
    setPosting(true);
    const { error } = await supabase.from("suggestions").insert({
      user_id: user.id,
      content: content.trim(),
    });
    if (error) toast.error("فشل إرسال الاقتراح");
    else {
      setContent("");
      toast.success("تم إرسال الاقتراح");
      fetchSuggestions();
    }
    setPosting(false);
  };

  const handleDeleteSuggestion = async (id: string) => {
    const { error } = await supabase.from("suggestions").delete().eq("id", id);
    if (error) toast.error("فشل حذف الاقتراح");
    else {
      toast.success("تم حذف الاقتراح");
      fetchSuggestions();
    }
  };

  const handlePinSuggestion = async (id: string, currentlyPinned: boolean) => {
    const { error } = await supabase
      .from("suggestions")
      .update({ is_pinned: !currentlyPinned } as any)
      .eq("id", id);
    if (error) toast.error("فشل تثبيت الاقتراح");
    else toast.success(currentlyPinned ? "تم إلغاء التثبيت" : "تم تثبيت الاقتراح");
    fetchSuggestions();
  };

  const handleLike = async (suggestionId: string) => {
    if (!user) return;
    const suggestion = suggestions.find(s => s.id === suggestionId);
    const isLiked = suggestion?.suggestion_likes.some(l => l.user_id === user.id);
    if (isLiked) {
      await supabase.from("suggestion_likes").delete().eq("suggestion_id", suggestionId).eq("user_id", user.id);
    } else {
      await supabase.from("suggestion_likes").insert({ suggestion_id: suggestionId, user_id: user.id });
    }
    fetchSuggestions();
  };

  const handleReplyLike = async (replyId: string) => {
    if (!user) return;
    const current = replyLikes[replyId];
    if (current?.liked) {
      await supabase.from("suggestion_reply_likes").delete().eq("reply_id", replyId).eq("user_id", user.id);
    } else {
      await supabase.from("suggestion_reply_likes").insert({ reply_id: replyId, user_id: user.id });
    }
    fetchSuggestions();
  };

  const handleReply = async (suggestionId: string) => {
    const text = replyText[suggestionId]?.trim();
    if (!user || !text) return;
    const { error } = await supabase.from("suggestion_replies").insert({
      suggestion_id: suggestionId,
      user_id: user.id,
      content: text,
    });
    if (error) toast.error("فشل إرسال الرد");
    else {
      setReplyText(prev => ({ ...prev, [suggestionId]: "" }));
      fetchSuggestions();
    }
  };

  const handleEditReply = async (replyId: string) => {
    if (!editReplyText.trim()) return;
    const { error } = await supabase
      .from("suggestion_replies")
      .update({ content: editReplyText.trim() })
      .eq("id", replyId);
    if (error) toast.error("فشل تعديل الرد");
    else {
      setEditingReply(null);
      setEditReplyText("");
      fetchSuggestions();
    }
  };

  const toggleReplies = (id: string) => {
    setShowReplies(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">اقتراحات تعديل الموقع</h1>
      <p className="text-muted-foreground mb-6">
        شاركنا اقتراحاتك لتطوير الموقع. فقط الإدارة يمكنها الرد على الاقتراحات.
      </p>

      {user && (
        <div className="bg-card border rounded-xl p-4 mb-6">
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="اكتب اقتراحك هنا..."
            className="resize-none min-h-[80px] mb-3"
          />
          <Button onClick={handleSubmit} disabled={posting || !content.trim()} size="sm" className="gap-1">
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            إرسال اقتراح
          </Button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        </div>
      ) : suggestions.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">لا توجد اقتراحات بعد</p>
      ) : (
        <div className="space-y-4">
          {suggestions.map(s => {
            const isLiked = user ? s.suggestion_likes.some(l => l.user_id === user.id) : false;
            const repliesVisible = showReplies.has(s.id);
            return (
              <Card key={s.id} className={`animate-fade-in ${s.is_pinned ? "border-primary/40 ring-1 ring-primary/20" : ""}`}>
                <CardContent className="pt-4 space-y-3">
                  {s.is_pinned && (
                    <div className="flex items-center gap-1 text-primary text-xs font-medium">
                      <Pin className="w-3 h-3" /> اقتراح مثبت
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={s.profiles?.avatar_url || ""} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {s.profiles?.full_name?.charAt(0) || "م"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{s.profiles?.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: ar })}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePinSuggestion(s.id, s.is_pinned)} title={s.is_pinned ? "إلغاء التثبيت" : "تثبيت"}>
                          {s.is_pinned ? <PinOff className="w-4 h-4 text-primary" /> : <Pin className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteSuggestion(s.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <p className="whitespace-pre-wrap">{s.content}</p>

                  {/* Like & Replies toggle */}
                  <div className="flex items-center gap-4 pt-1">
                    <button
                      onClick={() => handleLike(s.id)}
                      className={`flex items-center gap-1 text-sm transition-colors ${isLiked ? "text-destructive" : "text-muted-foreground hover:text-destructive"}`}
                    >
                      <Heart className={`w-5 h-5 ${isLiked ? "fill-current" : ""}`} />
                      <span>{s.suggestion_likes.length}</span>
                    </button>
                    {s.suggestion_replies.length > 0 && (
                      <button
                        onClick={() => toggleReplies(s.id)}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>{s.suggestion_replies.length} رد</span>
                      </button>
                    )}
                  </div>

                  {/* Replies */}
                  {(repliesVisible || s.suggestion_replies.length === 0) && s.suggestion_replies.map(reply => {
                    const rl = replyLikes[reply.id] || { count: 0, liked: false };
                    return (
                      <div key={reply.id} className="bg-primary/5 border border-primary/20 rounded-lg p-3 mr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Shield className="w-4 h-4 text-primary" />
                          <span className="text-xs font-semibold text-primary">رد الإدارة</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true, locale: ar })}
                          </span>
                          {user && reply.user_id === user.id && editingReply !== reply.id && (
                            <button
                              onClick={() => { setEditingReply(reply.id); setEditReplyText(reply.content); }}
                              className="mr-auto text-muted-foreground hover:text-foreground transition-colors"
                              title="تعديل الرد"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {editingReply === reply.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editReplyText}
                              onChange={e => setEditReplyText(e.target.value)}
                              className="resize-none min-h-[40px] text-sm"
                            />
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => handleEditReply(reply.id)}>
                                <Check className="w-3.5 h-3.5" /> حفظ
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => setEditingReply(null)}>
                                <X className="w-3.5 h-3.5" /> إلغاء
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm">{reply.content}</p>
                        )}
                        <button
                          onClick={() => handleReplyLike(reply.id)}
                          className={`flex items-center gap-1 text-xs mt-2 transition-colors ${rl.liked ? "text-destructive" : "text-muted-foreground hover:text-destructive"}`}
                        >
                          <Heart className={`w-3.5 h-3.5 ${rl.liked ? "fill-current" : ""}`} />
                          <span>{rl.count}</span>
                        </button>
                      </div>
                    );
                  })}

                  {/* Admin reply input */}
                  {isAdmin && (
                    <div className="flex gap-2 mr-4">
                      <Textarea
                        value={replyText[s.id] || ""}
                        onChange={e => setReplyText(prev => ({ ...prev, [s.id]: e.target.value }))}
                        placeholder="رد الإدارة..."
                        className="resize-none min-h-[40px] text-sm"
                      />
                      <Button size="icon" className="shrink-0" onClick={() => handleReply(s.id)}>
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Suggestions;
