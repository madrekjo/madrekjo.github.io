import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "../config/supabase-config";
import type { Ayah, Option, OptionKey, Question } from "../types";

/**
 * طبقة قاعدة البيانات لقسم «اكتب سؤالك».
 * عند إدخال مفاتيح Supabase في .env تتحول كل الدوال من المحلية إلى السحابية
 * دون أي تغيير في الواجهة.
 */

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export function dbAvailable(): boolean {
  return !!supabase;
}

// ---- الربط بين سطر القاعدة و نوع Question الواجهة ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toQuestion(r: any): Question {
  const author = Array.isArray(r.author)
    ? r.author[0] ?? null
    : (r.author ?? null);
  const has4 = Array.isArray(r.options) && r.options.length === 4;
  const options: [Option, Option, Option, Option] = has4
    ? r.options
    : [
        { key: "أ", text: (r.options?.[0]?.text ?? "") || "أ" },
        { key: "ب", text: r.options?.[1]?.text ?? "ب" },
        { key: "ج", text: r.options?.[2]?.text ?? "ج" },
        { key: "د", text: r.options?.[3]?.text ?? "د" },
      ];
  return {
    id: r.id,
    question: r.question,
    image: r.image_url ?? undefined,
    options,
    correct: (r.correct as OptionKey) ?? "أ",
    field: r.field,
    subject: r.subject,
    grade: r.grade ?? undefined,
    ayah: r.ayah ?? undefined,
    author: author?.username ?? "طالب مدارك جو",
    likes: r.likes_count ?? r.reactions ?? 0,
    reactions: r.reactions ?? 0,
    answersCount: r.answers_count ?? 0,
  };
}

const QUESTION_SELECT = `
  id, author_id, question, image_url, options, correct, field, subject,
  grade, ayah, reactions, answers_count, created_at,
  author:profiles!questions_author_id_fkey(username)
`;

// ---- الدوال العامة ----

export async function listQuestions(): Promise<Question[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("questions")
    .select(QUESTION_SELECT + ", likes(count)");
  if (error) throw error;

  const stats = await fetchLikesStats();
  const rows = (data ?? []) as unknown as { id: string }[];
  return rows.map((r) => toQuestion({ ...r, likes_count: stats.get(r.id) ?? 0 }));
}

async function fetchLikesStats(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!supabase) return map;
  const { data, error } = await supabase.from("question_stats").select("question_id, likes_count");
  if (error) return map;
  (data ?? []).forEach((s) => map.set(s.question_id, s.likes_count));
  return map;
}

export async function fetchQuestion(id: string): Promise<Question | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("questions")
    .select(QUESTION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: st } = await supabase
    .from("question_stats")
    .select("likes_count")
    .eq("question_id", id)
    .maybeSingle();
  return toQuestion({ ...data, likes_count: st?.likes_count ?? 0 });
}

export type NewQuestionInput = {
  author_id: string;
  question: string;
  image_url?: string | null;
  options: { key: string; text: string }[];
  correct: string;
  field: string;
  subject: string;
  grade?: string | null;
  ayah?: Ayah | null;
};

export async function insertQuestion(input: NewQuestionInput): Promise<Question> {
  if (!supabase) throw new Error("القاعدة غير مربوطة بعد");
  const { data, error } = await supabase
    .from("questions")
    .insert({
      author_id: input.author_id,
      question: input.question,
      image_url: input.image_url ?? null,
      options: input.options,
      correct: input.correct,
      field: input.field,
      subject: input.subject,
      grade: input.grade ?? null,
      ayah: input.ayah ?? null,
    })
    .select(QUESTION_SELECT)
    .single();
  if (error) throw error;
  return toQuestion(data);
}

export async function deleteQuestion(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("questions").delete().eq("id", id);
  if (error) throw error;
}

// ---- اللايكات ----

export async function isLiked(userId: string, questionId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase
    .from("likes")
    .select("user_id")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .maybeSingle();
  return !!data;
}

export async function toggleLike(userId: string, questionId: string): Promise<boolean> {
  if (!supabase) throw new Error("القاعدة غير مربوطة بعد");
  const liked = await isLiked(userId, questionId);
  if (liked) {
    await supabase
      .from("likes")
      .delete()
      .eq("user_id", userId)
      .eq("question_id", questionId);
    return false;
  }
  await supabase.from("likes").insert({ user_id: userId, question_id: questionId });
  return true;
}

// ---- المحفوظات ----

export async function listSavedIds(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("saves")
    .select("question_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((s) => s.question_id);
}

export async function toggleSave(userId: string, questionId: string): Promise<boolean> {
  if (!supabase) throw new Error("القاعدة غير مربوطة بعد");
  const { data } = await supabase
    .from("saves")
    .select("question_id")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .maybeSingle();
  if (data) {
    await supabase
      .from("saves")
      .delete()
      .eq("user_id", userId)
      .eq("question_id", questionId);
    return false;
  }
  await supabase.from("saves").insert({ user_id: userId, question_id: questionId });
  return true;
}

// ---- الإجابة / إعادة الحل ----

export type AttemptInput = {
  userId: string;
  questionId: string;
  chosen: string;
  correct: boolean;
};

export async function fetchCorrectCount(userId: string): Promise<number> {
  if (!supabase) return 0;
  const { count } = await supabase
    .from("answer_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("correct", true);
  return count ?? 0;
}

export async function recordAttempt(input: AttemptInput): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase
    .from("answer_attempts")
    .select("attempts")
    .eq("user_id", input.userId)
    .eq("question_id", input.questionId)
    .maybeSingle();

  const base = {
    user_id: input.userId,
    question_id: input.questionId,
    chosen: input.chosen,
    correct: input.correct,
    updated_at: new Date().toISOString(),
  };
  if (data) {
    await supabase
      .from("answer_attempts")
      .update({ ...base, attempts: (data.attempts ?? 0) + 1 })
      .eq("user_id", input.userId)
      .eq("question_id", input.questionId);
  } else {
    await supabase.from("answer_attempts").insert({ ...base, attempts: 1 });
  }
}

export async function clearAttempt(userId: string, questionId: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("answer_attempts")
    .delete()
    .eq("user_id", userId)
    .eq("question_id", questionId);
}

// ---- البروفايل ----

export async function myProfile(userId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, field, grade")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(
  userId: string,
  input: { username: string; field: string; grade: string }
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("profiles")
    .update({
      username: input.username,
      field: input.field,
      grade: input.grade || null,
    })
    .eq("id", userId);
  if (error) throw error;
}