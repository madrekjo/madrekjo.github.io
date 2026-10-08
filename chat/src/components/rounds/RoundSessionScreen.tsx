import { useAuth } from "@/contexts/AuthContext";
import { usePoints } from "@/contexts/PointsContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  X, Users, Clock, Coffee, Play, Square, LogOut as LogOutIcon, UserMinus,
  Trophy, Flame, Activity, CheckCircle2, UserPlus, Hourglass, BellRing,
} from "lucide-react";
import {
  roundStateAt,
  roundTotalSeconds,
  breakSecondsLeft,
  formatDuration,
  MAX_BALANCE,
  SECONDS_PER_BATCH,
  POINTS_PER_BATCH,
} from "@/lib/roundSchedule";
import type { RoundLeaderboardRow } from "@/lib/points";
import type { LiveRound } from "@/hooks/useRoundPresence";
import type { Round } from "./types";

interface RoundSessionScreenProps {
  round: Round;
  now: number;
  board: RoundLeaderboardRow[];
  joined: boolean;
  live: LiveRound;
  beating: boolean;
  busy: boolean;
  ringing: boolean;
  isStaff: boolean;
  isMember: boolean;
  hasCompletion: boolean;
  onEnter: () => void;
  onExit: () => void;
  onBack: () => void;
  onLeave: () => void;
  onStart: () => void;
  onEnd: () => void;
  onInvite: () => void;
  onKick: (uid: string) => void;
  onCompletion: () => void;
  onStopAlarm: () => void;
}

/**
 * شاشة الجولة — تغطّي الصفحة كلها.
 * الدخول تلقائي عند الفتح والجولة نشطة، والخروج من الشاشة (×) لا يوقف
 * الاحتساب؛ يوقفه زر «إيقاف الاحتساب» أو نهاية الجولة.
 */
const RoundSessionScreen = (p: RoundSessionScreenProps) => {
  const { round, now, board, joined, live, beating, busy } = p;
  const { user } = useAuth();
  const { balance } = usePoints();

  const isOwner = round.user_id === user?.id;
  const st = roundStateAt(round, now);
  const over = round.status === "active" && st.wallRemaining <= 0;
  const total = roundTotalSeconds(round);
  const elapsed =
    round.status === "pending"
      ? 0
      : Math.min(total, Math.max(0, total - (over ? 0 : st.wallRemaining)));
  const overallPct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;

  const secs = Math.max(0, Math.floor(live.liveFocus));
  const batchPct = ((secs % SECONDS_PER_BATCH) / SECONDS_PER_BATCH) * 100;
  const toBatch = SECONDS_PER_BATCH - (secs % SECONDS_PER_BATCH);

  const people = round.participants.length;
  const me = board.find((b) => b.user_id === user?.id);

  const rows = [
    { uid: round.user_id, name: round.profile?.full_name, avatar: round.profile?.avatar_url, owner: true },
    ...round.participants
      .filter((x) => x.user_id !== round.user_id)
      .map((x) => ({ uid: x.user_id, name: x.profile?.full_name, avatar: x.profile?.avatar_url, owner: false })),
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-background overflow-y-auto">
      <div className="mx-auto flex max-w-2xl min-h-full flex-col gap-4 px-4 py-4">
        {/* شريط علوي: رجوع + عنوان + إيقاف الاحتساب */}
        <div className="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b bg-background px-4 py-3">
          <Button variant="ghost" size="icon" onClick={p.onBack} aria-label="رجوع">
            <X className="w-5 h-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">{round.title}</h1>
            {round.description && (
              <p className="truncate text-xs text-muted-foreground">{round.description}</p>
            )}
          </div>
          {joined && (
            <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={p.onExit}>
              <LogOutIcon className="w-4 h-4" /> إيقاف الاحتساب
            </Button>
          )}
        </div>

        {/* شارات */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1">
            <Users className="w-3 h-3" /> {people}
            {round.capacity ? ` / ${round.capacity}` : ""} منضم
          </span>
          <span className="flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1">
            <Clock className="w-3 h-3" /> مدة الجولة {formatDuration(total)}
          </span>
          {round.settled && (
            <span className="flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-3 h-3" /> مُحسومة
            </span>
          )}
        </div>

        {/* المنبّه عند النهاية */}
        {p.ringing && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <BellRing className="h-4 w-4 animate-pulse text-destructive" />
            <span className="flex-1 text-sm">انتهت زمن الجولة!</span>
            <Button size="sm" variant="destructive" onClick={p.onStopAlarm}>إيقاف المنبّه</Button>
          </div>
        )}

        {/* المؤقّت */}
        {round.status === "pending" ? (
          <div className="rounded-xl border bg-muted/40 p-8 text-center">
            <Hourglass className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="mb-1 text-sm font-medium">بانتظار بدء الجولة</p>
            <p className="text-xs text-muted-foreground">
              المالك يضغط «ابدأ الآن»، ومن بعده يُحتسب الحضور للجميع.
            </p>
            {isOwner && (
              <Button className="mt-4 gap-1" onClick={p.onStart} disabled={busy}>
                {busy ? <Square className="h-4 w-4 animate-pulse" /> : <Play className="h-4 w-4" />}
                ابدأ الآن
              </Button>
            )}
          </div>
        ) : round.status === "completed" ? (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-500" />
            <p className="text-sm font-medium">الجولة منجزة ومُحسومة</p>
            <p className="mt-1 text-xs text-muted-foreground">
              حُسب حضور الجميع حتى نهاية الجولة — النقاط في سجل معاملاتك.
            </p>
          </div>
        ) : (
          <div
            className={`rounded-xl p-6 text-center ${
              over
                ? "border border-green-500/30 bg-green-500/10"
                : st.inBreak
                ? "border border-amber-500/30 bg-amber-500/10"
                : "border border-primary/30 bg-primary/5"
            }`}
          >
            <p
              className={`mb-2 text-xs font-medium ${
                over
                  ? "text-green-600 dark:text-green-400"
                  : st.inBreak
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-primary"
              }`}
            >
              {over ? "انتهت الجولة" : st.inBreak ? "☕ استراحة — لا تُحتسب" : "📚 وقت الدراسة"}
            </p>
            <p
              className={`text-7xl font-bold tabular-nums ${
                over
                  ? "text-muted-foreground"
                  : st.inBreak
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-primary"
              }`}
              dir="ltr"
            >
              {formatDuration(over ? 0 : st.inBreak ? st.breakRemaining : st.workRemaining)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              من أصل {formatDuration(st.totalWorkSeconds)} دراسة
              {round.break_enabled && ` + ${formatDuration(breakSecondsLeft(st))} راحة متبقية`}
            </p>

            {/* شريط زمن الجولة الكامل */}
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-1000"
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatDuration(elapsed)} من {formatDuration(total)} من زمن الجولة
            </p>

            {over && !round.settled && isOwner && (
              <Button
                variant="outline"
                className="mt-3 gap-1 text-destructive"
                onClick={p.onEnd}
                disabled={busy}
              >
                {busy ? <Square className="h-4 w-4 animate-pulse" /> : <Square className="h-4 w-4" />}
                تثبيت النهاية
              </Button>
            )}
            {over && round.settled && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                سُجّل الحضور وحُسمت النقاط — ما دمت في الجولة ستظهر لك تقييم «إنجازي».
              </p>
            )}
          </div>
        )}

        {/* الاحتساب الشخصي */}
        {(isOwner || p.isMember) && round.status === "active" && (
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                {joined ? (
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                    يُحتسب حضورك الآن
                  </p>
                ) : over ? (
                  <p className="text-sm text-muted-foreground">انتهى الوقت — لا يُحتسب المزيد</p>
                ) : (
                  <Button size="sm" className="gap-1" onClick={p.onEnter}>
                    <Play className="h-4 w-4" /> ابدأ الاحتساب
                  </Button>
                )}
                {beating && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Activity className="h-3 w-3 animate-pulse" /> جارٍ تسجيل حضورك…
                  </p>
                )}
                {live.error && <p className="mt-1 text-[11px] text-destructive">{live.error}</p>}
                {me && !joined && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    سجلك: {formatDuration(me.focus_seconds)} حضور ⇒ {me.points_awarded} نقطة
                  </p>
                )}
              </div>
              <div className="text-left">
                <p className="text-lg font-bold tabular-nums text-amber-500">+{joined ? live.points : me?.points_awarded ?? 0}</p>
                <p className="text-[11px] text-muted-foreground">
                  رصيدك {balance} / {MAX_BALANCE}
                </p>
              </div>
            </div>

            {joined && (
              <div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.min(100, batchPct)}%` }}
                  />
                </div>
                <p className="mt-1 text-center text-[11px] text-muted-foreground">
                  الدفعة القادمة بعد {formatDuration(toBatch)} ⇒ <b>+{POINTS_PER_BATCH} نقاط</b>
                </p>
              </div>
            )}
          </div>
        )}

        {/* أفعال سريعة */}
        {(isOwner || p.isMember) && round.status !== "completed" && (
          <div className="flex flex-wrap gap-2">
            {isOwner && round.status === "active" && !over && (
              <Button variant="outline" className="gap-1 text-destructive" onClick={p.onEnd} disabled={busy}>
                {busy ? <Square className="h-4 w-4 animate-pulse" /> : <Square className="h-4 w-4" />} إنهاء الجولة الآن
              </Button>
            )}
            {isOwner && (
              <Button variant="outline" className="gap-1" onClick={p.onInvite}>
                <UserPlus className="h-4 w-4" /> دعوة
              </Button>
            )}
            {p.isMember && !isOwner && (
              <Button
                variant="destructive"
                className="gap-1"
                onClick={p.onLeave}
              >
                <LogOutIcon className="h-4 w-4" /> مغادرة الجولة
              </Button>
            )}
          </div>
        )}

        {round.status === "completed" && p.isMember && !p.hasCompletion && (
          <Button className="gap-1" onClick={p.onCompletion}>
            <Flame className="h-4 w-4" /> سجّل إنجازك في الجولة
          </Button>
        )}

        {/* الأكورديونات */}
        <Accordion type="multiple" defaultValue={["participants"]} className="space-y-2">
          <AccordionItem value="participants" className="rounded-lg border px-3">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" /> الأشخاص داخل الجولة ({rows.length})
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="max-h-[40vh] space-y-1 overflow-y-auto">
                {rows.map((r) => (
                  <div key={r.uid} className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted/60">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={r.avatar || ""} />
                      <AvatarFallback className="text-[10px]">{r.name?.charAt(0) || "م"}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate text-sm">
                      {r.name || "مستخدم"}
                      {r.owner && <span className="text-[10px] text-primary"> (المالك)</span>}
                      {r.uid === user?.id && <span className="text-[10px] text-muted-foreground"> (أنت)</span>}
                    </span>
                    {p.isStaff && !r.owner && r.uid !== user?.id && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => p.onKick(r.uid)}
                        title="طرد"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {(isOwner || p.isMember) && (
            <AccordionItem value="board" className="rounded-lg border px-3">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-1.5">
                  <Trophy className="h-4 w-4" /> سجل الحضور (محسوب على الخادم)
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {board.length === 0 ? (
                  <p className="py-2 text-center text-sm text-muted-foreground">لا يوجد حضور مسجَّل بعد</p>
                ) : (
                  <div className="max-h-[40vh] space-y-1 overflow-y-auto">
                    {board.map((b, i) => (
                      <div
                        key={b.user_id}
                        className={`flex items-center gap-2 rounded-lg p-2 ${b.user_id === user?.id ? "bg-primary/10" : "bg-muted/50"}`}
                      >
                        <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={b.avatar_url || ""} />
                          <AvatarFallback className="text-[10px]">{b.full_name?.charAt(0) || "م"}</AvatarFallback>
                        </Avatar>
                        <span className="flex-1 truncate text-sm">
                          {b.full_name}
                          {b.user_id === user?.id && <span className="text-[10px] text-muted-foreground"> (أنت)</span>}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">{formatDuration(b.focus_seconds)}</span>
                        <span className="w-10 text-left text-xs font-bold tabular-nums text-amber-500">+{b.points_awarded}</span>
                      </div>
                    ))}
                  </div>
                )}
                {me && (
                  <p className="mt-1 text-center text-[11px] text-muted-foreground">
                    سجلك: {formatDuration(me.focus_seconds)} حضور ⇒ {me.points_awarded} نقطة
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          <AccordionItem value="details" className="rounded-lg border px-3">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> تفاصيل الجولة
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {round.duration_minutes} دقيقة دراسة صافية
                  {round.break_enabled && (
                    <span className="text-muted-foreground">
                      + بريك {round.break_duration_minutes}د كل {round.break_interval_minutes}د
                    </span>
                  )}
                </p>
                <p className="flex items-center gap-2">
                  <Coffee className="h-3.5 w-3.5 text-muted-foreground" />
                  الزمن الكلي {formatDuration(total)} (البريكات تُضاف ولا تُحتسب عملاً)
                </p>
                <p className="flex items-center gap-2">
                  <Flame className="h-3.5 w-3.5 text-muted-foreground" />
                  {POINTS_PER_BATCH} نقاط كل ساعة حضور داخل الجولة (تشمل الاستراحات)
                </p>
                <p className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  {round.capacity ? `السعة ${people} من ${round.capacity} منضم` : "بلا سعة محدودة"}
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <p className="pb-2 text-center text-[11px] text-muted-foreground">
          الاحتساب يبدأ بزر «ابدأ الاحتساب»، ويستمر ولو انتقلت لصفحة أخرى — يوقفه
          «إيقاف الاحتساب» أو نهاية الجولة. الساعة من الخادم لا من جهازك.
        </p>
      </div>
    </div>
  );
};

export default RoundSessionScreen;
