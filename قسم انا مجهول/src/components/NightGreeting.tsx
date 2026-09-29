import { useEffect, useMemo, useRef, useState } from "react";
import { Moon, Volume2, VolumeX } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/* جدول broadcasts غير موجود في أنواع قاعدة "أنا مجهول" — نقرأه عبر عميل غير مطبوع */
const db = supabase as unknown as SupabaseClient;
import { useAuth } from "@/hooks/use-auth";

type Block =
  | { t: "salam" | "tipsHeader" | "closing"; text: string }
  | { t: "p"; text: string }
  | { t: "li"; text: string };

interface Broadcast {
  id: string;
  title: string;
  content: Block[];
  expires_at?: string;
}

const SEEN_PREFIX = "mdk_night_seen_";

const SAMPLE: Block[] = [
  { t: "salam", text: "يا أهل مدارك 🤍" },
  {
    t: "p",
    text: "قرب وقت النوم، وقبل ما تسكروا يومكم وتتركوا كل شيء لبكرا، خذوا منكم دقيقتين بس لأنفسكم.",
  },
  { t: "tipsHeader", text: "🌙 قبل النوم:" },
  { t: "li", text: "توضأ إذا قدرت." },
  { t: "li", text: "صلِّ الوتر، وإذا عليك صلاة فحاول تقضيها." },
  { t: "li", text: "اقرأ آية الكرسي." },
  { t: "li", text: "اقرأ آخر آيتين من سورة البقرة." },
  { t: "li", text: "اقرأ الإخلاص والفلق والناس ثلاث مرات، وامسح بها جسدك." },
  { t: "li", text: "أكثر من الاستغفار والصلاة على النبي ﷺ." },
  { t: "li", text: "احمد الله على الأشياء الحلوة اللي صارت معك اليوم، حتى لو كان يومك صعب." },
  { t: "li", text: "اترك الهاتف قبل النوم بوقت، وخلي آخر شيء يدخل عقلك شيء هادئ ومطمئن." },
  { t: "tipsHeader", text: "🤲 ومن أجمل ما تقوله قبل النوم:" },
  { t: "li", text: "«باسمك اللهم أموت وأحيا.»" },
  { t: "li", text: "«اللهم قني عذابك يوم تبعث عبادك.»" },
  {
    t: "li",
    text: "«اللهم إني أسألك نومًا هادئًا، وقلبًا مطمئنًا، وصباحًا أجمل، وبارك لي في يومي القادم.»",
  },
  { t: "p", text: "وتذكروا… مش لازم كل يوم يكون يومًا مثاليًا." },
  { t: "p", text: "يمكن اليوم درست كثير، ويمكن قصّرت." },
  { t: "p", text: "يمكن أنجزت أشياء كنت فخورًا فيها، ويمكن ضاع منك وقت." },
  { t: "p", text: "المهم إنك ما زلت تحاول، وبكرا عندك فرصة جديدة تبدأ فيها من جديد." },
  { t: "p", text: "وأحب أذكركم بشيء يمكن ما بنحكيه كثير:" },
  { t: "p", text: "إحنا بنحاول نبني مكان تحسوا فيه إنكم مش لحالكم في طريقكم." },
  { t: "p", text: "المكان اللي تدخل عليه آخر الليل وتلاقي ناس مثلك بتحاول." },
  { t: "p", text: "المكان اللي تفتح فيه عيونك الصبح وتلاقي تحديًا جديدًا." },
  { t: "p", text: "المكان اللي ترجع له بعد يوم طويل، حتى لو ما أنجزت اللي كنت مخطط له." },
  {
    t: "p",
    text: "ويمكن بعد فترة، لما تخلصوا كل هذا الطريق، تتذكروا الأيام اللي كنتم تدخلوا فيها مدارك آخر الليل، وتقولوا:",
  },
  { t: "closing", text: "«كنا هون من البداية.» 🤍" },
  { t: "p", text: "ناموا وأنتم مرتاحين، سامحوا أنفسكم على تقصير اليوم، واتركوا بكرا لوقته." },
  {
    t: "p",
    text: "الله يريح قلوبكم، ويبارك في أعماركم وأوقاتكم، ويكتب لكم التوفيق في دراستكم وحياتكم، ويحقق لكم الأشياء اللي تتمنوها وأكثر.",
  },
  { t: "closing", text: "تصبحون على خير يا أهل مدارك.\nنشوفكم بكرا. 🌙🤍" },
];

/* ---------- صوت الليل: تسجيل حقيقي لصرير الحشرات (مرفق في المشروع) ---------- */
const AUDIO_URL = import.meta.env.BASE_URL + "audio/night-calm-v2.mp3";

/* ---------- نجوم ثابتة تتولد مرة واحدة ---------- */
const STARS = Array.from({ length: 46 }, (_, i) => ({
  id: i,
  top: Math.random() * 100,
  left: Math.random() * 100,
  size: 1.5 + Math.random() * 2.5,
  delay: Math.random() * 4,
  dur: 2 + Math.random() * 3,
}));

export default function NightGreeting() {
  const { isAdmin } = useAuth();
  const [bcast, setBcast] = useState<Broadcast | null>(null);
  const [forced, setForced] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [sndOn, setSndOn] = useState(false);
  const [snd, setSnd] = useState<HTMLAudioElement | null>(null);
  const stars = useMemo(() => STARS, []);
  const dismissRef = useRef(false);

  const isPreview =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("night") === "1";

  const active =
    forced || !bcast
      ? { id: "forced", title: "🌙 وقت النوم — معاينة", content: SAMPLE }
      : bcast;

  const showOverlay = forced || (!!bcast && bcast.id !== dismissed);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const nowIso = new Date().toISOString();
        const { data, error } = await db
          .from("broadcasts")
          .select("id, title, content, expires_at")
          .eq("kind", "night")
          .eq("visible", true)
          .lte("starts_at", nowIso)
          .gt("expires_at", nowIso)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error || !alive) return;
        if (!data) return;
        if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return;
        setBcast(data as unknown as Broadcast);
        clearInterval(id);
        if (localStorage.getItem(SEEN_PREFIX + (data as { id: string }).id) === "1") {
          setDismissed((data as { id: string }).id);
        }
      } catch {
        /* الجدول غير موجود — بلا إزعاج */
      }
    };

    if (isPreview) {
      if (sessionStorage.getItem("mdk_night_preview_done") === "1") {
        setDismissed("preview");
        return () => {
          alive = false;
        };
      }
      setBcast({ id: "preview", title: "🌙 وقت النوم — معاينة", content: SAMPLE });
      return () => {
        alive = false;
      };
    }

    void check();
    const id = setInterval(check, 600_000);

    const chan = supabase
      .channel("broadcasts-night")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "broadcasts", filter: "kind=eq.night" },
        () => void check()
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      supabase.removeChannel(chan);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [isPreview]);

  /* إغلاق قاطع عند وقت الانتهاء (3 فجراً): يختفي التنبيه والزر معاً بلا استثناء */
  useEffect(() => {
    if (!bcast?.expires_at) return;
    const ms = new Date(bcast.expires_at).getTime() - Date.now();
    if (ms <= 0) {
      setBcast(null);
      return;
    }
    const t = setTimeout(() => setBcast(null), Math.min(ms, 2_147_483_647));
    return () => clearTimeout(t);
  }, [bcast]);

  /* عنصر صوتي دائم يُنشأ عند التركيب (يحاول التشغيل التلقائي حيث يسمح المتصفح) */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = new Audio(AUDIO_URL);
    el.loop = true;
    el.volume = 0.55;
    el.preload = "auto";
    setSnd(el);
    return () => {
      el.pause();
      el.src = "";
    };
  }, []);

  const playSound = () => {
    let el = snd;
    if (!el) {
      el = new Audio(AUDIO_URL);
      el.loop = true;
      el.volume = 0.55;
      setSnd(el);
    }
    const p = el.play();
    if (p) {
      p.then(() => setSndOn(true)).catch(() => setSndOn(false));
    }
  };

  /* محاولة تشغيل تلقائية عند ظهور الشاشة */
  useEffect(() => {
    if (!showOverlay) return;
    dismissRef.current = false;
    playSound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOverlay]);

  /* اختصار معاينة للمالك: Ctrl/⌘ + Shift + N */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isAdmin && (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setForced((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAdmin]);

  if (!showOverlay) {
    /* نافذة التنبيه ما زالت مفتوحة (لحد 3 فجراً) → نعرض زراً للجميع يعيد فتحها */
    const inWindow = !!(bcast && (!bcast.expires_at || new Date(bcast.expires_at).getTime() > Date.now()));
    if (!inWindow && !isAdmin) return null;

    return (
      <button
        onClick={() => (bcast ? setDismissed(null) : setForced(true))}
        className="night-fab fixed bottom-16 left-3 z-40 rounded-full h-12 w-12 text-xl font-bold backdrop-blur flex items-center justify-center transition-colors"
        aria-label="تنبيه وقت النوم"
        title={inWindow ? "تنبيه وقت النوم — اضغط للعرض" : "تجربة ما قبل النوم (Ctrl+Shift+N)"}
      >
        🌙
      </button>
    );
  }

  const dismiss = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    dismissRef.current = true;
    if (!forced) {
      if (isPreview) sessionStorage.setItem("mdk_night_preview_done", "1");
      else localStorage.setItem(SEEN_PREFIX + active.id, "1");
    }
    snd?.pause();
    setSndOn(false);
    setForced(false);
    setDismissed(active.id);
  };

  const startOnTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dismissRef.current) return;
    if ((e.target as HTMLElement).closest("[data-silent]")) return;
    if (!sndOn) playSound();
  };

  const toggleSound = () => {
    if (sndOn) {
      snd?.pause();
      setSndOn(false);
    } else {
      playSound();
    }
  };

  const renderBlock = (b: Block, i: number) => {
    switch (b.t) {
      case "salam":
        return (
          <p key={i} className="night-title text-center font-extrabold text-lg sm:text-2xl leading-snug">
            {b.text}
          </p>
        );
      case "tipsHeader":
        return (
          <p key={i} className="night-primary font-bold text-base sm:text-lg flex items-center gap-2 pt-1">
            <Moon className="w-4 h-4 shrink-0" /> {b.text}
          </p>
        );
      case "closing":
        return (
          <p key={i} className="night-accent text-center font-extrabold text-base sm:text-lg whitespace-pre-wrap">
            {b.text}
          </p>
        );
      default:
        return (
          <p key={i} className="night-body leading-relaxed whitespace-pre-wrap">
            {b.text}
          </p>
        );
    }
  };

  /* هل ما زال وقت العرض مفتوحاً؟ (يُخفي التلميح بعد 3 فجر) */
  const inWindowHint =
    !forced && !isPreview && !!bcast?.expires_at && new Date(bcast.expires_at).getTime() > Date.now();

  const body: React.ReactNode[] = [];
  {
    const blocks: Block[] = Array.isArray(active.content) ? active.content : [];
    const renderList = (items: { t: "li"; text: string }[], key: string) => (
      <ul key={key} className="night-list list-disc pr-5 space-y-1.5">
        {items.map((li, j) => (
          <li key={j}>{li.text}</li>
        ))}
      </ul>
    );
    let pending: { t: "li"; text: string }[] = [];
    blocks.forEach((block, i) => {
      if (block.t === "li") {
        pending.push(block as { t: "li"; text: string });
        return;
      }
      if (pending.length) {
        body.push(renderList(pending, `ul-${i}`));
        pending = [];
      }
      body.push(renderBlock(block, i));
    });
    if (pending.length) body.push(renderList(pending, "ul-end"));
  }

  return (
    <div className="night-overlay" onClick={startOnTap}>
      <div className="night-sky">
        <div className="night-moon" />
        {stars.map((s) => (
          <span
            key={s.id}
            className="night-star"
            style={{ top: `${s.top}%`, left: `${s.left}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s`, animationDuration: `${s.dur}s` }}
          />
        ))}
      </div>

      <div className="relative z-10 min-h-full flex items-center justify-center p-4">
        <div className="max-w-xl w-full mx-auto">
          <div className="text-center mb-5 night-float">
            <div className="night-bed-scene">
              <div className="night-zzz" aria-hidden>
                <span>Z</span><span>z</span><span>Z</span>
              </div>
              <div className="night-sleeper">😴</div>
              <div className="night-bed">🛏️</div>
            </div>
          </div>

          <div className="night-card rounded-3xl p-5 sm:p-7 space-y-4 text-sm sm:text-[15px]">
            <div className="text-center space-y-1">
              <p className="night-title font-extrabold text-xl sm:text-2xl">{active.title}</p>
              <p className="night-muted text-[11px] flex items-center justify-center gap-1">
                <Volume2 className="w-3.5 h-3.5 night-primary" /> صوت الليل معك…
              </p>
            </div>

            <div className="space-y-3">{body}</div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                data-silent
                onClick={dismiss}
                className="night-btn-primary w-full rounded-xl py-3 font-bold transition-colors"
              >
                تصبحون على خير 🌙
              </button>
              <button
                onClick={toggleSound}
                className="night-btn-ghost w-full rounded-xl py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {sndOn ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                {sndOn ? "كتم صوت الليل" : "تشغيل صوت الليل"}
              </button>
              {inWindowHint && (
                <p className="night-muted text-center text-[10px] leading-relaxed">
                  تقدر ترجع تشوفه وقت ما تحب من زر 🌙 — يضل ظاهر لحد الساعة 3 فجراً
                </p>
              )}
              {(forced || isPreview) && (
                <p className="night-accent text-center text-[10px]">
                  وضع المعاينة — لا يظهر لغيرك
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}