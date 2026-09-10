import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Ghost,
  Heart,
  Instagram,
  Maximize2,
  MessageCircle,
  X,
} from "lucide-react";
import type { Line } from "@/lib/api";

const shareBtn =
  "flex items-center gap-1.5 rounded-full border border-line bg-paper px-3.5 py-2 text-xs font-medium text-ink-soft transition hover:border-gold-deep hover:text-gold-deep disabled:opacity-50";

function ReelCard({
  line,
  liked,
  busyAction,
  onToggle: handleLike,
  onWhatsApp: handleWhatsApp,
  onExpand,
}: {
  line: Line;
  liked: boolean;
  busyAction: string;
  onToggle: (l: Line) => void;
  onWhatsApp: (l: Line) => void;
  onExpand?: (l: Line) => void;
}) {
  return (
    <div
      className={
        "ornament relative flex min-h-96 w-full flex-col justify-between rounded-2xl border border-line bg-card p-5 shadow-[0_14px_30px_-16px_rgba(51,41,29,0.4)] transition " +
        (liked ? "saturate-[.55] opacity-85" : "")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-xs font-medium text-gold-deep">
            {line.category}
          </span>
          {liked && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-600">
              أعجبتك ✓
            </span>
          )}
        </span>
        <span className="font-serif text-lg text-gold-deep">❝</span>
      </div>

      <p className="font-serif text-2xl leading-relaxed text-ink">
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

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            onClick={() => handleLike(line)}
            aria-pressed={liked}
            className={
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition " +
              (liked ? "text-rose-500" : "text-ink-soft hover:text-rose-500")
            }
          >
            <Heart className={liked ? "fill-rose-500" : ""} size={19} />
            <span>{line.likes}</span>
          </button>
          <span className="text-xs text-ink-soft">
            {line.shares} مشاركة · {line.visits} مشاهدات
          </span>
          <button
            onClick={() => handleWhatsApp(line)}
            disabled={busyAction !== ""}
            className="grid size-9 place-items-center rounded-full bg-emerald-500 text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-50"
            aria-label="شارك واتساب"
          >
            <MessageCircle size={17} />
          </button>
          {onExpand && (
            <button
              onClick={() => onExpand(line)}
              disabled={busyAction !== ""}
              className="grid size-9 place-items-center rounded-full border border-gold/50 bg-gold/10 text-gold-deep transition hover:bg-gold hover:text-white disabled:opacity-50"
              aria-label="فتح بطاقة المشاركة"
            >
              <Maximize2 size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReelsFeed({
  lines,
  likedIds,
  busyAction,
  focusId,
  onFocusDone,
  onToggleLike,
  onWhatsApp,
  onShareImage,
  onDownloadImg,
  onCopy,
}: {
  lines: Line[];
  likedIds: string[];
  busyAction: string;
  focusId: string;
  onFocusDone: () => void;
  onToggleLike: (l: Line) => void;
  onWhatsApp: (l: Line) => void;
  onShareImage: (l: Line, platform: "instagram" | "snapchat") => void;
  onDownloadImg: (l: Line) => void;
  onCopy: (l: Line) => void;
}) {
  const [expanded, setExpanded] = useState<Line | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`reel-${focusId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    onFocusDone();
  }, [focusId, onFocusDone]);

  useEffect(() => {
    const body = document.body;
    if (expanded) {
      body.style.overflow = "hidden";
    } else {
      body.style.overflow = "";
    }
    return () => {
      body.style.overflow = "";
    };
  }, [expanded]);

  const copy = async (l: Line) => {
    setCopied("");
    await onCopy(l);
    setCopied(l.id);
  };

  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card p-8 text-center">
        <p className="text-sm leading-6 text-ink-soft">
          ما في سطور بعد في هذا التصنيف — أضف أول سطر من تبويب «الرئيسية»
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {lines.map((l) => (
        <div key={l.id} id={`reel-${l.id}`} className="scroll-mt-24">
          <ReelCard
            line={l}
            liked={likedIds.includes(l.id)}
            busyAction={busyAction}
            onToggle={onToggleLike}
            onWhatsApp={onWhatsApp}
            onExpand={setExpanded}
          />
        </div>
      ))}

      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-paper p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-serif text-xl font-bold text-ink">
                بطاقة المشاركة 🃏
              </h3>
              <button
                onClick={() => setExpanded(null)}
                aria-label="إغلاق"
                className="grid size-9 place-items-center rounded-full border border-line text-ink-soft transition hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <ReelCard
              line={expanded}
              liked={likedIds.includes(expanded.id)}
              busyAction={busyAction}
              onToggle={onToggleLike}
              onWhatsApp={onWhatsApp}
            />

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => void onShareImage(expanded, "instagram")}
                disabled={busyAction !== ""}
                className={shareBtn}
              >
                <Instagram size={16} />
                {busyAction === "instagram" ? "جارٍ..." : "ستوري انستا"}
              </button>
              <button
                onClick={() => void onShareImage(expanded, "snapchat")}
                disabled={busyAction !== ""}
                className={shareBtn}
              >
                <Ghost size={16} />
                {busyAction === "snapchat" ? "جارٍ..." : "سناب"}
              </button>
              <button
                onClick={() => void onDownloadImg(expanded)}
                disabled={busyAction !== ""}
                className={shareBtn}
              >
                <Download size={16} />
                {busyAction === "image" ? "تحضير..." : "نزّل الصورة"}
              </button>
              <button onClick={() => void copy(expanded)} className={shareBtn}>
                {copied === expanded.id ? (
                  <Check size={16} />
                ) : (
                  <Copy size={16} />
                )}
                {copied === expanded.id ? "نُسخ" : "انسخ النص"}
              </button>
            </div>
            <p className="mt-3 text-center text-[11px] leading-5 text-ink-soft">
              بعد النشر ارفع سكرين شوت من «بطاقتي» في تبويب الرئيسية لتثبت
              مشاركتك وتنافس في قمة الأسبوع
            </p>
          </div>
        </div>
      )}
    </div>
  );
}