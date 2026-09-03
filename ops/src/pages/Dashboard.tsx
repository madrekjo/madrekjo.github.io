import { Ghost, Trophy, Users, Timer, Flag, Activity, Radio } from "lucide-react";
import { usePlatformStats } from "@/hooks/usePlatformStats";
import { useEffect, useState } from "react";
import { chatClient, anonClient } from "@/lib/supabase-clients";
import { timeAgo, cn } from "@/lib/utils";

/* ---------------- Platform Radar ---------------- */

interface RadarBar {
  label: string;
  value: number;
  color: string;
  glow: string;
}

const RMAX = 200;

function Bar({ value, color, glow }: { value: number; color: string; glow: string }) {
  const pct = Math.max(2, Math.min(100, (value / RMAX) * 100));
  return (
    <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-ops-border/50">
      <div
        className={cn("absolute inset-y-0 start-0 rounded-full transition-all", color, glow)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function PlatformRadar({ bars, posts }: { bars: RadarBar[]; posts: number }) {
  return (
    <div className="ops-card flex h-full flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ops-dim">
          // PLATFORM RADAR
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] text-ops-green">
          <Radio className="h-3 w-3" /> SCANNING
        </span>
      </div>

      <div className="relative mx-auto mb-5 flex h-44 w-44 items-center justify-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full animate-[spin_20s_linear_infinite]">
          <circle cx="50" cy="50" r="46" fill="none" stroke="#1a2337" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="31" fill="none" stroke="#1a2337" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="16" fill="none" stroke="#1a2337" strokeWidth="0.5" />
          <line x1="6" y1="50" x2="94" y2="50" stroke="#00d4ff" strokeWidth="0.6" opacity="0.25" />
          <line x1="50" y1="6" x2="50" y2="94" stroke="#00d4ff" strokeWidth="0.6" opacity="0.15" />
          <line x1="50" y1="50" x2="94" y2="50" stroke="#00d4ff" strokeWidth="0.8" opacity="0.8" />
        </svg>
        <div className="relative z-10 text-center">
          <div className="font-mono text-3xl font-bold text-ops-text tabular-nums">{posts}</div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-ops-dim">Total Posts</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {bars.map((b) => (
          <div key={b.label} className="flex flex-col gap-1">
            <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-ops-dim">
              <span>{b.label}</span>
              <span className="text-ops-text tabular-nums">{b.value}</span>
            </div>
            <Bar value={b.value} color={b.color} glow={b.glow} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Critical Events ---------------- */

interface EvRow {
  time: string;
  title: string;
  detail: string;
  severity: 0 | 1 | 2;
}

function CriticalEvents({ events }: { events: EvRow[] }) {
  return (
    <div className="ops-card h-full p-5">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-ops-cyan" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-ops-cyan">
          Critical Events
        </span>
      </div>

      <div className="space-y-2">
        {events.length === 0 ? (
          <div className="flex items-center justify-center py-8 font-mono text-[11px] text-ops-dim">
            // NO EVENTS — OPERATIONAL
          </div>
        ) : (
          events.map((e, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-md border border-ops-border bg-ops-bg/60 px-3 py-2"
            >
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  e.severity === 2 ? "bg-ops-red" : e.severity === 1 ? "bg-ops-amber" : "bg-ops-cyan"
                )}
              />
              <span className="font-mono text-[10px] text-ops-dim tabular-nums">{e.time}</span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-widest text-ops-text">
                  {e.title}
                </p>
                <p className="truncate text-xs text-ops-dim">{e.detail}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------------- Intel Card ---------------- */

function IntelCard({
  icon,
  accent,
  label,
  value,
  rows,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: number;
  rows: { k: string; v: string }[];
}) {
  return (
    <div className="ops-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ops-dim">{label}</span>
        {icon}
      </div>
      <div className={cn("font-mono text-3xl font-bold tabular-nums", accent)}>{value}</div>
      <div className="mt-3 space-y-1.5 border-t border-ops-border/60 pt-2.5 font-mono text-[10px]">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-ops-dim">{r.k}</span>
            <span className="text-ops-text tabular-nums">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function Dashboard() {
  const { stats, workerStatus } = usePlatformStats(true);
  const [reports, setReports] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);

  useEffect(() => {
    anonClient
      .from("reports")
      .select("id, content_type, reason_code, status, created_at, content_snapshot")
      .order("created_at", { ascending: false })
      .limit(6)
      .then(({ data }) => setReports(data ?? []));
    chatClient
      .from("study_rounds")
      .select("id, title, starts_at, status")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setRounds(data ?? []));
  }, []);

  const reportEvents: EvRow[] = reports.map((r) => ({
    time: fmtTime(r.created_at),
    title: r.status === "open" ? "NEW REPORT" : "REPORT CLOSED",
    detail: `${r.content_type ?? "post"} — ${r.reason_code ?? "reason"}`,
    severity: (r.status === "open" ? 2 : 0) as 0 | 1 | 2,
  }));
  const roundEvents: EvRow[] = rounds.map((r) => ({
    time: fmtTime(r.starts_at),
    title: r.status === "active" ? "ROUND ACTIVE" : "ROUND",
    detail: r.title ?? "",
    severity: (r.status === "active" ? 1 : 0) as 0 | 1 | 2,
  }));
  const events: EvRow[] = [...reportEvents, ...roundEvents].slice(0, 6);

  const radarBars: RadarBar[] = [
    { label: "CHAT", value: stats.chatPosts, color: "bg-ops-cyan", glow: "shadow-[0_0_6px_rgba(0,212,255,0.6)]" },
    { label: "ANON", value: stats.anonPosts, color: "bg-ops-violet", glow: "shadow-[0_0_6px_rgba(139,92,246,0.6)]" },
    { label: "ACHIEVE", value: stats.achievementTasks, color: "bg-ops-green", glow: "shadow-[0_0_6px_rgba(0,255,136,0.5)]" },
    { label: "USERS", value: stats.chatUsers, color: "bg-ops-dim", glow: "" },
  ];

  const online =
    workerStatus === "online"
      ? "bg-ops-green/10 text-ops-green border-ops-green/40"
      : workerStatus === "offline"
        ? "bg-ops-red/10 text-ops-red border-ops-red/40"
        : "bg-ops-amber/10 text-ops-amber border-ops-amber/40";
  const onlineLabel = workerStatus === "online" ? "OPERATIONAL" : workerStatus === "offline" ? "OFFLINE" : "CHECKING";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-widest text-ops-text">OVERVIEW</h1>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-ops-dim">
            // SYSTEM STATUS: {onlineLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px]", online)}>
            {onlineLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <PlatformRadar bars={radarBars} posts={stats.chatPosts + stats.anonPosts} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-2">
          <IntelCard
            icon={<Users className="h-4 w-4 text-ops-cyan" />}
            accent="text-ops-cyan"
            label="Users Monitor"
            value={stats.chatUsers}
            rows={[
              { k: "ACTIVE TODAY", v: String(stats.chatActiveToday) },
              { k: "TOTAL USERS", v: String(stats.chatUsers) },
            ]}
          />
          <IntelCard
            icon={<Ghost className="h-4 w-4 text-ops-violet" />}
            accent="text-ops-violet"
            label="Anonymous Monitor"
            value={stats.anonPosts}
            rows={[
              { k: "REPORTS", v: String(stats.anonReportsOpen) },
              { k: "BLOCKED", v: String(stats.anonBlocked) },
            ]}
          />
          <IntelCard
            icon={<Timer className="h-4 w-4 text-ops-green" />}
            accent="text-ops-green"
            label="Study Operations"
            value={stats.achievementActiveRounds}
            rows={[
              { k: "OPEN ROUNDS", v: String(stats.achievementActiveRounds) },
              { k: "USERS", v: String(stats.achievementUsers) },
            ]}
          />
          <IntelCard
            icon={<Trophy className="h-4 w-4 text-ops-dim" />}
            accent="text-ops-text"
            label="Achievement Engine"
            value={stats.achievementTasks}
            rows={[{ k: "TOTAL TASKS", v: String(stats.achievementTasks) }]}
          />
        </div>
      </div>

      <CriticalEvents events={events} />
    </div>
  );
}