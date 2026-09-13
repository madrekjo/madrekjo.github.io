import {
  Bookmark,
  Compass,
  GraduationCap,
  Pencil,
  UserRound,
  X,
} from "lucide-react";
import type { UserProfile } from "@/types";
import Avatar from "./Avatar";

export default function MyProfile({
  profile,
  stats,
  onClose,
  onBrowse,
  onSaved,
  onEdit,
}: {
  profile: UserProfile;
  stats: { published: number; likes: number; correct: number };
  onClose: () => void;
  onBrowse: () => void;
  onSaved: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      {/* رأس الصفحة */}
      <div className="flex shrink-0 items-center justify-between border-b border-line/70 bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-extrabold text-ink">
          <UserRound size={17} className="text-gold-deep" />
          ملفي الشخصي
        </div>
        <button
          onClick={onClose}
          aria-label="رجوع"
          className="grid size-9 place-items-center rounded-full border border-line text-ink-soft transition hover:border-gold-deep hover:text-gold-deep"
        >
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-md px-4 py-6">
          {/* البطاقة التعريفية */}
          <div className="flex flex-col items-center text-center">
            <Avatar
              name={profile.name}
              className="size-24 text-4xl ring-2 ring-gold/70"
            />
            <h3 className="mt-3 text-xl font-extrabold text-ink">
              {profile.name}
            </h3>
            <p className="mt-1 flex items-center gap-1 text-xs font-bold text-gold-deep">
              <GraduationCap size={13} />
              حقل {profile.field}
              {profile.grade ? ` · صف ${profile.grade}` : ""}
            </p>
            <p className="mt-1 text-[11px] font-medium text-ink-soft">
              هذا أنت 👋
            </p>
          </div>

          {/* الإحصائيات */}
          <div className="mt-6 grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl border border-line bg-card px-2 py-3 text-center shadow-sm">
              <p className="text-2xl font-extrabold text-gold-deep">
                {stats.published}
              </p>
              <p className="mt-0.5 text-[10px] font-bold text-ink-soft">
                منشوراتي
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-card px-2 py-3 text-center shadow-sm">
              <p className="text-2xl font-extrabold text-red-500">
                {stats.likes}
              </p>
              <p className="mt-0.5 text-[10px] font-bold text-ink-soft">
                إجمالي اللايكات
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-card px-2 py-3 text-center shadow-sm">
              <p className="text-2xl font-extrabold text-emerald-600">
                {stats.correct}
              </p>
              <p className="mt-0.5 text-[10px] font-bold text-ink-soft">
                إجابات صحيحة
              </p>
            </div>
          </div>

          {/* القائمة */}
          <div className="mt-7 space-y-3">
            <button
              onClick={onBrowse}
              className="group flex w-full items-center gap-3 rounded-2xl border-2 border-line bg-card p-4 text-right shadow-sm transition hover:border-gold-deep hover:bg-gold/5"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold/15 text-gold-deep">
                <Compass size={22} />
              </span>
              <span className="flex-1">
                <span className="block text-base font-extrabold text-ink">
                  تصفح الأسئلة
                </span>
                <span className="block text-[11px] font-medium text-ink-soft">
                  شوف قصص الأسئلة من الكل كل الحقول
                </span>
              </span>
              <span className="text-xl text-ink-soft transition group-hover:-translate-x-0.5 group-hover:text-gold-deep">
                ‹
              </span>
            </button>

            <button
              onClick={onEdit}
              className="group flex w-full items-center gap-3 rounded-2xl border-2 border-line bg-card p-4 text-right shadow-sm transition hover:border-gold-deep hover:bg-gold/5"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold/15 text-gold-deep">
                <Pencil size={22} />
              </span>
              <span className="flex-1">
                <span className="block text-base font-extrabold text-ink">
                  ملف الشخصي
                </span>
                <span className="block text-[11px] font-medium text-ink-soft">
                  عدّل اسمك وحقل دراستك وصفك
                </span>
              </span>
              <span className="text-xl text-ink-soft transition group-hover:-translate-x-0.5 group-hover:text-gold-deep">
                ‹
              </span>
            </button>

            <button
              onClick={onSaved}
              className="group flex w-full items-center gap-3 rounded-2xl border-2 border-line bg-card p-4 text-right shadow-sm transition hover:border-gold-deep hover:bg-gold/5"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold/15 text-gold-deep">
                <Bookmark size={22} />
              </span>
              <span className="flex-1">
                <span className="block text-base font-extrabold text-ink">
                  المحفوظات
                </span>
                <span className="block text-[11px] font-medium text-ink-soft">
                  الأسئلة اللي حفظتها 🔖 للرجوع لها
                </span>
              </span>
              <span className="text-xl text-ink-soft transition group-hover:-translate-x-0.5 group-hover:text-gold-deep">
                ‹
              </span>
            </button>
          </div>

          <p className="mt-6 rounded-2xl bg-gold/10 px-4 py-3 text-center text-[11px] font-medium leading-5 text-ink-soft">
            كل أسئلتك المنشورة تظهر باسم {profile.name} — شارك روابطها والناس
            تفوت ع نفس السؤال.
          </p>
        </div>
      </div>
    </div>
  );
}