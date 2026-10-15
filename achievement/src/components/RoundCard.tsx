import { useEffect, useState } from "react";
import { Round, getRoundImageUrl } from "@/hooks/useRounds";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Users, Clock, Trash2, Play, CheckCircle2 } from "lucide-react";

interface Props {
  round: Round;
  participantCount: number;
  hasJoined: boolean;
  canDelete: boolean;
  onJoin: () => void;
  onOpen: () => void;
  onDelete: () => void;
}

const formatRemaining = (ms: number) => {
  if (ms <= 0) return "انتهت";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

export const RoundCard = ({ round, participantCount, hasJoined, canDelete, onJoin, onOpen, onDelete }: Props) => {
  const [now, setNow] = useState(Date.now());
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let active = true;
    getRoundImageUrl(round.image_path).then((u) => { if (active) setImgUrl(u); });
    return () => { active = false; };
  }, [round.image_path]);

  const remaining = new Date(round.ends_at).getTime() - now;
  const isEnded = remaining <= 0 || round.status === "ended";

  return (
    <div className="surface surface-hover flex flex-col overflow-hidden">
      <div className="relative h-36 w-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/10">
        {imgUrl && (
          <img
            src={imgUrl}
            alt={round.title}
            className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
        {!isEnded && (
          <span className="absolute end-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-semibold text-primary backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            نشطة
          </span>
        )}
        {isEnded && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Badge variant="secondary" className="rounded-full px-3">
              منتهية
            </Badge>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-1 font-semibold text-foreground">{round.title}</h4>
          {canDelete && (
            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {round.description && <p className="line-clamp-2 text-xs text-muted-foreground">{round.description}</p>}

        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="gap-1 rounded-full">
            <Clock className="h-3 w-3" />
            <span className="tabular-nums">{formatRemaining(remaining)}</span>
          </Badge>
          <Badge variant="outline" className="gap-1 rounded-full">
            <Users className="h-3 w-3" />
            {participantCount}
          </Badge>
          <Badge variant="outline" className="rounded-full text-[10px]">
            {round.work_minutes}د دراسة / {round.break_minutes}د بريك
          </Badge>
        </div>

        <div className="mt-auto flex gap-2 pt-3">
          {!isEnded && !hasJoined && (
            <Button size="sm" className="flex-1 gap-1" onClick={onJoin}>
              <Play className="h-3.5 w-3.5" />
              انضمام
            </Button>
          )}
          {hasJoined && !isEnded && (
            <Button size="sm" variant="secondary" className="flex-1 gap-1" disabled>
              <CheckCircle2 className="h-3.5 w-3.5" />
              منضم
            </Button>
          )}
          <Button size="sm" variant="outline" className="flex-1" onClick={onOpen}>
            فتح
          </Button>
        </div>
      </div>
    </div>
  );
};
