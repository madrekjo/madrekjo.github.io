import { Check, Flame, ListFilter, PenLine, Play, Sparkles, Target, UserRound, Users } from "lucide-react";
import type { Scope } from "@/types";
import Avatar from "./Avatar";

export default function HomePicker({
  userName,
  userField,
  userGrade,
  scope,
  subject,
  availableSubjects,
  fieldCount,
  allCount,
  onPick,
  onOpenProfile,
  onCreate,
}: {
  userName: string;
  userField: string;
  userGrade: string;
  scope: Scope;
  subject: string;
  availableSubjects: string[];
  fieldCount: number;
  allCount: number;
  onPick: (scope: Scope, subject: string) => void;
  onOpenProfile: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8">
      <header className="text-center">
        <h1 className="font-serif text-4xl font-bold text-ink">اكتب سؤالك</h1>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-xs font-bold text-gold-deep">
          🎓 منصة الأسئلة التعليمية · مدارك جو
        </p>
      </header>

      <div className="mt-5 flex items-center justify-center">
        <button
          onClick={onOpenProfile}
          title="ملفي الشخصي"
          className="flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 shadow-sm transition hover:border-gold-deep hover:bg-gold/5"
        >
          <Avatar name={userName} className="size-8 text-sm" />
          <span className="text-sm font-bold text-ink">{userName}</span>
          <span className="text-xs font-bold text-ink-soft">
            · حقل {userField}
          </span>
          <span className="grid size-6 place-items-center rounded-full bg-gold/15 text-gold-deep">
            <UserRound size={13} />
          </span>
        </button>
      </div>

      {/* بطاقة التعريف بالقسم */}
      <section className="mt-6 overflow-hidden rounded-3xl border-2 border-gold/40 bg-card shadow-sm">
        <div className="border-b border-gold/25 bg-ink px-4 py-3 text-center">
          <p className="flex items-center justify-center gap-2 text-sm font-extrabold text-paper">
            <Sparkles size={16} className="text-gold" />
            تعرّف على «اكتب سؤالك»
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold-deep">
              <Users size={18} />
            </span>
            <div>
              <p className="text-sm font-extrabold text-ink">شو هو؟</p>
              <p className="mt-0.5 text-xs font-medium leading-5 text-ink-soft">
                مكانك في مدارك جو — هون بتحوّل السؤال اللي بيحيرك لسؤال
                بيستفيد منه كل الطلاب، من حقلَك ومن كل الحقول.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold-deep">
              <Target size={18} />
            </span>
            <div>
              <p className="text-sm font-extrabold text-ink">شو هدفه؟</p>
              <p className="mt-0.5 text-xs font-medium leading-5 text-ink-soft">
                نزرع ثقافة «اسأل بلا خجل»: كل سؤال تنشره بيكبر المكتبة
                المشتركة، وكل إجابة صحيحة بتسجّل علامة بملفّك — منشوراتك
                ولايكاتك وإجاباتك الصحيحة.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold-deep">
              <Play size={18} />
            </span>
            <div>
              <p className="text-sm font-extrabold text-ink">
                النمط الجديد: ريلز تفاعلية
              </p>
              <p className="mt-0.5 text-xs font-medium leading-5 text-ink-soft">
                ما عادت الأسئلة قوائم مملة — صارت قصص. البطاقة بتطبق قدامك،
                بتحاوِل الحين، تتأكّد من جوابك فوراً، وتحطّ إصبعك وتسحب
                لبطاقة جديدة.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 border-t border-gold/25 bg-gold/10 px-5 py-3">
          <Flame size={14} className="text-gold-deep" />
          <p className="text-xs font-bold leading-6 text-ink">
            اسأل بحرية … أجب بثقة … وخلّي غيرك يفوت ع نفس السؤال.
          </p>
        </div>
      </section>

      <div className="mt-7 text-center">
        <p className="flex items-center justify-center gap-1.5 text-base font-bold text-ink">
          <ListFilter size={18} className="text-gold-deep" />
          ماذا تريد أن تشاهد؟
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          onClick={() => onPick("mine-field", "all")}
          className={
            "group rounded-3xl border-2 p-5 text-right transition " +
            (scope === "mine-field"
              ? "border-gold-deep bg-gold/10 shadow-md"
              : "border-line bg-card hover:border-gold/60 hover:bg-gold/5")
          }
        >
          <div className="flex items-center justify-between">
            <span className="grid size-11 place-items-center rounded-2xl bg-gold/15 text-gold-deep">
              <Users size={22} />
            </span>
            {scope === "mine-field" && (
              <span className="grid size-6 place-items-center rounded-full bg-green-600 text-white">
                <Check size={14} />
              </span>
            )}
          </div>
          <div className="mt-3 text-lg font-extrabold text-ink">
            أسئلة حقلي
          </div>
          <div className="mt-1 text-xs font-medium leading-5 text-ink-soft">
            أسئلة من حقل {userField} فقط — {userGrade}
          </div>
          <div className="mt-2 text-xs font-bold text-gold-deep">
            {fieldCount} سؤال
          </div>
        </button>

        <button
          onClick={() => onPick("all", "all")}
          className={
            "group rounded-3xl border-2 p-5 text-right transition " +
            (scope === "all"
              ? "border-gold-deep bg-gold/10 shadow-md"
              : "border-line bg-card hover:border-gold/60 hover:bg-gold/5")
          }
        >
          <div className="flex items-center justify-between">
            <span className="grid size-11 place-items-center rounded-2xl bg-gold/15 text-gold-deep">
              <ListFilter size={22} />
            </span>
            {scope === "all" && (
              <span className="grid size-6 place-items-center rounded-full bg-green-600 text-white">
                <Check size={14} />
              </span>
            )}
          </div>
          <div className="mt-3 text-lg font-extrabold text-ink">
            جميع الحقول
          </div>
          <div className="mt-1 text-xs font-medium leading-5 text-ink-soft">
            كل أسئلة الطلاب من كل الحقول
          </div>
          <div className="mt-2 text-xs font-bold text-gold-deep">
            {allCount} سؤال
          </div>
        </button>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-bold text-ink">فلتر المادة</p>
        <div className="card-scrub flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => onPick(scope, "all")}
            className={
              "shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition " +
              (subject === "all"
                ? "border-gold-deep bg-ink text-paper"
                : "border-line bg-card text-ink-soft hover:border-gold-deep")
            }
          >
            جميع المواد
          </button>
          {availableSubjects.map((s) => (
            <button
              key={s}
              onClick={() => onPick(scope, s)}
              className={
                "shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition " +
                (subject === s
                  ? "border-gold-deep bg-ink text-paper"
                  : "border-line bg-card text-ink-soft hover:border-gold-deep")
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onCreate}
        className="mt-7 flex items-center justify-center gap-2 rounded-2xl bg-ink py-4 text-base font-extrabold text-paper shadow-lg transition hover:bg-gold-deep hover:text-white active:scale-[0.98]"
      >
        <PenLine size={20} /> + اكتب سؤالك
      </button>

      <p className="mt-auto pt-6 text-center text-xs font-medium leading-6 text-ink-soft">
        بطاقة سؤال ← أجب ← تظهر النتيجة ← اسحب للأعلى وخلّي السؤال الجديد يجي.
      </p>
    </div>
  );
}