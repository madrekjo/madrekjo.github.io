import { useEffect, useState, type FormEvent } from "react";
import { Save, Trash2, X } from "lucide-react";
import type { NotebookPage } from "@/lib/api";

export default function NotebookEditor({
  open,
  page,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  page: NotebookPage | null;
  onClose: () => void;
  onSave: (content: string, isPublic: boolean) => Promise<void>;
  onDelete: (page: NotebookPage) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setContent(page?.content ?? "");
      setIsPublic(page?.is_public ?? true);
      setErr("");
    }
  }, [open, page]);

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (content.trim().length < 1) {
      setErr("اكتب سطور صفحتك أولاً");
      return;
    }
    setBusy(true);
    try {
      await onSave(content.trim(), isPublic);
      onClose();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm">
      <div className="paper-sheet max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-gold/40 p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-serif text-2xl font-bold text-ink">
            {page ? "تعدّل الصفحة" : "صفحة جديدة من دفترك"}
          </h3>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="grid size-9 place-items-center rounded-full border border-line text-ink-soft transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            autoFocus
            placeholder="اكتب صفحة كاملة من أفكارك، خواطرك، أو سطورك..."
            className="notebook-lined w-full resize-y rounded-xl border border-line bg-card px-4 py-3 font-serif text-lg leading-8 text-ink outline-none focus:border-gold"
          />
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="size-4 accent-[#c9a227]"
            />
            صفحة عامة — أي زائر يقرأها
          </label>
          {err && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {err}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gold py-3 font-bold text-white transition hover:bg-gold-deep disabled:opacity-50"
          >
            <Save size={16} />
            {busy ? "جارٍ الحفظ..." : page ? "احفظ التعديلات" : "أضف الصفحة"}
          </button>
          {page && (
            <button
              type="button"
              onClick={() => void onDelete(page)}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-rose-200 py-2.5 text-sm font-medium text-rose-500 transition hover:bg-rose-50"
            >
              <Trash2 size={15} />
              حذف الصفحة
            </button>
          )}
        </form>
      </div>
    </div>
  );
}