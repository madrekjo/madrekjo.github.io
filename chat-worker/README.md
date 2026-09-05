# MADARIK CHAT — Read Gateway (Layer 2)

بوابة قراءة واحدة تجمع كل المقروءات المتكررة من قاعدة دردشة الكلية، تخزّنها
في Cloudflare KV، وتوزّع النتيجة نفسها على كل أجهزة المستخدمين. هذا يقضي على
تكرار نفس الطلبات مئات المرات (مثل `channel_settings` ×134 و `section_locks`
×133) منذ أول ضغطة.

## نطاق الـ Worker

| Endpoint | المحتوى | كاش | ملاحظة |
|---|---|---|---|
| `GET /config` | القنوات (تفعيل/تعطيل) + أقفال الأقسام | 60 ثانية | تعديلات الإدارة تنعكس خلال دقيقة |
| `GET /banned_words` | قائمة الكلمات المحظورة | 120 ثانية | |
| `GET /rounds` | الجلسات الدراسية الأخيرة | 20 ثانية | |
| `GET /feed?page=&limit=` | الفيد كاملاً في طلب واحد: posts+comments+likes+comment_likes+user_roles+profiles | 15 ثانية | بدل 5 طلبات من كل جهاز |
| `GET /health` | فحص | — | |

`?force=1` تجاوز الكاش وإعادة القراءة من القاعدة (مثال: بعد كتابة منشور).

## التثبيت

```bash
wrangler kv namespace create CHAT_KV        # انسخ المُعرّف
# افتح wrangler.toml وضع المُعرّف في [kv_namespaces] id
wrangler secret put CHAT_SERVICE_KEY
wrangler secret put ALLOWED_ORIGINS         # اختياري
wrangler deploy
```

## الربط من التطبيق (مثال المفاتيح)

```ts
// إعدادات القنوات والأقفال — جلب واحد للكل بدل 2×N
export async function loadConfigFromWorker() {
  const res = await fetch(`${WORKER_URL}/config?force=${adminToggle ? "1" : ""}`);
  const { channels, locks } = await res.json();
  return { channels, locks };
}
```

## طبقات تخفيف الحمل (للحل المتكامل)

1. **Layer 1 — كاش المتصفح** (`chat/src/lib/dataLayer.ts` + `appCache.ts`):
   يمنع تكرار الطلبات المتطابقة داخل نفس الجهاز وجلسة التصفح.
2. **Layer 2 — هذا الـ Worker**: يمنع التكرار بين الأجهزة المختلفة.
3. **Layer 3 — قاعدة البيانات** (`20260905000000_reduce_supabase_load.sql`):
   فهارس تسرّع الاستعلامات الساخنة.

## أمان

- الـ Worker **قراءة فقط**؛ عمليات الكتابة تبقى مباشرة عبر Supabase من المتصفح
  بقواعد RLS الحالية (لا يُكشف أي مفتاح خدمة للمتصفح).
- CORS مقيّد بالنطاقات المسموحة (`ALLOWED_ORIGINS`).
- للتحكّم بالضغط (Rate limiting) يفضّل تفعيل قاعدتها من لوحة Cloudflare.