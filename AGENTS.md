# قواعد العمل الدائمة — مدارك جو

## رفع أي تغيير على قسم «بين السطور» (أو أي قسم منشور)
بعد أي تعديل على القسم يلزم تلقائياً (بدون طلب):

1. البناء من `قسم بين السطور/` → نسخ الناتج إلى مجلد النشر `sutur/`
   - rm -f sutur/assets/* && cp -r "قسم بين السطور/dist/." sutur/
2. **رَفْع نسخة الرابط المنشور على الحقول**: رفع `?v=` في ملفات الحقول الخمسة
   - `2009/engineering.html` · `2009/health.html` · `2009/business.html` · `2009/languages.html` · `2010/index.html`
   - وملف الرئيسي `index.html` (بطاقة 🃏 + رابط الفوتر `href="/sutur/"`)
   - المثال: v=2 → v=3 → v=4 ... (sed على `sutur/?v=N`)
3. commit + push إلى main وحساب المالك `madrekjo` (معتمد محلياً)
4. السطور الجديدة في قاعدة Supabase تحتاج تنفيذ SQL يدوي من المستخدم في Dashboard → SQL Editor (ملفات `supabase/migrations/*.sql`) — تذكير المستخدم بها دائماً.

## ملاحظات المشروع
- مشروع: `madrekjo/madrekjo.github.io` — GitHub Pages (main).
- قسم «بين السطور»: مصدره `قسم بين السطور/` (Vite + React + Tailwind v4)، منشوره في `sutur/` تحت `/sutur/`.
- قاعدة Supabase: `cfwnarueaparjbetagpi` — مفتاح anon في `قسم بين السطور/src/config/supabase-config.ts` (لا تكتب service_role بأي ملف).
- القائمة الجانبية في حقول 2009 تستخدم مصفوفة `SHARED` داخل كل ملف HTML — روابط الأقسام فيها `type: 'iframe'`.
- مجلد أنا مجهول اسمه فعلياً `قسم انا مجهول/` (بدون همزة على أنا).