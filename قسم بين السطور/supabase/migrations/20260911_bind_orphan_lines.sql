-- ربط البطاقات المعلّقة (نُشرت قبل ربط user_id في submit_line) بصاحبها عبر الجهاز
update public.lines l
set user_id = u.id
from public.users u
where l.user_id is null
  and l.device_id = u.device_id;