import { useEffect, useMemo, useState } from "react";
import { Moon, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Block =
  | { t: "salam" | "tipsHeader" | "closing" | "now"; text: string }
  | { t: "p" | "hadith"; text: string }
  | { t: "li"; text: string };

interface Broadcast {
  id: string;
  title: string;
  content: Block[];
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

/* ---------- صوت الليل: صرير الحشرات — تشغيل ذاتي بلا ملف خارجي ---------- */
class NightAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private loop: number | null = null;
  started = false;

  private ensure(): boolean {
    if (this.ctx) return true;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.13;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  private chirp() {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 4100 + Math.random() * 500;
    bp.Q.value = 18;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 4; i++) {
      const s = t + i * 0.045;
      g.gain.setValueAtTime(0.45, s);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.06);
    }
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.3);
  }

  private schedule = () => {
    if (!this.ctx) return;
    this.chirp();
    this.loop = window.setTimeout(this.schedule, 480 + Math.random() * 920);
  };

  start() {
    if (!this.ensure()) return;
    void this.ctx!.resume();
    if (this.loop !== null) return;
    this.started = true;
    this.schedule();
  }

  stop() {
    if (this.loop !== null) {
      clearTimeout(this.loop);
      this.loop = null;
    }
    this.started = false;
  }
}

const audio = new NightAudio();

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
  const [bcast, setBcast] = useState<Broadcast | null>(null);
  const [gone, setGone] = useState(false);
  const [sndOn, setSndOn] = useState(false);
  const stars = useMemo(() => STARS, []);

  const isPreview =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("night") === "1";

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const { data, error } = await supabase
          .from("broadcasts")
          .select("id, title, content")
          .eq("kind", "night")
          .eq("visible", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error || !alive) return;
        if (!data) return;
        setBcast(data as unknown as Broadcast);
        if (localStorage.getItem(SEEN_PREFIX + (data as { id: string }).id) === "1") setGone(true);
      } catch {
        /* الجدول غير موجود — بلا إزعاج */
      }
    };

    if (isPreview) {
      setBcast({ id: "preview", title: "🌙 وقت النوم — معاينة", content: SAMPLE });
      return () => { alive = false; };
    }

    void check();
    const id = setInterval(check, 45_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [isPreview]);

  useEffect(() => {
    if (!bcast || gone) return;
    audio.start();
    const t = window.setTimeout(() => {
      if (!audio.started) setSndOn(false);
    }, 900);
    setSndOn(audio.started);
    return () => clearTimeout(t);
  }, [bcast, gone]);

  useEffect(() => {
    return () => audio.stop();
  }, []);

  if (!bcast || gone) return null;

  const dismiss = () => {
    if (!isPreview) localStorage.setItem(SEEN_PREFIX + bcast.id, "1");
    audio.stop();
    setGone(true);
  };

  const toggleSound = () => {
    if (audio.started) {
      audio.stop();
      setSndOn(false);
    } else {
      audio.start();
      setSndOn(true);
    }
  };

  const renderBlock = (b: Block, i: number) => {
    switch (b.t) {
      case "salam":
        return (
          <p key={i} className="text-center font-extrabold text-lg sm:text-2xl leading-snug">
            {b.text}
          </p>
        );
      case "tipsHeader":
        return (
          <p key={i} className="font-bold text-emerald-300 text-base sm:text-lg flex items-center gap-2 pt-1">
            <Moon className="w-4 h-4 shrink-0" /> {b.text}
          </p>
        );
      case "closing":
        return (
          <p key={i} className="text-center font-extrabold text-emerald-200 text-base sm:text-lg whitespace-pre-wrap">
            {b.text}
          </p>
        );
      default:
        return (
          <p key={i} className="leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {b.text}
          </p>
        );
    }
  };

  const body: React.ReactNode[] = [];
  (() => {
    let ul: { t: "li"; text: string }[] | null = null;
    bcast.content.forEach((block, i) => {
      if (block.t === "li") {
        if (!ul) ul = [];
        ul.push(block);
        return;
      }
      if (ul) {
        body.push(
          <ul key={`ul-${i}`} className="list-disc pr-5 space-y-1.5 text-foreground/95">
            {ul.map((li, j) => (
              <li key={j}>{li.text}</li>
            ))}
          </ul>
        );
        ul = null;
      }
      body.push(renderBlock(block, i));
    });
    if (ul) {
      body.push(
        <ul key="ul-end" className="list-disc pr-5 space-y-1.5 text-foreground/95">
          {ul.map((li, j) => (
            <li key={j}>{li.text}</li>
          ))}
        </ul>
      );
    }
  })();

  return (
    <div className="night-overlay" onClick={() => audio.start()}>
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
              <div className="night-pillow" aria-hidden />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-[0_0_60px_rgba(56,102,255,0.18)] p-5 sm:p-7 space-y-4 text-sm sm:text-[15px]">
            <div className="text-center space-y-1">
              <p className="font-extrabold text-xl sm:text-2xl text-white">{bcast.title}</p>
              <p className="text-[11px] text-sky-300/80 flex items-center justify-center gap-1">
                <Volume2 className="w-3.5 h-3.5" /> صوت الليل معك…
              </p>
            </div>

            <div className="space-y-3">{body}</div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={dismiss}
                className="w-full rounded-xl py-3 font-bold text-white bg-gradient-to-l from-indigo-500 to-teal-500 hover:opacity-90 transition-opacity shadow-lg"
              >
                تصبحون على خير 🌙
              </button>
              <button
                onClick={toggleSound}
                className="w-full rounded-xl py-2 text-xs font-semibold border border-white/15 text-sky-200 hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
              >
                {sndOn ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                {sndOn ? "كتم صوت الليل" : "تشغيل صوت الليل"}
              </button>
              {isPreview && (
                <p className="text-center text-[10px] text-amber-300/80">وضع المعاينة — لا يظهر لغيرك</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}