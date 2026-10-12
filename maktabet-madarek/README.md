# 📚 المكتبة — قسم ملفات مدارك جو

قسم «المكتبة»: مكتبة ملفات تعليمية بطلاب مدارك جو، مع لوحة إدارة
لاعتماد الملفات. يعمل بوضعين **يلتقطهما تلقائياً** من `js/store.js`:

| الوضع | متى يعمل | مصدر البيانات |
|---|---|---|
| **مباشر (Live)** | عند تحميل مكتبة supabase-js + توفر إعدادات في `js/supabase-config.js` | جداول ودوال Supabase (الـ migration) |
| **تجريبي (Trial)** | بدون عميل supabase أو بدون إعدادات | LocalStorage + ذاكرة الجلسة + 14 ملفاً وصفياً |

## التشغيل محلياً

```bash
# من جذر المشروع
node serve.js
```

ثم افتح في المتصفح:

```
http://localhost:8000/maktabet-madarek/
```

(بما أن ملفات الإعدادات موجودة، سيعمل محلياً في **الوضع المباشر**.
للتجربة التجريبية المحلية أنشئ `?trial=1` في الرابط؟ — لا؛ ببساطة
أوقِف الإنترنت عند الاتصال، أو أزل السطر CDN من `index.html` مؤقتاً.)

## الميزات

1. **التصفح**: بحث فوري (الاسم/الوصف/الرافع)، فلاتر (السنة/المادة/الفصل/النوع/الترتيب)،
   تصنيفات المواد، أقسام الأحدث والأكثر تحميلاً، ونافذة تفاصيل الملف.
2. **الرفع**: قدرة 10MB، PDF/JPG/PNG فقط، تحقق من الحقول والامتداد والحجم، شريط تقدم.
   - مباشر: يُرفع فعلياً إلى Supabase Storage + صف بحالة «قيد المراجعة».
3. **التنزيل والمعاينة**: الملفات الحقيقية تُحمَّل مباشرة من القاعدة؛
   الملفات الوصفية (بلا محتوى) تولِّد نموذجاً نصياً يوضّح ذلك.
4. **الإدارة**: زر الدرع 🛡️ → رمز الإدارة (مُخزّن في القاعدة فقط، ولا يظهر
   في كود الصفحة إطلاقاً):
   - اعتماد / رفض / إعادة للمراجعة / حذف (مع تأكيد) / معاينة الملف الحي.
   - بحث وإحصائيات وتبويبات الحالات.
   - **زر تفعيل/إيقاف المكتبة للزوار** (في الوضع المباشر فقط — يكتب في `library_enabled`).
   - زر «↺ إعادة التهيئة» يظهر في الوضع التجريبي فقط؛ محمي في المباشر.

## قاعدة البيانات (Supabase)

- الملف: `supabase/migrations/20261012_maktabet_library.sql` داخل هذا المجلد.
- ينشئ: جداول `maktabet_library_settings` و`maktabet_library_files` و`maktabet_library_reports`،
  سياسات RLS، مخزن `maktabet-library-files`، دالات
  `maktabet_login_admin` / `maktabet_add_file` / `maktabet_set_status` /
  `maktabet_delete_file` / `maktabet_increment_download` / `maktabet_is_admin`،
  وحارس حجم 10MB على مستوى التخزين.
- **التنفيذ يدوي** من Supabase Dashboard → Database → SQL Editor (الصق الملف كاملاً → Run).

### تحديث SQL إضافي (أضيف بعد أول تشغيل للملف)
شغّل القطعة التالية إن لم تكن مشمولة في نسخة الـ migration التي ثبّتّها:

```sql
create or replace function public.maktabet_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin')
$$;
grant execute on function public.maktabet_is_admin() to anon, authenticated;

drop policy if exists "user_roles_select_self" on public.user_roles;
create policy "user_roles_select_self" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid());
```

### خطوتان أساسيتان للوضع المباشر الكامل
1. **فعّل تسجيل الدخول المجهول** في Supabase Dashboard →
   Authentication → Sign In / Up → **Allow anonymous sign-ins** = ON
   (إلزامي لدخول الإدارة لأن رمز الإدارة يُتحقق منه داخل القاعدة).
2. **فعّل المكتبة** من لوحة الإدارة (زر «تفعيل المكتبة للزوار») بعد دخولك
   كأدمن، أو يدوياً:
   ```sql
   UPDATE public.maktabet_library_settings SET library_enabled = true WHERE id = 1;
   ```

## بيانات تجريبية

- 14 ملفاً وصفياً (معتمد / قيد المراجعة / مرفوض) متاحة في الوضع التجريبي فقط.
- الملفات الوصفية لا تحتوي محتوى؛ «التنزيل» يولّد نموذجاً نصياً يوضّح ذلك.
- محتوى الرفع التجريبي يحفظ في ذاكرة الجلسة فقط (لا يُخزَّن محلياً).

## ما يبقى للنسخة المباشرة

| الميزة | تجريبي (Trial) | مباشر (Live) |
|---|---|---|
| التخزين | ذاكرة جلسة فقط | Supabase Storage |
| الحالات | LocalStorage | جدول + RLS |
| رمز الإدارة | غير متاح في التجربة | دالة `maktabet_login_admin` (في القاعدة) |
| عدّاد التنزيلات | محلي | `maktabet_increment_download` |
| البلاغات | رسالة فقط | إدراج في `maktabet_library_reports` |

> ملاحظة أمان: المفتاح في `js/supabase-config.js` هو مفتاح **publishable/anon**
> عام — لا تكتب `service_role` في أي ملف داخل المستودع أبداً.

## البنية البرمجية

طبقة بيانات معزولة في `js/store.js` بنفس أسماء الدوال في الوضعين؛
الواجهة `js/app.js` تتكلم مع `MaktabetStore` فقط ولا تلمس التخزين مباشرة.

## الملفات

- `index.html` — الصفحة (واجهة + نوافذ + لوحة إدارة + تحميل CDN لـ supabase-js).
- `css/library.css` — الأنماط بهوية مدارك جو (أخضر داكن + فيروزي + أبيض، RTL).
- `js/config.js` — الإعدادات والتصنيفات وقيود الرفع (10MB). (لا يحتوي رمز إدارة إطلاقاً).
- `js/supabase-config.js` — رابط القاعدة والمفتاح العام وحاوية التخزين.
- `js/seed.js` — بيانات التجربة الوصفية (14 ملفاً).
- `js/store.js` — طبقة البيانات (مباشر عبر Supabase / تجريبي عبر LocalStorage).
- `js/app.js` — منطق الواجهة والتفاعل.
- `supabase/migrations/20261012_maktabet_library.sql` — مخطط قاعدة البيانات الكامل.