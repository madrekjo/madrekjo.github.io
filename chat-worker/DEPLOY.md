# دليل النشر الكامل — بوابة القراءة (Layer 2) + طبقة الفهارس (Layer 3)

هذا الدليل ينشر "بوابة القراءة" التي كتبها كود جاهز (انطلق منه في الفرونت الآن) ويطبّق
فهارس القاعدة. الترتيب المطلوب: **نشر الـ Worker أولاً ← اختباره ← ربط الفرونت ←**
تطبيق الميغريشن.

> الربط في الفرونت **جاهز بالفعل** ولا يتطلب سوى وضع رابط الـ Worker في
> `chat/src/config/worker-config.ts`. قبل ذلك يقرأ التطبيق من Supabase مباشرة
> (السلوك الحالي تماماً).

---

## 1) المتطلبات

| الأداة | الغرض |
|---|---|
| Node 18+ و `wrangler` | نشر الـ Worker إلى Cloudflare |
| حساب Cloudflare | منصة النشر (مجاني يكفي) |
| حساب Supabase | مفتاح الخدمة يدوياً (إن لم يكن لديك `supabase link`) ونافذة **SQL Editor** |

تثبيت wrangler (مرة واحدة):

```bash
npm i -g wrangler
wrangler login        # يفتح المتصفح لمصادقة حساب Cloudflare
```

---

## 2) إنشاء مساحة KV وربطها

من داخل مجلد البوابة:

```bash
cd chat-worker
wrangler kv namespace create CHAT_KV
```

النتيجة شكلها:

```
Created a new namespace:
  CHAT_KV  4f5c81a1x8xxxxxxxxxxxxxxxxxxxxxx
[wrangler kv:namespace] ⚠️ Add the following to wrangler.toml:
[[kv_namespaces]]
binding = "CHAT_KV"
id = "4f5c81a1x8xxxxxxxxxxxxxxxxxxxxxx"
```

افتح `chat-worker/wrangler.toml` وأزل التعليق عن كتلة `[[kv_namespaces]]` وضع
المعرّف الفعلي مكان المثال:

```toml
[[kv_namespaces]]
binding = "CHAT_KV"
id = "PASTE_YOUR_KV_ID_HERE"
```

---

## 3) مفاتيح سرية

```bash
wrangler secret put CHAT_SERVICE_KEY
# الصق مفتاح خدمة Supabase: Project Settings → API → service_role (سري!) وأكّده
```

> ⚠️ **أمان:** `service_role` يتجاوز RLS كلياً. الـ Worker يعرّض نقاط قراءة فقط
> بأعمدة محددة، لكن المفتاح نفسه يُحفظ في سر Cloudflare ولا يُمرَّر لأي جهة. لا
> تضعه في أي ملف، وأعدّه من Supabase عند الشك، وقيّد النطاقات أدناه.

```bash
wrangler secret put ALLOWED_ORIGINS
# مثال: https://madrekjo.github.io,http://localhost:5173
```

> CORS مقيّد بهذه القائمة. اتركها مثل المثال وأضف أي نطاق أرضي حقيقي لك (نطاق
> GitHub Pages). لو كان التطبيق يعمل من ملفات محلية دون نطاق فلن يصل الـ Worker.

---

## 4) النشر والاختبار

```bash
wrangler deploy
```

إخراج التحديث يعطيك عنواناً مثل:

```
✖ Updated Worker ... Uploaded madarik-chat-cache ...
↥ Deployment URL: https://madarik-chat-cache.<acct-subdomain>.workers.dev
```

اختبر النقاط (استبدل `<URL>` بعنوانك):

```bash
curl <URL>/health
curl <URL>/config
curl <URL>/banned_words
curl <URL>/rounds
curl <URL>/feed?page=1&limit=25
```

متوقع: `{"ok":true}` في `/health`، وكائنات JSON في البقية.

---

## 5) ربط الفرونت (الخطوة الوحيدة المطلوبة في الكود)

1. افتح `chat/src/config/worker-config.ts`.
2. ضع عنوان الـ Worker:

```ts
export const READ_GATEWAY_URL = "https://madarik-chat-cache.<acct-subdomain>.workers.dev";
```

3. أعد البناء والنشر المعتاد للتطبيق:

```bash
cd chat
npm run build
```

الآن `loadChannelSettings` و`loadSectionLocks` يقسمان قراءتهما عبر `/config`،
و`loadBannedWords` عبر `/banned_words` — بطلب واحد مشترك لكل الأجهزة بدل
مئات الطلبات، ومع `?force=1` تلقائياً بعد أي تعديل إداري (يُفعَّل عبر
`invalidateAppConfig` / `invalidateBannedWords`). وإذا تعطّل الـ Worker أو
أُفرغ الرابط، تعود كل المقروءات إلى Supabase مباشرة دون تغيير.

**الإرجاع (Rollback) الفوري:** أفرغ الرابط `export const READ_GATEWAY_URL = "";`
وأعد البناء — يعود التطبيق للوضع السابق حرفياً.

---

## 6) طبقة القاعدة (Layer 3) — فهارس الاستعلامات الساخنة

تنفيذ الملاحظات:
`chat/supabase/migrations/20260905000000_reduce_supabase_load.sql`

**الطريقة أ (موصى بها — يدوية):**
لوحة Supabase → **SQL Editor** → الصق محتوى الملف كاملاً → Run. جميع العبارات
`IF NOT EXISTS` وآمنة للإعادة التنفيذ.

**الطريقة ب (CLI، إن كان لديك اتصال):**

```bash
supabase link --project-ref <your-chat-project-ref>
supabase db push
```

---

## 7) قياس الأثر بعد النشر

1. لوحة Supabase → **Usage** → يظهر Egress وطلبات REST.
2. سجّل رقم الكيلو بايت/الطلبات قبل وبعد 48 ساعة.
3. المتوقع بعد الربط: اختفاء آلاف الطلبات المتكررة لـ `channel_settings` /
   `section_locks` / `banned_words` (كانت 134+133+133+… في الساعة)، وهبوط
   الـ Egress بنسبة **60–75%** بعد التركيب الكامل.

---

## 8) قيود وأشياء مؤجلة عمداً (اقرأ قبل أي توسيع)

1. **`/feed` لا يُربط بالفرونت الآن — بيئياً.** البوابة تقرأ بمفتاح خدمة
   `service_role` فيرجع كل تفاعلات المنشورات (من أعجب بمن)، بينما يُخفيها
   `RLS` حالياً على المتصفح (المتصفح يرى تفاعلاته الخاصة فقط). إذا أردت لاحقاً
   ربط `/feed` اجعل الـ Worker يمرر **JWT المستخدم** كبصمة Bearer إلى Supabase
   (دور `replicated` فتطبق RLS) عوضاً عن مفتاح الخدمة.
2. **`/rounds` لا يُربط الآن.** ترتيب البوابة (`starts_at desc`, limit 50) يختلف
   عن استعلام الصفحة (`created_at desc`, limit 100). إن شئت ربطه وازن سلوك
   البوابة أولاً أو اقبل الفارق.
3. **الـ Worker قراءة فقط** — عمليات الكتابة كلها تبقى عبر Supabase من المتصفح
   بقواعد RLS. أي نقطة كتابة في البوابة ممنوعة (405).
4. **تحمل الحمل:** عند الحاجة قلّد `wrangler` خطة Cloudflare التي تسمح
   بالـ rate limiting، أو أضف فحص `User-Agent`/ترويسات البوابة نفسها لاحقاً.
5. **المفاتيح العامة** في الفرونت (anon/publishable) لا تُنقل إلى أي سر —
   بقي كل شيء بنفس مكانه.

---

## 9) مراجع الملفات

| الملف | الدور |
|---|---|
| `chat-worker/chat-worker.js` | كود البوابة (كامل، بالنقاط الأربع) |
| `chat-worker/wrangler.toml` | إعداد النشر — يلزمه `kv_namespaces.id` |
| `chat/src/config/worker-config.ts` | الرابط في الفرونت (أفرغه إفتراضي) |
| `chat/src/lib/readGateway.ts` | الدالة الآمنة `readGateway` + التراجع التلقائي |
| `chat/src/lib/appCache.ts` | ربط القنوات والأقفال عبر `/config` |
| `chat/src/lib/bannedWords.ts` | ربط الكلمات المحظورة عبر `/banned_words` |
| `chat/src/pages/Admin.tsx` | `?force=1` بعد تعديلات الكلمات المحظورة |
| `chat/supabase/migrations/20260905000000_reduce_supabase_load.sql` | فهارس Layer 3 |