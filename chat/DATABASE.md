# دليل قاعدة البيانات — شرح الجداول ووظائفها

الملف `database-schema-full.sql` فيه كل الـ migrations مدموجة بالترتيب الزمني. شغّله مرة وحدة على مشروع Supabase الجديد (SQL Editor → New Query → paste → Run).

---

## 1) الحسابات والصلاحيات

| الجدول | الوظيفة | حقول رئيسية |
|---|---|---|
| `profiles` | بروفايل كل مستخدم (يتولّد تلقائياً من trigger على `auth.users`) | `user_id`, `full_name`, `avatar_url`, `generation` (09/10), `field`, `is_banned`, `chat_banned`, `timeout_until`, `name_changed_at` |
| `user_roles` | ربط المستخدم برتبته (many-to-many) — الرتب مخزّنة هون **مش** على profiles لأسباب أمنية | `user_id`, `role` (enum: `admin`, `moderator`, `supervisor`, `rounds_manager`, `user`) |
| `role_permissions` | مصفوفة صلاحيات لكل رتبة (switches قابلة للتحكم من لوحة الإدارة) | `role`, `can_delete_posts`, `can_delete_comments`, `can_ban_users`, `can_timeout`, `can_warn`, `can_manage_reports`, `can_lock_sections`, `can_manage_words` |
| `user_warnings` | تحذيرات صادرة من الإدارة للمستخدمين | `user_id`, `reason`, `issued_by` |
| `user_devices` | ربط كل مستخدم بأجهزته (لمنع تكرار الحسابات ولحظر الجهاز) | `user_id`, `device_id` |
| `banned_devices` | أجهزة محظورة (يقارن معها عند تسجيل الدخول) | `device_id`, `banned_by`, `reason` |
| `admin_actions` | سجل audit لكل إجراء إداري | `admin_id`, `target_user_id`, `action_type`, `details` |

**دوال أمنية مهمة**:
- `has_role(user_id, role)` — يفحص إذا مستخدم يملك رتبة معيّنة (SECURITY DEFINER عشان تتفادى recursion في RLS).
- `has_permission(user_id, permission_name)` — يقرأ من `role_permissions` ويرجّع صلاحية معيّنة. الأدمن يرجّع `true` دائماً.
- `is_user_banned()` / `is_user_chat_banned()` — تُستخدم من triggers لمنع الكتابة.
- `protect_original_admin()` — trigger يمنع حذف رتبة الأدمن الأصلي.

---

## 2) الدردشة العامة (Posts)

| الجدول | الوظيفة |
|---|---|
| `posts` | المنشورات الرئيسية. عمود `generation` يفصل شات جيل 09 عن 10. `NULL` = مشترك (منشورات الإدارة). |
| `comments` | تعليقات (مع `parent_comment_id` للردود المتشعبة). فيها soft-delete (`deleted_at`, `deleted_by`) و`is_pinned`. |
| `likes` | إعجابات المنشورات |
| `comment_likes` | إعجابات التعليقات |
| `notifications` | إشعارات (لايك/تعليق/رد/mention). |
| `post_reports` | البلاغات على المنشورات — تظهر في لوحة الإدارة. |

**دوال الشات**:
- `set_content_generation()` — trigger `BEFORE INSERT` يعبّي `generation` تلقائياً من بروفايل الكاتب (إلا إذا كان staff).
- `can_see_generation(gen)` — RLS: يرجّع true إذا كان المستخدم من نفس الجيل أو staff أو المحتوى مشترك.
- `hard_delete_post(id)` / `hard_delete_comment(id)` — حذف كامل من الإدارة.
- `delete_old_posts()` / `delete_old_comments()` — تنظيف تلقائي بعد 24 ساعة.
- `check_banned_words()` — trigger يرفض المحتوى اللي فيه كلمات محظورة.
- `enforce_ban_on_write()` / `enforce_chat_ban_on_write()` — triggers تمنع المحظورين من الكتابة.

---

## 3) الجولات الدراسية (Study Rounds)

| الجدول | الوظيفة |
|---|---|
| `study_rounds` | الجولات (اسم، مادة، تاريخ، منشئ). الإنشاء محصور بـ `admin` أو `rounds_manager`. |
| `round_participants` | أعضاء كل جولة |
| `round_completions` | إتمام كل جولة (عدّاد الإنجازات لكل مستخدم) |
| `round_chat` | شات داخلي لكل جولة |
| `round_meetings` | اجتماعات فرعية داخل الجولات |
| `round_meeting_members` | أعضاء الاجتماع |
| `round_meeting_messages` | رسائل الاجتماع |

**دوال**:
- `is_round_member(round_id, user_id)` — للـ RLS.
- `is_meeting_member(meeting_id, user_id)` — للـ RLS.
- `join_round(round_id, user_id)` — دالة انضمام آمنة (تمنع التكرار).
- `get_round_counts(user_ids[])` — عدّ إنجازات دفعة مستخدمين مرة وحدة.
- `delete_old_rounds()` — تنظيف بعد 10 أيام.

---

## 4) الجداول والملفات (Schedules)

| الجدول | الوظيفة |
|---|---|
| `schedules` | جداول (صور/PDF) مرفوعة على bucket `schedules` |
| `schedule_comments` | تعليقات على الجداول |

---

## 5) الاقتراحات (Suggestions)

| الجدول | الوظيفة |
|---|---|
| `suggestions` | اقتراحات المستخدمين |
| `suggestion_likes` | إعجابات الاقتراحات |
| `suggestion_replies` | ردود على الاقتراحات |
| `suggestion_reply_likes` | إعجابات الردود |

---

## 6) قنوات محتوى خاصّة

| الجدول | الوظيفة |
|---|---|
| `changes_messages` | قسم "التغييرات" — رسائل مصنّفة بـ `category` (تحديثات، ملاحظات، ...) مع رد |
| `staff_chat` | شات خاص بالإدارة فقط (متصل بـ bucket `staff-chat` للمرفقات) |
| `support_messages` | رسائل الدعم الفني — من المستخدم للإدارة |

---

## 7) الإعدادات والتحكم

| الجدول | الوظيفة |
|---|---|
| `banned_words` | قائمة الكلمات الممنوعة (تُفرض عبر trigger على posts/comments) |
| `section_locks` | قفل أقسام كاملة (chat/rounds/suggestions/...) — بـ `locked_until` اختياري |

**دالة**: `check_section_lock()` — trigger عام يرفض الإدخال إذا القسم مقفل.

---

## 8) Storage Buckets المطلوبة

بعد ما تشغّل السكربت، أنشئ هالـ buckets يدوياً من الـ Storage:

| Bucket | Public | الاستخدام |
|---|---|---|
| `avatars` | ✅ | صور البروفايل |
| `post-media` | ✅ | صور/فيديوهات المنشورات |
| `schedules` | ✅ | ملفات الجداول |
| `staff-chat` | ❌ | مرفقات شات الإدارة |
| `round-meetings` | ❌ | مرفقات الاجتماعات |

---

## 9) الأدمن الأصلي

`handle_new_user()` trigger على `auth.users` بيعطي رتبة `admin` تلقائياً للإيميل:
```
abdalrhmanmaaith24@gmail.com
```
غيّره في الـ SQL إذا بدك إيميل ثاني يكون الأدمن.

---

## 10) تفعيل Auth

بعد تشغيل السكربت:
1. Authentication → Providers → فعّل **Email** (ويفضّل عدم اشتراط تأكيد الإيميل للتجربة).
2. أضف **Google** لو بدك Google login.
3. أول مستخدم يسجّل بالإيميل الأصلي = بيصير أدمن تلقائياً.
