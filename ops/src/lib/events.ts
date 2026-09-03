export interface OpsEvent {
  time: string;
  label: string;
  detail: string;
  tone: "info" | "ok" | "warn" | "alert";
}

export function nowTime(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function eventFromPost(post: any, source: string, tone: OpsEvent["tone"]): OpsEvent {
  return {
    time: nowTime(),
    label: source,
    detail: truncate(post.content || `${source} نشاط جديد`),
    tone,
  };
}

export function truncate(text: string, max = 70): string {
  const t = text.trim();
  return t.length > max ? t.slice(0, max).trim() + "…" : t;
}