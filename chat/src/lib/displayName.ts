export const FIELD_PREFIX: Record<string, string> = {
  medical: "Dr.",
  engineering: "Eng.",
  languages: "Lang.",
  business: "Bus.",
};

export const FIELD_LABEL_AR: Record<string, string> = {
  medical: "صحي",
  engineering: "هندسي",
  languages: "لغات",
  business: "أعمال",
};

interface DisplayProfile {
  full_name?: string | null;
  generation?: string | null;
  field?: string | null;
}

/**
 * Formats a user display name with field prefix (Dr./Eng./Lang./Bus.)
 * and generation suffix (09/10). Falls back gracefully if data missing.
 */
export function formatDisplayName(profile: DisplayProfile | null | undefined, fallback = "مستخدم"): string {
  if (!profile) return fallback;
  const name = profile.full_name?.trim() || fallback;
  const prefix = profile.field && FIELD_PREFIX[profile.field] ? `${FIELD_PREFIX[profile.field]} ` : "";
  const suffix = profile.generation ? ` ${profile.generation}` : "";
  return `${prefix}${name}${suffix}`;
}
