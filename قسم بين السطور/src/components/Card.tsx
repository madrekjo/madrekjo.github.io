import { GraduationCap, Heart, Share2 } from "lucide-react";
import type { Line } from "@/lib/api";

export default function Card({
  line,
  liked,
  onToggle,
  onShare,
  isToday,
  demo,
}: {
  line: Line;
  liked: boolean;
  onToggle: () => void;
  onShare: () => void;
  isToday: boolean;
  demo?: boolean;
}) {
  return (
    <div className="ornament relative flex min-h-96 w-full flex-col justify-between rounded-2xl border border-line bg-card p-6 shadow-[0_18px_40px_-18px_rgba(51,41,29,0.45)]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span
            className={
              "rounded-full border px-2.5 py-0.5 text-xs font-medium text-gold-deep " +
              "border-gold/40 bg-gold/10"
            }
          >
            {line.category}
          </span>
          {isToday && (
            <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
              ☀️ سطر اليوم
            </span>
          )}
          {demo && (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              معاينة
            </span>
          )}
        </span>
        <span className="font-serif text-lg text-gold-deep">❝</span>
      </div>

      <p className="font-serif text-2xl leading-relaxed text-ink sm:text-[1.7rem]">
        {line.text}
      </p>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2 text-sm">
          <span className="font-medium text-ink-soft">{line.book}</span>
          <span className="text-gold-deep">{line.author}</span>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-paper px-3 py-2 text-xs text-ink-soft">
          <span>كُتبت بواسطة</span>
          <span className="font-bold text-gold-deep">{line.submitter}</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <button
            onClick={onToggle}
            className={
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition " +
              (liked ? "text-rose-500" : "text-ink-soft hover:text-rose-500")
            }
            aria-pressed={liked}
          >
            <Heart className={liked ? "fill-rose-500" : ""} size={19} />
            <span>{line.likes}</span>
          </button>
          <span className="text-xs text-ink-soft">
            {line.shares} مشاركة · {line.visits} مشاهدات
          </span>
          <button
            onClick={onShare}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-ink-soft transition hover:text-gold-deep"
          >
            <Share2 size={17} />
            <span>شارك</span>
          </button>
        </div>
      </div>

      <div className="relative mt-4 flex items-center justify-center gap-1.5 border-t border-line pt-3 text-gold-deep">
        <GraduationCap size={14} className="shrink-0" />
        <span className="font-medium">مدارك جو</span>
        <span className="text-xs text-ink-soft">· بين السطور</span>
      </div>
    </div>
  );
}