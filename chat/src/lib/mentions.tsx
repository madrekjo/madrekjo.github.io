import { ReactNode } from "react";

const MENTION_INLINE_RE = /\[@([^\]\n]+)\]\(user:([^)]+)\)/g;

/**
 * يحول نص المنشور/التعليق الذي يحتوي منشنات بالصيغة:
 *   [@الاسم](user:UUID)
 * إلى عناصر تفاعلية (رابطة + اسم ملون).
 * النص العادي يُرجع كما هو.
 */
export function renderMentions(text: string, onOpenProfile?: (userId: string) => void): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MENTION_INLINE_RE.lastIndex = 0;
  let key = 0;
  while ((m = MENTION_INLINE_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const name = m[1];
    const uid = m[2];
    parts.push(
      <button
        key={key++}
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpenProfile?.(uid); }}
        className="text-primary font-medium hover:underline cursor-pointer"
        title={name}
      >
        @{name}
      </button>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}