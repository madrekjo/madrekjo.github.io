import { UserRound } from "lucide-react";

export function DeviceNameTag({
  name,
  deviceId,
  className = "",
  showId = false,
}: {
  name?: string | null;
  deviceId?: string | null;
  className?: string;
  showId?: boolean;
}) {
  const shortId = deviceId ? `${deviceId.slice(0, 10)}…` : "—";
  if (!name) {
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] text-muted-foreground ${className}`} title={deviceId ?? ""}>
        <UserRound className="h-3 w-3" />
        {showId ? <span dir="ltr" className="font-mono">بدون اسم · {shortId}</span> : <span>بدون اسم</span>}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title={deviceId ?? name}>
      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">{name}</span>
      {showId && <span dir="ltr" className="font-mono text-[10px] text-muted-foreground">{shortId}</span>}
    </span>
  );
}
