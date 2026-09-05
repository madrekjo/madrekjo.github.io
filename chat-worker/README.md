# MADARIK CHAT — Read Gateway (Layer 2)

بوابة قراءة واحدة تجمع كل المقروءات المتكررة من قاعدة دردشة الكلية، تخزّنها
في Cloudflare KV، وتوزّع النتيجة نفسها على كل أجهزة المستخدمين. هذا يقضي على
تكرار نفس الطلبات مئات المرات (مثل `channel_settings` ×134 و `section_locks`
×133) منذ أول ضغطة.

## نطاق الـ Worker

| Endpoint | المحتوى | كاش | ملاحظة |
|---|---|---|---|
| `GET /config` | القنوات (تفعيل/تعطيل) + أقفال الأقسام | ساعة | تُبطل تلقائياً عند أي تغيير في channel_settings / section_locks / user_roles |
| `GET /banned_words` | قائمة الكلمات المحظورة | ساعة | تُبطل عند أي تغيير في banned_words |
| `GET /rounds` | الجلسات الدراسية الأخيرة | ساعة | تُبطل عند أي تغيير في study_rounds |
| `GET /feed?page=&limit=` | الفيد كاملاً في طلب واحد: posts+comments+likes+comment_likes+profiles | ساعة | بدل 5 طلبات من كل جهاز |
| `POST \| GET /invalidate?table=` | إبطال كاش الجداول المخزّنة فقط | — | يرفع stamp المجموعة (بدون حذف مفاتيح) |
| `GET /metrics?date=` | عداد استهلاك البوابة (قراءات Supabase + استجابات) | — | live من الذاكرة + stored من KV |
| `GET /health` | فحص | — | |

`?force=1` تجاوز الكاش وإعادة القراءة من القاعدة (مثال: بعد كتابة منشور).

رغم أن الكاش ساعة، أي تغيير في قاعدة البيانات يُبطل فوراً: الكلاينت يستدعي
`/invalidate?table=<الجدول>` بعد كل كتابة للجداول المخزّنة فيقلّب TTL فعلياً
من "ساعة" إلى "فوراً بعد أول تغيير".

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