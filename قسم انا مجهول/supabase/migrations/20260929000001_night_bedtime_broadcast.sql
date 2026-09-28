-- ============================================================================
-- تنبيه وقت النوم لقسم "أنا مجهول" (dqrzsllhdcvykoisisoy)
-- نفس آلية الشات: بث ليلي + نافذة حتى 3 فجراً + Realtime فوري
-- التنفيذ: Supabase Dashboard → SQL Editor → Run (يدوي من المالك)
-- ============================================================================

-- 1) جدول البث (إن لم يكن موجوداً) — متوافق مع جدول الشات
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content jsonb NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  kind text NOT NULL DEFAULT 'morning' CHECK (kind IN ('morning', 'night')),
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- فهرس خفيف للاستعلام الليلي
CREATE INDEX IF NOT EXISTS broadcasts_kind_created_at_idx
  ON public.broadcasts (kind, created_at DESC);

-- 2) بث وقت النوم
INSERT INTO public.broadcasts (kind, title, visible, content)
SELECT 'night', '🌙 وقت النوم', true,
'[
  {"t": "salam", "text": "يا أهل مدارك 🤍"},
  {"t": "p", "text": "قرب وقت النوم، وقبل ما تسكروا يومكم وتتركوا كل شيء لبكرا، خذوا منكم دقيقتين بس لأنفسكم."},
  {"t": "tipsHeader", "text": "🌙 قبل النوم:"},
  {"t": "li", "text": "توضأ إذا قدرت."},
  {"t": "li", "text": "صلِّ الوتر، وإذا عليك صلاة فحاول تقضيها."},
  {"t": "li", "text": "اقرأ آية الكرسي."},
  {"t": "li", "text": "اقرأ آخر آيتين من سورة البقرة."},
  {"t": "li", "text": "اقرأ الإخلاص والفلق والناس ثلاث مرات، وامسح بها جسدك."},
  {"t": "li", "text": "أكثر من الاستغفار والصلاة على النبي ﷺ."},
  {"t": "li", "text": "احمد الله على الأشياء الحلوة اللي صارت معك اليوم، حتى لو كان يومك صعب."},
  {"t": "li", "text": "اترك الهاتف قبل النوم بوقت، وخلي آخر شيء يدخل عقلك شيء هادئ ومطمئن."},
  {"t": "tipsHeader", "text": "🤲 ومن أجمل ما تقوله قبل النوم:"},
  {"t": "li", "text": "«باسمك اللهم أموت وأحيا.»"},
  {"t": "li", "text": "«اللهم قني عذابك يوم تبعث عبادك.»"},
  {"t": "li", "text": "«اللهم إني أسألك نومًا هادئًا، وقلبًا مطمئنًا، وصباحًا أجمل، وبارك لي في يومي القادم.»"},
  {"t": "p", "text": "وتذكروا… مش لازم كل يوم يكون يومًا مثاليًا."},
  {"t": "p", "text": "يمكن اليوم درست كثير، ويمكن قصّرت."},
  {"t": "p", "text": "يمكن أنجزت أشياء كنت فخورًا فيها، ويمكن ضاع منك وقت."},
  {"t": "p", "text": "المهم إنك ما زلت تحاول، وبكرا عندك فرصة جديدة تبدأ فيها من جديد."},
  {"t": "p", "text": "وأحب أذكركم بشيء يمكن ما بنحكيه كثير:"},
  {"t": "p", "text": "إحنا بنحاول نبني مكان تحسوا فيه إنكم مش لحالكم في طريقكم."},
  {"t": "p", "text": "المكان اللي تدخل عليه آخر الليل وتلاقي ناس مثلك بتحاول."},
  {"t": "p", "text": "المكان اللي تفتح فيه عيونك الصبح وتلاقي تحديًا جديدًا."},
  {"t": "p", "text": "المكان اللي ترجع له بعد يوم طويل، حتى لو ما أنجزت اللي كنت مخطط له."},
  {"t": "p", "text": "ويمكن بعد فترة، لما تخلصوا كل هذا الطريق، تتذكروا الأيام اللي كنتم تدخلوا فيها مدارك آخر الليل، وتقولوا:"},
  {"t": "closing", "text": "«كنا هون من البداية.» 🤍"},
  {"t": "p", "text": "ناموا وأنتم مرتاحين، سامحوا أنفسكم على تقصير اليوم، واتركوا بكرا لوقته."},
  {"t": "p", "text": "الله يريح قلوبكم، ويبارك في أعماركم وأوقاتكم، ويكتب لكم التوفيق في دراستكم وحياتكم، ويحقق لكم الأشياء اللي تتمنونها وأكثر."},
  {"t": "closing", "text": "تصبحون على خير يا أهل مدارك.\nنشوفكم بكرا. 🌙🤍"}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.broadcasts WHERE kind = 'night');

-- 3) نافذة العرض: من الآن حتى 3 فجر (بتوقيت عمّان)
UPDATE public.broadcasts
SET starts_at = now() - interval '1 minute',
    expires_at = (date_trunc('day', timezone('Asia/Amman', now()))
                  + interval '1 day' + interval '3 hours') AT TIME ZONE 'Asia/Amman'
WHERE kind = 'night';

-- 4) Realtime فوري — بدون استطلاع دوري
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcasts;

-- 5) فحص
SELECT id, kind, title, starts_at, expires_at
FROM public.broadcasts
WHERE kind = 'night'
ORDER BY created_at DESC;
