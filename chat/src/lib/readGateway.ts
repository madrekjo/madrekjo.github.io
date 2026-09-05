import { READ_GATEWAY_URL } from "@/config/worker-config";

/**
 * بوابة القراءة (Layer 2): وسيط واحد لقراءة البيانات العامة (إعدادات القنوات،
 * أقفال الأقسام، الكلمات المحظورة) بحيث تشارك كل أجهزة المستخدمين نفس القراءة
 * من القاعدة عبر Cloudflare KV بدل تكرارها مئات المرات.
 *
 * عندما لا تكون البوابة منشورة بعد (القيمة فارغة في worker-config) ترجع هذه
 * الدالة null ويتراجع المتصل إلى Supabase مباشرة — لا تغيير في السلوك.
 *
 * `force = true` تطلب `?force=1` من البوابة: يُجبر الـ Worker على إعادة القراءة
 * من القاعدة فوراً (مثل تعديل إداري يجب أن ينعكس لدى الجميع فوراً).
 *
 * `accessToken` (اختياري): يُمرَّر كـ Authorization: Bearer — مطلوب لمسارات
 * خاصة بالمستخدم مثل /feed حتى يطبّق الـ Worker صلاحيات RLS الخاصة به بدل
 * مفتاح الخدمة.
 */

const GATEWAY_TIMEOUT_MS = 4000;

export function isReadGatewayConfigured(): boolean {
  return READ_GATEWAY_URL.trim().length > 0;
}

export interface ReadGatewayOptions {
  force?: boolean;
  accessToken?: string;
}

export async function readGateway<T>(
  path: string,
  options?: boolean | ReadGatewayOptions
): Promise<T | null> {
  if (!isReadGatewayConfigured()) return null;
  const opts: ReadGatewayOptions =
    typeof options === "boolean" ? { force: options } : options ?? {};
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
    const sep = path.includes("?") ? "&" : "?";
    const url = `${READ_GATEWAY_URL}${path}${opts.force ? `${sep}force=1` : ""}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : undefined,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}