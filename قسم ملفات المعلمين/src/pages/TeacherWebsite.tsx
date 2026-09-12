import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, ExternalLink, Globe, Loader2 } from "lucide-react";
import { getPublicTeacher } from "@/lib/teacher-files";

function TeacherWebsite() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [url, setUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    if (!slug) return;
    getPublicTeacher(slug)
      .then((d) => {
        if (!active) return;
        if (!d?.teacher?.website_url) {
          setMissing(true);
          return;
        }
        setUrl(d.teacher.website_url);
        setName(d.teacher.name || "");
      })
      .catch(() => {
        if (active) setMissing(true);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (missing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <Globe className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">لا يوجد موقع مخصص لهذا المدرس</p>
        <button
          onClick={() => navigate("/t/" + slug, { replace: true })}
          className="text-sm font-medium text-primary hover:underline"
        >
          العودة لصفحة المدرس
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="z-10 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() =>
              window.history.length > 1 ? navigate(-1) : navigate("/t/" + slug, { replace: true })
            }
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            رجوع
          </button>
          <span className="truncate text-sm font-semibold">
            <Globe className="ml-1 inline h-3.5 w-3.5 text-primary" />
            {name ? `الموقع المخصص — ${name}` : "الموقع المخصص"}
          </span>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            تبويب جديد
          </a>
        )}
      </header>
      <div className="flex-1">
        {url ? (
          <iframe src={url} title="موقع المدرس" className="h-full w-full border-0" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

export default TeacherWebsite;