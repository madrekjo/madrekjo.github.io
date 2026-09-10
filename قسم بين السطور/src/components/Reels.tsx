import { useEffect, useRef, useState } from "react";
import { Bookmark, ChevronDown, ChevronUp, Heart, Share2, Star, X } from "lucide-react";
import type { ReelRow } from "@/lib/api";
import Avatar from "./Avatar";

const GRADS = [
  "reel-grad-1",
  "reel-grad-2",
  "reel-grad-3",
  "reel-grad-4",
  "reel-grad-5",
];

function gradOf(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GRADS[h % GRADS.length];
}

export default function Reels({
  rows,
  likedIds,
  starredIds,
  savedIds,
  busyAction,
  focusId,
  onToggleLike,
  onToggleStar,
  onToggleSave,
  onOpenOwner,
  onShare,
  onClose,
  onView,
}: {
  rows: ReelRow[];
  likedIds: string[];
  starredIds: string[];
  savedIds: string[];
  busyAction: string;
  focusId: string;
  onToggleLike: (id: string) => void;
  onToggleStar: (id: string) => void;
  onToggleSave: (id: string) => void;
  onOpenOwner: (row: ReelRow) => void;
  onShare: (row: ReelRow) => void;
  onClose: () => void;
  onView: (row: ReelRow) => void;
}) {
  const initial = Math.max(
    0,
    rows.findIndex((r) => r.line_id === focusId)
  );
  const [idx, setIdx] = useState(initial);
  const touchY = useRef<number | null>(null);

  const go = (d: number) => {
    setIdx((p) => Math.min(rows.length - 1, Math.max(0, p + d)));
  };

  const flipLock = useRef(false);
  const flipTimer = useRef<number | null>(null);
  const flip = (d: number) => {
    if (flipLock.current) return;
    flipLock.current = true;
    go(d);
    if (flipTimer.current) window.clearTimeout(flipTimer.current);
    flipTimer.current = window.setTimeout(
      () => (flipLock.current = false),
      650
    );
  };

  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) < 12) return;
    flip(e.deltaY > 0 ? 1 : -1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        flip(-1);
      } else if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        flip(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  useEffect(() => {
    return () => {
      if (flipTimer.current) window.clearTimeout(flipTimer.current);
    };
  }, []);

  useEffect(() => {
    const row = rows[idx];
    if (row) onView(row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchY.current == null) return;
    const dy = (e.changedTouches[0]?.clientY ?? 0) - touchY.current;
    touchY.current = null;
    if (dy < -55) go(1);
    else if (dy > 55) go(-1);
  };

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-4xl">🎞️</p>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          ما في عبارات منشورة بعد — كل بطاقة على الجدار بتحول ريلز
        </p>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-ink"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
    >
      <div className="relative flex h-full flex-1 overflow-hidden">
        {rows.map((r, i) => {
          const off = i - idx;
          const style: React.CSSProperties = {
            transform: `translateY(${off * 100}%)`,
            opacity: Math.abs(off) > 1 ? 0 : 1,
            pointerEvents: off === 0 ? "auto" : "none",
          };
          return (
            <div
              key={r.line_id}
              className="reel-page absolute inset-0"
              style={style}
            >
              <div className="relative h-full w-full overflow-hidden">
                <div
                  className={
                    "absolute inset-0 flex flex-col justify-between bg-gradient-to-br p-6 " +
                    gradOf(r.line_id)
                  }
                >
                  <div className="flex items-start justify-between">
                    <span className="rounded-full bg-white/25 px-3 py-1 text-xs font-bold text-white">
                      {r.category}
                    </span>
                    <span className="font-serif text-4xl text-white/70">❝</span>
                  </div>

                  <div className="px-1">
                    <p className="font-serif text-3xl leading-relaxed font-bold text-white drop-shadow-sm">
                      {r.text}
                    </p>
                  </div>

                  <div className="px-1">
                    <p className="truncate text-sm font-bold text-white/90">
                      {r.book}
                      {r.author ? ` — ${r.author}` : ""}
                    </p>
                  </div>
                </div>

                <div className="absolute bottom-6 left-4 flex flex-col items-center gap-4">
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => onToggleLike(r.line_id)}
                      aria-pressed={likedIds.includes(r.line_id)}
                      className="grid size-11 place-items-center rounded-full bg-ink/35 text-white backdrop-blur-sm transition hover:bg-ink/60"
                    >
                      <Heart
                        size={20}
                        className={
                          likedIds.includes(r.line_id) ? "fill-rose-500 text-rose-500" : ""
                        }
                      />
                    </button>
                    <span className="text-xs font-bold text-white">
                      {r.likes}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => onToggleStar(r.line_id)}
                      aria-pressed={starredIds.includes(r.line_id)}
                      className="grid size-11 place-items-center rounded-full bg-white/25 text-white backdrop-blur-sm transition hover:bg-white/45"
                    >
                      <Star
                        size={20}
                        className={
                          starredIds.includes(r.line_id)
                            ? "fill-amber-300 text-amber-300"
                            : "text-amber-200"
                        }
                      />
                    </button>
                    <span className="text-xs font-bold text-white">
                      {r.stars}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => onToggleSave(r.line_id)}
                      aria-pressed={savedIds.includes(r.line_id)}
                      className="grid size-11 place-items-center rounded-full bg-ink/35 text-white backdrop-blur-sm transition hover:bg-ink/60"
                    >
                      <Bookmark
                        size={19}
                        className={
                          savedIds.includes(r.line_id) ? "fill-white" : ""
                        }
                      />
                    </button>
                    <span className="text-[11px] font-bold text-white/90">
                      حفظ
                    </span>
                  </div>
                  <button
                    onClick={() => onShare(r)}
                    disabled={busyAction !== ""}
                    className="grid size-11 place-items-center rounded-full bg-ink/35 text-white backdrop-blur-sm transition hover:bg-ink/60 disabled:opacity-50"
                  >
                    <Share2 size={19} />
                  </button>
                  <div className="flex flex-col items-center gap-1">
                    {r.user_id ? (
                      <button
                        onClick={() => onOpenOwner(r)}
                        aria-label={`زيارة صاحب البطاقة: ${r.username ?? r.submitter}`}
                        title="زيارة صاحب البطاقة"
                        className="grid size-11 place-items-center rounded-full bg-ink/35 text-white backdrop-blur-sm transition hover:bg-ink/60"
                      >
                        <Avatar
                          name={r.username ?? r.submitter}
                          className="size-9 text-xs"
                        />
                      </button>
                    ) : (
                      <span className="grid size-11 place-items-center rounded-full bg-ink/35 text-white">
                        <Avatar
                          name={r.username ?? r.submitter}
                          className="size-9 text-xs"
                        />
                      </span>
                    )}
                    <span className="w-20 truncate text-center text-[11px] font-bold text-white/90">
                      {r.username ?? r.submitter}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex items-center justify-between px-4">
        <button
          onClick={onClose}
          aria-label="رجوع للبروفايل"
          className="pointer-events-auto grid size-10 place-items-center rounded-full bg-ink/40 text-white backdrop-blur-sm transition hover:bg-ink/60"
        >
          <X size={20} />
        </button>
        <span className="rounded-full bg-ink/40 px-4 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
          عبارات
        </span>
        <span className="rounded-full bg-ink/40 px-3 py-1.5 text-xs font-bold text-white/90 backdrop-blur-sm">
          {idx + 1}/{rows.length}
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-5 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => go(-1)}
          disabled={idx === 0}
          aria-label="السابق"
          className="pointer-events-auto grid size-10 place-items-center rounded-full bg-ink/40 text-white backdrop-blur-sm transition hover:bg-ink/60 disabled:opacity-40"
        >
          <ChevronUp size={18} />
        </button>
        <button
          onClick={() => go(1)}
          disabled={idx >= rows.length - 1}
          aria-label="التالي"
          className="pointer-events-auto grid size-10 place-items-center rounded-full bg-ink/40 text-white backdrop-blur-sm transition hover:bg-ink/60 disabled:opacity-40"
        >
          <ChevronDown size={18} />
        </button>
      </div>
    </div>
  );
}