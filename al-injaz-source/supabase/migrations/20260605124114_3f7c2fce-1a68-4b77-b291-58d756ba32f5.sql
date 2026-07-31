
DROP POLICY IF EXISTS "Users can view completed successful tasks" ON public.tasks;
DROP POLICY IF EXISTS "Support attachments are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Support attachments are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public read support-attachments" ON storage.objects;
