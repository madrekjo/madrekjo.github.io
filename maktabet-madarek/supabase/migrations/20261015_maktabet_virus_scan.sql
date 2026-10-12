-- ============================================================
-- المكتبة — فحص الفيروسات (VirusTotal) قبل النشر
-- ------------------------------------------------------------
-- يضيف طبقة فحص حقيقي بمحرّك خارجي:
--   1) عمود scan_status لكل ملف: clean | pending | infected | error
--   2) إعداد virus_scan_enabled (افتراضي false → لا يتغيّر سلوك الموقع)
--   3) تعديل maktabet_add_file: عند تفعيل الفحص يصبح الملف الجديد
--      scan_status='pending' فينتظر نتيجة الفحص قبل ظهوره.
--   4) تضييق القراءة العامة: للزائر لا يظهر إلا «معتمد + آمن».
--      الأدمن يرى كل شيء كما هو.
--
-- خطوات التفعيل (مرة واحدة، بعد تنفيذ هذا الملف):
--   أ) أنشئ حساب VirusTotal مجاناً وخُذ مفتاح API.
--   ب) أضف في GitHub → Settings → Secrets and variables → Actions:
--        VIRUSTOTAL_API_KEY          = مفتاح VirusTotal
--        MAKTABET_SERVICE_ROLE_KEY   = مفتاح service_role (Supabase → Settings → API)
--      (لا تُكتب هذه المفاتيح في أي ملف داخل المستودع إطلاقاً).
--   ج) شغّل عامل الفحص: GitHub → Actions → «فحص فيروسات المكتبة» → Run workflow.
--   د) فعّل الفحص في القاعدة:
--        update public.maktabet_library_settings
--           set virus_scan_enabled = true
--         where id = 1;
--
-- ملاحظة: ما دام virus_scan_enabled = false فالملفات الجديدة تُوسَم
--         'clean' مباشرة ويعمل الموقع كما هو تماماً (بلا انتظار).
-- ============================================================

-- 1) عمود حالة الفحص على الملفات
alter table public.maktabet_library_files
  add column if not exists scan_status text not null default 'clean';

alter table public.maktabet_library_files
  drop constraint if exists maktabet_files_scan_status_chk;
alter table public.maktabet_library_files
  add constraint maktabet_files_scan_status_chk
  check (scan_status in ('clean', 'pending', 'infected', 'error'));

create index if not exists maktabet_files_scan_status_idx
  on public.maktabet_library_files (scan_status);

-- 2) إعداد تفعيل الفحص (مغلق افتراضياً حتى يُضبط العامل والمفاتيح)
alter table public.maktabet_library_settings
  add column if not exists virus_scan_enabled boolean not null default false;

-- 3) تعديل دالة الإضافة لوضع حالة الفحص الصحيحة
create or replace function public.maktabet_add_file(
  p_title text,
  p_description text,
  p_year smallint,
  p_subject text,
  p_term smallint,
  p_type text,
  p_ext text,
  p_size_bytes bigint,
  p_uploader text default 'مستخدم مجهول',
  p_storage_path text default null,
  p_teacher text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  _limit bigint;
  _scan boolean;
  _id uuid;
begin
  if nullif(trim(p_title), '') is null then
    raise exception 'title_required';
  end if;
  if p_year not in (2009, 2010) then
    raise exception 'invalid_year';
  end if;
  if p_term not in (1, 2) then
    raise exception 'invalid_term';
  end if;
  if lower(coalesce(p_ext, '')) not in ('pdf', 'jpg', 'jpeg', 'png') then
    raise exception 'invalid_ext';
  end if;
  select max_size_bytes, virus_scan_enabled
    into _limit, _scan
    from public.maktabet_library_settings where id = 1;
  _limit := coalesce(_limit, 10485760); -- 10MB افتراضياً
  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'invalid_size';
  end if;
  if p_size_bytes > _limit then
    raise exception 'size_limit_exceeded';
  end if;

  insert into public.maktabet_library_files
    (title, description, year, subject, term, type, ext, size_bytes, uploader, storage_path, teacher, status, scan_status)
  values
    (trim(p_title),
     coalesce(nullif(trim(p_description), ''), ''),
     p_year, p_subject, p_term, p_type,
     lower(p_ext), p_size_bytes,
     coalesce(nullif(trim(p_uploader), ''), 'مستخدم مجهول'),
     p_storage_path,
     nullif(trim(coalesce(p_teacher, '')), ''),
     'pending',
     case when coalesce(_scan, false) then 'pending' else 'clean' end)
  returning id into _id;
  return _id;
end;
$$;

grant execute on function public.maktabet_add_file(
  text, text, smallint, text, smallint, text, text, bigint, text, text, text
) to anon, authenticated;

-- 4) سياسة القراءة العامة: الزائر يرى «المعتمد + الآمن» فقط، الأدمن يرى الكل
drop policy if exists "ml_files_read" on public.maktabet_library_files;
create policy "ml_files_read" on public.maktabet_library_files
  for select to anon, authenticated
  using (
    (public.is_maktabet_library_enabled() AND status = 'approved' AND scan_status = 'clean')
    OR public.has_role(auth.uid(), 'admin')
  );
