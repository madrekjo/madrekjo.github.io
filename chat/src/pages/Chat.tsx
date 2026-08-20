import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { containsBannedWord, loadBannedWords } from "@/lib/bannedWords";
import PostCard from "@/components/PostCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Send, Image as ImageIcon, Video, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { compressMedia } from "@/lib/mediaCompression";

const PAGE_SIZE = 20;

interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  generation: string | null;
  channel: string | null;
  profiles: { full_name: string; avatar_url: string | null; generation?: string | null; field?: string | null } | null;
  likes: { user_id: string }[];
  comments: {
    id: string;
    content: string;
    user_id: string;
    parent_comment_id: string | null;
    created_at: string;
    is_pinned: boolean;
    profiles: { full_name: string; avatar_url: string | null; generation?: string | null; field?: string | null } | null;
  }[];
}

const Chat = () => {
  const { user, profile, isAdmin, isStaff } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [posting, setPosting] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightPostId = searchParams.get("post");
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasScrolled = useRef(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [postTarget, setPostTarget] = useState<"all" | "gender" | "gen">("all");
  const [staffPostTarget, setStaffPostTarget] = useState<"shared" | "09" | "10">("shared");
  const [staffChannelTarget, setStaffChannelTarget] = useState<string>("all");

  const fetchPosts = useCallback(async (offset = 0, append = false) => {
    if (append) setLoadingMore(true);
    try {
      const { data: rows, error } = await supabase
        .from("posts")
        .select("*, profiles!posts_user_id_profiles_fkey(full_name, avatar_url, generation, field, gender)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;
      const baseRows = (rows || []) as any[];
      const postIds = baseRows.map(p => p.id);

      const [likesRes, commentsRes] = postIds.length
        ? await Promise.all([
            supabase.from("likes").select("post_id, user_id").in("post_id", postIds),
            supabase
              .from("comments")
              .select("id, post_id, content, user_id, parent_comment_id, created_at, is_pinned, profiles:profiles!comments_user_id_profiles_fkey(full_name, avatar_url, generation, field, gender)")
              .in("post_id", postIds)
              .is("deleted_at", null)
              .order("created_at", { ascending: true }),
          ])
        : [{ data: [] }, { data: [] }];

      const cleaned = baseRows.map((p: any) => ({
        ...p,
        likes: (likesRes.data || []).filter((l: any) => l.post_id === p.id),
        comments: (commentsRes.data || []).filter((c: any) => c.post_id === p.id),
      })) as unknown as Post[];

      const sorted = cleaned.sort((a, b) => {
        if ((a as any).is_pinned && !(b as any).is_pinned) return -1;
        if (!(a as any).is_pinned && (b as any).is_pinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setPosts(prev => append ? [...prev, ...sorted] : sorted);
      setHasMore(baseRows.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load chat posts", err);
      toast.error("تعذر تحميل الدردشة، حاول تحديث الصفحة");
      if (!append) setPosts([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadBannedWords();
    fetchPosts(0, false);

    const channel = supabase
      .channel("posts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => { fetchPosts(0, false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => { fetchPosts(0, false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, () => { fetchPosts(0, false); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchPosts]);

  useEffect(() => {
    if (highlightPostId && !hasScrolled.current && posts.length > 0) {
      const el = postRefs.current[highlightPostId];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        hasScrolled.current = true;
        setTimeout(() => setSearchParams({}, { replace: true }), 3000);
      }
    }
  }, [highlightPostId, posts, setSearchParams]);

  useEffect(() => {
    if (!loaderRef.current || !hasMore || loading) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore) {
        fetchPosts(posts.length, true);
      }
    }, { threshold: 0.1 });
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, posts.length, fetchPosts]);

  const handlePost = async () => {
    if (!user || !content.trim()) return;
    if (profile?.timeout_until && new Date(profile.timeout_until) > new Date()) {
      toast.error("أنت في تايم اوت حتى " + new Date(profile.timeout_until).toLocaleString("ar"));
      return;
    }
    if (containsBannedWord(content, isAdmin)) { toast.error("المحتوى يحتوي على كلمات محظورة"); return; }
    setPosting(true);
    let imageUrl: string | null = null;
    let videoUrl: string | null = null;

    if (mediaFile) {
      const compressed = await compressMedia(mediaFile);
      const fileExt = compressed.name.split(".").pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("post-media").upload(filePath, compressed);
      if (uploadError) { toast.error("فشل رفع الملف"); setPosting(false); return; }
      const { data: urlData } = supabase.storage.from("post-media").getPublicUrl(filePath);
      if (mediaType === "image") imageUrl = urlData.publicUrl;
      else videoUrl = urlData.publicUrl;
    }

    let targetChannel: string = "all";
    let targetGen: string | null = null;

    if (isStaff) {
      targetChannel = staffChannelTarget;
      targetGen = staffPostTarget === "shared" ? null : staffPostTarget;
    } else {
      if (postTarget === "gender") {
        targetChannel = profile?.gender === "male" ? "male" : "female";
      } else if (postTarget === "gen") {
        targetChannel = `gen_${profile?.generation || "2009"}`;
        targetGen = profile?.generation ?? null;
      } else {
        targetChannel = "all";
      }
    }

    const insertData: any = {
      user_id: user.id, content: content.trim(), image_url: imageUrl, video_url: videoUrl,
      channel: targetChannel,
      generation: targetGen,
    };

    const { error } = await supabase.from("posts").insert(insertData);
    if (error) {
      if ((error as any).message?.includes("section_locked")) toast.error("هذه القناة مقفلة حالياً من قبل الإدارة");
      else toast.error("فشل نشر المنشور");
    }
    else { setContent(""); setMediaFile(null); setMediaType(null); toast.success("تم النشر"); }
    setPosting(false);
  };

  const handleFileSelect = (type: "image" | "video") => {
    setMediaType(type);
    if (fileInputRef.current) {
      fileInputRef.current.accept = type === "image" ? "image/*" : "video/*";
      fileInputRef.current.click();
    }
  };

  const inTimeout = profile?.timeout_until && new Date(profile.timeout_until) > new Date();
  const chatBanned = profile?.chat_banned;

  if (profile?.is_banned) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-destructive mb-2">تم حظر حسابك</h2>
        <p className="text-muted-foreground">لا يمكنك الوصول إلى الدردشة. تواصل مع الإدارة.</p>
      </div>
    );
  }
  if (chatBanned) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-destructive mb-2">تم حظرك من الدردشة العامة</h2>
        <p className="text-muted-foreground">لا يزال بإمكانك استخدام بقية الأقسام.</p>
      </div>
    );
  }

  const channelLabel = profile?.gender === "male" ? "شباب" : profile?.gender === "female" ? "بنات" : "الدردشة";

  const myGenderChannel = profile?.gender === "male" ? "male" : profile?.gender === "female" ? "female" : null;
  const myGenChannel = profile?.generation ? `gen_${profile.generation}` : null;

  const channelTabs = isStaff
    ? [
        { key: "all", label: "الجميع" },
        { key: "male", label: "شباب" },
        { key: "female", label: "بنات" },
        ...(profile?.generation === "09" ? [{ key: "gen_09", label: "طلاب 2009" }] : []),
        ...(profile?.generation === "10" ? [{ key: "gen_10", label: "طلاب 2010" }] : []),
      ]
    : [
        { key: "all", label: "الجميع" },
        ...(myGenderChannel ? [{ key: myGenderChannel, label: profile?.gender === "male" ? "شباب" : "بنات" }] : []),
        ...(myGenChannel ? [{ key: myGenChannel, label: `طلاب ${profile?.generation === "09" ? "2009" : "2010"}` }] : []),
      ];

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      {user && (
        <div className="bg-card border rounded-xl p-4 mb-6 animate-fade-in">
          <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder={`شارك أفكارك مع ${channelLabel}...`} className="min-h-[80px] resize-none mb-3" />
          {mediaFile && (
            <div className="mb-3 p-2 bg-muted rounded-lg flex items-center justify-between">
              <span className="text-sm text-muted-foreground truncate">{mediaFile.name}</span>
              <Button variant="ghost" size="sm" onClick={() => { setMediaFile(null); setMediaType(null); }}>إزالة</Button>
            </div>
          )}
          {!isStaff && profile?.generation && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-muted-foreground">نشر إلى:</span>
              <div className="flex gap-1 bg-muted/60 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setPostTarget("all")}
                  className={`text-xs px-3 py-1 rounded-md transition-colors ${postTarget === "all" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-background"}`}
                >
                  الجميع
                </button>
                <button
                  type="button"
                  onClick={() => setPostTarget("gender")}
                  className={`text-xs px-3 py-1 rounded-md transition-colors ${postTarget === "gender" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-background"}`}
                >
                  {profile.gender === "male" ? "شباب" : "بنات"}
                </button>
                <button
                  type="button"
                  onClick={() => setPostTarget("gen")}
                  className={`text-xs px-3 py-1 rounded-md transition-colors ${postTarget === "gen" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-background"}`}
                >
                  طلاب {profile.generation === "09" ? "2009" : "2010"}
                </button>
              </div>
            </div>
          )}
          {isStaff && (
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">القناة:</span>
                <div className="flex gap-1 bg-muted/60 rounded-lg p-1">
                  {[
                    { key: "all", label: "الجميع" },
                    { key: "male", label: "شباب" },
                    { key: "female", label: "بنات" },
                    { key: "gen_09", label: "طلاب 2009" },
                    { key: "gen_10", label: "طلاب 2010" },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setStaffChannelTarget(opt.key)}
                      className={`text-xs px-3 py-1 rounded-md transition-colors ${staffChannelTarget === opt.key ? "bg-primary text-primary-foreground font-medium" : "hover:bg-background"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">الجيل:</span>
                <div className="flex gap-1 bg-muted/60 rounded-lg p-1">
                  {[
                    { key: "shared", label: "الجميع" },
                    { key: "09", label: "جيل 09" },
                    { key: "10", label: "جيل 10" },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setStaffPostTarget(opt.key as any)}
                      className={`text-xs px-3 py-1 rounded-md transition-colors ${staffPostTarget === opt.key ? "bg-primary text-primary-foreground font-medium" : "hover:bg-background"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => handleFileSelect("image")} className="gap-1"><ImageIcon className="w-4 h-4" /> صورة</Button>
              <Button variant="ghost" size="sm" onClick={() => handleFileSelect("video")} className="gap-1"><Video className="w-4 h-4" /> فيديو</Button>
            </div>
            <Button onClick={handlePost} disabled={posting || !content.trim()} size="sm" className="gap-1">
              {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              نشر
            </Button>
          </div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) setMediaFile(file); }} />
        </div>
      )}

      {/* Channel filter tabs */}
      <div className="flex items-center gap-1 mb-4 bg-muted/60 rounded-lg p-1 w-fit flex-wrap">
        <span className="text-xs text-muted-foreground px-2">عرض:</span>
        {channelTabs.map(opt => (
          <button
            key={opt.key}
            onClick={() => setChannelFilter(opt.key)}
            className={`text-xs px-3 py-1 rounded-md transition-colors ${channelFilter === opt.key ? "bg-primary text-primary-foreground font-medium" : "hover:bg-background"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><p>لا توجد منشورات بعد. كن أول من ينشر!</p></div>
      ) : (
        <div className="space-y-4">
          {posts
            .filter(p => {
              if (channelFilter === "all") return true;
              return p.channel === channelFilter;
            })
            .map(post => (
              <PostCard
                key={post.id}
                ref={(el) => { postRefs.current[post.id] = el; }}
                post={post}
                onRefresh={() => fetchPosts(0, false)}
                highlight={post.id === highlightPostId}
              />
            ))}
          {hasMore && (
            <div ref={loaderRef} className="text-center py-6">
              {loadingMore ? (
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
              ) : (
                <Button variant="outline" size="sm" onClick={() => fetchPosts(posts.length, true)}>
                  تحميل المزيد
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Chat;
