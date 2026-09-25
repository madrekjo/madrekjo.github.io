import { UserRound } from "lucide-react";

export function DeviceNameTag({
  name,
  deviceId,
  className = "",
  showId = false,
  onClick,
}: {
  name?: string | null;
  deviceId?: string | null;
  className?: string;
  showId?: boolean;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  const Comp: any = clickable ? "button" : "span";
  const extra = clickable
    ? { type: "button" as const, onClick, title: "اضغط لعرض كل معلوماته وأدوات الإدارة" }
    : {};
  const shortId = deviceId ? `${deviceId.slice(0, 10)}…` : "—";
  if (!name) {
    return (
      <Comp {...extra} className={`inline-flex items-center gap-1 text-[11px] text-muted-foreground ${className} ${clickable ? "cursor-pointer hover:opacity-80" : ""}`} title={clickable ? "اضغط لعرض كل معلوماته وأدوات الإدارة" : (deviceId ?? "")}>
        <UserRound className="h-3 w-3" />
        {showId ? <span dir="ltr" className="font-mono">بدون اسم · {shortId}</span> : <span>بدون اسم</span>}
      </Comp>
    );
  }
  return (
    <Comp {...extra} className={`inline-flex items-center gap-1 ${className} ${clickable ? "cursor-pointer hover:opacity-80" : ""}`} title={clickable ? "اضغط لعرض كل معلوماته وأدوات الإدارة" : (deviceId ?? name)}>
      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">{name}</span>
      {showId && <span dir="ltr" className="font-mono text-[10px] text-muted-foreground">{shortId}</span>}
    </Comp>
  );
}
