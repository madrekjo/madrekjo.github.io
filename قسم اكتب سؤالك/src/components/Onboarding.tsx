import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { UserProfile } from "@/types";
import { FIELDS } from "@/data";

export default function Onboarding({
  mode,
  initial,
  onDone,
  onCancel,
}: {
  mode: "setup" | "edit";
  initial?: UserProfile;
  onDone: (p: UserProfile) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [field, setField] = useState(initial?.field ?? "");
  const [grade, setGrade] = useState(initial?.grade ?? "");

  const ready = useMemo(
    () => name.trim().length >= 2 && !!field,
    [name, field]
  );

  const submit = () => {
    if (!ready) return;
    onDone({
      name: name.trim(),
      field,
      grade: grade.trim(),
    });
  };

  return (
    <div className="absolute inset-0 z-[90] flex min-h-dvh flex-col bg-paper">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8">
        <div className="flex items-center justify-between">
          <button
            onClick={onCancel}
            className="grid size-10 place-items-center rounded-full border border-line text-ink-soft transition hover:border-gold-deep hover:text-gold-deep"
            aria-label="رجوع"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="rounded-full bg-gold/15 px-3 py-1 text-xs font-bold text-gold-deep">
            🎓 مدارك جو
          </span>
        </div>

        <div className="mt-10 text-center">
          <div className="text-5xl">{mode === "setup" ? "👋" : "🪪"}</div>
          <h1 className="mt-4 font-serif text-2xl font-bold text-ink">
            {mode === "setup" ? "أهلاً فيك بمنصة «اكتب سؤالك»" : "تعديل ملفك الشخصي"}
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-sm font-medium leading-6 text-ink-soft">
            {mode === "setup"
              ? "خلينا نعرف عليك — الاسم والحقل عشان نضبط الأسئلة حسب دراستك."
              : "غيّر الاسم أو الحقل متى ما بتحب."}
          </p>
        </div>

        <div className="mt-8 space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-ink">
              اسمك
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="اكتب اسمك هون"
              className="w-full rounded-2xl border border-line bg-white/80 px-4 py-3 text-base font-bold text-ink outline-none transition placeholder:font-medium placeholder:text-ink-soft/50 focus:border-gold-deep focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-ink">
              حقل دراستك
            </label>
            <div className="grid grid-cols-2 gap-2">
              {FIELDS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setField(f.id)}
                  className={
                    "rounded-2xl border-2 px-3 py-3 text-center text-sm font-bold transition " +
                    (field === f.id
                      ? "border-gold-deep bg-gold/15 text-gold-deep"
                      : "border-line bg-white/60 text-ink-soft hover:border-gold/60")
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] font-medium text-ink-soft">
              أبعد ما بتختار تشوف أسئلة حقلك أول.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-ink">
              صفك (اختياري)
            </label>
            <input
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="مثلاً: 2009"
              className="w-full rounded-2xl border border-line bg-white/80 px-4 py-3 text-base font-bold text-ink outline-none transition placeholder:font-medium placeholder:text-ink-soft/50 focus:border-gold-deep focus:bg-white"
            />
          </div>
        </div>

        <div className="mt-auto pt-8">
          <button
            onClick={submit}
            disabled={!ready}
            className={
              "w-full rounded-2xl py-4 text-base font-extrabold shadow-lg transition active:scale-[0.98] " +
              (ready
                ? "bg-ink text-paper hover:bg-gold-deep hover:text-white"
                : "cursor-not-allowed bg-line text-ink-soft/60")
            }
          >
            {mode === "setup" ? "ابدأ معي 🚀" : "حفظ الملف الشخصي"}
          </button>
          {!ready && (
            <p className="mt-2 text-center text-[11px] font-medium text-ink-soft">
              اكتب اسمك (حرفين على الأقل) واختر حقل دراستك.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}