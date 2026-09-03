// MADARIK OPS - Authentication
// كلمة المرور تُخزَّن مشفرة (SHA-256) فقط — النص الأصلي غير موجود في الكود.
// الـ Worker يقوم بالتحقق الفعلي من كلمة المرور ويمنح توكن جلسة.

export const PASSWORD_HASH =
  "43ad61500e632bef088d0222c2a11e8f73a3d52c669b45f2cd48d99819399b9e";

export const SESSION_KEY = "madarik_ops_session";
export const SESSION_TTL = 60 * 60 * 1000; // ساعة

export interface OpsSession {
  token: string;
  issuedAt: number;
}
