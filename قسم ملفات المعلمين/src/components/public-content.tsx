import {
  FileText,
  Image as ImageIcon,
  Link2,
  Film,
  Download,
  ExternalLink,
  Paperclip,
  Play,
} from "lucide-react";
import type { TeacherContent } from "@/lib/teacher-files";

export function contentIcon(content: TeacherContent) {
  switch (content.content_type) {
    case "file":
      return <FileText className="h-4 w-4" />;
    case "image":
      return <ImageIcon className="h-4 w-4" />;
    case "video":
      return <Film className="h-4 w-4" />;
    default:
      return <Link2 className="h-4 w-4" />;
  }
}

function MainLink({ content }: { content: TeacherContent }) {
  if (content.content_type === "file" || content.content_type === "image") {
    return content.file_url ?? content.link_url ?? "#";
  }
  if (content.content_type === "video") {
    return content.link_url ?? content.file_url ?? "#";
  }
  return content.link_url ?? content.file_url ?? "#";
}

export function PublicContentItem({ content }: { content: TeacherContent }) {
  const href = MainLink({ content });
  const isVideoFile =
    content.content_type === "video" &&
    content.file_url &&
    (content.file_mime ?? "").startsWith("video/");

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      {content.content_type === "image" && content.file_url ? (
        <a href={content.file_url} target="_blank" rel="noreferrer" className="block">
          <img
            src={content.file_url}
            alt={content.title}
            className="mb-2 max-h-72 w-full rounded-lg border border-border object-contain"
            loading="lazy"
          />
        </a>
      ) : isVideoFile ? (
        <video
          src={content.file_url ?? undefined}
          controls
          preload="metadata"
          className="mb-2 w-full rounded-lg border border-border"
        />
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{contentIcon(content)}</span>
            <span className="truncate text-sm font-semibold">{content.title}</span>
          </div>
          {content.description && (
            <p className="mt-1 text-xs text-muted-foreground">{content.description}</p>
          )}
        </div>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
        >
          {content.content_type === "video" ? (
            <>
              <Play className="h-3 w-3" />
              مشاهدة
            </>
          ) : content.content_type === "file" ? (
            <>
              <Download className="h-3 w-3" />
              تحميل
            </>
          ) : content.content_type === "image" ? (
            <>
              <ExternalLink className="h-3 w-3" />
              فتح
            </>
          ) : (
            <>
              <ExternalLink className="h-3 w-3" />
              فتح
            </>
          )}
        </a>
      </div>
      {content.content_type === "file" && content.file_name && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Paperclip className="h-3 w-3" />
          <span className="truncate">{content.file_name}</span>
        </div>
      )}
    </div>
  );
}
