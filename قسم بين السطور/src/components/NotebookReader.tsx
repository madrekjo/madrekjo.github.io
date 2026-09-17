import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Calendar,
  Pencil,
  Plus,
  Save,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import type { NotebookPage } from "@/lib/api";
import { waitFont } from "@/lib/cardImage";

const NEW_LOCAL_ID = "new-local";

const MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtRel(iso: string | null): string {
  if (!iso) return "";
  const past = new Date(iso).getTime();
  if (Number.isNaN(past)) return "";
  const mins = Math.max(0, Math.round((Date.now() - past) / 60000));
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `قبل ${hrs} ساعة`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "قبل يوم";
  if (days === 2) return "قبل يومين";
  if (days < 11) return `قبل ${days} أيام`;
  if (days < 30) return `قبل ${days} يوماً`;
  const months = Math.round(days / 30);
  if (months === 1) return "قبل شهر";
  if (months === 2) return "قبل شهرين";
  if (months < 12) return `قبل ${months} أشهر`;
  const years = Math.round(days / 365);
  return years === 1 ? "قبل سنة" : `قبل ${years} سنة`;
}

export default function NotebookReader({
  open,
  isMine,
  ownerName,
  pages,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onSharePage,
}: {
  open: boolean;
  isMine: boolean;
  ownerName: string;
  pages: NotebookPage[];
  onClose: () => void;
  onCreate: (content: string, isPublic: boolean) => Promise<void>;
  onUpdate: (pageId: number, content: string, isPublic: boolean) => Promise<void>;
  onDelete: (page: NotebookPage) => Promise<void>;
  onSharePage: (page: NotebookPage, pageNum: number, total: number) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftPublic, setDraftPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [sharing, setSharing] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (open) {
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

  useEffect(() => {
    void waitFont("Amiri");
  }, []);

  useEffect(() => {
    if (!open || editingId === null) return;
    const t = window.setTimeout(() => {
      draftRef.current?.focus();
    }, 120);
    return () => window.clearTimeout(t);
  }, [open, editingId]);

  if (!open) return null;

  const startedAt = pages.length
    ? pages.reduce((a, b) => (a.created_at < b.created_at ? a : b)).created_at
    : null;
  const lastAt = pages.length
    ? pages.reduce((a, b) =>
        ((a.updated_at ?? a.created_at) > (b.updated_at ?? b.created_at) ? a : b)
      ).updated_at ?? null
    : null;

  const commitSave = async () => {
    if (savingRef.current || editingId === null) return;
    const content = draft.trim();
    if (editingId === NEW_LOCAL_ID && !content) return;
    savingRef.current = true;
    setSaving(true);
    setSaveErr("");
    try {
      if (editingId === NEW_LOCAL_ID) {
        await onCreate(content, draftPublic);
        setCreatingNew(false);
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
  };

  const shareHere = async (p: NotebookPage) => {
    if (sharing || editingId !== null) return;
    if (!p.content || !p.content.trim()) return;
    setSharing(true);
    try {
      await onSharePage(p, pages.indexOf(p) + 1, pages.length);
    } catch {
      /* الأخطاء تظهر من الأعلى */
    } finally {
      setSharing(false);
    }
  };

  const startEdit = (p: NotebookPage) => {
    if (!isMine) return;
    if (editingId === NEW_LOCAL_ID && !creatingNew) return;
    setEditingId(creatingNew ? NEW_LOCAL_ID : p.id);
    setDraft(p.content);
    setDraftPublic(creatingNew ? true : p.is_public);
    setSaveErr("");
  };

  const editingNew = editingId === NEW_LOCAL_ID;
  const isEditing = editingId != null;

  const renderPage = (page: NotebookPage, num: number) => {
    const editingHere =
      editingId === page.id ||
      (editingNew && creatingNew && num === pages.length + 1);

    if (editingHere) {
      return (
        <div className="notebook-paper notebook-text flex min-h-[300px] flex-col p-5 pt-6">
          <span className="pointer-events-none absolute top-3 left-4 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold-deep">
            {editingNew ? pages.length + 1 : num}
          </span>
          <span className="absolute top-3 right-4 flex items-center gap-1 text-[10px] font-medium text-ink-soft/70">
            <Calendar size={11} />
            اليوم
          </span>
          <textarea
            ref={draftRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commitSave()}
            autoFocus
            placeholder="اكتب على ورقتك مباشرة — بتحفظ تلقائياً..."
            className="notebook-text min-h-0 flex-1 resize-none bg-transparent leading-[45px] text-[#3c3122] outline-none placeholder:text-[#3c3122]/30"
          />
          <div className="mt-2 flex items-center justify-between gap-1">
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-ink-soft">
              <input
                type="checkbox"
                checked={draftPublic}
                onChange={(e) => setDraftPublic(e.target.checked)}
                className="size-3.5 accent-[#c9a227]"
              />
              عامة — أي زائر يقرأها
            </label>
            <div className="flex items-center gap-1.5">
              {!editingNew && (
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
          "notebook-paper notebook-text flex min-h-[220px] flex-col p-5 pt-6 " +
          (isMine ? "cursor-text" : "")
        }
        onClick={() => {
          if (!isMine) return;
          if (editingId === null) startEdit(page);
          else if (editingId !== NEW_LOCAL_ID) void commitSave();
        }}
      >
        <span className="pointer-events-none absolute top-3 left-4 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold-deep">
          ورقة {num}
        </span>
        <span className="absolute top-3 right-4 flex items-center gap-1 text-[10px] font-medium text-ink-soft/70">
          <Calendar size={11} />
          {fmtRel(page.updated_at ?? page.created_at)} ·
          {fmtDate(page.updated_at ?? page.created_at)}
        </span>
        <div className="whitespace-pre-wrap leading-[45px] text-[#3c3122]">
          {page.content}
        </div>
        {isMine && editingId === null && (
          <span className="absolute bottom-3 left-4 flex items-center gap-1 text-[10px] font-medium text-gold-deep/50">
            <Pencil size={10} />
            اضغط للكتابة
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            void shareHere(page);
          }}
          disabled={sharing || !page.content?.trim()}
          aria-label="مشاركة الورقة"
          className="absolute bottom-3 right-4 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-card/80 px-3 py-1.5 text-[10px] font-bold text-gold-deep transition hover:bg-gold hover:text-white disabled:opacity-40"
        >
          <Share2 size={12} />
          {sharing ? "تحضير..." : "مشاركة"}
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#e9e0cb]">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[#e9e0cb]/95 px-3 py-2.5 backdrop-blur sm:px-5">
        <h2 className="flex items-center gap-2 font-serif text-xl font-bold text-ink">
          <BookOpen size={19} className="text-gold-deep" />
          دَفتر {ownerName}
        </h2>
        <div className="flex items-center gap-2">
          {isMine && !isEditing && (
            <button
              onClick={addNew}
              className="inline-flex items-center gap-1.5 rounded-full border border-gold/50 bg-card px-3 py-2 text-xs font-bold text-gold-deep transition hover:bg-gold hover:text-white"
            >
              <Plus size={14} />
              ورقة جديدة
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="grid size-9 place-items-center rounded-full border border-line bg-card text-ink-soft transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-3 pb-24 pt-3 sm:px-5">
        <div className="notebook-paper flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-gold/15 text-2xl">
              📓
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-ink">
                دَفتر {ownerName}
              </h3>
              <p className="text-xs text-ink-soft">
                {pages.length} {pages.length === 1 ? "صفحة" : "صفحات"}
              </p>
            </div>
          </div>
          <div className="text-left text-[11px] leading-5 text-ink-soft">
            {lastAt && <p>آخر كتابة: {fmtRel(lastAt)}</p>}
            {startedAt && <p>بدأ هذا الدفتر: {fmtRel(startedAt)}</p>}
          </div>
        </div>

        {pages.length === 0 && !editingNew ? (
          <div className="notebook-paper mt-4 p-8 text-center">
            <p className="text-3xl">📖</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              {isMine
                ? "دفترك فاضي — اضغط «ورقة جديدة» وابدأ أول صفحة"
                : "ما في صفحات منشورة بهذا الدفتر بعد"}
            </p>
            {isMine && (
              <button
                onClick={addNew}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-white transition hover:bg-gold-deep"
              >
                <Plus size={16} />
                اكتب أول ورقة
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {pages.map((p, i) => (
              <div key={p.id}>
                {renderPage(p, i + 1)}
              </div>
            ))}
            {editingNew && creatingNew && renderPage((
              { id: -1, user_id: "", content: "", is_public: true, position: 0, created_at: null, updated_at: null } as unknown as NotebookPage
            ), pages.length + 1)}
            {isMine && !isEditing && (
              <button
                onClick={addNew}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-gold/50 bg-card px-4 py-3 text-sm font-bold text-gold-deep transition hover:bg-gold hover:text-white"
              >
                <Plus size={16} />
                أضف ورقة جديدة
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}