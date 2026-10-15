// ============================================================
// أدوات بحث عربية مشتركة (تُستخدم في لوحة الإدارة وغيرها)
// ============================================================

/**
 * تطبيع النص العربي قبل المقارنة:
 * - إزالة التشكيل والتطويل
 * - توحيد الألف (أ إ آ ٱ → ا) والياء (ى → ي) والتاء المربوطة (ة → ه)
 * - حذف المحارف الخفية وتوحيد المسافات
 */
export const normalizeArabic = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[\u0640\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * هل يطابق النص عبارة البحث؟ (تطابق جزئي بعد التطبيع)
 * كل كلمة في البحث يجب أن توجد داخل النص، بغضّ النظر عن ترتيب الكلمات.
 */
export const matchesSearch = (haystack: string | null | undefined, query: string) => {
  const q = normalizeArabic(query);
  if (!q) return true;
  const target = normalizeArabic(haystack);
  return q.split(" ").every((token) => target.includes(token));
};

/**
 * مطابقة على عدة حقول مجتمعة (مثلاً: اسم المستخدم + آخر رسالة).
 * تُدمج الحقول في نص واحد ثم تُطبَّق نفس قواعد matchesSearch.
 */
export const matchesSearchFields = (
  fields: Array<string | null | undefined>,
  query: string,
) => matchesSearch(fields.filter(Boolean).join(" "), query);
