import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { submitLine, type Category } from "@/lib/api";
import { GRADS } from "@/lib/colors";

const categories: Array<Category> = ["رواية", "ديني", "تنمية", "شعر", "تاريخ"];

export default function AddLineModal({
  open,
  onClose,
  onAdded,
  defaultName = "",
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  defaultName?: string;
}) {
  const [submitter, setSubmitter] = useState(defaultName);
  const [text, setText] = useState("");
  const [book, setBook] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState<Category>("رواية");
  const [color, setColor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (!open) return null;

  const reset = () => {
    setSubmitter(defaultName);
    setText("");
    setBook("");
    setAuthor("");
    setCategory("رواية");
    setColor("");
    setError("");
    setDone(false);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (text.trim().length < 3 || book.trim().length < 1) {
      setError("اكتب السطر واسم الكتاب أولاً");
      return;
    }
    setBusy(true);
    try {
      await submitLine({
        text: text.trim(),
        book: book.trim(),
        author: author.trim(),
        category,
        submitter: (defaultName || submitter).trim() || "طالب مدارك جو",
        color: color as "" | (typeof GRADS)[number],
      });
      setDone(true);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-card p-6 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl font-bold text-ink">
            {done ? "تم النشر 🎉" : "أضف سطرك"}
          </h2>
          <button
            onClick={close}
            className="grid size-9 place-items-center rounded-full border border-line text-ink-soft transition hover:text-ink"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="pt-2 text-center">
            <p className="text-2xl">🌟</p>
            <p className="mt-2 text-lg font-medium text-ink">
              بطاقتك ضهرت على الجدار مباشرة
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              رح "بطاقتي" تتابع التفاعل عليها وتوثّق مشاركاتها
            </p>
            <button
              onClick={close}
              className="mt-5 rounded-full bg-gold px-6 py-2.5 font-bold text-white transition hover:bg-gold-deep"
            >
              حلو جداً
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            {defaultName ? (
              <p className="rounded-xl bg-paper px-4 py-2.5 text-sm text-ink-soft">
                بتكتب باسم: <span className="font-bold text-ink">{defaultName}</span>
              </p>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  اسمك (كيف نقدّمك في "بطاقتي") *
                </label>
                <input
                  value={submitter}
                  onChange={(e) => setSubmitter(e.target.value)}
                  maxLength={40}
                  placeholder="مثلاً: أحمد من عجمان"
                  className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-ink outline-none focus:border-gold"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                أجمل سطر قرأته *
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder="اكتب السطر اللي بيعيش فيك..."
                className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-ink outline-none focus:border-gold"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  اسم الكتاب *
                </label>
                <input
                  value={book}
                  onChange={(e) => setBook(e.target.value)}
                  maxLength={120}
                  placeholder="مثال: العقلية الرقمية"
                  className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-ink outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  المؤلف (اختياري)
                </label>
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  maxLength={60}
                  placeholder="مثال: جون ماكسويل"
                  className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-ink outline-none focus:border-gold"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                التصنيف *
              </label>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={
                      "rounded-full border px-4 py-1.5 text-sm transition " +
                      (category === c
                        ? "border-gold bg-gold font-bold text-white"
                        : "border-line bg-paper text-ink-soft hover:border-gold-deep")
                    }
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                لون البطاقة
              </label>
              <div
                className={
                  "flex h-14 items-center justify-center rounded-xl border px-3 text-center font-serif text-base font-bold " +
                  (color === ""
                    ? "border-line bg-card text-ink"
                    : "border-transparent text-white " + color)
                }
              >
                {text.trim() || "معاينة لون سطرك هنا"}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setColor("")}
                  aria-label="بيج (افتراضي)"
                  title="بيج (افتراضي)"
                  className={
                    "size-8 rounded-full border border-line bg-card transition " +
                    (color === ""
                      ? "ring-2 ring-gold ring-offset-2"
                      : "hover:ring-2 hover:ring-gold/40 hover:ring-offset-2")
                  }
                />
                {GRADS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setColor(g)}
                    aria-label={g}
                    title={g}
                    className={
                      "size-8 rounded-full transition " +
                      g +
                      (color === g
                        ? " ring-2 ring-gold ring-offset-2"
                        : " hover:scale-110")
                    }
                  />
                ))}
                <span className="text-xs text-ink-soft">
                  اللون الأساسي هو البيج مثل الأول
                </span>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-gold py-3 font-bold text-white transition hover:bg-gold-deep disabled:opacity-50"
            >
              {busy ? "جارٍ النشر..." : "انشر بطاقتك"}
            </button>
            <p className="text-center text-xs text-ink-soft">
              ينشر مباشرة — قلنا خلينا نثق بالطلاب 😄
            </p>
          </form>
        )}
      </div>
    </div>
  );
}