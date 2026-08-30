import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { containsBannedWord, loadBannedWords } from "@/lib/bannedWords";
import PostCard from "@/components/PostCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Send, Image as ImageIcon, Video, Loader2, Lock } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { compressMedia } from "@/lib/mediaCompression";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const SALAWAT_KEY = "madrekjo_salawat_last";
const SALAWAT_INTERVAL = 24 * 60 * 60 * 1000;

function shouldShowSalawat() {
  try {
    const last = Number(localStorage.getItem(SALAWAT_KEY) || 0);
    if (!last) {
      localStorage.setItem(SALAWAT_KEY, String(Date.now()));
      return true;
    }
    if (Date.now() - last >= SALAWAT_INTERVAL) {
      localStorage.setItem(SALAWAT_KEY, String(Date.now()));
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

const PAGE_SIZE = 20;

interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  image_urls: string[] | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  generation: string | null;
  channel: string | null;
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
}

const Chat = () => {
  const { user, profile, isAdmin, isStaff, refreshProfile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [posting, setPosting] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightPostId = searchParams.get("post");
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasScrolled = useRef(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [postTarget, setPostTarget] = useState<string>("all");
  const [showSalawat, setShowSalawat] = useState(false);
  const [channelSettings, setChannelSettings] = useState<Record<string, boolean>>({ all: true, male: true, female: true, "09": true, "10": true });
  const [sectionLocks, setSectionLocks] = useState<Record<string, boolean>>({});

  const myGen = profile?.generation as string | null;

  const fetchPosts = useCallback(async (offset = 0, append = false) => {
    if (append) setLoadingMore(true);
    try {
      let query = supabase
        .from("posts")
        .select("*, profiles!posts_user_id_profiles_fkey(full_name, avatar_url, generation, field, gender)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (channelFilter === "all") {
        query = query.or("channel.is.null,channel.eq.all");
      } else {
        query = query.eq("channel", channelFilter);
      }

      let { data: rows, error } = await query.range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        // عمود channel لسه ما موجود بقاعدة البيانات → نرجع للجلب الكامل مؤقتاً
        const { data: rows2, error: err2 } = await supabase
          .from("posts")
          .select("*, profiles!posts_user_id_profiles_fkey(full_name, avatar_url, generation, field, gender)")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        rows = rows2;
        error = err2;
      }

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
  }, [channelFilter]);

  const fetchChannelSettings = useCallback(async () => {
    const { data } = await supabase.from("channel_settings" as any).select("*");
    if (data) {
      const map: Record<string, boolean> = { all: true, male: true, female: true, "09": true, "10": true };
      (data as any[]).forEach((r: any) => { map[r.channel] = r.enabled; });
      setChannelSettings(map);
    }
  }, []);

  const fetchSectionLocks = useCallback(async () => {
    const { data } = await (supabase as any).from("section_locks").select("section, locked, locked_until");
    const map: Record<string, boolean> = {};
    (data || []).forEach((r: any) => {
      const stillLocked = r.locked && (!r.locked_until || new Date(r.locked_until) > new Date());
      map[r.section] = !!stillLocked;
    });
    setSectionLocks(map);
  }, []);

  const sectionKeyFor = (ch: string) =>
    ch === "all" ? "chat_all" : ch === "09" ? "chat_09" : ch === "10" ? "chat_10" : null;

  const isChannelLocked = (key: string) => {
    if (isStaff) return false;
    const sec = sectionKeyFor(key);
    if (sec && sectionLocks[sec]) return true;
    return !(channelSettings[key] ?? true);
  };

  useEffect(() => {
    if (shouldShowSalawat()) setShowSalawat(true);
    loadBannedWords();
    fetchPosts(0, false);
    fetchChannelSettings();
    fetchSectionLocks();

    const channel = supabase
      .channel("posts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => { fetchPosts(0, false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => { fetchPosts(0, false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, () => { fetchPosts(0, false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "section_locks" }, () => { fetchSectionLocks(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_settings" }, () => { fetchChannelSettings(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchPosts, fetchChannelSettings, fetchSectionLocks]);

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
    let imageUrls: string[] | null = null;
    const imageUrl: string | null = null;
    let videoUrl: string | null = null;

    if (mediaFiles.length > 0) {
      const urls: string[] = [];
      for (const file of mediaFiles) {
        const compressed = await compressMedia(file);
        const fileExt = compressed.name.split(".").pop();
        const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("post-media").upload(filePath, compressed);
        if (uploadError) { toast.error("فشل رفع الملف"); setPosting(false); return; }
        const { data: urlData } = supabase.storage.from("post-media").getPublicUrl(filePath);
        urls.push(urlData.publicUrl);
      }
      if (mediaType === "image") imageUrls = urls;
      else videoUrl = urls[0];
    }

    const insertData: any = {
      user_id: user.id,
      content: content.trim(),
      image_url: imageUrl || (imageUrls && imageUrls.length ? imageUrls[0] : null),
      image_urls: imageUrls,
      video_url: videoUrl,
      channel: postTarget,
    };
    if (!imageUrls) delete insertData.image_urls;

    const { error } = await supabase.from("posts").insert(insertData);
    if (error) {
      if ((error as any).message?.includes("section_locked")) toast.error("هذه القناة مقفلة حالياً من قبل الإدارة");
      else toast.error("فشل نشر المنشور");
    }
    else { setContent(""); setMediaFiles([]); setMediaType(null); toast.success("تم النشر"); }
    setPosting(false);
  };

  const handleFileSelect = (type: "image" | "video") => {
    setMediaType(type);
    if (fileInputRef.current) {
      fileInputRef.current.accept = type === "image" ? "image/*" : "video/*";
      fileInputRef.current.multiple = type === "image";
      fileInputRef.current.click();
    }
  };

  const inTimeout = profile?.timeout_until && new Date(profile.timeout_until) > new Date();
  const chatBanned = profile?.chat_banned;

  // Auto-switch to an open channel if current filter is somehow locked
  useEffect(() => {
    const haveTabs = isStaff || !!(profile?.gender) || !!myGen;
    if (!haveTabs) return;
    const tabs = isStaff
      ? [{ key: "all" }, { key: "male" }, { key: "female" }, { key: "09" }, { key: "10" }]
      : [
          { key: "all" },
          ...(profile?.gender === "male" ? [{ key: "male" }] : []),
          ...(profile?.gender === "female" ? [{ key: "female" }] : []),
          ...(myGen ? [{ key: myGen }] : []),
        ];
    const tab = tabs.find(t => t.key === channelFilter);
    if (tab && isChannelLocked(tab.key)) {
      const firstOpen = tabs.find(t => !isChannelLocked(t.key));
      if (firstOpen) setChannelFilter(firstOpen.key);
    }
  }, [channelFilter, channelSettings, sectionLocks, profile?.gender, myGen, isStaff]);

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

  const channelTabs = isStaff
    ? [
        { key: "all", label: "الجميع", locked: false },
        { key: "male", label: "شباب", locked: false },
        { key: "female", label: "بنات", locked: false },
        { key: "09", label: "2009", locked: false },
        { key: "10", label: "2010", locked: false },
      ]
    : [
        { key: "all", label: "الجميع", locked: isChannelLocked("all") },
        ...(profile?.gender !== "female" ? [{ key: "male", label: "شباب", locked: isChannelLocked("male") }] : []),
        ...(profile?.gender !== "male" ? [{ key: "female", label: "بنات", locked: isChannelLocked("female") }] : []),
        ...(myGen ? [{ key: myGen, label: `20${myGen}`, locked: isChannelLocked(myGen) }] : []),
      ];

  // Channels that are open (=1 or 2 buttons floating at bottom)
  const openChannels = channelTabs.filter(t => !t.locked);

  const lockedKeys = new Set(channelTabs.filter(t => t.locked).map(t => t.key));

  // عند اختيار قسم من نوع جنسي والجنس غير محدد → نحفظ الجنس أولاً ثم نفتح القسم
  const chooseSection = async (key: string) => {
    if (!profile?.gender && (key === "male" || key === "female")) {
      const { error } = await supabase.from("profiles").update({ gender: key } as any).eq("user_id", user?.id);
      if (error) { toast.error("تعذر حفظ اختيارك، حاول مجدداً"); return false; }
      await refreshProfile();
    }
    return true;
  };

  const openTab = async (opt: { key: string; label: string; locked: boolean }) => {
    if (opt.locked) { toast.error(opt.label + " مقفلة حالياً من قبل الإدارة"); return; }
    if (!(await chooseSection(opt.key))) return;
    setChannelFilter(opt.key);
    setPostTarget(opt.key);
  };

  const pickTarget = async (key: string) => {
    if (!(await chooseSection(key))) return;
    setPostTarget(key);
  };

  const postTargets = isStaff
    ? [
        { key: "all", label: "الجميع" },
        { key: "male", label: "شباب" },
        { key: "female", label: "بنات" },
        { key: "09", label: "2009" },
        { key: "10", label: "2010" },
      ]
    : [
        { key: "all", label: "الجميع" },
        ...(profile?.gender !== "female" ? [{ key: "male", label: "شباب" }] : []),
        ...(profile?.gender !== "male" ? [{ key: "female", label: "بنات" }] : []),
        ...(myGen ? [{ key: myGen, label: `20${myGen}` }] : []),
      ].filter(t => !lockedKeys.has(t.key));

  return (
    <>
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      {user && (
        <div className="bg-card border rounded-xl p-4 mb-6 animate-fade-in">
          <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="شارك أفكارك..." className="min-h-[80px] resize-none mb-3" />
          {mediaFiles.length > 0 && (
            <div className="mb-3 p-2 bg-muted rounded-lg flex items-center justify-between">
              <span className="text-sm text-muted-foreground truncate">
                {mediaFiles.length} ملف: {mediaFiles.map(f => f.name).join(", ")}
              </span>
              <Button variant="ghost" size="sm" onClick={() => { setMediaFiles([]); setMediaType(null); }}>إزالة</Button>
            </div>
          )}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-muted-foreground">نشر إلى:</span>
            <div className="flex gap-1 bg-muted/60 rounded-lg p-1 flex-wrap">
              {postTargets.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => void pickTarget(opt.key)}
                  className={`text-xs px-3 py-1 rounded-md transition-colors ${postTarget === opt.key ? "bg-primary text-primary-foreground font-medium" : "hover:bg-background"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
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
          <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const files = e.target.files; if (files) { const list = Array.from(files); setMediaFiles(prev => [...prev, ...list]); } e.target.value = ""; }} />
        </div>
      )}

      <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-1 w-fit flex-wrap mb-4">
        <span className="text-xs text-muted-foreground px-2">عرض:</span>
        {channelTabs.map(opt => (
          <button
            key={opt.key}
            onClick={() => void openTab(opt)}
            className={`text-xs px-3 py-1 rounded-md transition-colors flex items-center gap-1 ${opt.locked ? "text-muted-foreground/50 line-through cursor-not-allowed" : channelFilter === opt.key ? "bg-primary text-primary-foreground font-medium" : "hover:bg-background"}`}
            title={opt.locked ? "مقفلة" : ""}
          >
            {opt.locked && <Lock className="w-3 h-3" />}
            {opt.label}
          </button>
        ))}
      </div>

      {/* Locked current-channel message */}
      {channelTabs.find(t => t.key === channelFilter)?.locked && (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-3 mb-4">
          <Lock className="w-4 h-4" />
          <p className="text-sm">هذه القناة مقفلة حالياً من قبل الإدارة.</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><p>لا توجد منشورات بعد. كن أول من ينشر!</p></div>
      ) : (
        <div className="space-y-4">
          {posts
            .filter(p => {
              const ch = p.channel || "all";
              if (!isStaff && isChannelLocked(ch)) return false;
              return channelFilter === "all"
                 ? p.channel === "all" || p.channel === null
                 : p.channel === channelFilter || p.channel === "all" || p.channel === null;
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

      {/* Floating quick-switch to open channels — appears only when some channels are locked */}
      {!isStaff && openChannels.length > 0 && openChannels.length < 3 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex gap-2 bg-card/90 backdrop-blur border rounded-full p-1 shadow-lg animate-fade-in">
          {openChannels.map(opt => (
            <button
              key={opt.key}
              onClick={() => void openTab(opt)}
              className={`text-xs font-medium px-4 py-2 rounded-full transition-colors ${channelFilter === opt.key ? "bg-primary text-primary-foreground" : "bg-muted/60 hover:bg-muted"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>

    <Dialog open={showSalawat} onOpenChange={setShowSalawat}>
      <DialogContent className="text-center">
        <DialogHeader>
          <DialogTitle className="text-xl">🙏 ذِكر الدخول</DialogTitle>
          <DialogDescription className="text-base leading-relaxed text-foreground">
            اللهم صلِّ وسلم وبارك على نبينا محمد ﷺ
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <p className="text-2xl font-semibold text-primary leading-relaxed">ﷺ</p>
          <p className="text-sm text-muted-foreground">اللهم صلِّ على محمد وعلى آل محمد، كما صليت على آل إبراهيم، وبارك على محمد وعلى آل محمد، كما باركت على آل إبراهيم، إنك حميد مجيد.</p>
        </div>
        <DialogFooter className="sm:justify-center">
          <Button onClick={() => setShowSalawat(false)}>ﷺ صلِّ على النبي ×3</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default Chat;
