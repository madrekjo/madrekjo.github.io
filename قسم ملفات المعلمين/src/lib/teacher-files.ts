import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Teacher = Tables<"teachers">;
export type TeacherSection = Tables<"teacher_sections">;
export type TeacherContent = Tables<"teacher_contents">;
export type RefItem = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type SocialLink = { platform: string; url: string };

export type TeacherRelations = { subject_ids: string[]; field_ids: string[]; grade_ids: string[] };
export type TeacherAgg = Teacher & TeacherRelations;

// ============================================================
// قائمة الإدارة (من يدخل الرمز يحدد اسمه على جهازه)
// ============================================================
export type AdminProfile = {
  id: string;
  device_id: string;
  name: string;
  created_at: string;
  last_seen_at: string | null;
};

const DEVICE_KEY = "madrekjo_tf_device_id";

export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) as string;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export async function getAdminProfile(deviceId: string): Promise<AdminProfile | null> {
  const { data, error } = await supabase
    .from("teacher_files_admin_profiles")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (error) throw error;
  return (data as AdminProfile | null) ?? null;
}

export async function touchAdminProfile(deviceId: string) {
  const { error } = await supabase
    .from("teacher_files_admin_profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("device_id", deviceId);
  if (error) throw error;
}

export async function saveAdminProfile(name: string): Promise<AdminProfile> {
  const deviceId = getOrCreateDeviceId();
  const existing = await getAdminProfile(deviceId);
  const now = new Date().toISOString();
  if (existing) {
    const { data, error } = await supabase
      .from("teacher_files_admin_profiles")
      .update({ name: name.trim(), last_seen_at: now })
      .eq("device_id", deviceId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data as AdminProfile;
  }
  const { data, error } = await supabase
    .from("teacher_files_admin_profiles")
    .insert({ device_id: deviceId, name: name.trim(), last_seen_at: now })
    .select("*")
    .single();
  if (error) throw error;
  return data as AdminProfile;
}

export async function listAdminProfiles(): Promise<AdminProfile[]> {
  const { data, error } = await supabase
    .from("teacher_files_admin_profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminProfile[];
}

export const CONTENT_TYPES = ["file", "image", "link", "video"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  file: "ملف",
  image: "صورة",
  link: "رابط خارجي",
  video: "فيديو",
};

export function contentTypeLabel(t: string): string {
  return CONTENT_TYPE_LABELS[t as ContentType] ?? t;
}

export function slugify(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\u0600-\u06FFa-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || Math.random().toString(36).slice(2, 8);
}

// ============================================================
// Feature Flag
// ============================================================
export async function getTeacherFilesEnabled(): Promise<boolean> {
  const { data, error } = await supabase
    .from("teacher_files_settings")
    .select("teacher_files_enabled")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data?.teacher_files_enabled ?? false;
}

export async function setTeacherFilesEnabled(enabled: boolean) {
  const { error } = await supabase
    .from("teacher_files_settings")
    .update({ teacher_files_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}

// ============================================================
// قوائم مرجعية
// ============================================================
type RefTable = "teacher_subjects" | "teacher_fields" | "teacher_grades";

const REF_COUNT: Record<RefTable, string> = {
  teacher_subjects: "subject_ids",
  teacher_fields: "field_ids",
  teacher_grades: "grade_ids",
};

async function listRefs(table: RefTable): Promise<RefItem[]> {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RefItem[];
}

export async function listSubjects() {
  return listRefs("teacher_subjects");
}
export async function listFields() {
  return listRefs("teacher_fields");
}
export async function listGrades() {
  return listRefs("teacher_grades");
}

export async function addRefItem(table: RefTable, name: string): Promise<RefItem> {
  const { data, error } = await supabase.from(table).insert({ name }).select("*").single();
  if (error) throw error;
  return data as RefItem;
}
export async function renameRefItem(table: RefTable, id: string, name: string) {
  const { error } = await supabase.from(table).update({ name }).eq("id", id);
  if (error) throw error;
}
export async function deleteRefItem(table: RefTable, id: string) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// الروابط (مواد/حقول/صفوف) للمعلم
// ============================================================
type LinkTableName = "teacher_subject_links" | "teacher_field_links" | "teacher_grade_links";

type LinkRow =
  | { teacher_id: string; subject_id: string }
  | { teacher_id: string; field_id: string }
  | { teacher_id: string; grade_id: string };

type LinkConfig = {
  key: keyof TeacherRelations;
  table: LinkTableName;
  fk: string;
};
const LINK_CONFIGS: LinkConfig[] = [
  { key: "subject_ids", table: "teacher_subject_links", fk: "subject_id" },
  { key: "field_ids", table: "teacher_field_links", fk: "field_id" },
  { key: "grade_ids", table: "teacher_grade_links", fk: "grade_id" },
];

const EMPTY_RELATIONS: TeacherRelations = { subject_ids: [], field_ids: [], grade_ids: [] };

async function loadRelations(teacherIds: string[]): Promise<Map<string, TeacherRelations>> {
  const map = new Map<string, TeacherRelations>();
  teacherIds.forEach((id) =>
    map.set(id, {
      subject_ids: [],
      field_ids: [],
      grade_ids: [],
    }),
  );
  if (teacherIds.length === 0) return map;

  for (const cfg of LINK_CONFIGS) {
    const { data, error } = await supabase.from(cfg.table).select("*").in("teacher_id", teacherIds);
    if (error) throw error;
    const rows = (data ?? []) as Array<Record<string, string>>;
    rows.forEach((row) => {
      const agg = map.get(row.teacher_id);
      if (agg) agg[cfg.key].push(row[cfg.fk]);
    });
  }
  return map;
}

export async function replaceTeacherLinks(
  teacherId: string,
  links: TeacherRelations,
) {
  for (const cfg of LINK_CONFIGS) {
    const ids = links[cfg.key];
    const { error: delErr } = await supabase.from(cfg.table).delete().eq("teacher_id", teacherId);
    if (delErr) throw delErr;
    if (ids.length > 0) {
      const rows = ids.map((id) => ({ teacher_id: teacherId, [cfg.fk]: id }) as LinkRow);
      const { error: insErr } = await supabase.from(cfg.table).insert(rows);
      if (insErr) throw insErr;
    }
  }
}

// ============================================================
// المعلمون
// ============================================================
export async function listTeachers(): Promise<TeacherAgg[]> {
  const { data, error } = await supabase
    .from("teachers")
    .select("*")
    .order("featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Teacher[];
  const map = await loadRelations(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, ...(map.get(r.id) ?? EMPTY_RELATIONS) }));
}

export async function createTeacher(data: {
  name: string;
  slug?: string;
  bio?: string;
  photo_url?: string | null;
  website_url?: string | null;
  social_links?: SocialLink[];
  is_published?: boolean;
  featured?: boolean;
  sort_order?: number;
  links?: { subject_ids: string[]; field_ids: string[]; grade_ids: string[] };
}): Promise<TeacherAgg> {
  const { data: row, error } = await supabase
    .from("teachers")
    .insert({
      name: data.name,
      slug: data.slug || slugify(data.name),
      bio: data.bio ?? "",
      photo_url: data.photo_url ?? null,
      website_url: data.website_url ?? null,
      social_links: data.social_links ?? [],
      is_published: data.is_published ?? false,
      featured: data.featured ?? false,
      sort_order: data.sort_order ?? 0,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  const teacher = row as Teacher;
  const empty = {
    subject_ids: [] as string[],
    field_ids: [] as string[],
    grade_ids: [] as string[],
  };
  if (data.links) {
    await replaceTeacherLinks(teacher.id, data.links);
    return { ...teacher, ...data.links };
  }
  return { ...teacher, ...empty };
}

export async function updateTeacher(
  id: string,
  patch: Partial<{
    name: string;
    slug: string;
    bio: string;
    photo_url: string | null;
    website_url: string | null;
    social_links: SocialLink[];
    is_published: boolean;
    featured: boolean;
    sort_order: number;
  }>,
) {
  const { error } = await supabase
    .from("teachers")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTeacher(id: string) {
  const { error } = await supabase.from("teachers").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// الأقسام
// ============================================================
export async function listSections(teacherId: string): Promise<TeacherSection[]> {
  const { data, error } = await supabase
    .from("teacher_sections")
    .select("*")
    .eq("teacher_id", teacherId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createSection(data: {
  teacher_id: string;
  name: string;
  description?: string;
  icon?: string;
  is_visible?: boolean;
  sort_order?: number;
}): Promise<TeacherSection> {
  const { data: row, error } = await supabase
    .from("teacher_sections")
    .insert({
      teacher_id: data.teacher_id,
      name: data.name,
      description: data.description ?? "",
      icon: data.icon ?? "📁",
      is_visible: data.is_visible ?? true,
      sort_order: data.sort_order ?? 0,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return row as TeacherSection;
}

export async function updateSection(
  id: string,
  patch: Partial<{ name: string; description: string; icon: string; is_visible: boolean }>,
) {
  const { error } = await supabase
    .from("teacher_sections")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSection(id: string) {
  const { error } = await supabase.from("teacher_sections").delete().eq("id", id);
  if (error) throw error;
}

export async function moveSection(teacherId: string, id: string, dir: -1 | 1) {
  const { data, error } = await supabase
    .from("teacher_sections")
    .select("id, sort_order")
    .eq("teacher_id", teacherId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as { id: string; sort_order: number }[];
  const idx = rows.findIndex((r) => r.id === id);
  const other = rows[idx + dir];
  if (!other) return;
  const a = rows[idx].sort_order;
  const b = other.sort_order;
  const { error: e1 } = await supabase
    .from("teacher_sections")
    .update({ sort_order: b, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("teacher_sections")
    .update({ sort_order: a, updated_at: new Date().toISOString() })
    .eq("id", other.id);
  if (e2) throw e2;
}

// ============================================================
// المحتويات
// ============================================================
export async function listContents(sectionId: string): Promise<TeacherContent[]> {
  const { data, error } = await supabase
    .from("teacher_contents")
    .select("*")
    .eq("section_id", sectionId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createContent(data: {
  section_id: string;
  title: string;
  description?: string;
  content_type: ContentType;
  file_url?: string | null;
  file_name?: string | null;
  file_mime?: string | null;
  link_url?: string | null;
  is_published?: boolean;
  sort_order?: number;
}): Promise<TeacherContent> {
  const { data: row, error } = await supabase
    .from("teacher_contents")
    .insert({
      section_id: data.section_id,
      title: data.title,
      description: data.description ?? "",
      content_type: data.content_type,
      file_url: data.file_url ?? null,
      file_name: data.file_name ?? null,
      file_mime: data.file_mime ?? null,
      link_url: data.link_url ?? null,
      is_published: data.is_published ?? true,
      sort_order: data.sort_order ?? 0,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return row as TeacherContent;
}

export async function updateContent(
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    content_type: ContentType;
    file_url: string | null;
    file_name: string | null;
    file_mime: string | null;
    link_url: string | null;
    is_published: boolean;
  }>,
) {
  const { error } = await supabase
    .from("teacher_contents")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteContent(id: string) {
  const { error } = await supabase.from("teacher_contents").delete().eq("id", id);
  if (error) throw error;
}

export async function moveContent(sectionId: string, id: string, dir: -1 | 1) {
  const { data, error } = await supabase
    .from("teacher_contents")
    .select("id, sort_order")
    .eq("section_id", sectionId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as { id: string; sort_order: number }[];
  const idx = rows.findIndex((r) => r.id === id);
  const other = rows[idx + dir];
  if (!other) return;
  const a = rows[idx].sort_order;
  const b = other.sort_order;
  const { error: e1 } = await supabase
    .from("teacher_contents")
    .update({ sort_order: b, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("teacher_contents")
    .update({ sort_order: a, updated_at: new Date().toISOString() })
    .eq("id", other.id);
  if (e2) throw e2;
}

// ============================================================
// الواجهة العامة (تظهر فقط عند التفعيل — RLS تمنع غير ذلك)
// ============================================================
export async function listPublishedTeachers(): Promise<
  Array<TeacherAgg & { subjects: string[]; fields: string[]; grades: string[] }>
> {
  const { data, error } = await supabase
    .from("teachers")
    .select("*")
    .eq("is_published", true)
    .order("featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Teacher[];
  if (rows.length === 0) return [];
  const map = await loadRelations(rows.map((r) => r.id));
  const [subjects, fields, grades] = await Promise.all([
    listSubjects(),
    listFields(),
    listGrades(),
  ]);
  const sName = new Map(subjects.map((s) => [s.id, s.name]));
  const fName = new Map(fields.map((f) => [f.id, f.name]));
  const gName = new Map(grades.map((g) => [g.id, g.name]));
  return rows.map((r) => {
    const rel = map.get(r.id)!;
    return {
      ...r,
      ...rel,
      subjects: rel.subject_ids.map((id) => sName.get(id) ?? id),
      fields: rel.field_ids.map((id) => fName.get(id) ?? id),
      grades: rel.grade_ids.map((id) => gName.get(id) ?? id),
    };
  });
}

export async function getPublicTeacher(slug: string): Promise<{
  teacher: TeacherAgg & { subjects: string[]; fields: string[]; grades: string[] };
  sections: Array<TeacherSection & { contents: TeacherContent[] }>;
} | null> {
  const { data, error } = await supabase
    .from("teachers")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw error;
  const teacher = data as Teacher | null;
  if (!teacher) return null;

  const map = await loadRelations([teacher.id]);
  const rel = map.get(teacher.id)!;
  const [subjects, fields, grades] = await Promise.all([
    listSubjects(),
    listFields(),
    listGrades(),
  ]);
  const sName = new Map(subjects.map((s) => [s.id, s.name]));
  const fName = new Map(fields.map((f) => [f.id, f.name]));
  const gName = new Map(grades.map((g) => [g.id, g.name]));

  const { data: sectionsData, error: secErr } = await supabase
    .from("teacher_sections")
    .select("*")
    .eq("teacher_id", teacher.id)
    .eq("is_visible", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (secErr) throw secErr;
  const sections = (sectionsData ?? []) as TeacherSection[];

  const contentsMap = new Map<string, TeacherContent[]>();
  if (sections.length > 0) {
    const { data: contentsData, error: cErr } = await supabase
      .from("teacher_contents")
      .select("*")
      .in(
        "section_id",
        sections.map((s) => s.id),
      )
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (cErr) throw cErr;
    (contentsData ?? []).forEach((c) => {
      const list = contentsMap.get(c.section_id) ?? [];
      list.push(c);
      contentsMap.set(c.section_id, list);
    });
  }

  return {
    teacher: {
      ...teacher,
      ...rel,
      subjects: rel.subject_ids.map((id) => sName.get(id) ?? id),
      fields: rel.field_ids.map((id) => fName.get(id) ?? id),
      grades: rel.grade_ids.map((id) => gName.get(id) ?? id),
    },
    sections: sections
      .map((s) => ({ ...s, contents: contentsMap.get(s.id) ?? [] }))
      .filter((s) => s.contents.length > 0),
  };
}
