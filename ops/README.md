# MADARIK OPS - لوحة التحكم السرية

نظام تحكم استخباراتي مركزي لكل أقسام منصة مدارك جو.

## المعمارية

```
المتصفح (صفحة OPS السرية)
    │  كلمة المرور فقط
    ▼
Cloudflare Worker (madarik-ops)  ← يحمل مفاتيح service_role بأمان
    ├─ Chat          (biabdoatwfteqwgjdxzc)
    ├─ أنا مجهول     (dqrzsllhdcvykoisisoy)
    └─ الإنجازات     (itflhfhsfzrdfpxvlzrv)
```

- **القراءة**: الصفحة تقرأ مباشرة عبر anon keys (آمنة للقراءة فقط).
- **الكتابة/الحذف/الحظر**: تتم عبر الـ Worker الذي يحمل مفاتيح الخدمة (لا تتكشف للعميل).

## كلمة المرور

كلمة المرور المولّدة: `NKbDLBMiXatC#qCA`

تُخزَّن فقط بصيغة SHA-256 hash. لا تحفظ النص الصريح في أي ملف.

## PUBLICATION (نشر الـ Worker)

من مجلد `ops-worker/`:

```bash
wrangler login
wrangler secret put OPS_PASSWORD_HASH      # 43ad61500e632bef088d0222c2a11e8f73a3d52c669b45f2cd48d99819399b9e
wrangler secret put OPS_TOKEN_SECRET       # (مفتاح عشوائي طويل لتنبيه الجلسات)
wrangler secret put CHAT_SERVICE_KEY        # service_role key للشات
wrangler secret put ANON_SERVICE_KEY        # service_role key لأنا مجهول
wrangler secret put ACHIEVEMENT_SERVICE_KEY # service_role key للإنجازات
wrangler deploy
```

الـ Worker يتوفّر على: `https://madarik-ops.abdalrhmanmaaith1.workers.dev`

## PUBLICATION (نشر الصفحة على GitHub Pages)

1. البناء:
```bash
cd ops
npm install
npm run build
```

2. نسخ مخرجات البناء `ops/dist/` إلى `k7-x9mz4-ops/` داخل الـ repo الرئيسي
   (المُرفع على GitHub Pages).

3. الصفحة ستتوفر على: `https://madrekjo.github.io/k7-x9mz4-ops/`
   أو `https://madrekjo.com/k7-x9mz4-ops/`

الرابط السري `k7-x9mz4-ops` غير مرتبط بأي مكان بالمنصة.

## الأمان

- كلمة المرور تُفحص محلياً (SHA-256) **و** على الخادم (الـ Worker).
- التوكن يُوقَّع HMAC وينتهي بعد ساعة.
- مفاتيح service_role تتواجد فقط على الـ Worker كـ secrets، لا داخل الكود.
- الصفحة تستعمل `noindex` فلا تُفهرس في محركات البحث.

## العناوين التي عدّلتها

| الملف | الغرض |
|-------|-------|
| `ops/src/config/auth.ts` | hash كلمة المرور + إعدادات الجلسة |
| `ops/src/config/supabase.ts` | اتصالات Supabase + رابط الـ Worker |
| `ops-worker/ops-worker.js` | منطق الـ Worker الإداري |
| `ops-worker/wrangler.toml` | إعدادات نشر الـ Worker |
