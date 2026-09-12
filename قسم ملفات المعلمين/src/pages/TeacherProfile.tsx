import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  GraduationCap,
  Loader2,
  ArrowRight,
  Globe,
  MapPin,
  BookOpen,
  Users,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { PlatformBrandIcon, socialDisplayName } from "@/components/social-icons";
import { SiteHeader } from "@/components/site-header";
import { getPublicTeacher } from "@/lib/teacher-files";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PublicContentItem } from "@/components/public-content";

function Chip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${className ?? "bg-muted text-muted-foreground"}`}
    >
      {label}
    </span>
  );
}

function SocialRow({ platform, url }: { platform: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs transition hover:bg-accent"
    >
      <PlatformBrandIcon name={platform} className="h-3.5 w-3.5" />
      {socialDisplayName(platform)}
    </a>
  );
}

function TeacherProfile() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<Awaited<ReturnType<typeof getPublicTeacher>> | null | undefined>(
    undefined,
  );

  async function share() {
    const url = `${window.location.origin}/teacher-files/t/${slug}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "صفحة معلم", url });
        return;
      } catch {
        /* المستخدم ألغى المشاركة */
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("تم نسخ رابط الصفحة");
  }

  useEffect(() => {
    let active = true;
    setData(undefined);
    if (!slug) return;
    getPublicTeacher(slug)
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {
        if (active) setData(null);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (data === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader showAdminLink />
        <div className="flex justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (data === null || !data) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader showAdminLink />
        <div className="py-24 text-center">
          <p className="text-sm text-muted-foreground">الصفحة غير موجودة</p>
          <Link to="/" className="mt-4 inline-flex text-sm text-primary hover:underline">
            العودة للرئيسية
          </Link>
        </div>
      </div>
    );
  }

  const { teacher, sections } = data;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader showAdminLink />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-3 w-3" />
          جميع المعلمين
        </Link>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="h-24 bg-gradient-to-l from-primary/30 via-accent/20 to-transparent" />
          <div className="-mt-10 px-5 pb-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-2">
                <Avatar className="h-20 w-20 rounded-2xl border-4 border-card">
                  <AvatarImage src={teacher.photo_url ?? undefined} />
                  <AvatarFallback className="rounded-2xl bg-primary/20 text-2xl font-bold text-primary">
                    {teacher.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h1 className="text-2xl font-bold">{teacher.name}</h1>
                  <p className="mt-0.5 text-sm text-muted-foreground">معلم في مدارك جو</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={share}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  مشاركة
                </button>
                {teacher.website_url && (
                  <a
                    href={teacher.website_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    الموقع
                  </a>
                )}
                {(teacher.social_links as { platform?: string; url?: string }[]).map(
                  (s, i) =>
                    s?.url && <SocialRow key={i} platform={s?.platform ?? "تواصل"} url={s.url} />,
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {teacher.subjects.length > 0 && (
                <>
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  {teacher.subjects.map((s) => (
                    <Chip key={"s" + s} label={s} className="bg-primary/10 text-primary" />
                  ))}
                </>
              )}
              {teacher.fields.map((f) => (
                <Chip key={"f" + f} label={f} className="bg-accent/30 text-accent-foreground" />
              ))}
              {teacher.grades.map((g) => (
                <Chip key={"g" + g} label={g} />
              ))}
            </div>

            {teacher.bio && (
              <p className="mt-4 whitespace-pre-wrap border-t border-border pt-4 text-sm leading-relaxed">
                {teacher.bio}
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 space-y-5">
          {teacher.website_url && (
            <section className="rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Globe className="h-4 w-4 shrink-0 text-primary" />
                  <h2 className="text-base font-bold">الموقع المخصص للأستاذ</h2>
                </div>
                <Link
                  to={`/t/${slug}/website`}
                  className="shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20"
                >
                  افتح الموقع
                </Link>
              </div>
            </section>
          )}

          {sections.map((section) => (
            <section key={section.id} className="rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <span className="text-xl">{section.icon || "📁"}</span>
                <div className="min-w-0">
                  <h2 className="text-base font-bold">{section.name}</h2>
                  {section.description && (
                    <p className="truncate text-xs text-muted-foreground">{section.description}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2">
                {section.contents.map((c) => (
                  <PublicContentItem key={c.id} content={c} />
                ))}
              </div>
            </section>
          ))}

          {sections.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              لا توجد ملفات منشورة بعد.
            </div>
          )}
        </div>

        {sections.length > 0 && (
          <div className="mt-10 flex justify-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> مدارك جو
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> مجاناً لجميع الطلاب
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <GraduationCap className="h-3 w-3" /> كل ما يحتاجه الطالب
            </span>
          </div>
        )}
      </main>
    </div>
  );
}

export default TeacherProfile;
