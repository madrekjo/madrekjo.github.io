import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "./device";
import type { CardColor } from "./colors";

export interface Line {
  id: string;
  text: string;
  book: string;
  author: string;
  category: Category;
  submitter: string;
  color: CardColor;
  likes: number;
  shares: number;
  visits: number;
  stars: number;
  featured_date: string | null;
  created_at: string;
  user_id: string | null;
}

export type Category = "رواية" | "ديني" | "تنمية" | "شعر" | "تاريخ";

export interface ReelRow {
  line_id: string;
  text: string;
  book: string;
  author: string;
  category: Category;
  submitter: string;
  color: CardColor;
  likes: number;
  stars: number;
  shares: number;
  visits: number;
  created_at: string;
  user_id: string | null;
  username: string | null;
  bio: string | null;
}

export interface WeeklyTopRow {
  line_id: string;
  text: string;
  book: string;
  author: string;
  category: Category;
  submitter: string;
  likes: number;
  shares: number;
  week_shares: number;
}

export interface MyReport {
  report_id: string;
  line_id: string;
  line_text: string;
  platform: string;
  reach: number;
  reactions: number;
  note: string;
  created_at: string;
}

export interface MyProof {
  proof_id: string;
  line_id: string;
  line_text: string;
  storage_path: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  nickname: string;
  message: string;
  device_id: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  username: string;
  bio: string;
  avatar_url: string;
  card_count: number;
  likes_total: number;
  shares_total: number;
  stars_earned: number;
  stars_avg: number;
  stars_count: number;
  followers_count: number;
  following_count: number;
}

export interface NotebookPage {
  id: number;
  user_id: string;
  content: string;
  is_public: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

function errorMessage(err: { message?: string; details?: string; hint?: string } | null, fallback: string): string {
  if (err?.message) {
    const m = err.message;
    if (m.includes("does not exist") || (m.includes("function") && m.includes("not found")))
      return "القاعدة تنتظر تنفيذ Migration — افتح Supabase → SQL Editor ونفّذ ملف profiles.sql ثم platform.sql";
    if (err.details) return m + " — " + err.details;
    return m;
  }
  return fallback;
}

export async function fetchLines(): Promise<Line[]> {
  const { data, error } = await supabase.rpc("get_lines");
  if (error) throw new Error(errorMessage(error, "تعذّر تحميل السطور"));
  return (data ?? []) as Line[];
}

export async function submitLine(input: {
  text: string;
  book: string;
  author?: string;
  category: Category;
  submitter: string;
  color?: CardColor;
}): Promise<{ id: string; tooMany?: boolean }> {
  const { data, error } = await supabase.rpc("submit_line", {
    p_text: input.text,
    p_book: input.book,
    p_author: input.author ?? "",
    p_category: input.category,
    p_submitter: input.submitter,
    p_color: input.color ?? "",
    p_device: getDeviceId(),
  });
  if (error) {
    throw new Error(
      errorMessage(
        error,
        "تعذّر إضافة السطر — تأكد من تشغيل قاعدة البيانات (Migration)"
      )
    );
  }
  return { id: data as string };
}

export async function likeLine(lineId: string): Promise<number> {
  const { data, error } = await supabase.rpc("like_line", {
    p_line: lineId,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر تسجيل القلب"));
  return Number(data ?? 0);
}

export async function fetchMyLikedIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc("my_liked_line_ids", {
    p_device: getDeviceId(),
  });
  if (error) return [];
  return ((data ?? []) as (string | number)[]).map((x) => String(x));
}

export async function recordShare(
  lineId: string,
  platform: string
): Promise<number> {
  const { data, error } = await supabase.rpc("record_share", {
    p_line: lineId,
    p_platform: platform,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر تسجيل المشاركة"));
  return (data as number) ?? 0;
}

export async function confirmShare(lineId: string): Promise<number> {
  const { data, error } = await supabase.rpc("confirm_share", {
    p_line: lineId,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر اعتماد المشاركة"));
  return (data as number) ?? 0;
}

export async function recordVisit(lineId: string): Promise<void> {
  await supabase.rpc("record_visit", { p_line: lineId });
}

export async function weeklyTop(limit = 3): Promise<WeeklyTopRow[]> {
  const { data, error } = await supabase.rpc("weekly_top", { p_limit: limit });
  if (error) throw new Error(errorMessage(error, "تعذّر تحميل قمة الأسبوع"));
  return (data ?? []) as WeeklyTopRow[];
}

export async function myLines(): Promise<Line[]> {
  const { data, error } = await supabase.rpc("my_lines", {
    p_device: getDeviceId(),
  });
  if (error) {
    if (String(error.message).includes("Could not find the function")) {
      throw new Error(
        "تحديثات قاعدة البيانات ما اتطبّقت — نفّذ supabase/migrations/*.sql من Dashboard → SQL Editor"
      );
    }
    throw new Error(errorMessage(error, "تعذّر تحميل بطاقاتك"));
  }
  return (data ?? []) as Line[];
}

export async function submitReport(input: {
  line_id: string;
  platform: string;
  reach: number;
  reactions: number;
  note: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("submit_report", {
    p_line: input.line_id,
    p_platform: input.platform,
    p_reach: input.reach,
    p_reactions: input.reactions,
    p_note: input.note,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر إرسال التقرير"));
  return data as string;
}

export async function attachProof(
  lineId: string,
  path: string
): Promise<void> {
  const { error } = await supabase.rpc("attach_proof", {
    p_line: lineId,
    p_path: path,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر حفظ الدليل"));
}

export async function myReports(): Promise<MyReport[]> {
  const { data, error } = await supabase.rpc("my_reports", {
    p_device: getDeviceId(),
  });
  if (error) return [];
  return (data ?? []) as MyReport[];
}

export async function myProofs(): Promise<MyProof[]> {
  const { data, error } = await supabase.rpc("my_proofs", {
    p_device: getDeviceId(),
  });
  if (error) return [];
  return (data ?? []) as MyProof[];
}

export async function uploadProof(
  lineId: string,
  file: File
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${lineId}/${getDeviceId()}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("proofs").upload(path, file);
  if (error) {
    const m = String(error.message);
    if (m.includes("bucket") || m.includes("does not exist")) {
      throw new Error(
        "احذث البكت proofs من Dashboard → Storage + نفّذ SQL ملف proofs_storage"
      );
    }
    if (
      /row-level|policy|permission|denied/i.test(m)
    ) {
      throw new Error(
        "صلاحيات رفع الصور مقفولة — نفّذ SQL ملف proofs_storage من الميغريشن"
      );
    }
    throw new Error("تعذّر رفع الصورة");
  }
  await attachProof(lineId, path);
  return path;
}

export async function getChatMessages(limit = 50): Promise<ChatMessage[]> {
  const { data, error } = await supabase.rpc("get_chat_messages", {
    p_limit: limit,
  });
  if (error) {
    throw new Error(
      errorMessage(error, "تعذّر تحميل ركن القرّاء — نفّذ migration الشات")
    );
  }
  return (data ?? []) as ChatMessage[];
}

export async function postChatMessage(
  nickname: string,
  message: string
): Promise<string> {
  const { data, error } = await supabase.rpc("post_chat_message", {
    p_nickname: nickname,
    p_message: message,
    p_device: getDeviceId(),
  });
  if (error) {
    throw new Error(
      errorMessage(error, "تعذّر إرسال الرسالة — هل نفّذت migration ركن القرّاء؟")
    );
  }
  return data as string;
}

export async function updateChatMessage(
  id: string,
  message: string
): Promise<string> {
  const { data, error } = await supabase.rpc("update_chat_message", {
    p_id: id,
    p_message: message,
    p_device: getDeviceId(),
  });
  if (error) {
    throw new Error(
      errorMessage(error, "تعذّر تعديل الرسالة — هل نفّذت migration إدارة الرسائل؟")
    );
  }
  return data as string;
}

export async function deleteChatMessage(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("delete_chat_message", {
    p_id: id,
    p_device: getDeviceId(),
  });
  if (error) {
    throw new Error(errorMessage(error, "تعذّر حذف الرسالة"));
  }
  return Boolean(data);
}

// ---------- البروفايلات ----------

export async function ensureUser(
  username: string,
  bio = ""
): Promise<string> {
  const device = getDeviceId();
  if (device.length < 4) throw new Error("تعذّر التعرّف على جهازك");

  const { data, error } = await supabase.rpc("ensure_user", {
    p_username: username.trim().slice(0, 25),
    p_bio: bio,
    p_device: device,
  });
  if (error) {
    console.error("ensure_user error:", error, { device, username });
    throw new Error(errorMessage(error, "تعذّر حفظ اسمك"));
  }
  return data as string;
}

export async function myProfile(): Promise<UserProfile | null> {
  const { data, error } = await supabase.rpc("my_profile", {
    p_device: getDeviceId(),
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? (row as UserProfile) : null;
}

export async function publicProfile(
  userId: string
): Promise<UserProfile | null> {
  const { data, error } = await supabase.rpc("public_profile", {
    p_user: userId,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? (row as UserProfile) : null;
}

export async function userByLine(lineId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("user_by_line", { p_line: lineId });
  if (error) return null;
  return data ?? null;
}

export async function rateUser(userId: string, stars: number): Promise<number> {
  const { data, error } = await supabase.rpc("rate_user", {
    p_user: userId,
    p_stars: stars,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر حفظ التقييم"));
  return (data as number) ?? 0;
}

export async function myRating(userId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("my_rating", {
    p_user: userId,
    p_device: getDeviceId(),
  });
  if (error) return null;
  return data ?? null;
}

export async function setBio(bio: string): Promise<void> {
  const { error } = await supabase.rpc("set_bio", {
    p_bio: bio,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر حفظ نبذتك"));
}

// ---------- الدفتر ----------

export async function addNotebookPage(
  content: string,
  isPublic = true
): Promise<number> {
  const { data, error } = await supabase.rpc("add_notebook_page", {
    p_content: content,
    p_is_public: isPublic,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر إضافة صفحة الدفتر"));
  return data as number;
}

export async function myNotebook(): Promise<NotebookPage[]> {
  const { data, error } = await supabase.rpc("my_notebook", {
    p_device: getDeviceId(),
  });
  if (error) return [];
  return (data ?? []) as NotebookPage[];
}

export async function publicNotebook(userId: string): Promise<NotebookPage[]> {
  const { data, error } = await supabase.rpc("public_notebook", {
    p_user: userId,
  });
  if (error) return [];
  return (data ?? []) as NotebookPage[];
}

export async function updateNotebookPage(
  id: number,
  content: string,
  isPublic = true
): Promise<void> {
  const { error } = await supabase.rpc("update_notebook_page", {
    p_page: id,
    p_content: content,
    p_is_public: isPublic,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر تحديث الصفحة"));
}

export async function deleteNotebookPage(id: number): Promise<void> {
  const { error } = await supabase.rpc("delete_notebook_page", {
    p_page: id,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر حذف الصفحة"));
}

// ---------- المنصة الاجتماعية ----------

export async function toggleLike(lineId: string): Promise<number> {
  const { data, error } = await supabase.rpc("toggle_like", {
    p_line: lineId,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر تسجيل القلب"));
  return Number(data ?? 0);
}

export async function toggleLineStar(lineId: string): Promise<number> {
  const { data, error } = await supabase.rpc("toggle_line_star", {
    p_line: lineId,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر تسجيل النجمة"));
  return Number(data ?? 0);
}

export async function myStarredLineIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc("my_starred_line_ids", {
    p_device: getDeviceId(),
  });
  if (error) return [];
  return ((data ?? []) as (string | number)[]).map((x) => String(x));
}

export async function toggleSave(lineId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_save", {
    p_line: lineId,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر حفظ البطاقة"));
  return Boolean(data);
}

export async function mySavedIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc("my_saved_ids", {
    p_device: getDeviceId(),
  });
  if (error) return [];
  return ((data ?? []) as (string | number)[]).map((x) => String(x));
}

export async function toggleFollow(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_follow", {
    p_user: userId,
    p_device: getDeviceId(),
  });
  if (error) throw new Error(errorMessage(error, "تعذّر تحديث المتابعة"));
  return Boolean(data);
}

export async function myFollowingIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc("my_following_ids", {
    p_device: getDeviceId(),
  });
  if (error) return [];
  return ((data ?? []) as (string | number)[]).map((x) => String(x));
}

export async function linesByUser(userId: string): Promise<Line[]> {
  const { data, error } = await supabase.rpc("lines_by_user", {
    p_user: userId,
  });
  if (error) return [];
  return (data ?? []) as Line[];
}

export async function reelsFeed(limit = 50): Promise<ReelRow[]> {
  const { data, error } = await supabase.rpc("reels_feed", {
    p_exclude: null,
    p_limit: limit,
  });
  if (error) throw new Error(errorMessage(error, "تعذّر تحميل عبارات الريلز"));
  return (data ?? []) as ReelRow[];
}