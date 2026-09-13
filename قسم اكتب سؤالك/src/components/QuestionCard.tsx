import {
  Bookmark,
  BookOpen,
  Download,
  Heart,
  MessageCircle,
  RotateCcw,
  Share2,
} from "lucide-react";
import type { AnswerState, OptionKey, Question } from "@/types";
import { OPTION_KEYS } from "@/types";
import Avatar from "./Avatar";

function stateBg(
  answer: AnswerState | null,
  key: OptionKey,
  isCorrectKey: boolean
): string {
  if (!answer) return "bg-ink/5 text-ink";
  if (answer.chosen === key) return answer.correct ? "bg-green-600 text-white" : "bg-red-600 text-white";
  if (isCorrectKey) return "bg-green-600 text-white";
  return "bg-ink/10 text-ink/50";
}

const railBtn =
  "grid size-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/25 active:scale-90";

export default function QuestionCard({
  q,
  answer,
  liked,
  likes,
  saved,
  onAnswer,
  onToggleLike,
  onToggleSave,
  onShare,
  onResetAnswer,
  onOpenAuthor,
  onSaveImage,
  saving,
}: {
  q: Question;
  answer: AnswerState | null;
  liked: boolean;
  likes: number;
  saved: boolean;
  onAnswer: (key: OptionKey) => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onShare: () => void;
  onResetAnswer: () => void;
  onOpenAuthor: (q: Question) => void;
  onSaveImage: (q: Question) => void;
  saving: boolean;
}) {
  const answered = answer !== null;
  const border = answered
    ? answer.correct
      ? "border-green-500 ring-2 ring-green-500/30"
      : "border-red-500 ring-2 ring-red-500/30"
    : "border-gold/40";

  return (
    <div className="relative h-full w-full">
      <div className="flex h-full items-center justify-center gap-3 py-4 pl-20 pr-2 md:pl-24">
        <div
          className={
            "question-card relative flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border-2 bg-card text-ink transition-colors duration-300 " +
            border
          }
          style={{ height: "min(82vh, 650px)" }}
        >
          {/* الهيدر */}
          <div className="flex shrink-0 items-start justify-between gap-2 border-b border-line/70 px-5 pb-3 pt-4">
            <div>
              <div className="font-serif text-xl font-bold text-ink">
                اكتب سؤالك
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-gold-deep">
                🎓 مدارك جو
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[10px] font-bold text-gold-deep">
                {q.field} · {q.subject}
              </span>
              {q.grade && (
                <span className="text-[11px] font-medium text-ink-soft">
                  صف {q.grade}
                </span>
              )}
            </div>
          </div>

          {/* المحتوى القابل للتمرير: السؤال + الصورة + الآية */}
          <div className="card-scrub min-h-0 flex-1 overflow-y-auto px-5 pb-1 pt-4">
            <p className="break-words font-serif text-[1.25rem] font-bold leading-relaxed md:text-[1.5rem]">
              {q.question}
            </p>

            {q.image && (
              <img
                src={q.image}
                alt="صورة السؤال"
                className="mx-auto mt-3 block h-auto max-h-44 w-auto max-w-full rounded-2xl border border-line bg-white object-contain"
              />
            )}

            {q.ayah && (
              <div className="ayah-box ornament relative mt-3 rounded-xl border border-gold/50 px-4 py-2.5 text-center">
                <p className="font-serif text-base leading-loose text-ink md:text-lg">
                  {q.ayah.text}
                </p>
                <p className="mt-0.5 text-xs font-bold text-gold-deep">
                  {q.ayah.ref}
                </p>
              </div>
            )}
          </div>

          {/* منطقة الإجابة الثابتة: النتيجة + الخيارات (دائماً ظاهرة) */}
          <div className="shrink-0 px-4 pb-2 pt-2">
            {answered && (
              <div
                className={
                  "pop-in mb-2 flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-xs font-extrabold " +
                  (answer.correct
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800")
                }
              >
                <span>
                  {answer.correct
                    ? "✓ إجابتك صحيحة"
                    : `✕ إجابتك خاطئة — الصحيح: ${q.correct}`}
                </span>
                <button
                  onClick={onResetAnswer}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-bold text-ink transition hover:bg-white"
                >
                  <RotateCcw size={12} /> إعادة الحل
                </button>
              </div>
            )}

            <div
              className={
                "grid grid-cols-2 gap-2 " +
                (answered ? "pointer-events-none" : "")
              }
            >
              {q.options.map((opt) => {
                const isCorrectKey = opt.key === q.correct;
                const cls = !answered
                  ? "border-line bg-white/60 text-ink hover:border-gold-deep hover:bg-gold/10 active:scale-[0.98]"
                  : answer.correct
                    ? opt.key === answer.chosen
                      ? "border-green-500 bg-green-50/70 text-green-900"
                      : "border-line/60 bg-white/40 text-ink/40"
                    : opt.key === answer.chosen
                      ? "border-red-500 bg-red-50 text-red-900"
                      : isCorrectKey
                        ? "border-green-500 bg-green-50/70 text-green-900"
                        : "border-line/60 bg-white/40 text-ink/40";
                return (
                  <button
                    key={opt.key}
                    onClick={() => onAnswer(opt.key)}
                    className={
                      "option-btn flex min-h-11 items-center gap-1.5 rounded-lg border px-2 py-2 text-right text-xs font-bold transition sm:px-2.5 sm:text-xs " +
                      cls
                    }
                  >
                    <span
                      className={
                        "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold " +
                        stateBg(answer, opt.key, isCorrectKey)
                      }
                    >
                      {opt.key}
                    </span>
                    <span className="flex-1 leading-snug">{opt.text}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* الفوتر */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-5 py-2.5">
            <button
              onClick={() => onOpenAuthor(q)}
              className="flex min-w-0 items-center gap-2 rounded-lg transition hover:opacity-80"
              title="صفحة صاحب السؤال"
            >
              <Avatar name={q.author} className="size-8 text-xs" />
              <span className="truncate text-sm font-bold text-ink">
                {q.author}
              </span>
            </button>
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-ink-soft">
              <MessageCircle size={14} className="text-gold-deep" />
              {q.reactions}
              <span className="mx-1 inline-block h-3 w-px bg-line" />
              <button
                onClick={onToggleLike}
                aria-label="لايك"
                className="flex items-center gap-1 rounded-full transition hover:scale-110"
              >
                <Heart
                  size={15}
                  className={
                    liked ? "fill-red-500 text-red-500" : "text-ink-soft"
                  }
                />
                {likes}
              </button>
              <button
                onClick={onToggleSave}
                aria-label="حفظ السؤال"
                title="احفظ السؤال"
                className="rounded-full transition hover:scale-110"
              >
                <Bookmark
                  size={15}
                  className={
                    saved
                      ? "fill-gold-deep text-gold-deep"
                      : "text-ink-soft"
                  }
                />
              </button>
              <button
                onClick={onShare}
                aria-label="مشاركة السؤال"
                title="شارك السؤال"
                className="flex items-center gap-1 rounded-full transition hover:scale-110 hover:text-gold-deep"
              >
                <Share2 size={14} />
                مشاركة
              </button>
            </span>
          </div>
        </div>
      </div>

      {/* عمود الإجابة الجانبي */}
      <div className="absolute bottom-10 left-3 flex flex-col items-center gap-1.5">
        {OPTION_KEYS.map((k) => {
          const chosen = answer?.chosen === k;
          const isRight = k === q.correct;
          const btnCls = !answered
            ? "bg-white/10 text-white hover:bg-gold/80 hover:text-ink active:scale-95"
            : chosen && answer!.correct
              ? "bg-green-500 text-white"
              : chosen && !answer!.correct
                ? "bg-red-500 text-white"
                : isRight
                  ? "bg-green-500 text-white"
                  : "bg-white/10 text-white/40 opacity-60";
          return (
            <button
              key={k}
              onClick={() => onAnswer(k)}
              disabled={answered}
              aria-label={`الجواب ${k}`}
              className={
                "grid size-10 place-items-center rounded-full text-lg font-extrabold shadow-lg backdrop-blur-sm transition disabled:cursor-default " +
                btnCls
              }
            >
              {k}
            </button>
          );
        })}

        <span className="my-0.5 h-px w-6 bg-white/20" />

        <button
          onClick={onToggleLike}
          aria-label="لايك"
          title="لايك"
          className="flex flex-col items-center gap-0.5"
        >
          <span
            className={
              "grid size-10 place-items-center rounded-full backdrop-blur-sm transition active:scale-90 " +
              (liked
                ? "bg-red-500 text-white"
                : "bg-white/10 text-white hover:bg-white/25")
            }
          >
            <Heart size={19} className={liked ? "fill-current" : ""} />
          </span>
          <span className="min-w-6 text-center text-[10px] font-bold text-white/90">
            {likes}
          </span>
        </button>

        <button
          onClick={onToggleSave}
          aria-label="حفظ السؤال"
          title="احفظ السؤال"
          className={
            "grid size-10 place-items-center rounded-full backdrop-blur-sm transition active:scale-90 " +
            (saved ? "bg-gold text-ink" : railBtn)
          }
        >
          <Bookmark size={19} className={saved ? "fill-current" : ""} />
        </button>

        <span className="my-0.5 h-px w-6 bg-white/20" />

        <button
          onClick={onShare}
          aria-label="مشاركة"
          title="شارك السؤال"
          className={railBtn + " hover:bg-gold/80 hover:text-ink"}
        >
          <Share2 size={18} />
        </button>

        <button
          onClick={() => onSaveImage(q)}
          disabled={saving}
          aria-label="حفظ كصورة"
          title="حمّل بطاقة السؤال كصورة"
          className={railBtn + " disabled:opacity-50"}
        >
          <Download size={19} />
        </button>

        {answered && (
          <button
            onClick={onResetAnswer}
            aria-label="إعادة الحل"
            title="إعادة الحل"
            className={railBtn + " hover:bg-gold/80 hover:text-ink"}
          >
            <RotateCcw size={18} />
          </button>
        )}

        <span className="my-0.5 h-px w-6 bg-white/20" />

        <button
          onClick={() => onOpenAuthor(q)}
          aria-label="صفحة صاحب السؤال"
          className="flex flex-col items-center gap-0.5 transition active:scale-95"
          title={q.author}
        >
          <Avatar
            name={q.author}
            className="size-10 text-sm ring-2 ring-gold/80"
          />
          <span className="w-14 truncate text-center text-[9px] font-bold text-white/90">
            {q.author}
          </span>
        </button>

        <span className="mt-1 flex items-center gap-1 text-[9px] font-bold text-white/50">
          <BookOpen size={11} /> أجب ثم اسحب
        </span>
      </div>
    </div>
  );
}