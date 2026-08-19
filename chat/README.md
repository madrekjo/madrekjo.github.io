# دليل تشغيل الموقع

## 1) اعمل مشروع Supabase جديد
- https://supabase.com → New Project
- اختار كلمة سر قوية للقاعدة

## 2) شغّل قاعدة البيانات
- في المشروع الجديد: **SQL Editor** → **New Query**
- افتح `database-schema-full.sql` → انسخ محتواه كامل → الصق → **Run**
- (شوف `DATABASE.md` لشرح كل جدول)

## 3) أنشئ Storage Buckets يدوياً
من **Storage**:

| Bucket | Public |
|---|---|
| avatars | ✅ |
| post-media | ✅ |
| schedules | ✅ |
| staff-chat | ❌ |
| round-meetings | ❌ |

## 4) فعّل Authentication
- **Authentication → Providers** → فعّل **Email** (وأغلق Confirm email للتجربة)
- (اختياري) فعّل **Google**

## 5) عدّل ملف الإعدادات
افتح `src/config/supabase-config.ts` وحط:
- `SUPABASE_URL` من Project Settings → API → Project URL
- `SUPABASE_PUBLISHABLE_KEY` من Project Settings → API → anon / public key

## 6) شغّل الموقع محلياً
```bash
npm install     # أو bun install
npm run dev
```
افتح http://localhost:8080

## 7) الأدمن الأصلي
الإيميل `abdalrhmanmaaith24@gmail.com` بيصير أدمن تلقائياً عند التسجيل.
لتغييره عدّل دالة `handle_new_user()` في `database-schema-full.sql` قبل التشغيل.

## 8) البناء للنشر
```bash
npm run build
```
مجلد `dist/` جاهز للرفع على Vercel / Netlify / Cloudflare Pages.

----

## سجل التعديلات

### 2026-08-19 — إضافة نظام القنوات + تحديد الجنس

**القاعدة:**
- `chat20.sql`: إضافة عمود `channel` للمنشورات + عمود `gender` للملفات الشخصية + دالة `can_see_channel()` + تحديث سياسات RLS للقنوات

**الواجهة:**
- `Chat.tsx`: تبويبات قنوات (الكل / أفكار / أنشطة /‥) + فلترة حسب القناة
- `App.tsx`: مسارات القنوات `/channel/افكار` و `/channel/انشطه` و‥
- `Profile.tsx`: حقل اختيار الجنس (ذكر / أنثى)
- `GenderOnboardingDialog.tsx`: نافذة إجبارية للمستخدمين بدون جنس
- `AuthContext.tsx`: تحميل `gender` مع بيانات المستخدم
