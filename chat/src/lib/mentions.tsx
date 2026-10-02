import { ReactNode } from "react";
import { extractMentions } from "@/components/MentionInput";
import { POINT_COSTS } from "@/lib/points";
import {
  FIELD_MENTION_COST,
  FIELD_MENTION_META,
  fieldOfGroupId,
  isFieldGroupId,
} from "@/lib/fieldMentions";

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
      const fieldId = fieldOfGroupId(uid);
      const gmeta = (GROUP_IDS as readonly string[]).includes(uid)
        ? GROUP_BADGES[uid as GroupId]
        : null;
      if (fieldId) {
        const fmeta = FIELD_MENTION_META[fieldId];
        parts.push(
          <span
            key={key++}
            className={"inline-flex items-center gap-1 rounded-full font-bold px-2 py-0.5 text-sm cursor-default " + fmeta.cls}
            title={fmeta.hint}
          >
            {fmeta.icon} حقل {fmeta.label}
          </span>
        );
      } else if (gmeta) {
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
  const fieldGroups = mentions.filter(mt => isFieldGroupId(mt.userId)) as { name: string; userId: string }[];
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
      .limit(500);
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
      .limit(500);
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
    if (isFieldGroupId(mt.userId)) continue;
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

  // منشن الحقل: كل أعضاء الحقل (عدا صاحبه) يوصلهم إشعار.
  for (const g of fieldGroups) {
    const field = fieldOfGroupId(g.userId);
    if (!field) continue;
    const { error } = await client.from("post_mentions").insert({
      ...source,
      actor_id: opts.actorId,
      user_id: null,
      is_all: false,
      mention_group: g.userId,
      mentioned_name: g.name || FIELD_MENTION_META[field].label,
      channel: opts.channel,
    } as any);
    if (error) continue;
    let fq = client
      .from("profiles")
      .select("user_id")
      .is("is_banned", false)
      .is("chat_banned", false)
      .eq("field", field)
      .limit(500);
    // احترم القناة المعروضة: لا منشن للبنات داخل قناة الشباب
    if (opts.channel === "male" || opts.channel === "female") fq = fq.eq("gender", opts.channel);
    const { data: members } = await fq;
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
}

/**
 * تكلفة الرسالة حسب المنشنات الموجودة فيها (توكن حقيقي، مو نص عادي):
 *   منشن شخص واحد  = سعر الرسالة (2)
 *   منشن حقل       = max(السعر, 3)  → منشور 5 · تعليق 3
 *   منشن جنس/الجميع = 10
 * المنشن الغالي ما بيخلي الرسالة أرخص أبداً.
 */
export function mentionCostFor(text: string, baseCost: number): number {
  let cost = baseCost;
  for (const mt of extractMentions(text)) {
    const id = mt.userId;
    if (!id) continue;
    if (id === EVERYONE_ID || (GROUP_IDS as readonly string[]).includes(id)) {
      cost = Math.max(cost, POINT_COSTS.everyone);
    } else if (isFieldGroupId(id)) {
      cost = Math.max(cost, FIELD_MENTION_COST);
    }
  }
  return cost;
}

/** هل النص فيه منشن غالٍ (جنس/الجميع)؟ — للعرض في الواجهة */
export function hasBulkMention(text: string): boolean {
  return extractMentions(text).some(
    mt => mt.userId === EVERYONE_ID || (GROUP_IDS as readonly string[]).includes(mt.userId || "") || isFieldGroupId(mt.userId),
  );
}
