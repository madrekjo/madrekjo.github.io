import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatsCard({
  label,
  value,
  icon,
  accent = "cyan",
  sub,
}: {
  label: string;
  value: number | string;
  icon?: ReactNode;
  accent?: "cyan" | "green" | "red" | "amber" | "violet";
  sub?: string;
}) {
  const accents: Record<string, string> = {
    cyan: "text-ops-cyan shadow-[0_0_14px_rgba(0,212,255,0.2)] border-ops-cyan/40",
    green: "text-ops-green shadow-[0_0_14px_rgba(0,255,136,0.2)] border-ops-green/40",
    red: "text-ops-red shadow-[0_0_14px_rgba(255,51,102,0.2)] border-ops-red/40",
    amber: "text-ops-amber shadow-[0_0_14px_rgba(255,176,32,0.2)] border-ops-amber/40",
    violet: "text-ops-violet shadow-[0_0_14px_rgba(139,92,246,0.2)] border-ops-violet/40",
  };
  return (
    <div className={cn("ops-card p-4", accents[accent])}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ops-dim">{label}</span>
        {icon}
      </div>
      <div className="mt-2 font-mono text-3xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-ops-dim">{sub}</div>}
    </div>
  );
}

export function StatusBadge({
  status,
  mapping,
}: {
  status: string | boolean;
  mapping?: Record<string, { label: string; cls: string }>;
}) {
  const defaultMap: Record<string, { label: string; cls: string }> = {
    true: { label: "نشط", cls: "bg-ops-green/15 text-ops-green border-ops-green/40" },
    false: { label: "مغلق", cls: "bg-ops-red/15 text-ops-red border-ops-red/40" },
    active: { label: "نشط", cls: "bg-ops-green/15 text-ops-green border-ops-green/40" },
    pending: { label: "قيد المراجعة", cls: "bg-ops-amber/15 text-ops-amber border-ops-amber/40" },
    approved: { label: "معتمد", cls: "bg-ops-green/15 text-ops-green border-ops-green/40" },
    rejected: { label: "مرفوض", cls: "bg-ops-red/15 text-ops-red border-ops-red/40" },
    open: { label: "مفتوح", cls: "bg-ops-red/15 text-ops-red border-ops-red/40" },
    resolved: { label: "مغلق", cls: "bg-ops-green/15 text-ops-green border-ops-green/40" },
  };
  const key = String(status);
  const m = (mapping ?? defaultMap)[key] ?? {
    label: key,
    cls: "bg-ops-panel text-ops-dim border-ops-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold",
        m.cls
      )}
    >
      {m.label}
    </span>
  );
}

export function LoadingScanner({ text = "LOADING" }: { text?: string }) {
  return (
    <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-md border border-ops-border bg-ops-bg">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="h-10 w-full animate-scan bg-gradient-to-b from-transparent via-ops-cyan/10 to-transparent" />
      </div>
      <span className="font-mono text-xs tracking-widest text-ops-cyan animate-pulse">
        {text}...
      </span>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-ops-border bg-ops-bg/50 py-10 text-center">
      <span className="font-mono text-xs text-ops-dim">{message}</span>
    </div>
  );
}
