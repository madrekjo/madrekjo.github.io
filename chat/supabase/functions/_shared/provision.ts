// ============================================================================
// تجهيز حساب المستخدم في كل الأقسام النشطة ومنحه جلسة دخول في كل منها.
// يُستخدم من invite-login و invite-signup ليصير رمز الدعوة يفتح كل المنصة
// (لا الدردشة فقط). الأقسام التي لا يتوفّر لها مفتاح service_role تُتجاهل
// بأمان حتى تُزوَّد مفاتيحها لاحقاً.
//
// الأمان: المفاتيح تُقرأ من أسرار الدالة (env) ولا تُكتب في الكود أبداً.
// ============================================================================

export interface SectionProv {
  key: string;
  url: string;
  service?: string;
}

export type ProvisionMap = Record<string, { token_hash: string }>;

function envGet(key: string): string | undefined {
  try {
    return Deno.env.get(key) || undefined;
  } catch {
    return undefined;
  }
}

// سجلّ الأقسام: الرابط + اسم سرّ service_role الخاص به.
// (achievement يُضاف تلقائياً حين يُزوَّد مفتاحه ACHIEVEMENT_SERVICE_ROLE_KEY.)
export function sectionList(): SectionProv[] {
  const AJR_URL = "https://njdvogvquzofnqqwyvyl.supabase.co";
  return [
    { key: "chat", url: envGet("SUPABASE_URL") || "", service: envGet("SUPABASE_SERVICE_ROLE_KEY") },
    { key: "anon", url: "https://jmucsccdxxizvqtkyieq.supabase.co", service: envGet("ANON_SERVICE_ROLE_KEY") },
    { key: "sutur", url: "https://cfwnarueaparjbetagpi.supabase.co", service: envGet("SUTUR_SERVICE_ROLE_KEY") },
    { key: "ajr", url: AJR_URL, service: envGet("AJR_SERVICE_ROLE_KEY") },
    { key: "talaawat", url: AJR_URL, service: envGet("AJR_SERVICE_ROLE_KEY") },
    { key: "achievement", url: "https://itflhfhsfzrdfpxvlzrv.supabase.co", service: envGet("ACHIEVEMENT_SERVICE_ROLE_KEY") },
  ];
}

function adminHeaders(service: string): Record<string, string> {
  return {
    apikey: service,
    Authorization: `Bearer ${service}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ضمان وجود الحساب بنفس الإيميل (ينشئه إن لم يكن موجوداً). الإيميل المؤكّد
// حتى لا يُطلب أي تحقق بريدي. إن كان الحساب موجوداً نعتبر ذلك نجاحاً.
async function ensureUser(
  url: string,
  service: string,
  email: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: adminHeaders(service),
      body: JSON.stringify({ email, email_confirm: true, user_metadata: metadata }),
    });
    if (res.ok) return true;
    const txt = await res.text();
    if (/already|registered|exists|duplicate/i.test(txt)) return true;
    console.error(`[provision] createUser ${url} failed:`, res.status, txt.slice(0, 200));
    return false;
  } catch (e) {
    console.error(`[provision] createUser ${url} threw:`, e);
    return false;
  }
}

// توليد رمز دخول سحري (magiclink) لحساب موجود، وإرجاع token_hash فقط.
async function magicToken(url: string, service: string, email: string): Promise<string | null> {
  try {
    const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: adminHeaders(service),
      body: JSON.stringify({ type: "magiclink", email }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`[provision] generate_link ${url} failed:`, res.status, txt.slice(0, 200));
      return null;
    }
    const data = await res.json();
    // REST /admin/generate_link يُرجع hashed_token في الجذر؛ و supabase-js يلفّه
    // داخل properties. نغطّي الحالتين.
    return data?.properties?.hashed_token || data?.hashed_token || null;
  } catch (e) {
    console.error(`[provision] generate_link ${url} threw:`, e);
    return null;
  }
}

export interface ProvisionResult {
  map: ProvisionMap;
  debug: Record<string, string>;
}

// يجهّز الحساب في كل قسم له مفتاح، ويعيد خريطة { key: { token_hash } } + تشخيص.
export async function provisionSections(
  email: string,
  metadata: Record<string, unknown>,
): Promise<ProvisionResult> {
  const map: ProvisionMap = {};
  const debug: Record<string, string> = {};

  const all = sectionList();
  const targets = all.filter((s) => s.url && s.service);

  // تشخيص الأقسام المتخطّاة (بلا مفتاح).
  for (const s of all) {
    if (!s.url) debug[s.key] = "no_url";
    else if (!s.service) debug[s.key] = "no_key";
  }

  // الأقسام التي تتشارك نفس مشروع Supabase (مثل أجر وثواب + التلاوات) تُجهَّز
  // مرة واحدة فقط: توليد رمزين لنفس الإيميل يُبطل الأول. نولّد رمزاً واحداً
  // ونعيده لكل مفاتيح نفس المشروع.
  const urlToKeys: Record<string, string[]> = {};
  for (const s of targets) {
    (urlToKeys[s.url] ||= []).push(s.key);
  }
  const uniqueByUrl = new Map<string, SectionProv>();
  for (const s of targets) {
    if (!uniqueByUrl.has(s.url)) uniqueByUrl.set(s.url, s);
  }

  await Promise.all(
    [...uniqueByUrl.values()].map(async (s) => {
      const keys = urlToKeys[s.url];
      const ok = await ensureUser(s.url, s.service as string, email, metadata);
      if (!ok) {
        for (const k of keys) debug[k] = "create_failed";
        return;
      }
      const token = await magicToken(s.url, s.service as string, email);
      if (!token) {
        for (const k of keys) debug[k] = "link_failed";
        return;
      }
      for (const k of keys) {
        map[k] = { token_hash: token };
        debug[k] = "ok";
      }
    }),
  );

  return { map, debug };
}
