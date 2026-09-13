import { useEffect, useRef, useState } from "react";
import { Bookmark, ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import type { AnswerState, OptionKey, Question } from "@/types";
import QuestionCard from "./QuestionCard";

export default function QuestionReels({
  questions,
  answers,
  likedIds,
  likeCounts,
  savedIds,
  savedOnly,
  focusId,
  scopeLabel,
  onAnswer,
  onToggleLike,
  onToggleSave,
  onShare,
  onResetAnswer,
  onToggleSavedView,
  onBack,
  onOpenAuthor,
  onSaveImage,
  onOpenCreate,
  savingId,
}: {
  questions: Question[];
  answers: Record<string, AnswerState>;
  likedIds: Record<string, boolean>;
  likeCounts: Record<string, number>;
  savedIds: Record<string, boolean>;
  savedOnly: boolean;
  focusId?: string;
  scopeLabel: string;
  onAnswer: (q: Question, key: OptionKey) => void;
  onToggleLike: (q: Question) => void;
  onToggleSave: (q: Question) => void;
  onShare: (q: Question) => void;
  onResetAnswer: (q: Question) => void;
  onToggleSavedView: () => void;
  onBack: () => void;
  onOpenAuthor: (q: Question) => void;
  onSaveImage: (q: Question) => void;
  onOpenCreate: () => void;
  savingId: string;
}) {
  const initial = Math.max(
    0,
    questions.findIndex((q) => q.id === focusId)
  );
  const [idx, setIdx] = useState(initial);
  const touchY = useRef<number | null>(null);
  const flipLock = useRef(false);
  const flipTimer = useRef<number | null>(null);

  const go = (d: number) => {
    setIdx((p) => Math.min(questions.length - 1, Math.max(0, p + d)));
  };

  const flip = (d: number) => {
    if (flipLock.current) return;
    flipLock.current = true;
    go(d);
    if (flipTimer.current) window.clearTimeout(flipTimer.current);
    flipTimer.current = window.setTimeout(() => (flipLock.current = false), 650);
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
  }, [questions.length]);

  useEffect(() => {
    return () => {
      if (flipTimer.current) window.clearTimeout(flipTimer.current);
    };
  }, []);

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

  if (questions.length === 0) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-ink px-6 text-center text-white">
        <p className="text-4xl">
          {savedOnly ? "🔖" : "✍️"}
        </p>
        <p className="mt-3 text-sm font-medium text-white/80">
          {savedOnly
            ? "ما في أسئلة محفوظة — احفظ الأسئلة بضغط زر العلامة 🔖"
            : "ما في أسئلة بهذا الفلتر — اكتب أول سؤال!"}
        </p>
        {savedOnly && (
          <button
            onClick={onToggleSavedView}
            className="mt-5 flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-gold-deep hover:text-white"
          >
            عرض كل الأسئلة
          </button>
        )}
        <button
          onClick={onOpenCreate}
          className="mt-5 flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-gold-deep hover:text-white"
        >
          <Plus size={18} /> اكتب سؤالك
        </button>
        <button
          onClick={onBack}
          className="mt-3 text-xs font-bold text-white/50 hover:text-white"
        >
          رجوع
        </button>
      </div>
    );
  }

  return (
    <div
      className="reel-backdrop fixed inset-0 z-40 flex h-dvh flex-col"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
    >
      <div className="relative h-full flex-1 overflow-hidden">
        {questions.map((q, i) => {
          const off = i - idx;
          const style: React.CSSProperties = {
            transform: `translateY(${off * 100}%)`,
            opacity: Math.abs(off) > 1 ? 0 : 1,
            pointerEvents: off === 0 ? "auto" : "none",
          };
          const liked = !!likedIds[q.id];
          const likes = likeCounts[q.id] ?? q.likes;
          const saved = !!savedIds[q.id];
          return (
            <div key={q.id} className="reel-page absolute inset-0" style={style}>
              <QuestionCard
                q={q}
                answer={answers[q.id] ?? null}
                liked={liked}
                likes={likes}
                saved={saved}
                onAnswer={(k) => onAnswer(q, k)}
                onToggleLike={() => onToggleLike(q)}
                onToggleSave={() => onToggleSave(q)}
                onShare={() => onShare(q)}
                onResetAnswer={() => onResetAnswer(q)}
                onOpenAuthor={onOpenAuthor}
                onSaveImage={onSaveImage}
                saving={savingId === q.id}
              />
            </div>
          );
        })}
      </div>

      {/* الشريط العلوي */}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex items-center justify-between gap-2 px-3">
        <button
          onClick={onBack}
          aria-label="رجوع"
          className="pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55"
        >
          <X size={20} />
        </button>
        <div className="min-w-0 rounded-full bg-black/35 px-4 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
          اكتب سؤالك
          <span className="mr-2 hidden text-xs font-medium text-white/60 sm:inline">
            · {scopeLabel}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onToggleSavedView}
            aria-label="المحفوظات"
            title="المحفوظات"
            className={
              "pointer-events-auto grid size-9 place-items-center rounded-full backdrop-blur-sm transition " +
              (savedOnly
                ? "bg-gold text-ink"
                : "bg-black/35 text-white hover:bg-black/55")
            }
          >
            <Bookmark size={16} className={savedOnly ? "fill-current" : ""} />
          </button>
          <button
            onClick={onOpenCreate}
            className="pointer-events-auto flex items-center gap-1 rounded-full bg-gold px-3 py-2 text-xs font-bold text-ink shadow-lg transition hover:bg-gold-deep hover:text-white"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">اكتب سؤالك</span>
            <span className="sm:hidden">سؤال</span>
          </button>
          <span className="rounded-full bg-black/35 px-3 py-1.5 text-xs font-bold text-white/90 backdrop-blur-sm">
            {idx + 1}/{questions.length}
          </span>
        </div>
      </div>

      {/* أزرار التنقل على الشاشات الكبيرة */}
      <div className="pointer-events-none absolute bottom-5 right-3 z-10 hidden flex-col gap-2 sm:flex">
        <button
          onClick={() => go(-1)}
          disabled={idx === 0}
          aria-label="السؤال السابق"
          className="pointer-events-auto grid size-11 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55 disabled:opacity-40"
        >
          <ChevronUp size={18} />
        </button>
        <button
          onClick={() => go(1)}
          disabled={idx >= questions.length - 1}
          aria-label="السؤال التالي"
          className="pointer-events-auto grid size-11 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55 disabled:opacity-40"
        >
          <ChevronDown size={18} />
        </button>
      </div>

      {/* تلميح السحب */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/25 px-3 py-1 text-[11px] font-bold text-white/70 backdrop-blur-sm">
        اسحب للأعلى للسؤال التالي ↑
      </div>
    </div>
  );
}