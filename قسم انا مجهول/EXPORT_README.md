# أنا مجهول — نسخة المشروع الكاملة

## المحتويات
- `src/` كود الواجهة (TanStack Start + React + Tailwind)
- `supabase/migrations/` كل ملفات قاعدة البيانات (الجداول، RLS، السياسات، الدوال، التريغرات) بالترتيب الزمني
- `supabase/config.toml` إعدادات المشروع
- `package.json`, `vite.config.ts`, `tsconfig.json` إلخ

## التشغيل محلياً
```bash
bun install
bun run dev
```

## استرجاع قاعدة البيانات
نفّذ ملفات `supabase/migrations/*.sql` بالترتيب الأبجدي على مشروع Supabase جديد،
ثم عبّئ متغيرات البيئة في `.env`:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
```
ملاحظة: الملف لا يحتوي بيانات المستخدمين/المنشورات (فقط بنية القاعدة والكود)، ولا يحتوي أي مفاتيح سرية.
