import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, Star, Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { listPublishedTeachers } from "@/lib/teacher-files";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type TeacherCard = Awaited<ReturnType<typeof listPublishedTeachers>>[number];

function Chip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${className ?? "bg-muted text-muted-foreground"}`}
    >
      {label}
    </span>
  );
}

function TeacherCardView({ t }: { t: TeacherCard }) {
  return (
    <Link
      to={`/t/${t.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/50 hover:shadow-lg"
    >
      <div className="flex items-start gap-3 p-4">
        <Avatar className="h-16 w-16 shrink-0 rounded-xl">
          <AvatarImage src={t.photo_url ?? undefined} />
          <AvatarFallback className="rounded-xl bg-primary/15 text-lg font-bold text-primary">
            {t.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-base font-bold">{t.name}</h3>
            {t.featured && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
          </div>
          {t.bio && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.bio}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pb-4">
        {t.subjects.slice(0, 4).map((s) => (
          <Chip key={"s" + s} label={s} className="bg-primary/10 text-primary" />
        ))}
        {t.subjects.length > 4 && <Chip label={`+${t.subjects.length - 4}`} />}
        {t.fields.map((f) => (
          <Chip key={"f" + f} label={f} className="bg-accent/30 text-accent-foreground" />
        ))}
        {t.grades.map((g) => (
          <Chip key={"g" + g} label={g} />
        ))}
      </div>
    </Link>
  );
}

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
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <GraduationCap className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">ملفات المعلمين</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ملفات، ملخصات، امتحانات، ومراجعات مباشرة من معلمي مدارك جو.
          </p>
        </div>

        {teachers === null ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : teachers.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">لا يوجد معلمون حاليًا.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {teachers.map((t) => (
              <TeacherCardView key={t.id} t={t} />
            ))}
          </div>
        )}
        <div className="mt-10 flex justify-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">مدارك جو</Badge>
          <Badge variant="outline">مجاناً 100%</Badge>
        </div>
      </main>
    </div>
  );
}

export default PublicHome;
