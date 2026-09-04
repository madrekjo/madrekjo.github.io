import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
  Coffee, BellRing, Eye, HelpCircle, CheckCircle2, UserMinus, Edit2, Lock, MessageSquare,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import RoundChat from "@/components/RoundChat";
import MeetingChat from "@/components/MeetingChat";
import { usePoints } from "@/contexts/PointsContext";

interface Round {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  break_enabled: boolean;
  break_interval_minutes: number | null;
  break_duration_minutes: number | null;
  started_at: string | null;
  ended_at: string | null;
  status: "pending" | "active" | "completed";
  created_at: string;
  profile?: { full_name: string; avatar_url: string | null } | null;
  participants: { user_id: string; profile?: { full_name: string; avatar_url: string | null } | null }[];
}

interface Meeting { id: string; owner_id: string; title: string; }

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const Rounds = () => {
  const { user, isAdmin, isModerator, isRoundsManager } = useAuth();
  const { rewardRound, lastRewardedRoundAt, refreshPoints } = usePoints();
  const autoRewarded = useRef<Set<string>>(new Set());
  const canCreateRound = isAdmin || isRoundsManager;
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [viewingRound, setViewingRound] = useState<Round | null>(null);
  const [editingRound, setEditingRound] = useState<Round | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(60);
  const [breakEnabled, setBreakEnabled] = useState(false);
  const [breakInterval, setBreakInterval] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [alarmMuted, setAlarmMuted] = useState(false);
  const [creating, setCreating] = useState(false);

  const [now, setNow] = useState(Date.now());
  const alarmRef = useRef<HTMLAudioElement | null>(null);
  const ringingFor = useRef<Set<string>>(new Set());
  const [, forceTick] = useState(0);
  const notifiedBreaks = useRef<Set<string>>(new Set());

  // Meetings
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingOpen, setMeetingOpen] = useState<Meeting | null>(null);
  const [createMeetingOpen, setCreateMeetingOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");

  // Completions
  const [completionRound, setCompletionRound] = useState<Round | null>(null);
  const [achievement, setAchievement] = useState("");
  const [myCompletions, setMyCompletions] = useState<Set<string>>(new Set());

  const isStaff = isAdmin || isModerator;

  // يُخزَّن المشاركون والبروفايلات خارج قائمة الجولات حتى لا يُعاد جلبها كل استطلاع.
  // تُجلب فقط على فترات بطيئة (5 دقائق) وعند الانضمام/الخروج فقط — لتقليل استهلاك القاعدة.
  const detailCache = useRef<{ parts: any[]; profiles: any[] }>({ parts: [], profiles: [] });

  useEffect(() => {
    fetchRounds();
    fetchMeetings();
    // استطلاع سريع: قائمة الجولات القصيرة فقط (بدون المشاركين/البروفايلات)
    const poll = setInterval(() => { fetchRounds(); }, 30000);
    // جلب التفاصيل (المشاركين + البروفايلات) على فترات بطيئة
    const detailTimer = setInterval(() => { fetchRoundsDetail(); }, 300000);
    return () => { clearInterval(poll); clearInterval(detailTimer); };
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
        .from("study_rounds").select("id, user_id, title, description, duration_minutes, break_enabled, break_interval_minutes, break_duration_minutes, started_at, ended_at, status, created_at").order("created_at", { ascending: false }).limit(100);
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

  // يُجلب المشاركون والبروفايلات ببطء (مرة كل 5 دقائق وعند الانضمام/الخروج) ويُخزَّن في الكاش
  const fetchRoundsDetail = async () => {
    try {
      // نجلب قائمة الجولات الحالية بأنفسنا بدلاً من الاعتماد على حالة `rounds` (حتى تعمل أول دخول)
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

  // جلب التفاصيل مرة أولى عند الدخول
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

  const submitCompletion = async () => {
    if (!completionRound || !user || !achievement.trim()) return;
    const { error } = await (supabase as any).from("round_completions").insert({
      round_id: completionRound.id, user_id: user.id, achievement: achievement.trim(),
    });
    if (error) toast.error("فشل الحفظ");
    else {
      toast.success("تم تسجيل إنجازك! 🔥");
      // مكافأة المشاركة في الجولة
      if (completionRound.started_at && completionRound.status === "completed") {
        const rewardResult = await rewardRound(
          completionRound.id,
          completionRound.started_at,
          new Date().toISOString()
        );
        if (rewardResult.success && rewardResult.pointsEarned > 0) {
          toast.success(`حصلت على ${rewardResult.pointsEarned} نقاط مكافأة! 🎉`);
        }
      }
      setMyCompletions(s => new Set([...s, completionRound.id]));
      setCompletionRound(null); setAchievement("");
    }
  };

  // Auto-complete + alarm trigger
  useEffect(() => {
    rounds.forEach(r => {
      if (r.status !== "active" || !r.started_at) return;
      const elapsed = (now - new Date(r.started_at).getTime()) / 1000;
      const total = r.duration_minutes * 60;
      if (elapsed >= total && !ringingFor.current.has(r.id)) {
        ringingFor.current.add(r.id);
        forceTick(x => x + 1);
        // Auto mark completed (no alarm — just open completion dialog for participants/owner)
        if (r.user_id === user?.id || isAdmin) {
          (supabase as any).from("study_rounds")
            .update({ status: "completed", ended_at: new Date().toISOString() })
            .eq("id", r.id).then(() => fetchRounds());
        }
        const isMember = r.user_id === user?.id || r.participants.find(p => p.user_id === user?.id);
        if (isMember && !myCompletions.has(r.id) && !completionRound) {
          setCompletionRound(r);
        }
      }
      if (r.break_enabled && r.break_interval_minutes) {
        const interval = r.break_interval_minutes * 60;
        const breakIdx = Math.floor(elapsed / interval);
        if (breakIdx > 0 && elapsed % interval < 5) {
          const key = `${r.id}-${breakIdx}`;
          if (!notifiedBreaks.current.has(key)) {
            notifiedBreaks.current.add(key);
            toast.info(`☕ وقت البريك! استرح ${r.break_duration_minutes} دقيقة - "${r.title}"`);
          }
        }
      }
      // مكافأة تلقائية: +5 نقاط كل ساعتين حضور في الجولة
      if (r.status === "active" && r.started_at && user) {
        const isMember = r.user_id === user.id || (r.participants || []).find(p => p.user_id === user.id);
        if (isMember) {
          const rewardKey = `${r.id}-${user.id}`;
          const lastRewardMs = lastRewardedRoundAt ? new Date(lastRewardedRoundAt).getTime() : 0;
          const baseMs = lastRewardMs || new Date(r.started_at).getTime();
          const twoHours = 2 * 60 * 60 * 1000;
          if (now - baseMs >= twoHours && !autoRewarded.current.has(rewardKey)) {
            autoRewarded.current.add(rewardKey);
            (async () => {
              const res = await rewardRound(r.id, r.started_at!, new Date().toISOString());
              if (res.success && res.pointsEarned > 0) {
                toast.success(`حصلت على +${res.pointsEarned} نقاط مكافأة حضور الجولة! 🎉`);
                await refreshPoints();
              }
            })();
          }
        }
      }
    });
  }, [now, rounds, user, isAdmin, lastRewardedRoundAt, rewardRound, refreshPoints]);

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
    else { toast.success("تم إنشاء الجولة"); setOpen(false); resetForm(); fetchRounds(); }
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
    setAlarmMuted(!!(r as any).alarm_muted);
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
    else { toast.success("تم التعديل"); setEditingRound(null); resetForm(); fetchRounds(); }
  };

  const handleStart = async (r: Round) => {
    const { error } = await (supabase as any).from("study_rounds")
      .update({ status: "active", started_at: new Date().toISOString() }).eq("id", r.id);
    if (error) toast.error("فشل البدء"); else { toast.success("بدأت الجولة"); fetchRounds(); }
  };

  const handleJoin = async (roundId: string) => {
    if (!user) return;
    const { error } = await (supabase as any).from("round_participants").insert({ round_id: roundId, user_id: user.id });
    if (error) toast.error("فشل الانضمام"); else { toast.success("انضممت للجولة"); await fetchRoundsDetail(); fetchRounds(); }
  };
  const handleLeave = async (roundId: string) => {
    if (!user) return;
    const { error } = await (supabase as any).from("round_participants").delete().eq("round_id", roundId).eq("user_id", user.id);
    if (error) toast.error("فشل الخروج"); else { toast.success("خرجت من الجولة"); await fetchRoundsDetail(); fetchRounds(); }
  };
  const handleKick = async (roundId: string, uid: string) => {
    if (!confirm("طرد هذا المستخدم؟")) return;
    const { error } = await (supabase as any).from("round_participants").delete().eq("round_id", roundId).eq("user_id", uid);
    if (error) toast.error("فشل الطرد"); else { toast.success("تم الطرد"); await fetchRoundsDetail(); fetchRounds(); setViewingRound(null); }
  };
  const handleDelete = async (roundId: string) => {
    if (!confirm("حذف الجولة؟")) return;
    const { error } = await (supabase as any).from("study_rounds").delete().eq("id", roundId);
    if (error) toast.error("فشل الحذف"); else { toast.success("تم الحذف"); fetchRounds(); }
  };

  const handleCreateMeeting = async () => {
    if (!user || !meetingTitle.trim()) return;
    const { data, error } = await (supabase as any).from("round_meetings")
      .insert({ owner_id: user.id, title: meetingTitle.trim() }).select().single();
    if (error) toast.error("فشل إنشاء الاجتماع");
    else { setMeetingTitle(""); setCreateMeetingOpen(false); fetchMeetings(); setMeetingOpen(data); }
  };
  const handleDeleteMeeting = async (id: string) => {
    if (!confirm("حذف الاجتماع؟")) return;
    await (supabase as any).from("round_meetings").delete().eq("id", id);
    fetchMeetings();
  };

  if (loading) return (
    <div className="container mx-auto px-4 py-12 text-center">
      <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
    </div>
  );

  const active = rounds.filter(r => r.status !== "completed");
  const completed = rounds.filter(r => r.status === "completed");

  // Visible meetings: owner OR member (server enforces; UI shows only what RLS returned)
  const myMeetings = meetings;

  const renderCard = (r: Round) => {
    const joined = !!r.participants.find(p => p.user_id === user?.id);
    const isOwner = r.user_id === user?.id;
    const canDelete = isOwner || isStaff;
    const canStart = isOwner && r.status === "pending";
    const canEdit = isOwner;
    const canKick = isStaff;

    let remainingSec = 0;
    let inBreak = false;
    let breakRemaining = 0;
    let timerLabel = "الوقت المتبقي";
    if (r.status === "active" && r.started_at) {
      const elapsed = Math.floor((now - new Date(r.started_at).getTime()) / 1000);
      const total = r.duration_minutes * 60;
      const totalRemaining = Math.max(0, total - elapsed);

      if (r.break_enabled && r.break_interval_minutes && r.break_duration_minutes) {
        const interval = r.break_interval_minutes * 60;
        const breakDur = r.break_duration_minutes * 60;
        const sinceBreak = elapsed % interval;
        if (elapsed >= interval && sinceBreak < breakDur) {
          inBreak = true;
          breakRemaining = breakDur - sinceBreak;
        } else {
          // countdown to next break, capped by total remaining
          const toNextBreak = interval - sinceBreak;
          remainingSec = Math.min(toNextBreak, totalRemaining);
          timerLabel = "الوقت حتى البريك التالي";
        }
      } else {
        remainingSec = totalRemaining;
      }
    }
    const isRinging = ringingFor.current.has(r.id);

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
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {r.duration_minutes} دقيقة</span>
            {r.break_enabled && (
              <span className="flex items-center gap-1">
                <Coffee className="w-3 h-3" /> بريك {r.break_duration_minutes}د كل {r.break_interval_minutes}د
              </span>
            )}
          </div>

          {r.status === "active" && (
            <div className={`rounded-lg p-3 text-center ${inBreak ? "bg-amber-500/10 border border-amber-500/30" : "bg-primary/10 border border-primary/30"}`}>
              {inBreak ? (
                <>
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1 flex items-center justify-center gap-1">
                    <Coffee className="w-3 h-3" /> فترة راحة
                  </p>
                  <p className="text-2xl font-bold tabular-nums">{fmt(breakRemaining)}</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-primary font-medium mb-1">{timerLabel}</p>
                  <p className="text-2xl font-bold tabular-nums text-primary">{fmt(remainingSec)}</p>
                </>
              )}
            </div>
          )}

          {isRinging && (
            <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg p-2">
              <BellRing className="w-4 h-4 text-destructive animate-pulse" />
              <span className="text-xs flex-1">انتهت الجولة!</span>
              <Button size="sm" variant="destructive" onClick={() => stopAlarm(r.id)}>إيقاف</Button>
            </div>
          )}

          {r.break_enabled && r.status === "active" && inBreak && (joined || isOwner) && (
            <RoundChat roundId={r.id} />
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={() => setViewingRound(r)}>
              <Eye className="w-3 h-3" /> المشاركون ({r.participants.length})
            </Button>
            <div className="flex gap-2">
              {canStart && (
                <Button size="sm" variant="default" onClick={() => handleStart(r)} className="gap-1">
                  <Play className="w-3 h-3" /> بدء
                </Button>
              )}
              {r.status !== "completed" && (joined ? (
                <Button size="sm" variant="outline" onClick={() => handleLeave(r.id)} className="gap-1">
                  <LogOutIcon className="w-3 h-3" /> خروج
                </Button>
              ) : (
                <Button size="sm" onClick={() => handleJoin(r.id)} className="gap-1">
                  <LogIn className="w-3 h-3" /> دخول
                </Button>
              ))}
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
          <DialogHeader><DialogTitle>كيفية استخدام الجولات الدراسية</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>📝 <b>إنشاء جولة:</b> اضغط "جولة جديدة" واكتب الاسم والوصف ومدة الجولة.</p>
            <p>☕ <b>البريك:</b> فعّل فترات الراحة وحدد كل كم دقيقة وعدد دقائق البريك.</p>
            <p>⏳ <b>العد التنازلي:</b> يعدّ حتى البريك التالي، وفي البريك يعدّ تنازلياً لانتهاء الراحة.</p>
            <p>▶️ <b>البدء:</b> صاحب الجولة يضغط "بدء".</p>
            <p>✏️ <b>تعديل:</b> صاحب الجولة يقدر يعدّل الاسم والوصف والمدة.</p>
            <p>🚫 <b>طرد:</b> الأدمن والمشرفون يقدروا يطردوا أي مشارك من قائمة المشاركين.</p>
            <p>🔒 <b>الاجتماعات الخاصة:</b> أنشئ اجتماعاً خاصاً وادعُ من تريد فقط.</p>
            <p>🔥 <b>الشعلة:</b> تحسب فقط بعد ما تكتب إنجازك في تقييم نهاية الجولة.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Completion self-assessment */}
      <Dialog open={!!completionRound} onOpenChange={(o) => { if (!o) { setCompletionRound(null); setAchievement(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>🎉 انتهت الجولة "{completionRound?.title}"</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">شارك إنجازك في هذه الجولة (سيتم احتساب الشعلة 🔥 بعد إرسال إنجازك)</p>
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
      <label className="text-sm font-medium">مدة الجولة (دقائق)</label>
      <Input type="number" min={5} max={480} value={p.duration} onChange={e => p.setDuration(Number(e.target.value))} />
    </div>
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium flex items-center gap-1"><Coffee className="w-4 h-4" /> فترات راحة</p>
        <p className="text-xs text-muted-foreground">إضافة بريك أثناء الجولة</p>
      </div>
      <Switch checked={p.breakEnabled} onCheckedChange={p.setBreakEnabled} />
    </div>
    {p.breakEnabled && (
      <div className="grid grid-cols-2 gap-3 animate-fade-in">
        <div>
          <label className="text-xs text-muted-foreground">كل كم دقيقة بريك؟</label>
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
        <p className="text-xs text-muted-foreground">عند كتم الصوت لن يصدر أي زمّور عند انتهاء الجولة</p>
      </div>
      <Switch checked={p.alarmMuted} onCheckedChange={p.setAlarmMuted} />
    </div>
  </div>
);

export default Rounds;
