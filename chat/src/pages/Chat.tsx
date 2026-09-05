import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { containsBannedWord, loadBannedWords } from "@/lib/bannedWords";
import { invalidateTable } from "@/lib/invalidation";
import { loadChannelSettings, loadSectionLocks, isSectionEffectivelyLocked, loadAdminUserIds } from "@/lib/appCache";
import { isReadGatewayConfigured, readGateway } from "@/lib/readGateway";
import PostCard from "@/components/PostCard";
import MentionInput from "@/components/MentionInput";
import { renderMentions, submitMentions } from "@/lib/mentions";
import { usePoints } from "@/contexts/PointsContext";
import PointsDisplay from "@/components/PointsDisplay";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Send, Image as ImageIcon, Video, Loader2, Lock, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { compressMedia } from "@/lib/mediaCompression";
import { uploadToCloudinary } from "@/lib/cloudinary";
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
  status?: string | null;
  is_pinned?: boolean;
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
  /** عدد التعليقات — يُملأ من الفيد الرفيع (بدل حمل أجسام التعليقات). */
  commentCount?: number;
}

/** حِزمة /feed من البوابة (Layer 2) — تُقرأ بصلاحيات RLS الخاصة بالمستخدم. */
interface GatewayFeedPost {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  image_urls: string[] | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  is_pinned: boolean;
  generation: string | null;
  field: string | null;
  channel: string | null;
  status?: string | null;
}

interface GatewayFeed {
  page: number;
  limit: number;
  posts: GatewayFeedPost[];
  /** الفيد الرفيع: عدد تعليقات كل منشور فقط (بلا أجسام). */
  commentCounts: Record<string, number>;
  likes: { post_id: string; user_id: string }[];
  profiles: Record<string, {
    full_name?: string | null;
    avatar_url?: string | null;
    generation?: string | null;
    field?: string | null;
    gender?: string | null;
  } | undefined>;
}

const Chat = () => {
  const { user, profile, isAdmin, isStaff, refreshProfile, session } = useAuth();
  const { spend, getCost, balance } = usePoints();
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
  const [showSalawat, setShowSalawat] = useState(false);
  const [channelSettings, setChannelSettings] = useState<Record<string, boolean>>({ all: true, male: true, female: true, "09": true, "10": true });
  const [sectionLocks, setSectionLocks] = useState<Record<string, boolean>>({});
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());

  const myGen = profile?.generation as string | null;
  const userPickedChannel = useRef(false);

  const sortPosts = (a: any, b: any) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  };

  const fetchPosts = useCallback(async (offset = 0, append = false) => {
    if (append) setLoadingMore(true);
    try {
      // المسار المباشر (Fallback): السلوك الأصلي الحالي تماماً — يُستخدم عند
      // غياب البوابة أو فشلها أو غياب رمز المستخدم.
      const loadDirect = async () => {
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

        const [likesRes, countsRes] = postIds.length
          ? await Promise.all([
              supabase.from("likes").select("post_id, user_id").in("post_id", postIds),
              // فيد رفيع مباشر: إحصاء التعليقات فقط (post_id) — لا أجسام تعليقات.
              supabase.from("comments").select("post_id").in("post_id", postIds).is("deleted_at", null),
            ])
          : [{ data: [] }, { data: [] }];

        const countsMap: Record<string, number> = {};
        (countsRes.data || []).forEach((c: any) => {
          countsMap[c.post_id] = (countsMap[c.post_id] || 0) + 1;
        });

        const cleaned = baseRows.map((p: any) => ({
          ...p,
          likes: (likesRes.data || []).filter((l: any) => l.post_id === p.id),
          comments: [],
          commentCount: countsMap[p.id] || 0,
        })) as unknown as Post[];

        const sorted = cleaned.sort(sortPosts);
        setPosts(prev => append ? [...prev, ...sorted] : sorted);
        setHasMore(baseRows.length === PAGE_SIZE);

        // مجموعة الأدمن من كاش مشترك (لا طلب user_roles مع كل فيد).
        if (postIds.length > 0) {
          const [adminSet] = await Promise.all([loadAdminUserIds()]);
          setAdminUserIds(adminSet);
        }
      };

      // المسار عبر البوابة (Layer 2): طلب واحد بصلاحيات RLS الخاصة بالمستخدم.
      const accessToken = session?.access_token ||
        (await supabase.auth.getSession()).data.session?.access_token ||
        "";
      let viaGateway = false;

      if (isReadGatewayConfigured() && accessToken) {
        const page = Math.floor(offset / PAGE_SIZE) + 1;
        const feed = await readGateway<GatewayFeed>(
          `/feed?page=${page}&limit=${PAGE_SIZE}&channel=${encodeURIComponent(channelFilter)}`,
          { accessToken }
        );

        if (feed && Array.isArray(feed.posts)) {
          const postsForPage = feed.posts
            .map((p: GatewayFeedPost) => ({
              ...p,
              profiles: feed.profiles?.[p.user_id] ?? null,
              likes: (feed.likes || []).filter((l) => l.post_id === p.id),
              comments: [],
              commentCount: feed.commentCounts?.[p.id] ?? 0,
            }))
            .sort(sortPosts) as unknown as Post[];

          setPosts(prev => append ? [...prev, ...postsForPage] : postsForPage);
          setHasMore(feed.posts.length === PAGE_SIZE);

          // مجموعة الأدمن من كاش مشترك (لا طلب user_roles مع كل فيد).
          const [adminSet] = await Promise.all([loadAdminUserIds()]);
          setAdminUserIds(adminSet);
          viaGateway = true;
        }
      }

      if (!viaGateway) {
        await loadDirect();
      }
    } catch (err) {
      console.error("Failed to load chat posts", err);
      toast.error("تعذر تحميل الدردشة، حاول تحديث الصفحة");
      if (!append) setPosts([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [channelFilter, user, session]);

  const fetchChannelSettings = useCallback(async () => {
    const map = await loadChannelSettings();
    setChannelSettings(map);
  }, []);

  const fetchSectionLocks = useCallback(async () => {
    const map = await loadSectionLocks();
    const booleans: Record<string, boolean> = {};
    Object.keys(map).forEach((k) => {
      booleans[k] = isSectionEffectivelyLocked(map[k]);
    });
    setSectionLocks(booleans);
  }, []);

  const refreshPost = useCallback(async (postId: string) => {
    if (!postId) return;
    try {
      const { data: row, error } = await supabase
        .from("posts")
        .select("*, profiles!posts_user_id_profiles_fkey(full_name, avatar_url, generation, field, gender)")
        .is("deleted_at", null)
        .eq("id", postId)
        .maybeSingle();

      if (error || !row) {
        // المنشور محذوف (soft-delete) أو غير مرئي → نزيله من القائمة محلياً
        setPosts(prev => prev.filter(p => p.id !== postId));
        return;
      }

      const [likesRes, countsRes] = await Promise.all([
        supabase.from("likes").select("post_id, user_id").eq("post_id", postId),
        supabase.from("comments").select("post_id").eq("post_id", postId).is("deleted_at", null),
      ]);

      const cleaned = {
        ...row,
        likes: likesRes.data || [],
        comments: [],
        commentCount: (countsRes.data || []).length,
      } as unknown as Post;

      setPosts(prev => {
        const exists = prev.some(p => p.id === postId);
        const base = exists ? prev.map(p => (p.id === postId ? cleaned : p)) : [cleaned, ...prev];
        return base.sort(sortPosts);
      });
    } catch {
      console.error("Failed to refresh post", postId);
    }
  }, []);

  const sectionKeyFor = (ch: string) =>
    ch === "all" ? "chat_all" : ch === "09" ? "chat_09" : ch === "10" ? "chat_10" : null;

  const isChannelLocked = (key: string) => {
    if (isStaff) return false;
    const sec = sectionKeyFor(key);
    if (sec && sectionLocks[sec]) return true;
    return !(channelSettings[key] ?? true);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPosts(0, false);
    setRefreshing(false);
  }, [fetchPosts]);

  // تحديث محلي فوري للايكات بدون إعادة جلب (يُحافظ على كاش الفيد).
  const handleLikeChanged = useCallback((postId: string, adding: boolean) => {
    if (!user) return;
    setPosts(prev =>
      prev.map(p =>
        p.id === postId
          ? {
              ...p,
              likes: adding
                ? [...p.likes.filter(l => l.user_id !== user.id), { user_id: user.id }]
                : p.likes.filter(l => l.user_id !== user.id),
            }
          : p
      )
    );
  }, [user]);

  useEffect(() => {
    if (shouldShowSalawat()) setShowSalawat(true);
    loadBannedWords();
    fetchPosts(0, false);
    fetchChannelSettings();
    fetchSectionLocks();
    // لا Realtime هنا — جلب يدوي (زر تحديث) لتقليل استنزاف القاعدة كثيراً
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
    // فحص النقاط: تكلفة المنشور = 5 (أو 10 مع @everyone)
    const hasMentionAll = /@everyone|@الجميع/.test(content);
    const postCost = hasMentionAll ? getCost("everyone") : getCost("post");
    if (!isStaff && balance < postCost) {
      toast.error(`تحتاج ${postCost} نقطة لإنشاء منشور. رصيدك الحالي: ${balance}`);
      return;
    }
    // المنشور يُنشر تلقائياً في القناة المعروضة حالياً فقط، ولا يُسمح بالنشر في
    // قناة مقفلة (يُغلق القسم للجميع ما عدا الإدارة).
    if (!isStaff && isChannelLocked(channelFilter)) {
      toast.error("هذه القناة مقفلة حالياً من قبل الإدارة — لا يمكن النشر فيها");
      return;
    }
    setPosting(true);
    const needsReview = !isStaff && (channelFilter === "all");
    let imageUrls: string[] | null = null;
    const imageUrl: string | null = null;
    let videoUrl: string | null = null;

    if (mediaFiles.length > 0) {
      const urls: string[] = [];
      for (const file of mediaFiles) {
        const compressed = await compressMedia(file);
        try {
          const cdnUrl = await uploadToCloudinary(compressed);
          urls.push(cdnUrl);
        } catch {
          toast.error("فشل رفع الملف"); setPosting(false); return;
        }
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
      channel: channelFilter,
    };
    if (!imageUrls) delete insertData.image_urls;

    const { data: inserted, error } = await supabase.from("posts").insert(insertData).select("id");
    if (error) {
      if ((error as any).message?.includes("section_locked")) toast.error("هذه القناة مقفلة حالياً من قبل الإدارة");
      else toast.error("فشل نشر المنشور");
    }
    else {
      // خصم النقاط بعد النشر الناجح
      if (!isStaff) {
        const costType = hasMentionAll ? "everyone" : "post";
        const spendResult = await spend(postCost, costType, "chat", { postId: inserted?.[0]?.id });
        if (!spendResult.success) {
          console.warn("[Chat] Points spend failed:", spendResult.errorMessage);
        }
      }
      setContent(""); setMediaFiles([]); setMediaType(null);
      toast.success(needsReview ? "تم إرسال المنشور للمراجعة، سيظهر بعد موافقة الإدارة" : "تم النشر");
      void invalidateTable("posts");
      const postId = inserted?.[0]?.id;
      if (postId) {
        await submitMentions(supabase, { postId, actorId: user.id, text: content, channel: channelFilter });
        const now = new Date().toISOString();
        const optimisticPost = {
          id: postId,
          user_id: user.id,
          content: content.trim(),
          image_url: imageUrls && imageUrls.length ? imageUrls[0] : null,
          image_urls: imageUrls,
          video_url: videoUrl,
          channel: channelFilter,
          status: needsReview ? "pending" : "approved",
          created_at: now,
          updated_at: now,
          generation: null,
          is_pinned: false,
          profiles: {
            full_name: profile?.full_name || "",
            avatar_url: profile?.avatar_url || null,
            generation: profile?.generation || null,
            field: profile?.field || null,
            gender: profile?.gender || null,
          },
          likes: [],
          comments: [],
          commentCount: 0,
        } as unknown as Post;
        setPosts(prev => [optimisticPost, ...prev].sort(sortPosts));
      }
    }
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

  // Channel label map for notifications
  const channelLabel = (key: string) =>
    ({ all: "الجميع", male: "شباب", female: "بنات", "09": "2009", "10": "2010" } as Record<string, string>)[key] ?? key;

  // Redirect to user's own channel once gender is known, and auto-switch
  // on lock preferring the user's channel before falling back to الجميع
  useEffect(() => {
    const haveTabs = isStaff || !!(profile?.gender) || !!myGen;
    if (!haveTabs) return;

    const ownChannels = [
      // فقط الجنس الصريح المؤكد (شباب/بنات) يُوجّه صاحبه لقناته؛ المجهول لا يُدرج له قناة جندرية.
      ...(profile?.gender === "male" || profile?.gender === "female" ? [{ key: profile.gender }] : []),
      ...(myGen ? [{ key: myGen }] : []),
    ];

    // Preference order: own channel(s) first, الجميع last (only fallback)
    const tabs = isStaff
      ? [{ key: "all" }, { key: "male" }, { key: "female" }, { key: "09" }, { key: "10" }]
      : [...ownChannels, { key: "all" }];

    const current = tabs.find(t => t.key === channelFilter);

    // Case 1: current channel got locked — redirect to first open, preferring own channels
    if (current && isChannelLocked(current.key)) {
      const firstOpen = tabs.find(t => !isChannelLocked(t.key));
      if (firstOpen && firstOpen.key !== channelFilter) {
        toast.info(`انتقلت إلى ${channelLabel(firstOpen.key)} لأن ${channelLabel(channelFilter)} أُغلقت`);
        setChannelFilter(firstOpen.key);
      }
    // Case 2: first visit — steer user to their own channel instead of defaulting to الجميع
    } else if (!isStaff && !userPickedChannel.current && channelFilter === "all") {
      const home = ownChannels.find(c => !isChannelLocked(c.key));
      if (home && home.key !== channelFilter) setChannelFilter(home.key);
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
        // الشاب (male) يرى قناة الشباب فقط، والبنت (female) ترى قناة البنات فقط.
        // المجهول الجنس لا يرى أي قناة جندرية حتى لا تتسرب قناة البنات للشباب.
        ...(profile?.gender === "male"
          ? [{ key: "male", label: "شباب", locked: isChannelLocked("male") }]
          : profile?.gender === "female"
            ? [{ key: "female", label: "بنات", locked: isChannelLocked("female") }]
            : []),
        ...(myGen ? [{ key: myGen, label: `20${myGen}`, locked: isChannelLocked(myGen) }] : []),
      ];

  // Channels that are open (=1 or 2 buttons floating at bottom)
  const openChannels = channelTabs.filter(t => !t.locked);

  // الجنس (ذكر/أنثى) يُضبط مرة واحدة فقط من الحوار الإجباري GenderOnboardingDialog
  // ولا يُشتق أبداً من فتح تبويب هنا — حتى لا ينقلب جنس أحد عن تجربة زر فينحصر
  // عليه جنس خاطئ (الترigger يمنع تغييره لاحقاً).
  const chooseSection = async (_key: string) => {
    return true;
  };

  const openTab = async (opt: { key: string; label: string; locked: boolean }) => {
    if (opt.locked) { toast.error(opt.label + " مقفلة حالياً من قبل الإدارة"); return; }
    if (!(await chooseSection(opt.key))) return;
    userPickedChannel.current = true;
    setChannelFilter(opt.key);
  };

  return (
    <>
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      {user && <PointsDisplay />}
      {user && (
        <div className="bg-card border rounded-xl p-4 mb-6 animate-fade-in">
          <MentionInput
            value={content}
            onChange={setContent}
            placeholder="شارك أفكارك... (اكتب @ لمنشن)"
            channel={channelFilter}
            currentGender={profile?.gender}
            currentGeneration={myGen}
            isAdmin={isAdmin}
            minRows={3}
            className="min-h-[80px] mb-3"
          />
          {mediaFiles.length > 0 && (
            <div className="mb-3 p-2 bg-muted rounded-lg flex items-center justify-between">
              <span className="text-sm text-muted-foreground truncate">
                {mediaFiles.length} ملف: {mediaFiles.map(f => f.name).join(", ")}
              </span>
              <Button variant="ghost" size="sm" onClick={() => { setMediaFiles([]); setMediaType(null); }}>إزالة</Button>
            </div>
          )}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground">
              {!isStaff && channelFilter === "all"
                ? "سيُراجع منشورك قبل النشر في قناة الجميع — يظهر بعد موافقة الإدارة"
                : `سيُنشر منشورك تلقائياً في قناة ${channelTabs.find(t => t.key === channelFilter)?.label ?? "الجميع"} نظراً لكونك داخلها`}
            </span>
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
        <Button
          variant="ghost"
          size="sm"
          className="ms-auto"
          onClick={() => void handleRefresh()}
          disabled={refreshing || loading}
          title="تحديث المنشورات"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
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
              if (p.status === "pending" && p.user_id !== user?.id) return false;
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
                onRefresh={() => refreshPost(post.id)}
                onLikeChanged={handleLikeChanged}
                highlight={post.id === highlightPostId}
                authorIsAdmin={adminUserIds.has(post.user_id)}
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
