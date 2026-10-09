import { supabase } from "@/integrations/supabase/client";

/**
 * التصويتات في الدردشة — الخادم هو المرجع، والواجهة تُحدّث محلياً للتفاؤل.
 *
 * الجداول (migration 20261008000004_chat_polls.sql):
 *   polls        (id, post_id, created_by, question, closed, created_at)
 *   poll_options (id, poll_id, position, text)
 *   poll_votes   (poll_id, option_id, user_id, created_at)  PK(poll_id,user_id)
 */

export interface PollOption {
  id: string;
  text: string;
  count: number;
}

export interface PollData {
  id: string;
  question: string;
  options: PollOption[];
  total: number;
  /** الخيار الذي صوّت له المستخدم الحالي — null إن لم يصوّت. */
  myOptionId: string | null;
  closed: boolean;
}

/** يجلب تصويتات مجموعة منشورات ويجمّع الأصوات محلياً. */
export async function fetchPollsForPosts(
  postIds: string[],
  userId: string
): Promise<Record<string, PollData>> {
  const out: Record<string, PollData> = {};
  if (!postIds.length) return out;

  const db = supabase as any;
  const { data: polls, error: pollsErr } = await db
    .from("polls")
    .select("id, post_id, question, closed")
    .in("post_id", postIds);
  if (pollsErr || !polls || polls.length === 0) return out;

  const pollIds = polls.map((p: any) => p.id);
  const [{ data: options }, { data: votes }] = await Promise.all([
    db.from("poll_options").select("id, poll_id, text, position").in("poll_id", pollIds),
    db.from("poll_votes").select("poll_id, option_id, user_id").in("poll_id", pollIds),
  ]);

  const optionsByPoll: Record<string, PollOption[]> = {};
  (options || [])
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    .forEach((o: any) => {
      (optionsByPoll[o.poll_id] ||= []).push({ id: o.id, text: o.text, count: 0 });
    });

  (votes || []).forEach((v: any) => {
    const opt = (optionsByPoll[v.poll_id] || []).find((o) => o.id === v.option_id);
    if (opt) opt.count += 1;
  });

  polls.forEach((p: any) => {
    const opts = optionsByPoll[p.id] || [];
    const myVote = (votes || []).find((v: any) => v.poll_id === p.id && v.user_id === userId);
    out[p.post_id] = {
      id: p.id,
      question: p.question,
      options: opts,
      total: opts.reduce((s, o) => s + o.count, 0),
      myOptionId: myVote ? myVote.option_id : null,
      closed: !!p.closed,
    };
  });

  return out;
}

/** إنشاء تصويت — المالك والأدمن فقط (الخادم يرفض غيرهما). */
export async function createPoll(
  content: string,
  channel: string,
  options: string[]
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await (supabase as any).rpc("create_poll", {
    p_content: content,
    p_channel: channel,
    p_options: options,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.id) {
    return { ok: false, error: row?.error_message || error?.message || "فشل إنشاء التصويت" };
  }
  return { ok: true };
}

/** تسجيل صوت (يستبدل الصوت السابق لنفس المستخدم — اختيار واحد). */
export async function votePoll(
  pollId: string,
  optionId: string,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await (supabase as any)
    .from("poll_votes")
    .upsert(
      { poll_id: pollId, option_id: optionId, user_id: userId },
      { onConflict: "poll_id,user_id" }
    );
  if (error) {
    const msg = String(error.message || error);
    if (/poll_closed/.test(msg)) return { ok: false, error: "انتهى هذا التصويت" };
    if (/invalid_option/.test(msg)) return { ok: false, error: "خيار غير صالح" };
    return { ok: false, error: "تعذر تسجيل صوتك" };
  }
  return { ok: true };
}

/** تطبيق صوت محلياً على الكائن (للتفاعل الفوري قبل تأكيد الخادم). */
export function applyVote(poll: PollData, optionId: string): PollData {
  if (poll.closed || poll.myOptionId === optionId) return poll;
  const options = poll.options.map((o) => ({ ...o }));
  if (poll.myOptionId) {
    const prev = options.find((o) => o.id === poll.myOptionId);
    if (prev) prev.count = Math.max(0, prev.count - 1);
  }
  const next = options.find((o) => o.id === optionId);
  if (next) next.count += 1;
  return {
    ...poll,
    options,
    total: options.reduce((s, o) => s + o.count, 0),
    myOptionId: optionId,
  };
}
