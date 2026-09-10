import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { NotebookPage } from "@/lib/api";

export default function NotebookReader({
  open,
  isMine,
  ownerName,
  pages,
  onClose,
  onEdit,
  onDelete,
  onAdd,
}: {
  open: boolean;
  isMine: boolean;
  ownerName: string;
  pages: NotebookPage[];
  onClose: () => void;
  onEdit: (page: NotebookPage) => void;
  onDelete: (page: NotebookPage) => void;
  onAdd: () => void;
}) {
  const [leaf, setLeaf] = useState(0); // 0 = الغلاف
  const [turned, setTurned] = useState<Set<number>>(new Set());
  const busyRef = useRef(false);
  const touchX = useRef<number | null>(null);

  const maxLeaf = pages.length; // 0..length
  const isEnd = turned.size >= maxLeaf;

  useEffect(() => {
    if (open) {
      setLeaf(0);
      setTurned(new Set());
    }
    const body = document.body;
    if (open) body.style.overflow = "hidden";
    else body.style.overflow = "";
    return () => {
      body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const wait = () =>
    new Promise<void>((res) => {
      window.setTimeout(res, 720);
    });

  const next = async () => {
    if (busyRef.current) return;
    if (turned.size >= maxLeaf) {
      setTurned(new Set());
      setLeaf(0);
      return;
    }
    busyRef.current = true;
    setTurned((t) => new Set(t).add(leaf));
    setLeaf((l) => l + 1);
    await wait();
    busyRef.current = false;
  };

  const prev = async () => {
    if (busyRef.current) return;
    if (leaf === 0) return;
    busyRef.current = true;
    setTurned((t) => {
      const n = new Set(t);
      n.delete(leaf - 1);
      return n;
    });
    setLeaf((l) => l - 1);
    await wait();
    busyRef.current = false;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
    touchX.current = null;
    if (dx < -45) void next();
    else if (dx > 45) void prev();
  };

  const leafContent = (i: number) => {
    if (i === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-[#33291d] to-[#1c150c] p-6 text-center text-paper">
          <BookOpen size={34} className="text-gold" />
          <p className="mt-3 font-serif text-3xl font-bold">دُفتر</p>
          <p className="mt-1 max-w-[13rem] truncate text-lg text-gold">
            {ownerName}
          </p>
          <p className="mt-6 text-[11px] opacity-70">
            {pages.length} {pages.length === 1 ? "صفحة" : "صفحات"} · بين السطور
          </p>
        </div>
      );
    }
    const page = pages[i - 1];
    if (!page) return null;
    return (
      <div className="notebook-lined flex h-full flex-col p-5 pt-7">
        <span className="pointer-events-none absolute top-3 left-4 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold-deep">
          {i}
        </span>
        <div className="overflow-y-auto no-scrollbar font-serif text-xl leading-[35px] text-[#3c3122]">
          {page.content}
        </div>
      </div>
    );
  };

  const leaves = Array.from({ length: maxLeaf + 1 }, (_, i) => i);

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#e9e0cb] p-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-serif text-2xl font-bold text-ink">
            <BookOpen size={20} className="text-gold-deep" />
            دُفتر {ownerName}
          </h2>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="grid size-9 place-items-center rounded-full border border-line bg-card text-ink-soft transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {leaves.length === 1 && (
          <div className="rounded-2xl border border-dashed border-gold/50 bg-card p-8 text-center">
            <p className="text-3xl">📓</p>
            <p className="mt-2 text-sm text-ink-soft">
              {isMine
                ? "دفترك فاضي — اكتب أول صفحة من أفكارك"
                : "ما في صفحات منشورة بهالدفتر"}
            </p>
            {isMine && (
              <button
                onClick={onAdd}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-white transition hover:bg-gold-deep"
              >
                <Plus size={16} />
                اكتب أول صفحة
              </button>
            )}
          </div>
        )}

        {leaves.length > 1 && (
          <>
            <div
              className="book3d select-none"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              <div className="book-spine" />
              {leaves.map((i) => {
                const isCurrent = i === leaf;
                const isTurned = turned.has(i);
                const z = isCurrent
                  ? 3000
                  : isTurned
                    ? 100 + i
                    : 2000 - i;
                return (
                  <div
                    key={i}
                    className={"sheet " + (isTurned ? "turned" : "")}
                    style={{ zIndex: z }}
                  >
                    <div className="face front">{leafContent(i)}</div>
                    <div className="face back paper-sheet" />
                  </div>
                );
              })}
              {isEnd && (
                <div
                  className="absolute inset-0 z-[3200] grid place-items-center"
                  onClick={() => void next()}
                >
                  <p className="font-serif text-2xl font-bold text-ink/70">
                    النهاية — اضغط لبدء الدفتر
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => void prev()}
                disabled={leaf === 0}
                aria-label="الصفحة السابقة"
                className="grid size-11 place-items-center rounded-full border border-line bg-card text-ink-soft shadow-sm transition hover:border-gold-deep hover:text-gold-deep disabled:opacity-40"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-sm text-ink-soft">
                {isEnd ? "النهاية" : `صفحة ${leaf} من ${maxLeaf}`}
              </span>
              <button
                onClick={() => void next()}
                disabled={
                  isEnd ||
                  (leaf === maxLeaf && turned.size === maxLeaf)
                }
                aria-label="الصفحة التالية"
                className="grid size-11 place-items-center rounded-full border border-line bg-card text-ink-soft shadow-sm transition hover:border-gold-deep hover:text-gold-deep disabled:opacity-40"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {isMine && leaf > 0 && pages[leaf - 1] && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => onEdit(pages[leaf - 1])}
                  className="rounded-full border border-line bg-card px-4 py-2 text-sm font-medium text-ink-soft transition hover:border-gold-deep hover:text-gold-deep"
                >
                  تعدّل هالصفحة
                </button>
                <button
                  onClick={() => onDelete(pages[leaf - 1])}
                  className="rounded-full border border-rose-200 bg-card px-4 py-2 text-sm font-medium text-rose-500 transition hover:bg-rose-50"
                >
                  <Trash2 size={14} className="inline" />
                  حذف
                </button>
              </div>
            )}

            {isMine && (
              <button
                onClick={onAdd}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gold px-4 py-3 text-sm font-bold text-white transition hover:bg-gold-deep"
              >
                <Plus size={16} />
                أضف صفحة جديدة
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}