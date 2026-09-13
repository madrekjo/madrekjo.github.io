import { useRef, useState, type FormEvent } from "react";
import { ImagePlus, Paperclip, Trash2, X } from "lucide-react";
import type { Ayah, OptionKey, Question } from "@/types";
import { OPTION_KEYS } from "@/types";
import { AYAT, CURRENT_USER, FIELDS, subjectsOf } from "@/data";

export default function CreateQuestion({
  open,
  onClose,
  onCreated,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (q: Question) => void;
  defaults?: { name: string; field: string; grade: string };
}) {
  const d = defaults ?? CURRENT_USER;
  const [question, setQuestion] = useState("");
  const [opts, setOpts] = useState<string[]>(["", "", "", ""]);
  const [correct, setCorrect] = useState<OptionKey | null>(null);
  const [field, setField] = useState(d.field);
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState(d.grade);
  const [author, setAuthor] = useState(d.name);
  const [image, setImage] = useState("");
  const [imageName, setImageName] = useState("");
  const [ayahMode, setAyahMode] = useState<"none" | "pick">("none");
  const [ayahPick, setAyahPick] = useState(AYAT[0]);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setQuestion("");
    setOpts(["", "", "", ""]);
    setCorrect(null);
    setField(d.field);
    setSubject("");
    setGrade(d.grade);
    setAuthor(d.name);
    if (image.startsWith("blob:")) URL.revokeObjectURL(image);
    setImage("");
    setImageName("");
    setAyahMode("none");
    setAyahPick(AYAT[0]);
    setError("");
  };

  const close = () => {
    reset();
    onClose();
  };

  const onPickImage = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("اختر ملف صورة (JPG / PNG / SVG)");
      return;
    }
    if (image.startsWith("blob:")) URL.revokeObjectURL(image);
    setImage(URL.createObjectURL(f));
    setImageName(f.name);
    setError("");
  };

  const pickAyah: Ayah = AYAT.find((a) => a.ref === ayahPick.ref) ?? AYAT[0];

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (question.trim().length < 5) {
      setError("اكتب نص السؤال أولاً (5 أحرف على الأقل)");
      return;
    }
    if (opts.some((o) => o.trim().length < 1)) {
      setError("املأ الاختيارات الأربعة أ/ب/ج/د");
      return;
    }
    if (!correct) {
      setError("حدّد الإجابة الصحيحة");
      return;
    }
    if (!subject) {
      setError("اختر المادة الخاصة بالحقل");
      return;
    }
    onCreated({
      id: `user-${Date.now()}`,
      question: question.trim(),
      image: image || undefined,
      imageName: imageName || undefined,
      options: OPTION_KEYS.map((k, i) => ({ key: k, text: opts[i].trim() })) as [
        Question["options"][0],
        Question["options"][1],
        Question["options"][2],
        Question["options"][3],
      ],
      correct,
      field,
      subject,
      grade: grade.trim() || undefined,
      author: author.trim() || "طالب مدارك جو",
      ayah: ayahMode === "pick" ? pickAyah : null,
      likes: 0,
      reactions: 0,
      answersCount: 0,
      mine: true,
    });
    close();
  };

  const inputCls =
    "w-full rounded-xl border border-line bg-white/70 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-gold-deep focus:bg-white";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-card p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-2xl font-bold text-ink">
              اكتب سؤالك
            </h2>
            <p className="text-xs font-medium text-ink-soft">
              سؤال واحد → بطاقة مستقلة في الريلز
            </p>
          </div>
          <button
            onClick={close}
            aria-label="إغلاق"
            className="grid size-9 place-items-center rounded-full border border-line text-ink-soft transition hover:border-gold-deep hover:text-gold-deep"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {/* السؤال */}
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-ink">
              السؤال
            </span>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              placeholder="اكتب سؤالك الدراسي هنا..."
              className={inputCls + " resize-none"}
            />
          </label>

          {/* الصورة */}
          <div>
            <span className="mb-1.5 block text-sm font-bold text-ink">
              صورة السؤال <span className="font-medium text-ink-soft">(اختياري)</span>
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickImage(e.target.files?.[0])}
            />
            {image ? (
              <div className="relative overflow-hidden rounded-2xl border border-line bg-white">
                <img
                  src={image}
                  alt="معاينة صورة السؤال"
                  className="mx-auto max-h-52 w-full object-contain"
                />
                <div className="flex items-center justify-between gap-2 bg-ink/5 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-ink-soft">
                    <Paperclip size={13} />
                    {imageName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (image.startsWith("blob:")) URL.revokeObjectURL(image);
                      setImage("");
                      setImageName("");
                    }}
                    className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700 transition hover:bg-red-200"
                  >
                    <Trash2 size={12} /> إزالة
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-line bg-white/40 px-4 py-5 text-ink-soft transition hover:border-gold-deep hover:bg-gold/5 hover:text-gold-deep"
              >
                <ImagePlus size={22} />
                <span className="text-xs font-bold">اختر صورة من جهازك</span>
              </button>
            )}
          </div>

          {/* الاختيارات */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {OPTION_KEYS.map((k, i) => (
              <label key={k} className="block">
                <span
                  className={
                    "mb-1 flex items-center gap-1.5 text-xs font-bold " +
                    (correct === k ? "text-green-700" : "text-ink-soft")
                  }
                >
                  <span
                    className={
                      "grid size-5 place-items-center rounded-full text-[10px] font-extrabold " +
                      (correct === k
                        ? "bg-green-600 text-white"
                        : "bg-ink/10 text-ink")
                    }
                  >
                    {k}
                  </span>
                  الاختيار {k}
                </span>
                <input
                  value={opts[i]}
                  onChange={(e) =>
                    setOpts((p) => p.map((o, j) => (j === i ? e.target.value : o)))
                  }
                  placeholder="نص الجواب..."
                  className={inputCls}
                />
              </label>
            ))}
          </div>

          {/* الإجابة الصحيحة */}
          <div>
            <span className="mb-1.5 block text-sm font-bold text-ink">
              الإجابة الصحيحة
            </span>
            <div className="flex gap-2">
              {OPTION_KEYS.map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setCorrect(k)}
                  aria-pressed={correct === k}
                  className={
                    "flex-1 rounded-xl border py-2 text-center text-base font-extrabold transition " +
                    (correct === k
                      ? "border-green-500 bg-green-100 text-green-800 shadow-sm"
                      : "border-line bg-white/60 text-ink-soft hover:border-gold-deep")
                  }
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* الحقل والمادة */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-ink">
                الحقل
              </span>
              <select
                value={field}
                onChange={(e) => {
                  setField(e.target.value);
                  setSubject("");
                }}
                className={inputCls + " cursor-pointer"}
              >
                {FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-ink">
                المادة
              </span>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={inputCls + " cursor-pointer"}
              >
                <option value="">— اختر —</option>
                {subjectsOf(field).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* الصف + الاسم */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-ink">
                الصف <span className="font-medium text-ink-soft">(اختياري)</span>
              </span>
              <input
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="مثال: 2009"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-ink">
                اسمك
              </span>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>

          {/* الآية */}
          <div>
            <span className="mb-1.5 block text-sm font-bold text-ink">
              آية قرآنية <span className="font-medium text-ink-soft">(اختياري)</span>
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAyahMode("none")}
                className={
                  "flex-1 rounded-xl border px-3 py-2 text-sm font-bold transition " +
                  (ayahMode === "none"
                    ? "border-gold-deep bg-gold/15 text-gold-deep"
                    : "border-line bg-white/60 text-ink-soft hover:border-gold-deep")
                }
              >
                بدون آية
              </button>
              <button
                type="button"
                onClick={() => setAyahMode("pick")}
                className={
                  "flex-1 rounded-xl border px-3 py-2 text-sm font-bold transition " +
                  (ayahMode === "pick"
                    ? "border-gold-deep bg-gold/15 text-gold-deep"
                    : "border-line bg-white/60 text-ink-soft hover:border-gold-deep")
                }
              >
                إضافة آية
              </button>
            </div>
            {ayahMode === "pick" && (
              <div className="mt-2">
                <select
                  value={ayahPick.ref}
                  onChange={(e) => {
                    const a = AYAT.find((x) => x.ref === e.target.value);
                    if (a) setAyahPick(a);
                  }}
                  className={inputCls + " cursor-pointer"}
                >
                  {AYAT.map((a) => (
                    <option key={a.ref} value={a.ref}>
                      {a.ref} — {a.text.slice(0, 40)}…
                    </option>
                  ))}
                </select>
                <div className="ayah-box mt-2 rounded-xl border border-gold/50 px-4 py-3 text-center">
                  <p className="font-serif text-lg leading-loose text-ink">
                    {pickAyah.text}
                  </p>
                  <p className="mt-1 text-xs font-bold text-gold-deep">
                    {pickAyah.ref}
                  </p>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="mt-1 w-full rounded-2xl bg-ink py-3 text-base font-bold text-paper transition hover:bg-gold-deep hover:text-white"
          >
            نشر السؤال
          </button>
        </form>
      </div>
    </div>
  );
}