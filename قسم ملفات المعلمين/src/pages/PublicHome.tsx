import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  GraduationCap,
  Star,
  Loader2,
  Sparkles,
  BookOpenCheck,
  ClipboardList,
  Users,
  ArrowLeft,
  Heart,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { listPublishedTeachers } from "@/lib/teacher-files";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type TeacherCard = Awaited<ReturnType<typeof listPublishedTeachers>>[number];

function Chip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${className ?? "bg-slate-100 text-slate-500"}`}
    >
      {label}
    </span>
  );
}

function TeacherCardView({ t }: { t: TeacherCard }) {
  return (
    <Link
      to={`/t/${t.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-teal-100 bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-lg"
    >
      <div className="h-1.5 w-full bg-gradient-to-l from-teal-500 via-cyan-400 to-sky-400" />
      <div className="flex items-start gap-3 p-4">
        <Avatar className="h-16 w-16 shrink-0 rounded-2xl ring-2 ring-teal-100">
          <AvatarImage src={t.photo_url ?? undefined} />
          <AvatarFallback className="rounded-2xl bg-gradient-to-br from-teal-500 to-sky-500 text-lg font-bold text-white">
            {t.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-base font-bold">{t.name}</h3>
            {t.featured && (
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            )}
          </div>
          {t.bio && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.bio}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pb-4">
        {t.subjects.slice(0, 4).map((s) => (
          <Chip key={"s" + s} label={s} className="bg-teal-50 text-teal-700" />
        ))}
        {t.subjects.length > 4 && <Chip label={`+${t.subjects.length - 4}`} />}
        {t.fields.map((f) => (
          <Chip key={"f" + f} label={f} className="bg-amber-50 text-amber-700" />
        ))}
        {t.grades.map((g) => (
          <Chip key={"g" + g} label={g} />
        ))}
      </div>
    </Link>
  );
}

const FEATURES = [
  {
    icon: BookOpenCheck,
    title: "ملفات وملخصات",
    body: "ملخصات وملاحظات مرتبة تساعدك تراجع بذكاء قبل الامتحان.",
    color: "bg-teal-100 text-teal-700",
  },
  {
    icon: ClipboardList,
    title: "امتحانات ومراجعات",
    body: "نماذج امتحانات ومراجعات أعدها معلموك خصيصاً لطلاب مدارك جو.",
    color: "bg-sky-100 text-sky-700",
  },
  {
    icon: Users,
    title: "مباشرة من معلميك",
    body: "كل ملف منشور من معلم القسم نفسه—ولا يحتاج أي تسجيل.",
    color: "bg-amber-100 text-amber-700",
  },
];

function PublicHome() {
  const [teachers, setTeachers] = useState<TeacherCard[] | null>(null);

  useEffect(() => {
    let active = true;
    listPublishedTeachers()
      .then((rows) => {
        if (active) setTeachers(rows);
      })
      .catch(() => {
        if (active) setTeachers([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader showAdminLink />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-500 via-cyan-500 to-sky-400 p-8 text-white shadow-xl">
          <div className="pointer-events-none absolute -left-10 -top-16 h-48 w-48 rounded-full bg-white/20 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 right-10 h-56 w-56 rounded-full bg-amber-200/30 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> مجاناً 100% لطلاب مدارك جو
            </span>
            <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">
              ملفات المعلمين
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/90 sm:text-base">
              ملفات، ملخصات، امتحانات، ومراجعات مباشرة من معلمي مدارك جو —
              كل ما يحتاجه الطالب في مكان واحد وبضغطة واحدة.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-teal-700">
                <GraduationCap className="h-4 w-4" />
                {teachers === null ? "..." : `${teachers.length} معلم`}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-4 py-1.5 text-xs font-semibold backdrop-blur">
                <Heart className="h-3.5 w-3.5" /> بدون تسجيل
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-4 py-1.5 text-xs font-semibold backdrop-blur">
                <Star className="h-3.5 w-3.5 fill-white" /> مباشرة من معلميك
              </span>
            </div>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-teal-100 bg-card p-5 shadow-sm transition hover:shadow-md"
            >
              <span
                className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${f.color}`}
              >
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-3 text-sm font-bold">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">معلمو المدارس</h2>
            <span className="text-xs text-muted-foreground">اختر معلمك لتصفح ملفاته</span>
          </div>

          {teachers === null ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : teachers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-teal-200 bg-white/60 py-14 text-center">
              <GraduationCap className="mx-auto h-8 w-8 text-teal-400" />
              <p className="mt-3 text-sm text-muted-foreground">
                لا يوجد معلمون حاليًا. تابعنا قريباً!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {teachers.map((t) => (
                <TeacherCardView key={t.id} t={t} />
              ))}
            </div>
          )}
        </section>

        <footer className="mt-12 flex flex-col items-center gap-3 pb-4 text-center">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-sky-500 text-white">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold">ملفات المعلمين</span>
          </div>
          <p className="text-xs text-muted-foreground">
            من معلمي مدارك جو، لطلاب مدارك جو — مجاناً دائماً.
          </p>
        </footer>
      </main>
    </div>
  );
}

export default PublicHome;