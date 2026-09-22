import { useEffect, useRef, useState } from "react";
import { Bookmark, ChevronDown, ChevronUp, Heart, MoreVertical, Palette, Share2, Star, X } from "lucide-react";
import type { ReelRow } from "@/lib/api";
import Avatar from "./Avatar";
import { CAT_META, GRADS } from "@/lib/colors";

const GRAD_KEY = "sutur_reel_grad";

function readGrads(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(GRAD_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveGrad(id: string, g: string): void {
  try {
    const s = readGrads();
    s[id] = g;
    localStorage.setItem(GRAD_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
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
  const [manualGrads, setManualGrads] = useState<Record<string, string>>(
    readGrads
  );
  const [moreFor, setMoreFor] = useState<string | null>(null);
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
          const grad = manualGrads[r.line_id] ?? r.color ?? "";
          const beige = grad === "";
          const isMore = moreFor === r.line_id;
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
              <div className="relative h-full w-full">
                <div className="flex h-full items-center justify-center gap-4 py-4 pl-20 pr-4">
                  <div
                    className={
                      "relative flex w-full max-w-lg flex-col justify-between overflow-hidden rounded-3xl p-5 shadow-2xl " +
                      (beige
                        ? "border border-line bg-card text-ink"
                        : "text-white " + grad)
                    }
                    style={{ height: "min(78vh, 560px)" }}
                  >
                    <div className="flex items-start justify-between">
                      <span
                        className={
                          "rounded-full border px-3 py-1 text-xs font-bold " +
                          (beige
                            ? "border-line bg-card text-ink-soft"
                            : "border-white/30 bg-white/15 text-white")
                        }
                      >
                        {CAT_META[r.category]?.icon ?? "📖"} {r.category}
                      </span>
                      <span
                        className={
                          "font-serif text-3xl " +
                          (beige ? "text-gold-deep/80" : "text-white/70")
                        }
                      >
                        ❝
                      </span>
                    </div>

                    <div className="px-1">
                      <p
                        className={
                          "break-words font-serif text-2xl font-bold leading-relaxed drop-shadow-sm md:text-[1.7rem] " +
                          (beige ? "text-ink" : "text-white")
                        }
                      >
                        {r.text}
                      </p>
                    </div>

                    <div>
                      <p
                        className={
                          "truncate text-sm font-bold " +
                          (beige ? "text-ink-soft" : "text-white/90")
                        }
                      >
                        {r.book}
                        {r.author ? ` — ${r.author}` : ""}
                      </p>
                      <div
                        className={
                          "mt-2 flex items-center justify-center gap-1.5 border-t pt-2 text-xs font-bold " +
                          (beige
                            ? "border-gold/30 text-gold-deep"
                            : "border-white/25 text-white/90")
                        }
                      >
                        🎓 مدارك جو · بين السطور
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-6 left-4 flex flex-col items-center gap-4">
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
                  <div className="relative flex flex-col items-center gap-1">
                    <button
                      onClick={() => setMoreFor(isMore ? null : r.line_id)}
                      aria-label="خيارات أكثر"
                      aria-pressed={isMore}
                      className="grid size-11 place-items-center rounded-full bg-ink/35 text-white backdrop-blur-sm transition hover:bg-ink/60"
                    >
                      <MoreVertical size={21} />
                    </button>
                    <span className="text-[11px] font-bold text-white/90">
                      تفاعل
                    </span>
                    {isMore && (
                      <div className="absolute bottom-full left-0 z-20 mb-3 w-52 rounded-2xl border border-white/15 bg-[#241b12]/95 p-2 text-white shadow-xl backdrop-blur-sm">
                        <button
                          onClick={() => onToggleLike(r.line_id)}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-white/10"
                        >
                          <span className="flex items-center gap-2.5">
                            <Heart
                              size={17}
                              className={
                                likedIds.includes(r.line_id)
                                  ? "fill-rose-500 text-rose-500"
                                  : "text-white/80"
                              }
                            />
                            إعجاب
                          </span>
                          <span
                            className={
                              "rounded-full px-2 py-0.5 text-xs font-bold " +
                              (likedIds.includes(r.line_id)
                                ? "bg-rose-500/20 text-rose-300"
                                : "bg-white/10 text-white/70")
                            }
                          >
                            {r.likes}
                          </span>
                        </button>
                        <button
                          onClick={() => onToggleStar(r.line_id)}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-white/10"
                        >
                          <span className="flex items-center gap-2.5">
                            <Star
                              size={17}
                              className={
                                starredIds.includes(r.line_id)
                                  ? "fill-amber-300 text-amber-300"
                                  : "text-amber-200/80"
                              }
                            />
                            نجمة
                          </span>
                          <span
                            className={
                              "rounded-full px-2 py-0.5 text-xs font-bold " +
                              (starredIds.includes(r.line_id)
                                ? "bg-amber-400/20 text-amber-200"
                                : "bg-white/10 text-white/70")
                            }
                          >
                            {r.stars}
                          </span>
                        </button>
                        <button
                          onClick={() => onToggleSave(r.line_id)}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-white/10"
                        >
                          <span className="flex items-center gap-2.5">
                            <Bookmark
                              size={17}
                              className={
                                savedIds.includes(r.line_id)
                                  ? "fill-white text-white"
                                  : "text-white/80"
                              }
                            />
                            حفظ
                          </span>
                          <span
                            className={
                              "rounded-full px-2 py-0.5 text-[11px] font-bold " +
                              (savedIds.includes(r.line_id)
                                ? "bg-white/20 text-white"
                                : "bg-white/10 text-white/60")
                            }
                          >
                            {savedIds.includes(r.line_id) ? "محفوظة" : ""}
                          </span>
                        </button>
                        <button
                          onClick={() => onShare(r)}
                          disabled={busyAction !== ""}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-white/10 disabled:opacity-50"
                        >
                          <Share2 size={17} className="text-white/80" />
                          مشاركة
                        </button>
                        <div className="my-1 h-px bg-white/15" />
                        <div className="px-3 py-2">
                          <p className="mb-2 flex items-center gap-1.5 text-[11px] text-white/70">
                            <Palette size={13} />
                            لون البطاقة
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              onClick={() => {
                                setManualGrads((p) => ({
                                  ...p,
                                  [r.line_id]: "",
                                }));
                                saveGrad(r.line_id, "");
                                setMoreFor(null);
                              }}
                              aria-label="بيج (افتراضي)"
                              title="بيج (افتراضي)"
                              className={
                                "size-7 rounded-full border border-white/30 transition hover:scale-110 " +
                                (beige ? " ring-2 ring-white" : "")
                              }
                              style={{ backgroundColor: "var(--color-card)" }}
                            />
                            {GRADS.map((g) => (
                              <button
                                key={g}
                                onClick={() => {
                                  setManualGrads((p) => ({
                                    ...p,
                                    [r.line_id]: g,
                                  }));
                                  saveGrad(r.line_id, g);
                                  setMoreFor(null);
                                }}
                                aria-label={g}
                                className={
                                  "size-7 rounded-full transition hover:scale-110 " +
                                  g +
                                  (grad === g ? " ring-2 ring-white" : "")
                                }
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
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
        <span className="w-10" />
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