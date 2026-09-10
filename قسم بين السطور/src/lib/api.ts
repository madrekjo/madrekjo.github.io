import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "./device";

export interface Line {
  id: string;
  text: string;
  book: string;
  author: string;
  category: Category;
  submitter: string;
  likes: number;
  shares: number;
  visits: number;
  featured_date: string | null;
  created_at: string;
}

export type Category = "رواية" | "ديني" | "تنمية" | "شعر" | "تاريخ";

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

function errorMessage(err: { message?: string; details?: string; hint?: string } | null, fallback: string): string {
  if (err?.message) {
    const m = err.message;
    return m.includes("جهاز") || m.includes("تمهّل") || m.includes("كثرة") || m.includes("ليست") ? m : fallback;
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
}): Promise<{ id: string; tooMany?: boolean }> {
  const { data, error } = await supabase.rpc("submit_line", {
    p_text: input.text,
    p_book: input.book,
    p_author: input.author ?? "",
    p_category: input.category,
    p_submitter: input.submitter,
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
  return Number(data ?? 0);
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