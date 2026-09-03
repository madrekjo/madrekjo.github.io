import { Ghost, Trophy, Users, Timer, Activity } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import { usePlatformStats } from "@/hooks/usePlatformStats";
import { useEffect, useState } from "react";
import { chatClient, anonClient } from "@/lib/supabase-clients";
import { timeAgo, cn } from "@/lib/utils";

interface RadarBar {
  label: string;
  value: number;
  accent: string;
}

const MAX_BAR = 120;

function RadarPip({ value }: { value: number }) {
  const pct = Math.max(4, Math.min(MAX_BAR, value));
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-ops-border/60">
      <div
        className="absolute inset-y-0 start-0 rounded-full bg-ops-cyan/50"
        style={{ width: `${(pct / MAX_BAR) * 100}%` }}
      />
    </div>
  );
}

function RadarQuarter({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <span className="font-mono text-[9px] uppercase tracking-widest text-ops-dim">{title}</span>
      {children}
    </div>
  );
}

function PlatformRadar({ bars }: { bars: RadarBar[] }) {
  return (
    <div className="ops-card relative overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ops-dim">
          // PLATFORM RADAR
        </span>
        <span className="font-mono text-[9px] text-ops-green">SCANNING</span>
      </div>

      <div className="mx-auto mb-5 block h-40 w-40">
        <svg viewBox="0 0 100 100" className="h-full w-full animate-[spin_16s_linear_infinite]">
          <defs>
            <radialGradient id="rad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="none" stroke="#1a2337" strokeWidth="0.6" />
          <circle cx="50" cy="50" r="32" fill="none" stroke="#1a2337" strokeWidth="0.6" />
          <circle cx="50" cy="50" r="16" fill="none" stroke="#1a2337" strokeWidth="0.6" />
          <path d="M 50,50 L 99,50" stroke="#00d4ff" strokeWidth="0.8" opacity="0.7" />
          <path d="M 50,6 L 50,50" stroke="#00d4ff" strokeWidth="0.8" opacity="0.3" />
          <ellipse cx="50" cy="50" rx="30" ry="46" fill="url(#rad)" opacity="0.5" />
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
        {bars.map((b) => (
          <RadarQuarter key={b.label} title={b.label}>
            <div className="flex w-full items-center gap-2">
              <span className={cn("inline-block h-1.5 w-1.5 rounded-full", b.accent)} />
              <RadarPip value={b.value} />
            </div>
          </RadarQuarter>
        ))}
      </div>
    </div>
  );
}

interface CrispCard {
  title: string;
  tone: "info" | "ok" | "warn" | "alert";
  lines: { k: string; v: string }[];
}

function CriticalEventCard({ ev }: { ev: CrispCard }) {
  const toneCls = {
    info: "border-ops-cyan/25 text-ops-cyan",
    ok: "border-ops-green/25 text-ops-green",
    warn: "border-ops-amber/25 text-ops-amber",
    alert: "border-ops-red/30 text-ops-red",
  }[ev.tone];

  return (
    <div className={cn("ops-card p-4", toneCls)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest">{ev.title}</span>
        <span className="font-mono text-[9px] text-ops-dim">REALTIME</span>
      </div>
      <div className="space-y-1 font-mono text-[11px]">
        {ev.lines.map((l, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span className="text-ops-dim">{l.k}</span>
            <span className="text-right text-ops-text">{l.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { stats, loading, workerStatus } = usePlatformStats(true);
  const [recentChat, setRecentChat] = useState<any[]>([]);
  const [recentAnon, setRecentAnon] = useState<any[]>([]);
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [recentRounds, setRecentRounds] = useState<any[]>([]);

  useEffect(() => {
    chatClient
      .from("study_rounds")
      .select("id, title, starts_at, status")
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => setRecentRounds(data ?? []));
    anonClient
      .from("reports")
      .select("id, content_type, reason_code, status, created_at, content_snapshot")
      .order("created_at", { ascending: false })
      .limit(4)
      .then(({ data }) => setRecentReports(data ?? []));
    chatClient
      .from("posts")
      .select("id, content, created_at, user_id, channel, status")
      .order("created_at", { ascending: false })
      .limit(4)
      .then(({ data }) => setRecentChat(data ?? []));
    anonClient
      .from("posts")
      .select("id, content, created_at, hidden, status, post_mode")
      .order("created_at", { ascending: false })
      .limit(4)
      .then(({ data }) => setRecentAnon(data ?? []));
  }, []);

  const radarBars: RadarBar[] = [
    { label: "CHAT", value: stats.chatPosts, accent: "bg-ops-cyan" },
    { label: "ANON", value: stats.anonPosts, accent: "bg-ops-violet" },
    { label: "ACHIEVEMENTS", value: stats.achievementTasks, accent: "bg-ops-green" },
    { label: "QUIZ", value: stats.chatUsers, accent: "bg-ops-dim" },
  ];

  const criticalEvents: CrispCard[] = [
    {
      title: "NEW REPORT RECEIVED",
      tone: "alert",
      lines: recentReports.length
        ? [
            { k: "Type", v: recentReports[0].content_type ?? "post" },
            { k: "Reason", v: recentReports[0].reason_code ?? "—" },
            { k: "When", v: timeAgo(recentReports[0].created_at) },
          ]
        : [{ k: "Status", v: "قائمة فارغة" }],
    },
    {
      title: "STUDY ROUND STATUS",
      tone: "info",
      lines: recentRounds.length
        ? [
            { k: "Round", v: recentRounds[0].title ?? "—" },
            { k: "Status", v: recentRounds[0].status ?? "—" },
            { k: "Start", v: timeAgo(recentRounds[0].starts_at) },
          ]
        : [{ k: "Status", v: "قائمة فارغة" }],
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-widest text-ops-text">
            OVERVIEW
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-ops-dim">
            // SYSTEM STATUS: OPERATIONAL
          </p>
        </div>
      </div>

      {/* CRITICAL EVENTS */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-ops-cyan" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-ops-cyan">
            CRITICAL EVENTS
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {criticalEvents.map((ev, i) => (
            <CriticalEventCard key={i} ev={ev} />
          ))}
        </div>
      </section>

      {/* RADAR + INTELLIGENCE */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <PlatformRadar bars={radarBars} />
        </div>

        <div className="lg:col-span-2 lg:col-start-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="ops-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-ops-dim">Users Monitor</span>
              <Users className="h-4 w-4 text-ops-cyan" />
            </div>
            <div className="font-mono text-3xl font-bold text-ops-text tabular-nums">{stats.chatUsers}</div>
            <div className="mt-2 space-y-1 font-mono text-[11px] text-ops-dim">
              <div className="flex justify-between"><span>ACTIVE TODAY</span><span className="text-ops-green">{stats.chatActiveToday}</span></div>
              <div className="flex justify-between"><span>REAL-TIME FEED</span><span>{recentChat.length} posts</span></div>
            </div>
          </div>

          <div className="ops-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-ops-dim">Anonymous Monitor</span>
              <Ghost className="h-4 w-4 text-ops-violet" />
            </div>
            <div className="font-mono text-3xl font-bold text-ops-text tabular-nums">{stats.anonPosts}</div>
            <div className="mt-2 space-y-1 font-mono text-[11px] text-ops-dim">
              <div className="flex justify-between"><span>REPORTS</span><span className="text-ops-amber">{stats.anonReportsOpen}</span></div>
              <div className="flex justify-between"><span>BLOCKED DEVICES</span><span>{stats.anonBlocked}</span></div>
            </div>
          </div>

          <div className="ops-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-ops-dim">Study Operations</span>
              <Timer className="h-4 w-4 text-ops-green" />
            </div>
            <div className="font-mono text-3xl font-bold text-ops-text tabular-nums">{stats.achievementActiveRounds}</div>
            <div className="mt-2 space-y-1 font-mono text-[11px] text-ops-dim">
              <div className="flex justify-between"><span>ACTIVE ROUNDS</span><span>{stats.achievementActiveRounds}</span></div>
              <div className="flex justify-between"><span>USERS</span><span>{stats.achievementUsers}</span></div>
            </div>
          </div>

          <div className="ops-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-ops-dim">Achievement Engine</span>
              <Trophy className="h-4 w-4 text-ops-dim" />
            </div>
            <div className="font-mono text-3xl font-bold text-ops-text tabular-nums">{stats.achievementTasks}</div>
            <div className="mt-2 space-y-1 font-mono text-[11px] text-ops-dim">
              <div className="flex justify-between"><span>ACTIVE TASKS</span><span>{stats.achievementTasks}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* STATUS FOOTER */}
      <div className="ops-panel flex items-center gap-3 p-3">
        <span className="font-mono text-[10px] uppercase text-ops-dim">System Status</span>
        <StatusBadge
          status={workerStatus === "online" ? "نشط" : workerStatus === "offline" ? "مغلق" : "قيد المراجعة"}
          mapping={{
            "نشط": { label: "OPERATIONAL", cls: "bg-ops-green/10 text-ops-green border-ops-green/40" },
            "مغلق": { label: "OFFLINE", cls: "bg-ops-red/10 text-ops-red border-ops-red/40" },
            "قيد المراجعة": { label: "CHECKING", cls: "bg-ops-amber/10 text-ops-amber border-ops-amber/40" },
          }}
        />
        <span className="font-mono text-[10px] text-ops-dim">SCAN: REALTIME</span>
      </div>
    </div>
  );
}