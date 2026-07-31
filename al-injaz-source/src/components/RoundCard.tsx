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
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden transition hover:shadow-md flex flex-col">
      <div className="relative h-32 w-full bg-gradient-to-br from-primary/20 to-accent/10">
        {imgUrl && <img src={imgUrl} alt={round.title} className="h-full w-full object-cover" />}
        {isEnded && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <Badge variant="secondary">منتهية</Badge>
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold text-foreground line-clamp-1">{round.title}</h4>
          {canDelete && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {round.description && <p className="text-xs text-muted-foreground line-clamp-2">{round.description}</p>}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            {formatRemaining(remaining)}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Users className="h-3 w-3" />
            {participantCount}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {round.work_minutes}د دراسة / {round.break_minutes}د بريك
          </Badge>
        </div>

        <div className="mt-auto pt-2 flex gap-2">
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
