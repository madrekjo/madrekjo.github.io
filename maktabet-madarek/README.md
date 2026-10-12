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

1. **قسمان منظّمان**: تبويب **📁 الملفات** وتبويب **🔗 الروابط المباشرة**، مع إحصائيات
   تتغيّر حسب القسم النشط.
2. **التصفح**: بحث فوري (الاسم/الوصف/الرافع/المعلم)، فلاتر (السنة/المادة/الفصل/النوع/الترتيب)،
   تصنيفات المواد، أقسام الأحدث والأكثر تحميلاً، ونافذة تفاصيل الملف.
3. **الرفع**: قدرة 10MB، PDF/JPG/PNG فقط، تحقق من الحقول والامتداد والحجم، شريط تقدم.
   - مباشر: يُرفع فعلياً إلى Supabase Storage + صف بحالة «قيد المراجعة».
4. **إضافة رابط مباشر**: عنوان + رابط (URL يبدأ بـ http/https) + وصف + سنة + مادة + فصل،
   مع حقل **اسم المعلم (اختياري)** — يبقى فارغاً إن كان المحتوى عاماً. يُضاف بحالة
   «قيد المراجعة» حتى يعتمده المشرف.
5. **التنزيل والمعاينة**: الملفات الحقيقية تُحمَّل مباشرة من القاعدة؛
   الملفات الوصفية (بلا محتوى) تولِّد نموذجاً نصياً يوضّح ذلك.
6. **الإدارة**: زر الدرع 🛡️ → رمز الإدارة (مُخزّن في القاعدة فقط، ولا يظهر
   في كود الصفحة إطلاقاً):
   - تبويبان: **الملفات** و**الروابط المباشرة** — لكلٍّ اعتماد / رفض / إعادة للمراجعة /
     حذف (مع تأكيد) / فتح الرابط.
   - بحث وإحصائيات وتبويبات الحالات.
   - **زر تفعيل/إيقاف المكتبة للزوار** (في الوضع المباشر فقط — يكتب في `library_enabled`).
   - زر «↺ إعادة التهيئة» يظهر في الوضع التجريبي فقط؛ محمي في المباشر.
   - **خروج حقيقي**: زر «🚪 خروج من الإدارة» يحذف دور الأدمن للجلسة من القاعدة
     (`maktabet_logout_admin`) فلا يعود للوضع الإداري عند التحديث.

## قاعدة البيانات (Supabase)

- الملف الأساسي: `supabase/migrations/20261012_maktabet_library.sql` داخل هذا المجلد.
- ينشئ: جداول `maktabet_library_settings` و`maktabet_library_files` و`maktabet_library_reports`،
  سياسات RLS، مخزن `maktabet-library-files`، دالات
  `maktabet_login_admin` / `maktabet_add_file` / `maktabet_set_status` /
  `maktabet_delete_file` / `maktabet_increment_download` / `maktabet_is_admin`،
  وحارس حجم 10MB على مستوى التخزين.
- **تحديث إضافي (الملف الثاني)**: `supabase/migrations/20261013_maktabet_links.sql`،
  ويضيف:
  - عمود `teacher` لجدول الملفات (اختياري — فارغ = غير مخصص لمعلم).
  - جدول `maktabet_library_links` + سياسات RLS + عدّاد فتح.
  - دالات `maktabet_add_link` / `maktabet_set_link_status` / `maktabet_delete_link` /
    `maktabet_increment_link_click`.
  - دالة `maktabet_logout_admin` (خروج حقيقي من الإدارة).
  - تحديث `maktabet_add_file` لقبول اسم المعلم.
- **التنفيذ يدوي** من Supabase Dashboard → Database → SQL Editor (الصق الملف كاملاً → Run).
  شغّل الملفين بالترتيب: `20261012` ثم `20261013`.

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
3. **عيّن رمز الإدارة بنفسك** (لا يوجد رمز حقيقي في المستودع — القيمة في
   الـ migration مجرد مكانٍ مؤقّت `CHANGE_ADMIN_PIN`):
   ```sql
   UPDATE public.maktabet_library_settings SET admin_pin = 'ضع-رمزاً-قوياً-هنا' WHERE id = 1;
   ```

> ⚠️ **أمن**: مجلد `supabase/` داخل القسم منشور علناً عبر GitHub Pages، لذا لا
> يُكتب رمز الإدارة الحقيقي في أي ملف بالمستودع. الرمز يعيش في القاعدة فقط،
> ويُغيَّر من Dashboard → SQL Editor. يُنصح بتدوير الرمز إن كان قد نُشر سابقاً.

4. **شغّل هجرة إخفاء رمز الإدارة** `20261014_maktabet_admin_pin_private.sql`
   لمنع أي زائر من قراءة `admin_pin` عبر الـ REST، ثم **غيّر الرمز** فوراً
   (كان قابلاً للقراءة قبل التنفيذ):
   ```sql
   UPDATE public.maktabet_library_settings SET admin_pin = 'رمز-جديد-قوي' WHERE id = 1;
   ```

## بيانات تجريبية

- 14 ملفاً وصفياً (معتمد / قيد المراجعة / مرفوض) تظهر في الوضع التجريبي فقط.
- **النسخة المنشورة مربوطة بقاعدة البيانات دائماً**: ما دام إعداد Supabase
  موجوداً في `js/supabase-config.js` فالوضع «مباشر» إلزامياً ولا تُعرض أي
  بيانات محلية/وهمية للزوار. إن تعذّر تحميل مكتبة Supabase يُعاد المحاولة،
  وتظهر رسالة «تعذّر الاتصال بقاعدة البيانات» بدل بيانات وهمية.
- محتوى الرفع التجريبي يحفظ في ذاكرة الجلسة فقط (لا يُخزَّن محلياً).

## الحماية الأمنية للملفات (فحص قبل الرفع)

كل ملف يُفحَص **مرّتين** (عند اختياره وقبل رفعه فعلياً) عبر `js/guard.js`:

| الفحص | يمنع |
|---|---|
| مطابقة المحتوى للامتداد (Magic bytes) | برنامج تنفيذي/أرشيف متنكّر بامتداد `.pdf` أو `.jpg` |
| كشف الألحاق متعدّدة الصيغ (polyglot) | صورة/PDF مُلحق داخلها أرشيف ZIP خطير |
| فحص الأكواد داخل PDF | `/JavaScript` · `/JS` · `/Launch` · `/EmbeddedFile` · `/RichMedia` |
| فحص اسم الملف | امتداد مزدوج (`file.pdf.exe`) أو أحرف تحكّم مخفية (RTL override) |

> هذه طبقة حماية فورية داخل المتصفح تمنع الحالات الخطرة الشائعة.

## فحص الفيروسات الحقيقي (VirusTotal + GitHub Actions)

الطبقة الثانية تفحص **محتوى** كل ملف بمحرّك مضاد فيروسات حقيقي عبر عامل
تلقائي في GitHub Actions (`tools/scan-library.mjs` +
`.github/workflows/maktabet-virus-scan.yml`). أي ملف مصاب يُرفض ويُحذف من
التخزين تلقائياً قبل أن يراه أي زائر.

**الترتيب المطلوب (مرة واحدة):**

1. نفّذ `supabase/migrations/20261015_maktabet_virus_scan.sql` في
   Supabase → SQL Editor.
2. أنشئ حساباً مجانياً في virustotal.com وخُذ مفتاح API.
3. GitHub → Settings → Secrets and variables → Actions، أضف:
   - `VIRUSTOTAL_API_KEY` = مفتاح VirusTotal.
   - `MAKTABET_SERVICE_ROLE_KEY` = مفتاح service_role (Supabase → Settings → API).
     ⚠️ يوضع في Secrets فقط — لا يُكتب في أي ملف داخل المستودع.
4. شغّل العامل مرة: GitHub → Actions → «فحص فيروسات المكتبة» → Run workflow.
5. فعّل الفحص في القاعدة:
   ```sql
   update public.maktabet_library_settings set virus_scan_enabled = true where id = 1;
   ```

**بعد التفعيل:** كل ملف جديد يدخل بحالة `scan_status = 'pending'` فلا يظهر
للزوار، ثم يفحصه العامل كل 15 دقيقة: الآمن يصبح `clean`، والمصاب يُحذف
ويُوسم `infected` + `rejected`. وللمشرف من اللوحة زر «🛡️ اعتماد كآمن»
لمعالجة أي ملف عالق يدوياً.

> ما دام `virus_scan_enabled = false` فالسلوك لا يتغيّر: الملفات تُوسم
> `clean` مباشرة وتظهر بعد اعتماد المشرف.

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
- `supabase/migrations/20261012_maktabet_library.sql` — مخطط قاعدة البيانات الأساسي.
- `supabase/migrations/20261013_maktabet_links.sql` — إضافات: الروابط المباشرة + المعلم + خروج الإدارة.