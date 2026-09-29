import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Users, Plus, Loader2, Trash2, LogIn, LogOut as LogOutIcon, Clock, Play,
  Coffee, BellRing, Eye, HelpCircle, CheckCircle2, UserMinus, Edit2, Lock,
  MessageSquare, RefreshCw, Flame, Trophy, Square, Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import MeetingChat from "@/components/MeetingChat";
import { usePoints } from "@/contexts/PointsContext";
import { useRoundHeartbeat } from "@/hooks/useRoundHeartbeat";
import {
  roundStateAt,
  roundTotalSeconds,
  breakSecondsLeft,
  formatDuration,
  MAX_BALANCE,
  SECONDS_PER_BATCH,
  POINTS_PER_BATCH,
  type RoundState,
} from "@/lib/roundSchedule";
import type { RoundLeaderboardRow } from "@/lib/points";

interface Round {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  break_enabled: boolean;
  break_interval_minutes: number | null;
  break_duration_minutes: number | null;
  alarm_muted: boolean;
  started_at: string | null;
  ended_at: string | null;
  /** يُحسب مرة واحدة في الخادم عند start_round — لا يلمسه العميل */
  scheduled_end_at: string | null;
  settled: boolean;
  status: "pending" | "active" | "completed";
  created_at: string;
  profile?: { full_name: string; avatar_url: string | null } | null;
  participants: { user_id: string; profile?: { full_name: string; avatar_url: string | null } | null }[];
}

interface Meeting { id: string; owner_id: string; title: string; }

const ROUND_COLUMNS =
  "id, user_id, title, description, duration_minutes, break_enabled, break_interval_minutes, break_duration_minutes, alarm_muted, started_at, ended_at, scheduled_end_at, settled, status, created_at";

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
  const { user, isAdmin, isModerator, isRoundsManager } = useAuth();
  const { startRound, settleRound, leaderboard, refreshPoints, balance } = usePoints();

  const canCreateRound = isAdmin || isRoundsManager;
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
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  // زر دخول/خروج: صريح للمستخدم، ويوقف الاحتساب فور الضغط على "خروج"
  const [sessionJoined, setSessionJoined] = useState(false);

  // المشارك المعروض تفاصيله (عند الضغط على اسمه)
  const [viewingMember, setViewingMember] = useState<{
    uid: string; name?: string; avatar?: string | null; owner: boolean;
  } | null>(null);

  // نبضة الحضور: تشتغل فقط داخل جلسة نشطة **و** بعد ضغط زر "دخول"
  const sessionIsActive = sessionRound?.status === "active";
  const { live, beat, beating } = useRoundHeartbeat(
    !!sessionRoundId && !!sessionIsActive && sessionJoined,
    sessionRoundId
  );

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

  // لوحة الحضور: عند فتح الجلسة ثم كل دقيقة
  const loadBoard = useCallback(async (id: string) => {
    setBoard(await leaderboard(id));
  }, [leaderboard]);

  useEffect(() => {
    if (!sessionRoundId) { setBoard([]); return; }
    void loadBoard(sessionRoundId);
    const t = setInterval(() => void loadBoard(sessionRoundId), 60_000);
    return () => clearInterval(t);
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

  // من انتهى وقته ولم يُنهِه الخادم بعد: نُحدّث القائمة مرة كل دقيقة
  // (الخادم وحده يُثبّت الحالة، لكن الواجهة تحتاج أن تُعلن النهاية)
  useEffect(() => {
    const t = setInterval(() => {
      const t0 = Date.now();
      if (roundsRef.current.some(r => r.status === "active" && roundEndMs(r) <= t0)) {
        void fetchRounds();
      }
    }, 60_000);
    return () => clearInterval(t);
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

  const resetForm = () => {
    setTitle(""); setDescription(""); setDuration(60);
    setBreakEnabled(false); setBreakInterval(25); setBreakDuration(5); setAlarmMuted(false);
  };

  const handleCreate = async () => {
    if (!user || !title.trim()) return;
    setCreating(true);
    const { error } = await (supabase as any).from("study_rounds").insert({
      user_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      duration_minutes: duration,
      break_enabled: breakEnabled,
      break_interval_minutes: breakEnabled ? breakInterval : null,
      break_duration_minutes: breakEnabled ? breakDuration : null,
      alarm_muted: alarmMuted,
      status: "pending",
    });
    if (error) toast.error("فشل إنشاء الجولة");
    else { toast.success("تم إنشاء الجولة"); setOpen(false); resetForm(); fetchRounds(); void invalidateTable("study_rounds"); }
    setCreating(false);
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
  };

  const handleSaveEdit = async () => {
    if (!editingRound) return;
    const { error } = await (supabase as any).from("study_rounds").update({
      title: title.trim(),
      description: description.trim() || null,
      duration_minutes: duration,
      break_enabled: breakEnabled,
      break_interval_minutes: breakEnabled ? breakInterval : null,
      break_duration_minutes: breakEnabled ? breakDuration : null,
      alarm_muted: alarmMuted,
    }).eq("id", editingRound.id);
    if (error) toast.error("فشل التعديل");
    else { toast.success("تم التعديل"); setEditingRound(null); resetForm(); fetchRounds(); void invalidateTable("study_rounds"); }
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
          if (!/duplicate key value violates unique constraint/i.test(msg)) {
            toast.error(`فشل الانضمام: ${msg}`);
            return;
          }
        }
        joined = true;
        toast.success("انضممت للجولة");
      } else {
        joined = true;
      }
      await fetchRoundsDetail(); await fetchRounds(); void invalidateTable("round_participants");
    } else {
      await fetchRoundsDetail(); await fetchRounds(); void invalidateTable("round_participants");
    }
    if (joined) setSessionRoundId(r.id);
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

  // بطاقة الحضور الشخصي: زر دخول/خروج + العدّاد التصاعدي تحت العدّاد الكبير
  const renderFocusCard = (st: RoundState) => {
    const secs = Math.max(0, Math.floor(live.liveFocus));
    const pct = (secs % SECONDS_PER_BATCH) / SECONDS_PER_BATCH;
    const toBatch = SECONDS_PER_BATCH - (secs % SECONDS_PER_BATCH);
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
        <Button
          type="button"
          variant={sessionJoined ? "destructive" : "default"}
          disabled={!sessionIsActive || st.wallRemaining <= 0}
          onClick={() => setSessionJoined((v) => !v)}
          className="w-full gap-1.5 font-semibold"
        >
          {sessionJoined ? <LogOutIcon className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
          {sessionJoined ? "خروج" : "دخول"}
        </Button>

        {/* العدّاد التصاعدي: يزيد من الصفر ما دمت داخل الجولة */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">وقتك داخل الجولة</p>
          <p className="text-4xl font-bold tabular-nums text-primary" dir="ltr">
            {formatDuration(secs)}
          </p>
          <p className="text-lg font-semibold text-muted-foreground mt-1">
            <span dir="ltr">+</span> {POINTS_PER_BATCH} نقاط كل {SECONDS_PER_BATCH / 3600} ساعة
          </p>
        </div>

        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${Math.min(100, pct * 100)}%` }}
          />
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          {sessionJoined
            ? `الدفعة القادمة بعد ${formatDuration(toBatch)}`
            : "اضغط «دخول» ليبدأ العدّاد"}
        </p>

        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="font-bold text-amber-500 text-base tabular-nums">+{live.points}</span>
          <span>رصيدك {balance} / {MAX_BALANCE}</span>
        </div>

        {live.error && <p className="text-[11px] text-destructive">{live.error}</p>}
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

    return (
      <Card key={r.id} className={r.status === "active" ? "border-primary/40" : ""}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src={r.profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {r.profile?.full_name?.charAt(0) || "م"}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {r.title}
                  {r.status === "completed" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {r.profile?.full_name} • {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ar })}
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              {canEdit && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)} title="تعديل">
                  <Edit2 className="w-4 h-4" />
                </Button>
              )}
              {canDelete && (
                <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => handleDelete(r.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {r.description && <p className="text-sm">{r.description}</p>}

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {r.duration_minutes} دقيقة عمل
              {r.break_enabled && <span className="text-muted-foreground/70"> (+{formatDuration(breakSecondsLeft(st))} راحة)</span>}
            </span>
            {r.break_enabled && (
              <span className="flex items-center gap-1">
                <Coffee className="w-3 h-3" /> بريك {r.break_duration_minutes}د كل {r.break_interval_minutes}د
              </span>
            )}
            {r.settled && <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> سجل الحضور مُجمَّد</span>}
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
                  <LogIn className="w-3 h-3" /> دخول
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <audio ref={alarmRef} src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" preload="auto" />

      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">الجولات الدراسية</h1>
        </div>
        <div className="flex gap-2">
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
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1"><Plus className="w-4 h-4" />جولة جديدة</Button>
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
                />
                <Button onClick={handleCreate} disabled={creating || !title.trim()} className="w-full">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "إنشاء"}
                </Button>
              </DialogContent>
            </Dialog>
          )}
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
        <TabsList className="grid grid-cols-2 mb-4">
          <TabsTrigger value="active">النشطة ({active.length})</TabsTrigger>
          <TabsTrigger value="completed">المنجزة ({completed.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          {active.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">لا توجد جولات نشطة</p>
          ) : <div className="space-y-3">{active.map(renderCard)}</div>}
        </TabsContent>
        <TabsContent value="completed">
          {completed.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">لا توجد جولات منجزة</p>
          ) : <div className="space-y-3">{completed.map(renderCard)}</div>}
        </TabsContent>
      </Tabs>

      {/* دخول الجولة: شاشة تركيز داخل الجولة */}
      <Dialog open={!!sessionRound} onOpenChange={o => !o && setSessionRoundId(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          {sessionRound && (() => {
            const st = roundStateAt(sessionRound, now);
            const isOwnerHere = sessionRound.user_id === user?.id;
            const isMemberHere = sessionRound.participants.find(p => p.user_id === user?.id);
            const over = sessionRound.status === "active" && st.wallRemaining <= 0;
            const me = board.find(b => b.user_id === user?.id);
            return (
              <>
                <DialogHeader className="text-center">
                  <DialogTitle className="text-xl">🎯 داخل الجولة</DialogTitle>
                  <p className="text-base font-bold text-primary">{sessionRound.title}</p>
                  {sessionRound.description && <p className="text-sm text-muted-foreground">{sessionRound.description}</p>}
                </DialogHeader>

                {sessionRound.status === "pending" ? (
                  <div className="rounded-xl border p-6 text-center bg-muted/40">
                    <p className="text-sm text-muted-foreground mb-2">بانتظار بدء الجولة من الخادم</p>
                    <p className="text-3xl font-bold">🎬</p>
                    {isOwnerHere && (
                      <Button className="mt-3 gap-1" onClick={() => handleStart(sessionRound)} disabled={busyId === sessionRound.id}>
                        {busyId === sessionRound.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} ابدأ الآن
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className={`rounded-xl p-6 text-center ${st.inBreak ? "bg-amber-500/10 border border-amber-500/30" : "bg-primary/10 border border-primary/30"}`}>
                    <p className="text-xs text-primary font-medium mb-2">
                      {st.inBreak ? "☕ راحة (لا تُحتسب)" : over ? "انتهت الجولة" : "الوقت المتبقي للعمل"}
                    </p>
                    <p className={`text-6xl font-bold tabular-nums ${st.inBreak ? "text-amber-600 dark:text-amber-400" : "text-primary"}`}>
                      {formatDuration(st.inBreak ? st.breakRemaining : st.workRemaining)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      من أصل {formatDuration(st.totalWorkSeconds)} عمل
                      {sessionRound.break_enabled && ` + ${formatDuration(breakSecondsLeft(st))} راحة متبقية`}
                    </p>
                  </div>
                )}

                {(isOwnerHere || isMemberHere) && renderFocusCard(st)}

                {sessionRound.status === "active" && (isOwnerHere || isMemberHere) && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    {beating ? <span className="flex items-center justify-center gap-1"><Activity className="w-3 h-3 animate-pulse" /> جارٍ تسجيل حضورك…</span>
                      : "احتسابك يتم على الخادم كل 30 ثانية. إخفاء التبويب أو إغلاقه يوقف الاحتساب."}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground justify-center">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {sessionRound.duration_minutes} دقيقة عمل</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {sessionRound.participants.length + 1} مشارك</span>
                  <span className="flex items-center gap-1"><Flame className="w-3 h-3" /> {POINTS_PER_BATCH} نقاط كل ساعتين</span>
                </div>

                {/* لوحة الحضور — المالك فقط، وإثبات أن النقاط محسوبة على وقت حقيقي */}
                {isOwnerHere && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Trophy className="w-3.5 h-3.5" /> سجل الحضور (محسوب على الخادم)
                    </p>
                    {board.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">لا يوجد حضور مسجَّل بعد</p>
                    ) : (
                      <div className="space-y-1 max-h-[26vh] overflow-y-auto">
                        {board.map((b, i) => (
                          <div key={b.user_id} className={`flex items-center gap-2 rounded-lg p-2 ${b.user_id === user?.id ? "bg-primary/10" : "bg-muted/50"}`}>
                            <span className="text-xs w-5 text-muted-foreground tabular-nums">{i + 1}</span>
                            <Avatar className="w-6 h-6">
                              <AvatarImage src={b.avatar_url || ""} />
                              <AvatarFallback className="text-[10px]">{b.full_name?.charAt(0) || "م"}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm flex-1 truncate">{b.full_name}{b.user_id === user?.id && <span className="text-[10px] text-muted-foreground"> (أنت)</span>}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">{formatDuration(b.focus_seconds)}</span>
                            <span className="text-xs font-bold text-amber-500 tabular-nums w-10 text-left">+{b.points_awarded}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {me && <p className="text-[11px] text-muted-foreground text-center">سجلك: {formatDuration(me.focus_seconds)} حضور ⇒ {me.points_awarded} نقطة</p>}
                  </div>
                )}

                {/* المشاركون: قائمة جانبية، الضغط على أي واحد يعرض تفاصيله */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> المشاركون ({sessionRound.participants.length + 1})
                  </p>
                  <div className="space-y-1 max-h-[24vh] overflow-y-auto">
                    {(() => {
                      const rows = [
                        { uid: sessionRound.user_id, name: sessionRound.profile?.full_name, avatar: sessionRound.profile?.avatar_url, owner: true },
                        ...sessionRound.participants
                          .filter(p => p.user_id !== sessionRound.user_id)
                          .map(p => ({ uid: p.user_id, name: p.profile?.full_name, avatar: p.profile?.avatar_url, owner: false })),
                      ];
                      return rows.map(r => (
                        <button
                          key={r.uid}
                          type="button"
                          onClick={() => setViewingMember(r)}
                          className="w-full flex items-center gap-2 rounded-lg p-2 text-right hover:bg-muted/60 transition-colors"
                        >
                          <Avatar className="w-6 h-6">
                            <AvatarImage src={r.avatar || ""} />
                            <AvatarFallback className="text-[10px]">{r.name?.charAt(0) || "م"}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm flex-1 truncate">{r.name || "مستخدم"}</span>
                          {r.owner && <span className="text-[10px] text-primary">(المالك)</span>}
                          {r.uid === user?.id && <span className="text-[10px] text-muted-foreground">(أنت)</span>}
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      ));
                    })()}
                  </div>
                </div>

                {/* تفاصيل المشارك */}
                <Dialog open={!!viewingMember} onOpenChange={o => !o && setViewingMember(null)}>
                  <DialogContent className="max-w-sm">
                    <DialogHeader>
                      <DialogTitle>تفاصيل المشارك</DialogTitle>
                    </DialogHeader>
                    {viewingMember && (() => {
                      const row = board.find(b => b.user_id === viewingMember.uid);
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-12 h-12">
                              <AvatarImage src={viewingMember.avatar || ""} />
                              <AvatarFallback>{viewingMember.name?.charAt(0) || "م"}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{viewingMember.name || "مستخدم"}</p>
                              {viewingMember.owner && <p className="text-xs text-primary">صاحب الجولة</p>}
                              {viewingMember.uid === user?.id && <p className="text-xs text-muted-foreground">أنت</p>}
                            </div>
                          </div>
                          {row ? (
                            <div className="grid grid-cols-2 gap-2 text-center">
                              <div className="rounded-lg bg-muted/60 p-3">
                                <p className="text-lg font-bold tabular-nums" dir="ltr">{formatDuration(row.focus_seconds)}</p>
                                <p className="text-[11px] text-muted-foreground">وقت داخل الجولة</p>
                              </div>
                              <div className="rounded-lg bg-muted/60 p-3">
                                <p className="text-lg font-bold tabular-nums text-amber-500">+{row.points_awarded}</p>
                                <p className="text-[11px] text-muted-foreground">نقطة</p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-2">
                              لم يُسجَّل حضور لهذا المشارك بعد.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </DialogContent>
                </Dialog>

                <DialogFooter className="gap-2 sm:justify-center">
                  <Button variant="outline" onClick={() => setSessionRoundId(null)} className="gap-1">
                    <LogOutIcon className="w-3 h-3" /> العودة للجولات
                  </Button>
                  {isOwnerHere && sessionRound.status === "active" && (
                    <Button variant="outline" onClick={() => handleEndRound(sessionRound)} disabled={busyId === sessionRound.id} className="gap-1 text-destructive">
                      {busyId === sessionRound.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />} إنهاء الجولة الآن
                    </Button>
                  )}
                  {isMemberHere && (
                    <Button variant="destructive" onClick={async () => { await handleLeave(sessionRound.id); setSessionRoundId(null); }} className="gap-1">
                      <LogOutIcon className="w-3 h-3" /> الخروج من الجولة
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

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
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditingRound(null); resetForm(); }}>إلغاء</Button>
            <Button onClick={handleSaveEdit} disabled={!title.trim()}>حفظ</Button>
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
            <p>📝 <b>إنشاء جولة:</b> اضغط "جولة جديدة" واكتب الاسم والوصف ومدة العمل.</p>
            <p>☕ <b>البريك:</b> المدة التي تكتبها هي <b>صافي وقت العمل</b>. البريكات تُضاف فوقها ولا تُحتسب عملاً. مثال: 60 دقيقة مع بريك 5 كل 25 ⇒ الجولة 70 دقيقة على الأرض.</p>
            <p>▶️ <b>البدء:</b> صاحب الجولة يضغط "بدء"، والخادم هو من يحسب الجدول ونهاية الجولة ويخزّنهما. لا أحد يعدّلهما من المتصفح.</p>
            <p>⏱️ <b>الاحتساب حقيقي:</b> اضغط «دخول» ليبدأ العدّاد، و«خروج» لإيقافه. طالما الجلسة نشطة يرسل المتصفح نبضة كل 30 ثانية <b>والتبويب مرئي فقط</b>. الخادم يحسب الثواني من ساعته هو.</p>
            <p>🚫 <b>ما لا يُحتسب:</b> إغلاق التبويب، أو الانتقال لتبويب آخر، أو غياب يتجاوز 5 دقائق. لا يمكن اختلاق الوقت من أي جهاز.</p>
            <p>🔥 <b>النقاط:</b> {POINTS_PER_BATCH} نقاط كل {SECONDS_PER_BATCH / 3600} ساعة حضور داخل الجولة (تشمل الاستراحات). الرصيد اليومي يبدأ من 50 ولا يتجاوز 200، وما أُضيف يُسجَّل في سجل معاملاتك.</p>
            <p>🏁 <b>الإنهاء:</b> عند انتهاء الوقت يُجمّد الخادم سجل الحضور تلقائياً، أو يستطيع المالك إنهاؤها مبكراً. النقاط كانت مُنحت أثناء الجولة بالفعل.</p>
            <p>📝 <b>تقييم الإنجاز:</b> اختياري وأدبي فقط — لا يمنح نقاط.</p>
            <p>🚫 <b>طرد:</b> الأدمن والمشرفون يقدروا يطردوا أي مشارك من قائمة المشاركين.</p>
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
