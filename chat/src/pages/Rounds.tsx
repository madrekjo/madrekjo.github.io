import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { invalidateTable } from "@/lib/invalidation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Users, Plus, Loader2, Trash2, LogIn, Clock, Play,
  Coffee, BellRing, Eye, HelpCircle, CheckCircle2, UserMinus, Edit2, Lock,
  MessageSquare, RefreshCw, Flame, Square, ImagePlus, UserPlus,
  LayoutGrid, List, Target, Award, Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import MeetingChat from "@/components/MeetingChat";
import { usePoints } from "@/contexts/PointsContext";
import { useRoundPresence } from "@/hooks/useRoundPresence";
import RoundSessionScreen from "@/components/rounds/RoundSessionScreen";
import InviteDialog from "@/components/rounds/InviteDialog";
import type { Round, Meeting } from "@/components/rounds/types";
import { compressImage, MAX_IMAGE_BYTES } from "@/lib/mediaCompression";
import { uploadToCloudinary } from "@/lib/cloudinary";
import {
  roundStateAt,
  roundTotalSeconds,
  breakSecondsLeft,
  formatDuration,
  BASE_BALANCE,
  MAX_BALANCE,
  POINTS_PER_BATCH,
} from "@/lib/roundSchedule";
import type { RoundLeaderboardRow } from "@/lib/points";

const ROUND_COLUMNS =
  "id, user_id, title, description, duration_minutes, break_enabled, break_interval_minutes, break_duration_minutes, alarm_muted, started_at, ended_at, scheduled_end_at, settled, status, created_at, capacity, cover_image_url";

/** وقت انتهاء الجولة بالمللي — من جدول الخادم إن وُجد، وإلا من نفس رياضة الجدولة */
const roundEndMs = (r: Round) => {
  if (r.scheduled_end_at) return new Date(r.scheduled_end_at).getTime();
  if (!r.started_at) return Number.POSITIVE_INFINITY;
  return new Date(r.started_at).getTime() + roundTotalSeconds(r) * 1000;
};

/** هل انتهى زمن الجولة كاملاً (عمل + بريكات)؟ */
const isRoundOver = (r: Round, now: number) =>
  r.status !== "pending" && roundEndMs(r) <= now;

const Rounds = () => {
  const { user, isAdmin, isModerator } = useAuth();
  const { startRound, settleRound, leaderboard, refreshPoints, balance } = usePoints();

  // الإنشاء متاح للجميع — السقفك (جولة نشطة/معلقة واحدة لكل مستخدم) على الخادم
  const canCreateRound = !!user;
  const isStaff = isAdmin || isModerator;

  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [viewingRound, setViewingRound] = useState<Round | null>(null);
  const [editingRound, setEditingRound] = useState<Round | null>(null);

  // نُخزّن المعرّف لا الكائن، حتى لا يبقى في الحوار كائن قديم بعد التحديث
  const [sessionRoundId, setSessionRoundId] = useState<string | null>(null);
  const sessionRound = useMemo(
    () => rounds.find((r) => r.id === sessionRoundId) ?? null,
    [rounds, sessionRoundId]
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(60);
  const [breakEnabled, setBreakEnabled] = useState(false);
  const [breakInterval, setBreakInterval] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [alarmMuted, setAlarmMuted] = useState(false);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [inviteRound, setInviteRound] = useState<Round | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // وضع العرض: شبكة بطاقات أو قائمة مضغوطة (محفوظ محلياً)
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof localStorage !== "undefined" && localStorage.getItem("rounds:viewMode") === "list") return "list";
    return "grid";
  });
  const toggleView = (m: "grid" | "list") => {
    setViewMode(m);
    try { localStorage.setItem("rounds:viewMode", m); } catch {}
  };

  const [now, setNow] = useState(Date.now());
  const alarmRef = useRef<HTMLAudioElement | null>(null);
  const ringingFor = useRef<Set<string>>(new Set());
  const wasInBreak = useRef<Map<string, boolean>>(new Map());
  const promptedFor = useRef<Set<string>>(new Set());
  const [, forceTick] = useState(0);

  // Meetings
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingOpen, setMeetingOpen] = useState<Meeting | null>(null);
  const [createMeetingOpen, setCreateMeetingOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");

  // Completions
  const [completionRound, setCompletionRound] = useState<Round | null>(null);
  const [achievement, setAchievement] = useState("");
  const [myCompletions, setMyCompletions] = useState<Set<string>>(new Set());

  // لوحة الحضور داخل الجلسة
  const [board, setBoard] = useState<RoundLeaderboardRow[]>([]);

  // زر دخول/خروج: صريح للمستخدم. الاحتساب كله على الخادم من لحظة الدخول،
  // فيستمر ولو غيّر المستخدم التبويب أو الصفحة — بلا نبض كل 30 ثانية.

  const {
    joinedRoundId: presenceRoundId,
    join: enterRound,
    leave: exitRound,
    live,
    beat,
    beating,
  } = useRoundPresence();

  const sessionJoined = !!sessionRoundId && presenceRoundId === sessionRoundId;

  // يُخزَّن المشاركون والبروفايلات خارج قائمة الجولات حتى لا يُعاد جلبها كل استطلاع.
  const detailCache = useRef<{ parts: any[]; profiles: any[] }>({ parts: [], profiles: [] });
  const roundsRef = useRef<Round[]>(rounds);
  roundsRef.current = rounds;

  useEffect(() => {
    void fetchRounds();
    void fetchMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!localStorage.getItem("rounds_help_seen")) {
      setHelpOpen(true);
      localStorage.setItem("rounds_help_seen", "1");
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchRounds = async () => {
    try {
      const { data: roundsData, error } = await (supabase as any)
        .from("study_rounds").select(ROUND_COLUMNS).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      if (!roundsData) return;
      const { parts, profiles } = detailCache.current;
      const enriched: Round[] = roundsData.map((r: any) => ({
        ...r,
        profile: profiles?.find((p: any) => p.user_id === r.user_id) || null,
        participants: (parts || [])
          .filter((p: any) => p.round_id === r.id)
          .map((p: any) => ({ user_id: p.user_id, profile: profiles?.find((pr: any) => pr.user_id === p.user_id) || null })),
      }));
      setRounds(enriched);
    } catch (err) {
      console.error("Failed to load rounds", err);
      toast.error("تعذر تحميل الجولات");
    } finally {
      setLoading(false);
    }
  };

  // يُجلب المشاركون والبروفايلات ببطء (عند الدخول + الانضمام/الخروج فقط)
  const fetchRoundsDetail = async () => {
    try {
      let roundIds: string[] = [];
      let userIds: string[] = [];
      const { data: brief } = await (supabase as any)
        .from("study_rounds").select("id, user_id").limit(100);
      if (brief) {
        roundIds = (brief as any[]).map(r => r.id);
        userIds = Array.from(new Set((brief as any[]).map(r => r.user_id)));
      }
      const { data: parts } = roundIds.length
        ? await (supabase as any).from("round_participants").select("round_id, user_id").in("round_id", roundIds)
        : { data: [] };
      const partUserIds = Array.from(new Set((parts || []).map((p: any) => p.user_id)));
      const allUserIds = Array.from(new Set([...userIds, ...partUserIds]));
      const { data: profiles } = allUserIds.length
        ? await supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", allUserIds as string[])
        : { data: [] };
      detailCache.current = { parts: parts || [], profiles: profiles || [] };
      setRounds(prev => prev.map((r: any) => ({
        ...r,
        profile: (profiles || []).find((p: any) => p.user_id === r.user_id) || null,
        participants: (parts || [])
          .filter((p: any) => p.round_id === r.id)
          .map((p: any) => ({ user_id: p.user_id, profile: (profiles || []).find((pr: any) => pr.user_id === p.user_id) || null })),
      })));
    } catch (err) {
      console.error("Failed to load rounds detail", err);
    }
  };

  useEffect(() => {
    fetchRoundsDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchMeetings = async () => {
    const { data } = await (supabase as any).from("round_meetings").select("id, owner_id, title").order("created_at", { ascending: false });
    setMeetings(data || []);
  };

  const fetchMyCompletions = async () => {
    if (!user) return;
    const { data } = await (supabase as any).from("round_completions").select("round_id").eq("user_id", user.id);
    setMyCompletions(new Set((data || []).map((d: any) => d.round_id)));
  };

  useEffect(() => { fetchMyCompletions(); }, [user?.id]);

  // دعوة إشعارية: /rounds?r=<id> تفتح شاشة الجولة مباشرة
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const rid = new URLSearchParams(location.search).get("r");
    if (!rid || rounds.length === 0) return;
    if (!rounds.some(r => r.id === rid)) return;
    setSessionRoundId(rid);
    navigate("/rounds", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, rounds]);

  // لوحة الحضور: تُجلب مرة واحدة عند فتح الجلسة — بلا استطلاع متكرر
  const loadBoard = useCallback(async (id: string) => {
    setBoard(await leaderboard(id));
  }, [leaderboard]);

  useEffect(() => {
    if (!sessionRoundId) { setBoard([]); return; }
    void loadBoard(sessionRoundId);
  }, [sessionRoundId, loadBoard]);

  // ---------------------------------------------------------------
  // المؤقّت والإشعارات — عرض فقط، ولا يكتب شيئاً في القاعدة
  // ---------------------------------------------------------------
  useEffect(() => {
    roundsRef.current.forEach(r => {
      if (r.status !== "active") return;
      const st = roundStateAt(r, now);

      // انتقال داخل/خارج البريك ⇒ إشعار دقيق مرة واحدة لكل بريك
      const was = wasInBreak.current.get(r.id) ?? false;
      if (st.inBreak !== was) {
        wasInBreak.current.set(r.id, st.inBreak);
        if (st.inBreak) {
          toast.info(`☕ وقت الراحة في "${r.title}" — لا تُحتسب دقائق، وإغلاق التبويب يوقف الاحتساب`);
        } else {
          toast.success(`رجعنا للعمل — "${r.title}"`);
        }
      }

      // منبّه انتهاء الجولة
      if (now >= roundEndMs(r) && !ringingFor.current.has(r.id)) {
        ringingFor.current.add(r.id);
        forceTick(x => x + 1);
        if (!r.alarm_muted) playAlarm();
        if (sessionRoundId === r.id) void beat();
      }
    });
  }, [now, rounds, sessionRoundId, beat]);

  // من انتهى وقته ولم يُنهِه الخادم بعد: نُحدّث القائمة عند العودة للصفحة
  // ومرة واحدة بعد 65 ثانية — بلا استطلاع متكرر (التسوية تلقائية في الخادم كل دقيقة)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchRounds();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const t = setTimeout(() => {
      if (roundsRef.current.some(r => r.status === "active" && roundEndMs(r) <= Date.now())) {
        void fetchRounds();
      }
    }, 65_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // الخادم هو من يُثبّت "انتهت الجولة"، هو نطلب تقييم الإنجاز (مرة واحدة)
  useEffect(() => {
    if (!user || completionRound) return;
    const target = rounds.find(r => r.status === "completed" && !myCompletions.has(r.id));
    if (!target || promptedFor.current.has(target.id)) return;
    const isMember = target.user_id === user.id || target.participants.some(p => p.user_id === user.id);
    if (!isMember) return;
    promptedFor.current.add(target.id);
    setCompletionRound(target);
  }, [rounds, myCompletions, user, completionRound]);

  const playAlarm = () => {
    if (!alarmRef.current) return;
    alarmRef.current.loop = true;
    alarmRef.current.currentTime = 0;
    alarmRef.current.play().catch(() => {});
  };
  const stopAlarm = (id?: string, auto = false) => {
    if (alarmRef.current) {
      try { alarmRef.current.pause(); alarmRef.current.currentTime = 0; alarmRef.current.loop = false; } catch {}
    }
    if (id) ringingFor.current.delete(id);
    forceTick(x => x + 1);
    if (!auto) toast.success("تم إيقاف المنبّه");
  };

  const clearCover = () => {
    if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
    setCoverFile(null);
    setCoverPreview(null);
  };

  const pickCover = (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES * 4) {
      toast.error("صورة كبيرة جداً — الحد 5 ميغابايت");
      return;
    }
    clearCover();
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const resetForm = () => {
    setTitle(""); setDescription(""); setDuration(60);
    setBreakEnabled(false); setBreakInterval(25); setBreakDuration(5); setAlarmMuted(false);
    setCapacity(null);
    clearCover();
  };

  const handleCreate = async () => {
    if (!user || !title.trim() || creating) return;
    setCreating(true);
    try {
      let cover_image_url: string | null = null;
      if (coverFile) {
        const compressed = await compressImage(coverFile);
        cover_image_url = await uploadToCloudinary(compressed);
      }
      const { error } = await (supabase as any).from("study_rounds").insert({
        user_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        duration_minutes: duration,
        break_enabled: breakEnabled,
        break_interval_minutes: breakEnabled ? breakInterval : null,
        break_duration_minutes: breakEnabled ? breakDuration : null,
        alarm_muted: alarmMuted,
        capacity: capacity && capacity > 0 ? capacity : null,
        cover_image_url,
        status: "pending",
      });
      if (error) {
        const msg = String((error as any)?.message || error);
        if (/round_limit_reached/.test(msg)) {
          toast.error((error as any)?.hint || "لديك جولة نشطة أو معلّقة بالفعل — أنهِها أو احذفها أولاً");
        } else if (/round_full/.test(msg)) {
          toast.error("الجولة ممتلئة");
        } else {
          toast.error("فشل إنشاء الجولة");
        }
        return;
      }
      toast.success("تم إنشاء الجولة");
      setOpen(false); resetForm(); fetchRounds(); void invalidateTable("study_rounds");
    } catch (err) {
      console.error("Failed to create round", err);
      toast.error("تعذر رفع صورة الجولة");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (r: Round) => {
    setEditingRound(r);
    setTitle(r.title);
    setDescription(r.description || "");
    setDuration(r.duration_minutes);
    setBreakEnabled(r.break_enabled);
    setBreakInterval(r.break_interval_minutes || 25);
    setBreakDuration(r.break_duration_minutes || 5);
    setAlarmMuted(!!r.alarm_muted);
    setCapacity(r.capacity);
    setCoverFile(null);
    setCoverPreview(r.cover_image_url);
  };

  const handleSaveEdit = async () => {
    if (!editingRound || creating) return;
    setCreating(true);
    try {
      let cover_image_url: string | null = coverPreview;
      if (coverFile) {
        const compressed = await compressImage(coverFile);
        cover_image_url = await uploadToCloudinary(compressed);
      }
      const { error } = await (supabase as any).from("study_rounds").update({
        title: title.trim(),
        description: description.trim() || null,
        duration_minutes: duration,
        break_enabled: breakEnabled,
        break_interval_minutes: breakEnabled ? breakInterval : null,
        break_duration_minutes: breakEnabled ? breakDuration : null,
        alarm_muted: alarmMuted,
        capacity: capacity && capacity > 0 ? capacity : null,
        cover_image_url,
      }).eq("id", editingRound.id);
      if (error) { toast.error("فشل التعديل"); return; }
      toast.success("تم التعديل");
      setEditingRound(null); resetForm(); fetchRounds(); void invalidateTable("study_rounds");
    } catch (err) {
      console.error("Failed to save round", err);
      toast.error("تعذر رفع صورة الجولة");
    } finally {
      setCreating(false);
    }
  };

  // ---------------------------------------------------------------
  // البدء والإنهاء: RPC فقط. لا ساعة المتصفح تتدخل في أي منهما.
  // ---------------------------------------------------------------
  const handleStart = async (r: Round) => {
    setBusyId(r.id);
    const res = await startRound(r.id);
    setBusyId(null);
    if (!res.success) { toast.error(res.errorMessage || "فشل البدء"); return; }
    stopAlarm(r.id, true);
    toast.success("بدأت الجولة — النقاط تُحسب من الآن مقابل حضورك الفعلي");
    await fetchRounds();
    void invalidateTable("study_rounds");
  };

  const handleEndRound = async (r: Round) => {
    if (!confirm("إنهاء الجولة الآن وتجميد سجل الحضور؟")) return;
    setBusyId(r.id);
    const res = await settleRound(r.id);
    setBusyId(null);
    if (!res.success) { toast.error(res.errorMessage || "فشل الإنهاء"); return; }
    stopAlarm(r.id, true);
    if (sessionRoundId === r.id) setSessionRoundId(null);
    toast.success(`انتهت الجولة — جُمّد حضور ${res.participants} مشارك (النقاط كانت تُمنح أثناء الجولة)`);
    await fetchRounds();
    void invalidateTable("study_rounds");
  };

  const joinAndEnter = async (r: Round) => {
    if (!user) return;
    let joined = !!r.participants.find(p => p.user_id === user.id);
    if (!joined) {
      const { data: existing } = await (supabase as any)
        .from("round_participants")
        .select("user_id")
        .eq("round_id", r.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!existing) {
        const { error } = await (supabase as any).from("round_participants").insert({ round_id: r.id, user_id: user.id });
        if (error) {
          const msg = String((error as any)?.message || error);
          if (/duplicate key value violates unique constraint/i.test(msg)) {
            joined = true;
          } else if (/round_full/.test(msg)) {
            toast.error(r.capacity ? `الجولة ممتلئة — السعة ${r.capacity} منضم` : "الجولة ممتلئة");
            return;
          } else {
            toast.error(`فشل الانضمام: ${msg}`);
            return;
          }
        } else {
          joined = true;
          toast.success("انضممت للجولة");
        }
      } else {
        joined = true;
      }
      await fetchRoundsDetail(); await fetchRounds(); void invalidateTable("round_participants");
    } else {
      await fetchRoundsDetail(); await fetchRounds(); void invalidateTable("round_participants");
    }
    if (joined) {
      setSessionRoundId(r.id);
      // الدخول = احتسب فوري: والجولة نشطة نُدخل حضورك مباشرة
      if (r.status === "active" && presenceRoundId !== r.id) enterRound(r.id);
    }
  };

  const handleLeave = async (roundId: string) => {
    if (!user) return;
    const { error } = await (supabase as any).from("round_participants").delete().eq("round_id", roundId).eq("user_id", user.id);
    if (error) toast.error("فشل الخروج"); else { toast.success("خرجت من الجولة"); await fetchRoundsDetail(); await fetchRounds(); void invalidateTable("round_participants"); }
  };

  const handleKick = async (roundId: string, uid: string) => {
    if (!confirm("طرد هذا المستخدم؟")) return;
    const { error } = await (supabase as any).from("round_participants").delete().eq("round_id", roundId).eq("user_id", uid);
    if (error) toast.error("فشل الطرد"); else { toast.success("تم الطرد"); await fetchRoundsDetail(); await fetchRounds(); setViewingRound(null); void invalidateTable("round_participants"); }
  };

  const handleDelete = async (roundId: string) => {
    if (!confirm("حذف الجولة؟")) return;
    const { error } = await (supabase as any).from("study_rounds").delete().eq("id", roundId);
    if (error) toast.error("فشل الحذف"); else { toast.success("تم الحذف"); fetchRounds(); void invalidateTable("study_rounds"); }
  };

  // إنجاز الجولة: أدبي فقط. النقاط مُنحت أصلاً مقابل الحضور.
  const submitCompletion = async () => {
    if (!completionRound || !user || !achievement.trim()) return;
    const { error } = await (supabase as any).from("round_completions").insert({
      round_id: completionRound.id, user_id: user.id, achievement: achievement.trim(),
    });
    if (error) { toast.error("فشل الحفظ"); return; }
    toast.success("تم تسجيل إنجازك! 🔥");
    setMyCompletions(s => new Set([...s, completionRound.id]));
    setCompletionRound(null); setAchievement("");
    void invalidateTable("round_completions");
    void refreshPoints();
  };

  const handleCreateMeeting = async () => {
    if (!user || !meetingTitle.trim()) return;
    const { data, error } = await (supabase as any).from("round_meetings")
      .insert({ owner_id: user.id, title: meetingTitle.trim() }).select().single();
    if (error) toast.error("فشل إنشاء الاجتماع");
    else { setMeetingTitle(""); setCreateMeetingOpen(false); fetchMeetings(); setMeetingOpen(data); void invalidateTable("round_meetings"); }
  };

  const handleDeleteMeeting = async (id: string) => {
    if (!confirm("حذف الاجتماع؟")) return;
    await (supabase as any).from("round_meetings").delete().eq("id", id);
    fetchMeetings();
    void invalidateTable("round_meetings");
  };

  if (loading) return (
    <div className="container mx-auto px-4 py-12 text-center">
      <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
    </div>
  );

  const active = rounds.filter(r => r.status !== "completed");
  const completed = rounds.filter(r => r.status === "completed");
  const myMeetings = meetings;

  // إحصائيات الهيرو
  const activeCount = active.length;
  const activeNow = active.filter(r => r.status === "active" && !isRoundOver(r, now)).length;
  const totalParticipants = rounds.reduce((s, r) => s + r.participants.length, 0);
  const myActive = rounds.filter(r => r.status !== "completed" && (r.user_id === user?.id || r.participants.some(x => x.user_id === user?.id))).length;

  // بطاقة الحضور الشخصي انتقلت إلى شاشة الجولة (RoundSessionScreen)

  const statusChip = (r: Round) => {
    const over = r.status === "active" && isRoundOver(r, now);
    const chip = "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium";
    if (r.status === "completed")
      return <span className={`${chip} bg-green-500/15 text-green-600 dark:text-green-400`}><CheckCircle2 className="h-3 w-3" /> {r.settled ? "محسومة" : "منجزة"}</span>;
    if (over) return <span className={`${chip} bg-amber-500/15 text-amber-600 dark:text-amber-400`}>انتهت</span>;
    if (r.status === "active")
      return <span className={`${chip} bg-primary/15 text-primary`}><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> نشطة</span>;
    return <span className={`${chip} bg-muted text-muted-foreground`}>بانتظار البدء</span>;
  };

  /** قائمة مضغوطة — صف أفقي مدمج لكل جولة */
  const renderCompactRow = (r: Round) => {
    const isOwner = r.user_id === user?.id;
    const canStart = isOwner && r.status === "pending";
    const canEnd = isOwner && r.status === "active";
    const st = roundStateAt(r, now);
    const over = r.status === "active" && st.wallRemaining <= 0;
    const busy = busyId === r.id;
    const didComplete = myCompletions.has(r.id);

    return (
      <div
        key={r.id}
        className={`group flex items-center gap-3 rounded-xl border bg-card p-3 transition-all hover:shadow-md cursor-pointer ${r.status === "active" && !over ? "border-primary/40 shadow-sm" : ""}`}
        onClick={() => joinAndEnter(r)}
      >
        {/* صورة مصغّرة */}
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
          {r.cover_image_url ? (
            <img src={r.cover_image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className={`h-full w-full ${r.status === "active" && !over ? "bg-gradient-to-br from-primary/80 to-emerald-500/60" : "bg-gradient-to-br from-slate-500/60 to-slate-700/60"}`} />
          )}
          {r.status === "active" && !over && (
            <span className="absolute bottom-1 left-1 h-2 w-2 animate-pulse rounded-full bg-green-400 ring-2 ring-black/50" />
          )}
        </div>

        {/* المحتوى */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold group-hover:text-primary transition-colors">{r.title}</p>
            {statusChip(r)}
          </div>
          <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-muted-foreground">
            <Avatar className="h-4 w-4 border">
              <AvatarImage src={r.profile?.avatar_url || ""} />
              <AvatarFallback className="text-[8px]">{r.profile?.full_name?.charAt(0) || "م"}</AvatarFallback>
            </Avatar>
            <span className="truncate">{r.profile?.full_name}</span>
            <span className="shrink-0">• {r.duration_minutes}د</span>
            {r.capacity != null && <span className="shrink-0 flex items-center gap-0.5"><Users className="h-3 w-3" />{r.participants.length}/{r.capacity}</span>}
            {r.status !== "completed" && r.capacity == null && <span className="shrink-0 flex items-center gap-0.5"><Users className="h-3 w-3" />{r.participants.length}</span>}
          </p>
        </div>

        {/* الجهة اليسرى: الوقت + الأفعال */}
        <div className="flex shrink-0 items-center gap-2" onClick={e => e.stopPropagation()}>
          {r.status === "active" && (
            <span className={`rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${over ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`} dir="ltr">
              {over ? "00:00" : formatDuration(st.wallRemaining)}
            </span>
          )}
          {r.status === "completed" && myCompletions.has(r.id) === false && (
            <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setCompletionRound(r)}>
              <Flame className="h-3.5 w-3.5" /> إنجازي
            </Button>
          )}
          {canStart && (
            <Button size="sm" onClick={() => handleStart(r)} disabled={busy} className="h-8 gap-1">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} بدء
            </Button>
          )}
          {canEnd && (
            <Button size="sm" variant="outline" onClick={() => handleEndRound(r)} disabled={busy} className="h-8 gap-1 text-destructive">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />} إنهاء
            </Button>
          )}
          {r.status !== "completed" && !canStart && !canEnd && (
            <Button size="sm" onClick={() => joinAndEnter(r)} className="h-8 gap-1">
              <LogIn className="h-3.5 w-3.5" /> دخول
            </Button>
          )}
          {(isOwner || isStaff) && (
            <>
              {isOwner && r.status !== "active" && (
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} title="تعديل">
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(r.id)} title="حذف">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewingRound(r)} title="المشاركون">
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  const renderCard = (r: Round) => {
    const isOwner = r.user_id === user?.id;
    const canDelete = isOwner || isStaff;
    const canStart = isOwner && r.status === "pending";
    const canEnd = isOwner && r.status === "active";
    const canEdit = isOwner && r.status !== "active";

    const st = roundStateAt(r, now);
    const over = r.status === "active" && st.wallRemaining <= 0;
    const isRinging = ringingFor.current.has(r.id);
    const busy = busyId === r.id;
    const didComplete = myCompletions.has(r.id);

    const chip = "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur";

    return (
      <Card key={r.id} className={`group overflow-hidden p-0 transition-all hover:shadow-lg ${r.status === "active" ? "border-primary/40 shadow-md" : ""}`}>
        {/* الغلاف: صورة أو تدرّج + شارات الحالة */}
        <div className="relative h-36">
          {r.cover_image_url ? (
            <img src={r.cover_image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className={`h-full w-full ${r.status === "active" ? "bg-gradient-to-br from-primary/80 via-primary/50 to-emerald-500/50" : "bg-gradient-to-br from-slate-500/70 via-slate-600/50 to-slate-700/60"}`} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/10" />

          <div className="absolute right-2 top-2 flex gap-1.5">
            {r.status === "completed" ? (
              <span className={`${chip} bg-green-600/90 text-white`}>
                <CheckCircle2 className="h-3 w-3" /> منجزة{r.settled ? " • محسومة" : " • غير محسومة"}
              </span>
            ) : over ? (
              <span className={`${chip} bg-amber-500/90 text-white`}>انتهت</span>
            ) : r.status === "active" ? (
              <span className={`${chip} bg-primary/90 text-primary-foreground`}>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> نشطة
              </span>
            ) : (
              <span className={`${chip} bg-black/55 text-white`}>بانتظار البدء</span>
            )}
            {r.capacity != null && (
              <span className={`${chip} bg-black/55 text-white`}>
                <Users className="h-3 w-3" /> {r.participants.length}/{r.capacity}
              </span>
            )}
          </div>

          {(canEdit || canDelete) && (
            <div className="absolute left-2 top-2 flex gap-1">
              {canEdit && (
                <Button size="icon" className="h-7 w-7 border border-white/20 bg-black/40 text-white backdrop-blur hover:bg-black/60" onClick={() => openEdit(r)} title="تعديل">
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              )}
              {canDelete && (
                <Button size="icon" className="h-7 w-7 border border-white/20 bg-black/40 text-white backdrop-blur hover:bg-black/60" onClick={() => handleDelete(r.id)} title="حذف">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}

          <div className="absolute inset-x-3 bottom-2 flex items-end justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar className="h-7 w-7 border border-white/40">
                <AvatarImage src={r.profile?.avatar_url || ""} />
                <AvatarFallback className="bg-black/40 text-white text-xs">
                  {r.profile?.full_name?.charAt(0) || "م"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white drop-shadow">{r.title}</p>
                <p className="truncate text-[10px] text-white/80">
                  {r.profile?.full_name} • {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ar })}
                </p>
              </div>
            </div>
            {r.status === "active" && (
              <span className="shrink-0 rounded-full bg-black/55 px-2 py-1 text-xs font-bold tabular-nums text-white backdrop-blur" dir="ltr">
                {over ? "00:00" : formatDuration(st.wallRemaining)}
              </span>
            )}
          </div>
        </div>

        <CardContent className="space-y-3 p-3 sm:p-4">
          {r.description && <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>}

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {r.duration_minutes} دقيقة عمل
              {r.break_enabled && <span className="text-muted-foreground/70"> (+{formatDuration(breakSecondsLeft(st))} راحة)</span>}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" /> {r.participants.length}{r.capacity ? `/${r.capacity}` : ""} منضم
            </span>
            {r.break_enabled && (
              <span className="flex items-center gap-1">
                <Coffee className="w-3 h-3" /> بريك {r.break_duration_minutes}د كل {r.break_interval_minutes}د
              </span>
            )}
          </div>

          {r.status === "active" && (
            <div className={`rounded-lg p-3 text-center ${st.inBreak ? "bg-amber-500/10 border border-amber-500/30" : "bg-primary/10 border border-primary/30"}`}>
              {st.inBreak ? (
                <>
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1 flex items-center justify-center gap-1">
                    <Coffee className="w-3 h-3" /> فترة راحة — لا تُحتسب
                  </p>
                  <p className="text-2xl font-bold tabular-nums">{formatDuration(st.breakRemaining)}</p>
                </>
              ) : over ? (
                <>
                  <p className="text-xs font-medium mb-1 text-green-600 dark:text-green-400">انتهت الجولة</p>
                  <p className="text-2xl font-bold tabular-nums text-muted-foreground">00:00</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-primary font-medium mb-1">الوقت المتبقي للعمل</p>
                  <p className="text-2xl font-bold tabular-nums text-primary">{formatDuration(st.workRemaining)}</p>
                </>
              )}
            </div>
          )}

          {isRinging && (
            <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg p-2">
              <BellRing className="w-4 h-4 text-destructive animate-pulse" />
              <span className="text-xs flex-1">انتهت زمن الجولة!</span>
              {canEnd && !r.settled && (
                <Button size="sm" variant="outline" onClick={() => handleEndRound(r)}>تثبيت النهاية</Button>
              )}
              <Button size="sm" variant="destructive" onClick={() => stopAlarm(r.id)}>إيقاف</Button>
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={() => setViewingRound(r)}>
              <Eye className="w-3 h-3" /> المشاركون ({r.participants.length})
            </Button>
            <div className="flex gap-2">
              {isOwner && r.status !== "completed" && (
                <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={() => setInviteRound(r)}>
                  <UserPlus className="w-3 h-3" /> دعوة
                </Button>
              )}
              {canStart && (
                <Button size="sm" variant="default" onClick={() => handleStart(r)} disabled={busy} className="gap-1">
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} بدء
                </Button>
              )}
              {canEnd && (
                <Button size="sm" variant="outline" onClick={() => handleEndRound(r)} disabled={busy} className="gap-1 text-destructive">
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />} إنهاء الآن
                </Button>
              )}
              {r.status === "completed" && !didComplete && (
                <Button size="sm" variant="ghost" onClick={() => setCompletionRound(r)} className="gap-1">
                  <Flame className="w-3 h-3" /> إنجازي
                </Button>
              )}
              {r.status !== "completed" && (
                <Button size="sm" onClick={() => joinAndEnter(r)} className="gap-1">
                  <LogIn className="w-3 h-3" /> دخول الجولة
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <audio ref={alarmRef} src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" preload="auto" />

      {/* ===== الهيرو ===== */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/12 via-card to-card mb-6">
        {/* زخارف خلفية */}
        <div className="pointer-events-none absolute -top-20 -left-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-emerald-500/8 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_60%,primary/5_100%)]" />

        <div className="relative p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25">
                <Target className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">الجولات الدراسية</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  ادرس مع زملائك بتركيز مشترك — كل ساعة حضور = <b className="text-amber-500">{POINTS_PER_BATCH} نقاط</b>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={refreshing} onClick={async () => {
                setRefreshing(true);
                try { await fetchRounds(); await fetchMeetings(); await fetchRoundsDetail(); }
                finally { setRefreshing(false); }
              }} className="gap-1">
                {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} تحديث
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setHelpOpen(true)} className="gap-1">
                <HelpCircle className="w-4 h-4" /> شرح
              </Button>
              {canCreateRound && (
                <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1.5 shadow-lg shadow-primary/25">
                      <Plus className="w-4 h-4" /> جولة جديدة
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>إنشاء جولة دراسية</DialogTitle></DialogHeader>
                    <RoundForm
                      title={title} setTitle={setTitle}
                      description={description} setDescription={setDescription}
                      duration={duration} setDuration={setDuration}
                      breakEnabled={breakEnabled} setBreakEnabled={setBreakEnabled}
                      breakInterval={breakInterval} setBreakInterval={setBreakInterval}
                      breakDuration={breakDuration} setBreakDuration={setBreakDuration}
                      alarmMuted={alarmMuted} setAlarmMuted={setAlarmMuted}
                      capacity={capacity} setCapacity={setCapacity}
                      coverPreview={coverPreview} onPickCover={pickCover} onRemoveCover={clearCover}
                    />
                    <Button onClick={handleCreate} disabled={creating || !title.trim()} className="w-full">
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "إنشاء"}
                    </Button>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          {/* إحصائيات */}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="flex items-center gap-2.5 rounded-xl border bg-background/60 px-3 py-2.5 backdrop-blur">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Activity className="h-4 w-4" />
              </span>
              <div>
                <p className="text-lg font-extrabold leading-none tabular-nums">{activeNow}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">جولة تُحتسب الآن</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border bg-background/60 px-3 py-2.5 backdrop-blur">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="h-4 w-4" />
              </span>
              <div>
                <p className="text-lg font-extrabold leading-none tabular-nums">{activeCount}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">جولة {activeCount === 1 ? "نشطة" : "نشطة"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border bg-background/60 px-3 py-2.5 backdrop-blur">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <LogIn className="h-4 w-4" />
              </span>
              <div>
                <p className="text-lg font-extrabold leading-none tabular-nums">{myActive}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">أنت منضم فيها</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border bg-background/60 px-3 py-2.5 backdrop-blur">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                <Award className="h-4 w-4" />
              </span>
              <div>
                <p className="text-lg font-extrabold leading-none tabular-nums text-amber-500">{balance}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">رصيدك من {MAX_BALANCE}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Meetings widget — owner & members (RLS enforces visibility) */}
      {user && (
        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><Lock className="w-4 h-4" /> الاجتماعات الخاصة</CardTitle>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => setCreateMeetingOpen(true)} className="gap-1">
                  <Plus className="w-3 h-3" /> اجتماع
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {myMeetings.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد اجتماعات. أنشئ واحداً وادعُ الأشخاص الذين تريد.</p>
            ) : (
              <div className="space-y-1">
                {myMeetings.map(m => (
                  <div key={m.id} className="flex items-center justify-between bg-background border rounded-lg p-2">
                    <button onClick={() => setMeetingOpen(m)} className="flex items-center gap-2 text-sm flex-1 text-right hover:text-primary">
                      <MessageSquare className="w-4 h-4" /> {m.title}
                      {m.owner_id === user.id && <span className="text-[10px] text-muted-foreground">(مالك)</span>}
                    </button>
                    {(m.owner_id === user.id || isAdmin) && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteMeeting(m.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="active">
        <div className="mb-4 flex items-center justify-between gap-2">
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="active">النشطة ({active.length})</TabsTrigger>
            <TabsTrigger value="completed">المنجزة ({completed.length})</TabsTrigger>
          </TabsList>
          {/* مبدّل شبكة / قائمة */}
          <div className="flex shrink-0 items-center gap-1 rounded-lg border bg-muted/40 p-1">
            <button
              onClick={() => toggleView("grid")}
              aria-label="عرض شبكي"
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${viewMode === "grid" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => toggleView("list")}
              aria-label="عرض قائمة"
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
        <TabsContent value="active">
          {active.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">لا توجد جولات نشطة</p>
          ) : viewMode === "grid" ? (
            <div className="grid gap-3 sm:grid-cols-2">{active.map(renderCard)}</div>
          ) : (
            <div className="space-y-2">{active.map(renderCompactRow)}</div>
          )}
        </TabsContent>
        <TabsContent value="completed">
          {completed.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">لا توجد جولات منجزة</p>
          ) : viewMode === "grid" ? (
            <div className="grid gap-3 sm:grid-cols-2">{completed.map(renderCard)}</div>
          ) : (
            <div className="space-y-2">{completed.map(renderCompactRow)}</div>
          )}
        </TabsContent>
      </Tabs>

      {/* شاشة الجولة — تغطّي الصفحة، والخروج منها لا يوقف الاحتساب */}
      {sessionRound && (
        <RoundSessionScreen
          round={sessionRound}
          now={now}
          board={board}
          joined={sessionJoined}
          live={live}
          beating={beating}
          busy={busyId === sessionRound.id}
          ringing={ringingFor.current.has(sessionRound.id)}
          isStaff={isStaff}
          isMember={sessionRound.user_id === user?.id || sessionRound.participants.some(x => x.user_id === user?.id)}
          hasCompletion={myCompletions.has(sessionRound.id)}
          onEnter={() => enterRound(sessionRound.id)}
          onExit={() => exitRound()}
          onBack={() => setSessionRoundId(null)}
          onLeave={async () => { stopAlarm(sessionRound.id, true); exitRound(); await handleLeave(sessionRound.id); setSessionRoundId(null); }}
          onStart={() => handleStart(sessionRound)}
          onEnd={() => handleEndRound(sessionRound)}
          onInvite={() => setInviteRound(sessionRound)}
          onKick={(uid) => handleKick(sessionRound.id, uid)}
          onCompletion={() => setCompletionRound(sessionRound)}
          onStopAlarm={() => stopAlarm(sessionRound.id)}
        />
      )}

      {/* Participants viewer */}
      <Dialog open={!!viewingRound} onOpenChange={o => !o && setViewingRound(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>المشاركون في "{viewingRound?.title}"</DialogTitle></DialogHeader>
          {viewingRound && viewingRound.participants.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">لا يوجد مشاركون بعد</p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {viewingRound?.participants.map(p => (
                <div key={p.user_id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-muted">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={p.profile?.avatar_url || ""} />
                      <AvatarFallback>{p.profile?.full_name?.charAt(0) || "م"}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{p.profile?.full_name}</span>
                  </div>
                  {isStaff && (
                    <Button size="sm" variant="ghost" className="text-destructive gap-1" onClick={() => handleKick(viewingRound.id, p.user_id)}>
                      <UserMinus className="w-3 h-3" /> طرد
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* دعوة أشخاص للجولة */}
      <InviteDialog round={inviteRound} onClose={() => setInviteRound(null)} />

      {/* Edit round */}
      <Dialog open={!!editingRound} onOpenChange={o => { if (!o) { setEditingRound(null); resetForm(); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>تعديل الجولة</DialogTitle></DialogHeader>
          <RoundForm
            title={title} setTitle={setTitle}
            description={description} setDescription={setDescription}
            duration={duration} setDuration={setDuration}
            breakEnabled={breakEnabled} setBreakEnabled={setBreakEnabled}
            breakInterval={breakInterval} setBreakInterval={setBreakInterval}
            breakDuration={breakDuration} setBreakDuration={setBreakDuration}
            alarmMuted={alarmMuted} setAlarmMuted={setAlarmMuted}
            capacity={capacity} setCapacity={setCapacity}
            coverPreview={coverPreview} onPickCover={pickCover} onRemoveCover={clearCover}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditingRound(null); resetForm(); }}>إلغاء</Button>
            <Button onClick={handleSaveEdit} disabled={!title.trim() || creating} className="gap-1">
              {creating && <Loader2 className="w-4 h-4 animate-spin" />} حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create meeting */}
      <Dialog open={createMeetingOpen} onOpenChange={setCreateMeetingOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>إنشاء اجتماع خاص</DialogTitle></DialogHeader>
          <Input value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)} placeholder="اسم الاجتماع" />
          <p className="text-xs text-muted-foreground">بعد الإنشاء يمكنك دعوة الأشخاص الذين تريد فقط.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateMeetingOpen(false)}>إلغاء</Button>
            <Button onClick={handleCreateMeeting} disabled={!meetingTitle.trim()}>إنشاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {meetingOpen && (
        <MeetingChat
          meetingId={meetingOpen.id}
          ownerId={meetingOpen.owner_id}
          title={meetingOpen.title}
          onClose={() => setMeetingOpen(null)}
        />
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>كيف تُحسب النقاط في الجولات</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>📝 <b>إنشاء جولة:</b> أي عضو يقدر ينشئ جولة — لكل مستخدم جولة نشطة واحدة في الوقت نفسه. تقدر تضيف صورة الجولة وسعة عدد المنضمين.</p>
            <p>☕ <b>البريك:</b> المدة التي تكتبها هي <b>صافي وقت العمل</b>. البريكات تُضاف فوقها ولا تُحتسب عملاً. مثال: 60 دقيقة مع بريك 5 كل 25 ⇒ الجولة 70 دقيقة على الأرض.</p>
            <p>▶️ <b>البدء:</b> صاحب الجولة يضغط "بدء"، والخادم هو من يحسب الجدول ونهاية الجولة ويخزّنهما. لا أحد يعدّلهما من المتصفح.</p>
            <p>⏱️ <b>الاحتساب:</b> «دخول الجولة» من البطاقة يبدأ الاحتساب فوراً. الانتقال لصفحة أخرى أو إخفاء التبويب <b>لا يوقف</b> الاحتساب — يوقفه زر «إيقاف الاحتساب» أو نهاية الجولة. الساعة من الخادم لا من جهازك.</p>
            <p>🔥 <b>النقاط:</b> {POINTS_PER_BATCH} نقاط كل ساعة حضور داخل الجولة (تشمل الاستراحات). الرصيد اليومي يبدأ من {BASE_BALANCE} ولا يتجاوز {MAX_BALANCE}، وما أُضيف يُسجَّل في سجل معاملاتك.</p>
            <p>👥 <b>السعة والدعوة:</b> عند امتلاء السعة يُرفض الانضمام تلقائياً. وزر «دعوة» يبحث بالاسم ويرسل إشعاراً يفتح الجولة بنقرة (الحد اليومي 100 دعوة).</p>
            <p>🏁 <b>الإنهاء:</b> عند انتهاء الوقت تُحسم الجولة تلقائياً خلال دقيقة وتُجمَّد سجل الحضور، أو يستطيع المالك إنهاؤها مبكراً. النقاط كانت مُنحت أثناء الجولة بالفعل.</p>
            <p>📝 <b>تقييم الإنجاز:</b> اختياري وأدبي فقط — لا يمنح نقاط.</p>
            <p>🚫 <b>طرد:</b> الأدمن والمشرفون يقدروا يطردوا أي مشارك من قائمة الأشخاص.</p>
            <p>🔒 <b>الاجتماعات الخاصة:</b> أنشئ اجتماعاً خاصاً وادعُ من تريد فقط.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Completion self-assessment */}
      <Dialog open={!!completionRound} onOpenChange={(o) => { if (!o) { setCompletionRound(null); setAchievement(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>🎉 انتهت الجولة "{completionRound?.title}"</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">شارك إنجازك في هذه الجولة. نقاطك محسوبة أصلاً من حضورك الحقيقي وقت الجولة.</p>
          <Textarea value={achievement} onChange={e => setAchievement(e.target.value)} placeholder="مثال: راجعت 3 وحدات وحليت 20 سؤال..." className="min-h-[100px]" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCompletionRound(null); setAchievement(""); }}>لاحقاً</Button>
            <Button onClick={submitCompletion} disabled={!achievement.trim()}>إرسال 🔥</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const RoundForm = (p: any) => (
  <div className="space-y-3">
    <div>
      <label className="text-sm font-medium">اسم الجولة</label>
      <Input placeholder="مثلاً: مراجعة رياضيات" value={p.title} onChange={e => p.setTitle(e.target.value)} />
    </div>
    <div>
      <label className="text-sm font-medium">وصف الجولة (اختياري)</label>
      <Textarea placeholder="ماذا ستتم دراسته..." value={p.description} onChange={e => p.setDescription(e.target.value)} />
    </div>
    <div>
      <label className="text-sm font-medium">صورة الجولة (اختياري)</label>
      <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:bg-muted/50">
        <ImagePlus className="w-4 h-4" />
        {p.coverPreview ? "تغيير الصورة" : "اختر صورة"}
        <input type="file" accept="image/*" className="hidden" onChange={e => p.onPickCover(e.target.files?.[0])} />
      </label>
      {p.coverPreview && (
        <div className="relative mt-2">
          <img src={p.coverPreview} alt="صورة الجولة" className="h-36 w-full rounded-lg border object-cover" />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute left-1 top-1 h-7 w-7"
            onClick={p.onRemoveCover}
            title="حذف الصورة"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
    <div>
      <label className="text-sm font-medium">سعة الجولة — عدد المنضمين (اختياري)</label>
      <Input
        type="number"
        min={1}
        max={500}
        placeholder="بلا حد"
        value={p.capacity ?? ""}
        onChange={e => p.setCapacity(e.target.value === "" ? null : Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
      />
      <p className="text-xs text-muted-foreground mt-1">عند امتلاء السعة يُرفض الانضمام الجديد تلقائياً.</p>
    </div>
    <div>
      <label className="text-sm font-medium">مدة العمل الصافية (دقائق)</label>
      <Input type="number" min={5} max={480} value={p.duration} onChange={e => p.setDuration(Number(e.target.value))} />
      <p className="text-xs text-muted-foreground mt-1">البريكات تُضاف فوق هذه المدة ولا تُحتسب عملاً.</p>
    </div>
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium flex items-center gap-1"><Coffee className="w-4 h-4" /> فترات راحة</p>
        <p className="text-xs text-muted-foreground">إضافة بريك أثناء الجولة (لا يُحتسب عملاً)</p>
      </div>
      <Switch checked={p.breakEnabled} onCheckedChange={p.setBreakEnabled} />
    </div>
    {p.breakEnabled && (
      <div className="grid grid-cols-2 gap-3 animate-fade-in">
        <div>
          <label className="text-xs text-muted-foreground">بعد كم دقيقة عمل بريك؟</label>
          <Input type="number" min={5} max={240} value={p.breakInterval} onChange={e => p.setBreakInterval(Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">مدة البريك (دقائق)</label>
          <Input type="number" min={1} max={60} value={p.breakDuration} onChange={e => p.setBreakDuration(Number(e.target.value))} />
        </div>
      </div>
    )}
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium flex items-center gap-1">🔕 كتم صوت المنبّه</p>
        <p className="text-xs text-muted-foreground">عند كتم الصوت لن يصدر أي زمّور عند انتهاء زمن الجولة</p>
      </div>
      <Switch checked={p.alarmMuted} onCheckedChange={p.setAlarmMuted} />
    </div>
  </div>
);

export default Rounds;
