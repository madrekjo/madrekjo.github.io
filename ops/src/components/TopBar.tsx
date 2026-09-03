import { useEffect, useState } from "react";
import { Power, Wifi, WifiOff } from "lucide-react";
import { PlatformStats } from "@/hooks/usePlatformStats";

interface Props {
  workerStatus: "checking" | "online" | "offline";
  onLogout: () => void;
  stats: PlatformStats | null;
}

export function TopBar({ workerStatus, onLogout, stats }: Props) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString("en-GB", { hour12: false });
  const date = now.toLocaleDateString("ar");

  return (
    <header className="sticky top-0 z-30 border-b border-ops-border bg-ops-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 rounded-full bg-ops-cyan animate-blink shadow-[0_0_8px_rgba(0,212,255,0.8)]" />
          <div className="leading-tight">
            <span className="font-mono text-sm font-bold tracking-[0.2em] text-ops-cyan glow-cyan">
              MADARIK.JO
            </span>
            <span className="ms-2 font-mono text-[10px] tracking-[0.25em] text-ops-dim">
              CONTROL CENTER
            </span>
            <div className="mt-0.5 flex items-center gap-3 font-mono text-[9px] uppercase text-ops-dim">
              <span>ROOT ACCESS</span>
              <span>
                LAST SYNC:{" "}
                <span className="text-ops-green tabular-nums">{time}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 font-mono text-[10px]">
            {stats && (
              <>
                <div className="text-center">
                  <div className="text-base font-bold text-ops-cyan tabular-nums">
                    {stats.chatActiveToday}
                  </div>
                  <div className="text-[8px] uppercase tracking-widest text-ops-dim">
                    Active Users
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-base font-bold text-ops-amber tabular-nums">
                    {stats.anonReportsOpen}
                  </div>
                  <div className="text-[8px] uppercase tracking-widest text-ops-dim">
                    Reports
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-base font-bold text-ops-green tabular-nums">
                    {stats.achievementActiveRounds}
                  </div>
                  <div className="text-[8px] uppercase tracking-widest text-ops-dim">
                    Open Rounds
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="hidden md:flex flex-col items-end">
            <span className="font-mono text-sm font-bold text-ops-green tabular-nums">
              {time}
            </span>
            <span className="font-mono text-[10px] text-ops-dim">{date}</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-md border border-ops-border bg-ops-panel px-2.5 py-1">
            {workerStatus === "online" ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-ops-green" />
                <span className="font-mono text-[10px] text-ops-green">OPERATIONAL</span>
              </>
            ) : workerStatus === "offline" ? (
              <>
                <WifiOff className="h-3.5 w-3.5 text-ops-red" />
                <span className="font-mono text-[10px] text-ops-red">OFFLINE</span>
              </>
            ) : (
              <>
                <Wifi className="h-3.5 w-3.5 text-ops-amber animate-pulse" />
                <span className="font-mono text-[10px] text-ops-amber">...</span>
              </>
            )}
          </div>

          <button
            onClick={onLogout}
            title="تسجيل الخروج"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-ops-border text-ops-dim transition-colors hover:border-ops-red/50 hover:text-ops-red"
          >
            <Power className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}