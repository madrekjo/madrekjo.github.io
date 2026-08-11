import { useEffect, useMemo, useState } from "react";
import { Round, Participant, useRounds, getRoundImageUrl } from "@/hooks/useRounds";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Users, BookOpen, Coffee, Play, CheckCircle2, Shield, UserCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  round: Round | null;
  participants: Participant[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (ms: number) => {
  if (ms <= 0) return "00:00";
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

export const RoundView = ({ round, participants, open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const { joinRound, finalizeRound } = useRounds();
  const [now, setNow] = useState(Date.now());
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let active = true;
    getRoundImageUrl(round?.image_path ?? null).then((u) => { if (active) setImgUrl(u); });
    return () => { active = false; };
  }, [round?.image_path]);

  const userIds = useMemo(() => participants.map((p) => p.user_id), [participants]);
  const { data: profiles = [] } = useQuery({
    queryKey: ["round-profiles", userIds.sort().join(",")],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data, error } = await achievementSupabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && userIds.length > 0,
  });

  const { data: creatorProfile } = useQuery({
    queryKey: ["round-creator-profile", round?.creator_id],
    queryFn: async () => {
      if (!round?.creator_id) return null;
      const { data, error } = await achievementSupabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .eq("user_id", round.creator_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && isAdmin && !!round?.creator_id,
  });

  // Trigger finalize when timer hits zero (idempotent)
  const remainingMs = round ? new Date(round.ends_at).getTime() - now : 0;
  useEffect(() => {
    if (!round) return;
    if (remainingMs > 0) return;
    if (round.credited) return;
    finalizeRound.mutate(round.id, {
      onSuccess: () => toast.success("تم احتساب وقت الدراسة لجميع المنضمين ✓"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs <= 0, round?.id, round?.credited]);

  if (!round) return null;

  const hasJoined = !!user && participants.some((p) => p.user_id === user.id);

  // Pomodoro phase
  const totalCycleMin = round.work_minutes + round.break_minutes;
  const elapsedMs = Math.max(0, now - new Date(round.starts_at).getTime());
  let phase: "work" | "break" = "work";
  let phaseRemainingMs = 0;
  if (totalCycleMin === 0 || round.break_minutes === 0) {
    phase = "work";
    phaseRemainingMs = remainingMs;
  } else {
    const cycleMs = totalCycleMin * 60_000;
    const pos = elapsedMs % cycleMs;
    const workMs = round.work_minutes * 60_000;
    if (pos < workMs) {
      phase = "work";
      phaseRemainingMs = workMs - pos;
    } else {
      phase = "break";
      phaseRemainingMs = cycleMs - pos;
    }
  }

  const isEnded = remainingMs <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{round.title}</DialogTitle>
          {round.description && <DialogDescription>{round.description}</DialogDescription>}
        </DialogHeader>

        {imgUrl && (
          <div className="rounded-lg overflow-hidden h-40">
            <img src={imgUrl} alt={round.title} className="h-full w-full object-cover" />
          </div>
        )}

        {/* Main countdown */}
        <div className="rounded-xl border bg-gradient-to-br from-primary/10 to-accent/5 p-4 text-center">
          <div className="text-xs text-muted-foreground mb-1">الوقت المتبقي للجولة</div>
          <div className="font-mono text-4xl font-bold text-primary tabular-nums">{fmt(remainingMs)}</div>
        </div>

        {/* Phase indicator */}
        {!isEnded && round.break_minutes > 0 && (
          <div className={`rounded-xl border p-4 ${phase === "work" ? "bg-success/10 border-success/30" : "bg-amber-500/10 border-amber-500/30"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {phase === "work" ? (
                  <><BookOpen className="h-5 w-5 text-success" /><span className="font-semibold">وقت الدراسة</span></>
                ) : (
                  <><Coffee className="h-5 w-5 text-amber-600 dark:text-amber-400" /><span className="font-semibold">وقت البريك</span></>
                )}
              </div>
              <div className="font-mono text-xl font-bold tabular-nums">{fmt(phaseRemainingMs)}</div>
            </div>
          </div>
        )}

        {isEnded && (
          <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-center">
            <CheckCircle2 className="h-6 w-6 text-success mx-auto mb-1" />
            <p className="text-sm font-semibold">انتهت الجولة</p>
            {hasJoined && <p className="text-xs text-muted-foreground mt-1">تم احتساب وقت الدراسة في إنجازك اليومي</p>}
          </div>
        )}

        {/* Join button */}
        {!isEnded && !hasJoined && (
          <Button onClick={() => joinRound.mutate(round.id)} disabled={joinRound.isPending} className="w-full gap-1">
            <Play className="h-4 w-4" />
            انضم للجولة
          </Button>
        )}

        {/* Participants */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">المنضمون ({participants.length})</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {participants.map((p) => {
              const prof = profiles.find((x) => x.user_id === p.user_id);
              return (
                <div key={p.id} className="flex flex-col items-center gap-1">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={prof?.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/15 text-primary text-sm">
                      {(prof?.display_name || "?")[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-[10px] text-center text-muted-foreground line-clamp-1">
                    {prof?.display_name || "مستخدم"}
                  </span>
                </div>
              );
            })}
            {participants.length === 0 && (
              <p className="col-span-4 text-center text-xs text-muted-foreground py-2">لا يوجد منضمون بعد</p>
            )}
          </div>
        </div>

        {/* Admin-only info */}
        {isAdmin && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <Shield className="h-4 w-4" />
              <span className="text-sm font-semibold">معلومات الإدارة</span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <UserCircle2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">منشئ الجولة:</span>
              <span className="font-medium text-foreground">
                {creatorProfile?.display_name || "مستخدم"}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1.5 text-xs">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">توقيت كل مشارك:</span>
              </div>
              <ul className="space-y-1 text-xs">
                {participants.map((p) => {
                  const prof = profiles.find((x) => x.user_id === p.user_id);
                  const joined = new Date(p.joined_at);
                  const endTs = Math.min(
                    new Date(round.ends_at).getTime(),
                    isEnded ? new Date(round.ends_at).getTime() : now
                  );
                  return (
                    <li
                      key={`admin-${p.id}`}
                      className="flex items-center justify-between gap-2 rounded-md bg-background/60 px-2 py-1.5"
                    >
                      <span className="font-medium text-foreground truncate">
                        {prof?.display_name || "مستخدم"}
                      </span>
                      <span className="text-muted-foreground tabular-nums" dir="ltr">
                        {joined.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                        {" → "}
                        {isEnded
                          ? new Date(round.ends_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </span>
                    </li>
                  );
                })}
                {participants.length === 0 && (
                  <li className="text-center text-muted-foreground py-1">لا يوجد مشاركون</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
