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
  Heart,
  Search,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { listPublishedTeachers } from "@/lib/teacher-files";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type TeacherCard = Awaited<ReturnType<typeof listPublishedTeachers>>[number];

function Chip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${className ?? "bg-muted text-muted-foreground"}`}
    >
      {label}
    </span>
  );
}

function TeacherCardView({ t }: { t: TeacherCard }) {
  return (
    <Link
      to={`/t/${t.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-primary/10 bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      <div className="h-1 w-full bg-gradient-to-l from-primary via-primary/60 to-accent" />
      <div className="flex items-start gap-3 p-4">
        <Avatar className="h-16 w-16 shrink-0 rounded-2xl ring-1 ring-primary/20">
          <AvatarImage src={t.photo_url ?? undefined} />
          <AvatarFallback className="rounded-2xl bg-primary text-lg font-bold text-primary-foreground">
            {t.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-base font-bold">{t.name}</h3>
            {t.featured && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
          </div>
          {t.bio && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.bio}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pb-4">
        {t.subjects.slice(0, 4).map((s) => (
          <Chip key={"s" + s} label={s} className="bg-primary/10 text-primary" />
        ))}
        {t.subjects.length > 4 && <Chip label={`+${t.subjects.length - 4}`} />}
        {t.fields.map((f) => (
          <Chip key={"f" + f} label={f} className="bg-accent/40 text-accent-foreground" />
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
  },
  {
    icon: ClipboardList,
    title: "امتحانات ومراجعات",
    body: "نماذج امتحانات ومراجعات أعدها معلموك خصيصاً لطلاب مدارك جو.",
  },
  {
    icon: Users,
    title: "مباشرة من معلميك",
    body: "كل ملف منشور من معلم القسم نفسه — ولا يحتاج أي تسجيل.",
  },
];

function PublicHome() {
  const [teachers, setTeachers] = useState<TeacherCard[] | null>(null);
  const [q, setQ] = useState("");

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

  const query = q.trim().toLowerCase();
  const filtered =
    teachers === null
      ? null
      : query
        ? teachers.filter((t) =>
            [t.name, t.bio, ...t.subjects, ...t.fields, ...t.grades]
              .filter(Boolean)
              .some((s) => String(s).toLowerCase().includes(query)),
          )
        : teachers;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader showAdminLink />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[oklch(0.42_0.07_225)] via-[oklch(0.47_0.05_220)] to-[oklch(0.55_0.04_200)] p-8 text-white shadow-lg">
          <div className="pointer-events-none absolute -left-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 right-10 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
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
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-primary">
                <GraduationCap className="h-4 w-4" />
                {teachers === null ? "..." : `${teachers.length} معلم`}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold backdrop-blur">
                <Heart className="h-3.5 w-3.5" /> بدون تسجيل
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold backdrop-blur">
                <Star className="h-3.5 w-3.5 fill-white" /> مباشرة من معلميك
              </span>
            </div>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-3 text-sm font-bold">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-8">
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث عن معلم أو مادة أو حقل أو صف..."
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-4 pr-9 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {filtered === null ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-primary/25 bg-card py-14 text-center">
              <Search className="mx-auto h-8 w-8 text-primary/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                {teachers?.length === 0 ? "لا يوجد معلمون حاليًا. تابعنا قريباً!" : "لا توجد نتائج مطابقة"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filtered.map((t) => (
                <TeacherCardView key={t.id} t={t} />
              ))}
            </div>
          )}
        </section>

        <footer className="mt-12 flex flex-col items-center gap-3 pb-4 text-center">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
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