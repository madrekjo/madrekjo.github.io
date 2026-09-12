import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import type { NotebookPage } from "@/lib/api";

const NEW_LOCAL_ID = "new-local";

export default function NotebookReader({
  open,
  isMine,
  ownerName,
  pages,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  isMine: boolean;
  ownerName: string;
  pages: NotebookPage[];
  onClose: () => void;
  onCreate: (content: string, isPublic: boolean) => Promise<void>;
  onUpdate: (pageId: number, content: string, isPublic: boolean) => Promise<void>;
  onDelete: (page: NotebookPage) => Promise<void>;
}) {
  const [leaf, setLeaf] = useState(0); // 0 = الغلاف
  const [turned, setTurned] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftPublic, setDraftPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const busyRef = useRef(false);
  const savingRef = useRef(false);
  const touchX = useRef<number | null>(null);
  const touchY = useRef<number | null>(null);

  const newBlankPage: NotebookPage = {
    id: -1,
    user_id: "",
    content: "",
    is_public: true,
    position: 0,
    created_at: "",
    updated_at: "",
  };

  const displayed = creatingNew ? [...pages, newBlankPage] : pages;
  const maxLeaf = displayed.length; // 0..length

  useEffect(() => {
    if (open) {
      setLeaf(0);
      setTurned(new Set());
      setEditingId(null);
      setCreatingNew(false);
      setDraft("");
      setSaveErr("");
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
    if (busyRef.current || editingId != null) return;
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

  const restart = () => {
    if (busyRef.current || editingId != null) return;
    setTurned(new Set());
    setLeaf(0);
  };

  const prev = async () => {
    if (busyRef.current || editingId != null) return;
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

  const isEditing = editingId != null;
  const isEditingHere = (i: number) =>
    editingId !== null && displayed[i - 1] !== undefined &&
    (creatingNew ? editingId === NEW_LOCAL_ID : editingId === displayed[i - 1].id);

  const startEdit = (i: number) => {
    if (!isMine || i === 0) return;
    const p = displayed[i - 1];
    if (!p) return;
    if (editingId === NEW_LOCAL_ID && !creatingNew) return;
    setEditingId(creatingNew ? NEW_LOCAL_ID : p.id);
    setDraft(p.content);
    setDraftPublic(creatingNew ? true : p.is_public);
    setSaveErr("");
  };

  const commitSave = async () => {
    if (savingRef.current || editingId === null) return;
    const content = draft.trim();
    if (!content) {
      setEditingId(null);
      if (creatingNew) setCreatingNew(false);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveErr("");
    try {
      if (editingId === NEW_LOCAL_ID) {
        await onCreate(content, draftPublic);
        setCreatingNew(false);
        setLeaf((l) => Math.max(l, 1));
      } else if (typeof editingId === "number") {
        await onUpdate(editingId, content, draftPublic);
      }
      setEditingId(null);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (saving) return;
    if (editingId === NEW_LOCAL_ID && creatingNew) setCreatingNew(false);
    setEditingId(null);
    setSaveErr("");
  };

  const askDelete = (p: NotebookPage) => {
    if (saving || !window.confirm("حذف هذه الورقة من الدفتر؟")) return;
    void (async () => {
      try {
        await onDelete(p);
        setEditingId(null);
        setSaveErr("");
      } catch (e) {
        setSaveErr(e instanceof Error ? e.message : "تعذّر الحذف");
      }
    })();
  };

  const addNew = () => {
    if (!isMine || editingId != null) return;
    setCreatingNew(true);
    setEditingId(NEW_LOCAL_ID);
    setDraft("");
    setDraftPublic(true);
    setSaveErr("");
    setTurned((t) => {
      const n = new Set(t);
      for (let k = 0; k <= pages.length; k++) n.add(k);
      return n;
    });
    setLeaf(pages.length + 1);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
    touchY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null || touchY.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
    const dy = (e.changedTouches[0]?.clientY ?? 0) - touchY.current;
    touchX.current = null;
    touchY.current = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return; // نقرة → النقر يعالج بالـ onClick
    if (dx < -45) void next();
    else if (dx > 45) void prev();
  };

  const stopPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const leafContent = (i: number) => {
    if (i === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-[#33291d] to-[#1c150c] p-6 text-center text-paper">
          <BookOpen size={34} className="text-gold" />
          <p className="mt-3 font-serif text-3xl font-bold">دُفتر</p>
          <p className="mt-1 max-w-[16rem] truncate text-lg text-gold">
            {ownerName}
          </p>
          <p className="mt-6 text-[11px] opacity-70">
            {displayed.length} {displayed.length === 1 ? "صفحة" : "صفحات"} · بين السطور
          </p>
        </div>
      );
    }
    const page = displayed[i - 1];
    if (!page) return null;

    const editingHere = isEditingHere(i);

    if (editingHere) {
      return (
        <div className="notebook-lined flex h-full flex-col p-4 pt-7">
          <span className="pointer-events-none absolute top-3 left-4 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold-deep">
            {i}
          </span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commitSave()}
            onTouchStart={stopPropagation}
            onTouchEnd={stopPropagation}
            onClick={stopPropagation}
            autoFocus
            placeholder="اكتب على ورقتك مباشرة — بتحفظ تلقائياً..."
            className="min-h-0 flex-1 resize-none bg-transparent font-serif text-xl leading-[35px] text-[#3c3122] outline-none placeholder:text-[#3c3122]/35"
          />
          <div className="mt-2 flex items-center justify-between gap-1">
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-ink-soft">
              <input
                type="checkbox"
                checked={draftPublic}
                onChange={(e) => setDraftPublic(e.target.checked)}
                className="size-3.5 accent-[#c9a227]"
              />
              عامة
            </label>
            <div className="flex items-center gap-1.5">
              {editingId !== NEW_LOCAL_ID && (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    askDelete(page);
                  }}
                  aria-label="حذف"
                  className="grid size-8 place-items-center rounded-full bg-rose-50 text-rose-500 transition hover:bg-rose-100"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  cancelEdit();
                }}
                className="rounded-full border border-line bg-card px-3 py-1.5 text-[11px] font-medium text-ink-soft transition hover:text-ink"
              >
                إلغاء
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void commitSave()}
                disabled={saving}
                className="flex items-center gap-1 rounded-full bg-gold px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-gold-deep disabled:opacity-50"
              >
                <Save size={13} />
                {saving ? "حفظ..." : "حفظ"}
              </button>
            </div>
          </div>
          {saveErr && (
            <p className="mt-1 rounded-md bg-rose-50 px-2 py-1 text-[10px] text-rose-500">
              {saveErr}
            </p>
          )}
        </div>
      );
    }

    return (
      <div
        className={
          "notebook-lined flex h-full flex-col p-5 pt-7 " +
          (isMine ? "cursor-text" : "")
        }
        onClick={() => (editingId === null ? startEdit(i) : void commitSave())}
      >
        <span className="pointer-events-none absolute top-3 left-4 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold-deep">
          {i}
          {isMine && editingId === null && (
            <Pencil size={10} className="mr-1 inline text-gold-deep/70" />
          )}
        </span>
        <div className="overflow-y-auto no-scrollbar whitespace-pre-wrap font-serif text-xl leading-[35px] text-[#3c3122]">
          {page.content}
        </div>
      </div>
    );
  };

  const leaves = Array.from({ length: maxLeaf + 1 }, (_, i) => i);
  const showBook = leaves.length > 1;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#e9e0cb] p-2 pt-3 sm:p-4">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-3 flex items-center justify-between px-1">
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

        {!showBook && (
          <div className="rounded-2xl border border-dashed border-gold/50 bg-card p-8 text-center">
            <p className="text-3xl">📓</p>
            <p className="mt-2 text-sm text-ink-soft">
              {isMine
                ? "دفترك فاضي — اضغط «اكتب ورقة» وابدأ مباشرة على الورقة"
                : "ما في ورقات منشورة بهالدفتر"}
            </p>
            {isMine && (
              <button
                onClick={addNew}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-white transition hover:bg-gold-deep"
              >
                <Plus size={16} />
                اكتب ورقة
              </button>
            )}
          </div>
        )}

        {showBook && (
          <>
            <div
              className="book3d select-none"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              onClick={() => (isEditing ? void commitSave() : undefined)}
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
              {isEditing && (
                <div className="pointer-events-none absolute inset-0 z-[3200] rounded-lg ring-4 ring-gold/40 ring-offset-2 ring-offset-[#e9e0cb]" />
              )}
            </div>

            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                onClick={() => void prev()}
                disabled={leaf === 0 || isEditing}
                aria-label="الورقة السابقة"
                className="grid size-11 place-items-center rounded-full border border-line bg-card text-ink-soft shadow-sm transition hover:border-gold-deep hover:text-gold-deep disabled:opacity-40"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-sm text-ink-soft">
                {isEndCheck(turned, maxLeaf) && !isEditing ? (
                  <button
                    onClick={restart}
                    className="rounded-full border border-gold/40 bg-card px-3 py-1 text-xs font-bold text-gold-deep transition hover:bg-gold hover:text-white"
                  >
                    النهاية — اضغط لبدء الدفتر
                  </button>
                ) : (
                  `صفحة ${leaf} من ${maxLeaf}`
                )}
              </span>
              <button
                onClick={() => void next()}
                disabled={
                  isEditing || isEndCheck(turned, maxLeaf) ||
                  (leaf === maxLeaf && turned.size === maxLeaf)
                }
                aria-label="الورقة التالية"
                className="grid size-11 place-items-center rounded-full border border-line bg-card text-ink-soft shadow-sm transition hover:border-gold-deep hover:text-gold-deep disabled:opacity-40"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {isMine && !isEditing && (
              <button
                onClick={addNew}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gold px-4 py-3 text-sm font-bold text-white transition hover:bg-gold-deep"
              >
                <Plus size={16} />
                أضف ورقة جديدة
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function isEndCheck(turned: Set<number>, maxLeaf: number): boolean {
  return maxLeaf > 0 && turned.size >= maxLeaf;
}