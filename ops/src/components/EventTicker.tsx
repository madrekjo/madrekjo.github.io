import { useEffect, useRef, useState } from "react";
import { OpsEvent } from "@/lib/events";
import { cn } from "@/lib/utils";

const TONE_CLS: Record<OpsEvent["tone"], string> = {
  info: "text-ops-cyan border-ops-cyan/30",
  ok: "text-ops-green border-ops-green/30",
  warn: "text-ops-amber border-ops-amber/30",
  alert: "text-ops-red border-ops-red/30",
};

export function EventTicker({ events }: { events: OpsEvent[] }) {
  const [tick, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  if (events.length === 0) {
    return (
      <div className="flex h-9 items-center gap-4 overflow-hidden border-t border-ops-border bg-ops-bg/80 px-4">
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-ops-dim">
          LIVE FEED
        </span>
        <span className="font-mono text-[11px] text-ops-dim">استماع للأحداث...</span>
      </div>
    );
  }

  const view = events.slice(0, 6);

  return (
    <div className="flex h-9 items-center gap-3 overflow-hidden border-t border-ops-border bg-ops-bg/80 px-3">
      <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ops-cyan">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-ops-cyan animate-blink" />
        LIVE
      </span>
      <div className="flex flex-1 items-center gap-6 overflow-hidden whitespace-nowrap">
        {view.map((e, i) => (
          <div key={`${e.time}-${i}`} className="flex items-center gap-2 font-mono text-[11px]">
            <span className="text-ops-dim">[{e.time}]</span>
            <span className={cn("rounded-sm border px-1.5 py-px", TONE_CLS[e.tone])}>
              {e.label}
            </span>
            <span className="text-ops-text">{e.detail}</span>
          </div>
        ))}
        <span className="pointer-events-none absolute start-[45%] z-10 h-full w-20 bg-gradient-to-r from-transparent to-ops-bg/80" />
      </div>
    </div>
  );
}