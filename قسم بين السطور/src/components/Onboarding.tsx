import { useState, type FormEvent } from "react";
import { PenLine, Check } from "lucide-react";
import { ensureUser } from "@/lib/api";

export default function Onboarding({
  onDone,
  onSkip,
}: {
  onDone: (id: string, username: string) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2) {
      setError("اكتب اسمك أولاً لنجهّز بطاقتك");
      return;
    }
    setBusy(true);
    try {
      const id = await ensureUser(name.trim(), bio.trim());
      onDone(id, name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gold/40 bg-card p-6 text-center shadow-2xl">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gold text-3xl">
          🧡
        </div>
        <h2 className="mt-3 font-serif text-2xl font-bold text-ink">
          أهلاً بيك على جدار بين السطور
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          سجّل اسمك حتى تُنسب بطاقاتك إلك، وتتابع سطورك وإحصائياتها من تبويب
          «الرئيسية» وتتنافس في قمة الأسبوع.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3 text-right">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              اسمك (كيف بتحب نناديك) *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="مثلاً: أحمد من عجمان"
              className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-ink outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              عنك بجملة (اختياري)
            </label>
            <input
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={120}
              placeholder="مثلاً: قارئ بلا توقف، أحب الشعر"
              className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-ink outline-none focus:border-gold"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gold py-3 font-bold text-white transition hover:bg-gold-deep disabled:opacity-50"
          >
            <PenLine size={16} />
            {busy ? "التحقاق..." : "سجّل اسمي"}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-ink-soft transition hover:text-ink"
          >
            <Check size={15} />
            تخطّي الآن — أستكشف أولاً
          </button>
          <p className="text-center text-[11px] leading-5 text-ink-soft">
            بيتحفظ اسمك على جهازك ويرتبط مع بطاقاتك — تقدر تغيّره لاحقاً
          </p>
        </form>
      </div>
    </div>
  );
}