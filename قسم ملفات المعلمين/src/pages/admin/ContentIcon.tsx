import { FileText, Image as ImageIcon, Link2, Film } from "lucide-react";
import type { TeacherContent } from "@/lib/teacher-files";

export function ContentIcon({ content }: { content: TeacherContent }) {
  switch (content.content_type) {
    case "file":
      return <FileText className="h-4 w-4 text-primary" />;
    case "image":
      return <ImageIcon className="h-4 w-4 text-primary" />;
    case "video":
      return <Film className="h-4 w-4 text-primary" />;
    default:
      return <Link2 className="h-4 w-4 text-primary" />;
  }
}
