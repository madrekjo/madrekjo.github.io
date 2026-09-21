import { ReactNode } from "react";
import { extractMentions } from "@/components/MentionInput";

const MENTION_INLINE_RE = /\[@([^\]\n]+)\]\(user:([^)]+)\)/g;

const EVERYONE_ID = "everyone";

const GROUP_IDS = ["boys", "girls"] as const;
type GroupId = (typeof GROUP_IDS)[number];

const GROUP_BADGES: Record<GroupId, { label: string; title: string; cls: string; icon: string }> = {
  boys: { label: "الشباب", title: "منشن لجميع الشباب", cls: "bg-sky-500/15 text-sky-600", icon: "👦" },
  girls: { label: "البنات", title: "منشن لجميع البنات", cls: "bg-pink-500/15 text-pink-600", icon: "👧" },
};

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
    if (uid === EVERYONE_ID) {
      parts.push(
        <span
          key={key++}
          className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary font-bold px-2 py-0.5 text-sm cursor-default"
          title="منشن للجميع"
        >
          {name}
        </span>
      );
    } else {
      const gmeta = (GROUP_IDS as readonly string[]).includes(uid)
        ? GROUP_BADGES[uid as GroupId]
        : null;
      if (gmeta) {
        parts.push(
          <span
            key={key++}
            className={"inline-flex items-center gap-1 rounded-full font-bold px-2 py-0.5 text-sm cursor-default " + gmeta.cls}
            title={gmeta.title}
          >
            {gmeta.icon} {gmeta.label}
          </span>
        );
      } else {
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
      }
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * يحفظ المنشنات عند نشر منشور/تعليق/رد:
 * - المنشن العادي: صف في post_mentions + إشعار لكل مذكور.
 * - منشن "الجميع" (للأدمن فقط): صف بـ is_all + إشعار لكل أعضاء القناة.
 */
export async function submitMentions(client: any, opts: {
  postId?: string;
  commentId?: string;
  actorId: string;
  text: string;
  channel: string;
}): Promise<void> {
  const mentions = extractMentions(opts.text);
  const everyone = mentions.some(mt => mt.userId === EVERYONE_ID);
  const groups = mentions.filter(mt => (GROUP_IDS as readonly string[]).includes(mt.userId)) as { name: string; userId: GroupId }[];
  const source = {
    post_id: opts.postId || null,
    comment_id: opts.commentId || null,
  } as any;

  if (everyone) {
    const { error } = await client.from("post_mentions").insert({
      ...source,
      actor_id: opts.actorId,
      user_id: null,
      is_all: true,
      mentioned_name: "الجميع",
      channel: opts.channel,
    });
    if (error) {
      // ممنوع أو غير مدعوم في قاعدة البيانات (غير مطبق التراجع الجديد) — لا نرسل إشعارات
      return;
    }
    let q = client
      .from("profiles")
      .select("user_id")
      .is("is_banned", false)
      .is("chat_banned", false)
      .limit(200);
    if (opts.channel === "male" || opts.channel === "female") q = q.eq("gender", opts.channel);
    else if (opts.channel === "09" || opts.channel === "10") q = q.eq("generation", opts.channel);
    const { data: members } = await q;
    const rows = (members || [])
      .filter((mem: any) => mem.user_id && mem.user_id !== opts.actorId)
      .map((mem: any) => ({
        user_id: mem.user_id,
        actor_id: opts.actorId,
        type: "mention",
        post_id: source.post_id,
        comment_id: source.comment_id,
      }));
    if (rows.length) {
      try { await client.from("notifications").insert(rows); } catch { /* تجاهل */ }
    }
  }

  // منشن الجنس (الشباب/البنات): كل عضو يذكر جنسه فقط — trigger يضمن ذلك.
  for (const g of groups) {
    const { error } = await client.from("post_mentions").insert({
      ...source,
      actor_id: opts.actorId,
      user_id: null,
      is_all: false,
      mention_group: g.userId,
      mentioned_name: g.name,
      channel: opts.channel,
    } as any);
    if (error) continue;
    const { data: members } = await client
      .from("profiles")
      .select("user_id")
      .is("is_banned", false)
      .is("chat_banned", false)
      .eq("gender", g.userId)
      .limit(200);
    const rows = (members || [])
      .filter((mem: any) => mem.user_id && mem.user_id !== opts.actorId)
      .map((mem: any) => ({
        user_id: mem.user_id,
        actor_id: opts.actorId,
        type: "mention",
        post_id: source.post_id,
        comment_id: source.comment_id,
      }));
    if (rows.length) {
      try { await client.from("notifications").insert(rows); } catch { /* تجاهل */ }
    }
  }

  for (const mt of mentions) {
    if (!mt.userId || mt.userId === EVERYONE_ID || mt.userId === opts.actorId) continue;
    if ((GROUP_IDS as readonly string[]).includes(mt.userId)) continue;
    try {
      await client.from("post_mentions").insert({
        ...source,
        actor_id: opts.actorId,
        user_id: mt.userId,
        mentioned_name: mt.name,
        channel: opts.channel,
      });
      await client.from("notifications").insert({
        user_id: mt.userId,
        actor_id: opts.actorId,
        type: "mention",
        post_id: source.post_id,
        comment_id: source.comment_id,
      });
    } catch { /* تجاهل */ }
  }
}