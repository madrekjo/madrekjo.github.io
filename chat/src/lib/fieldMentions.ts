/**
 * منشن الحقل — منشن يذهب لكل أعضاء حقل واحد.
 *
 * معرّف مجموعة الحقل بالقالب `field:<field>` في جدول post_mentions
 * (يطابق trigger منشن قاعدة البيانات `guard_group_mention`).
 * مثال: `field:engineering` = كل طلاب الحقل الهندسي.
 *
 * الفرق عن منشن الجنس (boys/girls): أي مستخدم يقدر يذكر أي حقل،
 * والPricing موحّد لكل الحقول.
 */

export type MentionField = "medical" | "engineering" | "languages" | "business" | "law";

/** بادئة معرّف مجموعة الحقل */
export const FIELD_GROUP_PREFIX = "field:";

/** تكلفة منشن الحقل (أقل من منشور 5، وأكثر من منشن شخص واحد 2) */
export const FIELD_MENTION_COST = 3;

/** الحقول المتاحة للمنشن — مطابقة لـ profiles_field_check */
export const FIELD_MENTION_LIST: readonly MentionField[] = [
  "engineering",
  "medical",
  "languages",
  "business",
  "law",
];

export const FIELD_MENTION_META: Record<
  MentionField,
  { label: string; icon: string; cls: string; hint: string }
> = {
  engineering: {
    label: "الهندسي",
    icon: "⚙️",
    cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    hint: "منشن لكل طلاب الحقل الهندسي",
  },
  medical: {
    label: "الصحي",
    icon: "🩺",
    cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    hint: "منشن لكل طلاب الحقل الصحي",
  },
  languages: {
    label: "اللغات",
    icon: "🗣️",
    cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    hint: "منشن لكل طلاب حقل اللغات",
  },
  business: {
    label: "الأعمال",
    icon: "💼",
    cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    hint: "منشن لكل طلاب حقل الأعمال",
  },
  law: {
    label: "القانون",
    icon: "⚖️",
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    hint: "منشن لكل طلاب حقل القانون",
  },
};

/** معرّفMention لمجموعة الحقل، أو null إذا لم يكن الحقل معروفاً */
export function fieldGroupId(field: string | null | undefined): string | null {
  if (!field) return null;
  const f = String(field).trim();
  return (FIELD_MENTION_LIST as readonly string[]).includes(f) ? FIELD_GROUP_PREFIX + f : null;
}

/** هل هذا معرّفMention لمجموعة حقل؟ */
export function isFieldGroupId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(FIELD_GROUP_PREFIX);
}

/** استرجع الحقل من معرّفMention (field:medical → medical) */
export function fieldOfGroupId(id: string | null | undefined): MentionField | null {
  if (!isFieldGroupId(id)) return null;
  const f = String(id).slice(FIELD_GROUP_PREFIX.length);
  return (FIELD_MENTION_LIST as readonly string[]).includes(f) ? (f as MentionField) : null;
}

/** اسم الحقل بالعربي */
export function fieldLabel(field: MentionField): string {
  return FIELD_MENTION_META[field].label;
}
