import { GraduationCap, PenLine, Plus } from "lucide-react";
import MyCards from "./MyCards";

export default function ProfileHome({
  profileUser,
  onRegister,
  onAddCard,
}: {
  profileUser: { id: string; username: string } | null;
  onRegister: () => void;
  onAddCard: () => void;
}) {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gold text-2xl">
            🧡
          </div>
          <div className="min-w-0 flex-1">
            {profileUser ? (
              <>
                <h2 className="truncate font-serif text-2xl font-bold text-ink">
                  أهلاً، {profileUser.username}
                </h2>
                <p className="mt-0.5 text-sm text-ink-soft">
                  نورنا بوجودك على جدار «بين السطور»
                </p>
              </>
            ) : (
              <>
                <h2 className="font-serif text-2xl font-bold text-ink">
                  أهلاً بيك 👋
                </h2>
                <p className="mt-0.5 text-sm text-ink-soft">
                  سجّل اسمك حتى نتابع إحصائيات بطاقاتك
                </p>
              </>
            )}
          </div>
          <button
            onClick={onAddCard}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-gold-deep"
          >
            <Plus size={15} />
            سطر جديد
          </button>
        </div>

        {!profileUser && (
          <button
            onClick={onRegister}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-gold/50 bg-gold/5 px-4 py-2.5 text-sm font-bold text-gold-deep transition hover:bg-gold hover:text-white"
          >
            <PenLine size={15} />
            سجّل اسمك وطالب العضوية
          </button>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-card p-5">
        <h3 className="flex items-center gap-2 font-serif text-xl font-bold text-ink">
          <GraduationCap size={18} className="text-gold-deep" />
          بطاقتي
        </h3>
        <p className="mt-1 text-xs leading-6 text-ink-soft">
          سطورك على هذا الجهاز — تابع قلوبها ومشاركاتها، ونزّل صورة توثيق جاهزة
          للمشاركة.
        </p>
        <MyCards defaultOpen />
      </section>
    </div>
  );
}