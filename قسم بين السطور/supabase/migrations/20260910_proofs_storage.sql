-- ============================================================
-- تفعيل رفع صور الدليل (سكرين شوت) في «بطاقتي»
-- ينشئ البكت + صلاحيات عامة (القراءة للعرض، والرفع والمسح)
-- تشغيل: Supabase Dashboard → SQL Editor → لصق وتنفيذ (أمن إعادة التشغيل)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proofs',
  'proofs',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set public = true;

create policy "proofs_public_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'proofs');

create policy "proofs_public_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'proofs');

create policy "proofs_public_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'proofs');

create policy "proofs_public_delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'proofs');