import { GraduationCap, Heart, MessageCircle, Play, X } from "lucide-react";
import type { Question } from "@/types";
import Avatar from "./Avatar";

export default function PublisherProfile({
  questions,
  likesOf,
  likedOf,
  currentUserName,
  onClose,
  onSeeQuestions,
  onOpenQuestion,
}: {
  questions: Question[];
  likesOf: (q: Question) => number;
  likedOf: (q: Question) => boolean;
  currentUserName: string;
  onClose: () => void;
  onSeeQuestions: () => void;
  onOpenQuestion: (q: Question) => void;
}) {
  const q = questions[0];
  if (!q) return null;
  const totalLikes = questions.reduce((s, x) => s + likesOf(x), 0);
  const totalLiked = questions.filter(likedOf).length;
  const totalReactions = questions.reduce((s, x) => s + x.reactions, 0);
  const totalAnswers = questions.reduce((s, x) => s + x.answersCount, 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      {/* رأس الصفحة */}
      <div className="flex shrink-0 items-center justify-between border-b border-line/70 bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-extrabold text-ink">
          <GraduationCap size={17} className="text-gold-deep" />
          صفحة الناشر
        </div>
        <button
          onClick={onClose}
          aria-label="رجوع"
          className="grid size-9 place-items-center rounded-full border border-line text-ink-soft transition hover:border-gold-deep hover:text-gold-deep"
        >
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-md px-4 py-6">
          {/* البطاقة التعريفية */}
          <div className="flex items-center gap-4">
            <Avatar name={q.author} className="size-20 text-3xl ring-2 ring-gold/70" />
            <div className="min-w-0">
              <h3 className="truncate text-xl font-extrabold text-ink">
                {q.author}
              </h3>
              <p className="mt-1 flex items-center gap-1 text-xs font-bold text-gold-deep">
                <GraduationCap size={13} />
                حقل {q.field}
                {q.grade ? ` · صف ${q.grade}` : ""}
              </p>
              <p className="mt-1 text-[11px] font-medium text-ink-soft">
                {q.author === currentUserName
                  ? "هذا أنت 👋"
                  : "ناشر أسئلة في مدارك جو"}
              </p>
            </div>
          </div>

          {/* الإحصاءات */}
          <div className="mt-5 grid grid-cols-4 gap-2">
            <div className="rounded-2xl border border-line bg-white/60 px-2 py-3 text-center">
              <div className="text-lg font-extrabold text-ink">{questions.length}</div>
              <div className="text-[10px] font-bold text-ink-soft">سؤال</div>
            </div>
            <div className="rounded-2xl border border-line bg-white/60 px-2 py-3 text-center">
              <div className="text-lg font-extrabold text-red-500">
                {totalLikes}
                {totalLiked > 0 && (
                  <span className="mr-1 text-[9px] text-red-400">+{totalLiked}</span>
                )}
              </div>
              <div className="flex items-center justify-center gap-0.5 text-[10px] font-bold text-ink-soft">
                <Heart size={10} className="fill-red-400 text-red-400" /> لايك
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-white/60 px-2 py-3 text-center">
              <div className="text-lg font-extrabold text-gold-deep">{totalReactions}</div>
              <div className="text-[10px] font-bold text-ink-soft">تفاعل</div>
            </div>
            <div className="rounded-2xl border border-line bg-white/60 px-2 py-3 text-center">
              <div className="text-lg font-extrabold text-ink">{totalAnswers}</div>
              <div className="text-[10px] font-bold text-ink-soft">إجابة</div>
            </div>
          </div>

          <button
            onClick={onSeeQuestions}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3 text-sm font-bold text-paper transition hover:bg-gold-deep hover:text-white"
          >
            <Play size={16} />
            تصفّح أسئلته في الريلز
          </button>

          {/* شبكة الأسئلة */}
          <div className="mt-6 flex items-center justify-between">
            <h4 className="text-sm font-extrabold text-ink">
              أسئلة {q.author}
            </h4>
            <span className="text-[11px] font-bold text-ink-soft">
              {questions.length} بطاقة
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            {questions.map((item) => (
              <button
                key={item.id}
                onClick={() => onOpenQuestion(item)}
                className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-card text-right shadow-sm transition hover:border-gold-deep hover:shadow-md"
              >
                <div className="flex h-24 w-full items-center justify-center overflow-hidden border-b border-line/60 bg-ink/5 p-2">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt=""
                      className="h-full w-full rounded-lg object-cover"
                    />
                  ) : (
                    <span className="font-serif text-2xl font-bold text-gold-deep">
                      ؟
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-2.5">
                  <p className="line-clamp-3 text-[11px] font-bold leading-snug text-ink">
                    {item.question}
                  </p>
                  <div className="mt-auto flex items-center gap-2 pt-2 text-[10px] font-bold text-ink-soft">
                    <span className="flex items-center gap-0.5 text-red-500">
                      <Heart
                        size={10}
                        className={likedOf(item) ? "fill-red-500" : ""}
                      />
                      {likesOf(item)}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <MessageCircle size={10} className="text-gold-deep" />
                      {item.reactions}
                    </span>
                    <span className="mr-auto rounded-full bg-gold/15 px-1.5 py-0.5 text-[9px] text-gold-deep">
                      {item.subject}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}