import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
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

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const half = h < 12 ? "صباحاً" : "مساءً";
  h = h % 12 || 12;
  return `${h}:${m} ${half}`;
}

function pageLabel(num: number): string {
  return num === 1 ? "أول صفحة" : `صفحة رقم ${num}`;
}

function NotebookMiniBook() {
  return (
    <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-card ring-1 ring-gold/40">
      <div className="relative h-11 w-9 overflow-hidden rounded-r-[4px] rounded-l-[2px] bg-gradient-to-bl from-[#8a5a2f] via-[#6f4524] to-[#4a2c14] shadow-[0_2px_5px_rgba(60,40,15,0.35)] ring-1 ring-[#3a2410]">
        <span className="absolute inset-y-0 right-0 w-[3px] bg-gradient-to-b from-[#e6c46a] to-[#a67c00]" />
        <span className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-l from-transparent to-black/25" />
        <span className="absolute inset-x-0 top-2 h-[2px] bg-[#e6c46a]/40" />
        <span className="absolute inset-x-0 top-2 h-[2px] translate-y-[13px] bg-[#e6c46a]/40" />
        <span className="absolute inset-x-0 top-2 h-[2px] translate-y-[26px] bg-[#e6c46a]/40" />
      </div>
    </div>
  );
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
        <div className="notebook-paper notebook-text flex flex-col px-5 pt-4 pb-4">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="rounded-full bg-gold/10 px-2.5 py-0.5 text-[10px] font-bold text-gold-deep">
              {editingNew ? "ورقة جديدة" : pageLabel(num)}
            </span>
            <span className="flex items-center gap-1 font-medium text-ink-soft/70">
              اليوم
            </span>
          </div>
          <textarea
            ref={draftRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commitSave()}
            autoFocus
            rows={Math.max(4, draft.split("\n").length)}
            placeholder="اكتب على ورقتك مباشرة — بتحفظ تلقائياً..."
            className="notebook-text mt-3 min-h-[260px] resize-none bg-transparent leading-[45px] text-ink outline-none placeholder:text-ink/30"
          />
          <div className="mt-3 flex items-center justify-between gap-1 border-t border-gold/15 pt-3">
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
            <p className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-[10px] text-rose-500">
              {saveErr}
            </p>
          )}
        </div>
      );
    }

    return (
      <div
        className={
          "notebook-paper notebook-text flex flex-col px-5 pt-4 pb-4 " +
          (isMine ? "cursor-text" : "")
        }
        onClick={() => {
          if (!isMine) return;
          if (editingId === null) startEdit(page);
          else if (editingId !== NEW_LOCAL_ID) void commitSave();
        }}
      >
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="rounded-full bg-gold/10 px-2.5 py-0.5 text-[10px] font-bold text-gold-deep">
            {pageLabel(num)}
          </span>
          <span className="font-medium text-ink-soft/70">
            {fmtRel(page.updated_at ?? page.created_at)}
          </span>
        </div>
        <div className="mx-1 my-3 flex items-center gap-3">
          <span className="h-px flex-1 bg-gold/25" />
          <span className="flex items-center gap-2 font-serif text-sm font-bold whitespace-nowrap text-gold-deep">
            {fmtDate(page.updated_at ?? page.created_at)}
            <span className="size-1 rounded-full bg-gold/50" />
            {fmtTime(page.updated_at ?? page.created_at)}
          </span>
          <span className="h-px flex-1 bg-gold/25" />
        </div>
        <div className="whitespace-pre-wrap leading-[45px] text-ink">
          {page.content}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-gold/15 pt-3">
          {isMine && editingId === null ? (
            <span className="flex items-center gap-1 text-[10px] font-medium text-gold-deep/50">
              <Pencil size={10} />
              اضغط للكتابة
            </span>
          ) : (
            <span className="text-[10px] font-medium text-ink-soft/60">
              من دفتر {ownerName}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              void shareHere(page);
            }}
            disabled={sharing || !page.content?.trim()}
            aria-label="مشاركة الورقة"
            className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-card/80 px-3 py-1.5 text-[10px] font-bold text-gold-deep transition hover:bg-gold hover:text-white disabled:opacity-40"
          >
            <Share2 size={12} />
            {sharing ? "تحضير..." : "مشاركة"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-paper">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-paper/95 px-3 py-2.5 backdrop-blur sm:px-5">
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
              أضف ورقة
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
        <div className="notebook-paper overflow-hidden">
          <div className="p-5">
            <div className="flex items-center gap-4">
              <NotebookMiniBook />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-serif text-xl font-bold text-ink">
                  دَفتر {ownerName}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-gold/10 px-2.5 py-0.5 text-[11px] font-bold text-gold-deep">
                    {pages.length} {pages.length === 1 ? "صفحة" : "صفحات"}
                  </span>
                  {lastAt && (
                    <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-medium text-ink-soft">
                      آخر كتابة {fmtRel(lastAt)}
                    </span>
                  )}
                </div>
              </div>
              {startedAt && (
                <span className="hidden text-left text-[10px] leading-4 text-ink-soft/70 sm:block">
                  بدأ منذ {fmtRel(startedAt)}
                </span>
              )}
            </div>
          </div>
          <p className="border-t border-gold/15 bg-card/70 px-4 py-3 text-center font-serif text-sm italic leading-6 text-gold-deep">
            «{isMine ? "اكتب ما تريد أن يقرأه الناس عنك" : `صفحات من أفكار ${ownerName}`}»
          </p>
        </div>

        {pages.length === 0 && !editingNew ? (
          <div className="notebook-paper mt-4 p-8 text-center">
            <p className="text-3xl">📖</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              {isMine
                ? "دفترك فاضي — اضغط «أضف ورقة» وابدأ أول صفحة"
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
              <div key={p.id}>{renderPage(p, i + 1)}</div>
            ))}
            {editingNew && creatingNew &&
              renderPage(
                {
                  id: -1,
                  user_id: "",
                  content: "",
                  is_public: true,
                  position: 0,
                  created_at: null,
                  updated_at: null,
                } as unknown as NotebookPage,
                pages.length + 1
              )}
          </div>
        )}
      </div>
    </div>
  );
}