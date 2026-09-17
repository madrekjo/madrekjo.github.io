import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Ghost,
  GraduationCap,
  Heart,
  Instagram,
  MessageCircle,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { Line } from "@/lib/api";
import { CAT_META, GRADS } from "@/lib/colors";

const btn =
  "flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-card px-4 py-3 text-[11px] font-medium text-ink-soft transition hover:border-gold-deep hover:text-gold-deep disabled:opacity-50";

export default function ShareSheet({
  line,
  liked,
  starred,
  busyAction,
  canDelete = false,
  onClose,
  onLike,
  onStar,
  onWhatsApp,
  onInstagram,
  onSnap,
  onDownload,
  onCopy,
  onDelete,
}: {
  line: Line | null;
  liked: boolean;
  starred: boolean;
  busyAction: string;
  canDelete?: boolean;
  onClose: () => void;
  onLike: (l: Line) => void;
  onStar: (l: Line) => void;
  onWhatsApp: (l: Line) => void;
  onInstagram: (l: Line) => void;
  onSnap: (l: Line) => void;
  onDownload: (l: Line) => void;
  onCopy: (l: Line) => void;
  onDelete?: (l: Line) => void;
}) {
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const body = document.body;
    if (line) body.style.overflow = "hidden";
    else body.style.overflow = "";
    return () => {
      body.style.overflow = "";
    };
  }, [line]);

  if (!line) return null;

  const copy = async () => {
    setCopied("");
    await onCopy(line);
    setCopied("c");
  };

  const grad = GRADS[(line.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) || 0) % GRADS.length];
  const cat = CAT_META[line.category] ?? { icon: "📖", chip: "bg-white/20 text-white" };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-line bg-paper p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-xl font-bold text-ink">بطاقة البطاقة 🃏</h3>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="grid size-9 place-items-center rounded-full border border-line text-ink-soft transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className={
            "relative flex aspect-[4/3] w-full flex-col justify-between overflow-hidden rounded-2xl p-5 text-white shadow-lg sm:p-6 " +
            grad
          }
        >
          <div className="flex items-center justify-between text-xs">
            <span
              className={
                "rounded-full border px-2.5 py-0.5 font-bold " + cat.chip
              }
            >
              {cat.icon} {line.category}
            </span>
            <span className="font-serif text-2xl opacity-80">❝</span>
          </div>
          <p
            className={
              "line-clamp-6 font-serif leading-relaxed font-bold drop-shadow-sm " +
              (line.category === "شعر"
                ? "text-3xl sm:text-[2rem]"
                : "text-2xl sm:text-[1.7rem]")
            }
          >
            {line.text}
          </p>
          <div>
            <div className="flex items-center justify-between text-xs opacity-90">
              <span>{line.book}</span>
              <span className="font-bold">{line.author}</span>
            </div>
            <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-[11px] backdrop-blur-sm">
              <GraduationCap size={13} />
              <span className="font-bold">{line.submitter}</span>
              <span className="opacity-75">· من بطاقات بين السطور</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-2 text-center">
          <button
            onClick={() => onLike(line)}
            aria-pressed={liked}
            className={
              "flex flex-col items-center gap-1 rounded-2xl border bg-card px-1 py-3 text-[11px] transition " +
              (liked
                ? "border-rose-300 text-rose-500"
                : "border-line text-ink-soft")
            }
          >
            <Heart className={liked ? "fill-rose-500" : ""} size={19} />
            <span>{line.likes}</span>
          </button>
          <button
            onClick={() => onStar(line)}
            aria-pressed={starred}
            className={
              "flex flex-col items-center gap-1 rounded-2xl border bg-card px-1 py-3 text-[11px] transition " +
              (starred
                ? "border-amber-400 text-gold-deep"
                : "border-line text-ink-soft")
            }
          >
            <Star className={starred ? "fill-gold" : ""} size={19} />
            <span>{line.stars}</span>
          </button>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-2">
          <button onClick={() => void onWhatsApp(line)} className={btn}>
            <MessageCircle size={18} className="text-emerald-500" />
            واتساب
          </button>
          <button
            onClick={() => void onInstagram(line)}
            disabled={busyAction !== ""}
            className={btn}
          >
            <Instagram size={18} className="text-rose-500" />
            {busyAction === "instagram" ? "جارٍ..." : "ستوري انستا"}
          </button>
          <button
            onClick={() => void onSnap(line)}
            disabled={busyAction !== ""}
            className={btn}
          >
            <Ghost size={18} className="text-amber-500" />
            {busyAction === "snapchat" ? "جارٍ..." : "سناب"}
          </button>
          <button
            onClick={() => void onDownload(line)}
            disabled={busyAction !== ""}
            className={btn}
          >
            <Download size={18} className="text-sky-500" />
            {busyAction === "image" ? "تحضير..." : "نزّل"}
          </button>
          <button onClick={() => void copy()} className={btn}>
            {copied ? (
              <Check size={18} className="text-emerald-500" />
            ) : (
              <Copy size={18} />
            )}
            {copied ? "نُسخ" : "انسخ"}
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] leading-5 text-ink-soft">
          شاركها على سوشيال ميديا وخلي غيرك يعيش السطر — كل حب ونجمة ترفع صاحبها
        </p>

        {canDelete && onDelete && (
          <button
            onClick={() => onDelete(line)}
            disabled={busyAction !== ""}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-rose-300 px-4 py-2.5 text-sm font-bold text-rose-600 transition hover:bg-rose-500 hover:text-white disabled:opacity-50"
          >
            <Trash2 size={16} />
            حذف البطاقة نهائياً
          </button>
        )}
      </div>
    </div>
  );
}