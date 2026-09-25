import { useCallback, useEffect, useRef, useState } from "react";
import { Siren, Volume2 } from "lucide-react";
import { ackWarning } from "@/lib/visitor.functions";
import { clearShownWarning } from "@/hooks/use-visitor-gate";
import { Button } from "@/components/ui/button";

type Warning = { message: string; at: string | null };

/** نغمة صاعدة/هابطة — جسم الإنذار */
function sweep(ctx: AudioContext, out: AudioNode, start: number, f0: number, f1: number, dur: number, type: OscillatorType, peak: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, start);
  osc.frequency.exponentialRampToValueAtTime(f1, start + dur * 0.92);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.035);
  g.gain.setValueAtTime(peak, start + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

/** دفعة منخفضة عند بداية كل دورة — تعطي ثقل الإنذار */
function thump(ctx: AudioContext, out: AudioNode, start: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(130, start);
  osc.frequency.exponentialRampToValueAtTime(48, start + 0.28);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.9, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
  osc.connect(g).connect(out);
  osc.start(start);
  osc.stop(start + 0.4);
}

/** نداء إنذار كامل: ٨ دورات صعود/هبوط (~٧ ثواني) بصوت عالٍ ومفلتر */
function playAlarm(ctx: AudioContext) {
  if (ctx.state === "suspended") return;
  const master = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 4200;
  filter.Q.value = 0.6;
  master.gain.value = 0.62;
  master.connect(filter).connect(ctx.destination);

  const t0 = ctx.currentTime + 0.03;
  const UP = 0.42;
  const DOWN = 0.42;
  const PERIOD = UP + DOWN;
  const CYCLES = 8;
  const total = CYCLES * PERIOD;

  for (let i = 0; i < CYCLES; i++) {
    const s = t0 + i * PERIOD;
    sweep(ctx, master, s, 470, 1240, UP, "sine", 0.55);
    sweep(ctx, master, s, 470, 1240, UP, "sawtooth", 0.22);
    sweep(ctx, master, s + UP, 1240, 470, DOWN, "sine", 0.55);
    sweep(ctx, master, s + UP, 1240, 470, DOWN, "sawtooth", 0.22);
    thump(ctx, master, s);
  }

  master.gain.setValueAtTime(0.62, t0 + total);
  master.gain.linearRampToValueAtTime(0.0001, t0 + total + 0.18);
}

function buzz() {
  try {
    navigator.vibrate?.([260, 110, 260, 110, 260, 110, 600]);
  } catch {
    /* غير مدعوم */
  }
}

let ctxRef: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!ctxRef || ctxRef.state === "closed") {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef = new Ctor();
    }
    return ctxRef;
  } catch {
    return null;
  }
}

const ALARM_SRC = `${import.meta.env.BASE_URL}warning-alarm.mp3`;

let audioRef: HTMLAudioElement | null = null;
function fileAlarm(): HTMLAudioElement | null {
  try {
    if (!audioRef) {
      const el = new Audio(ALARM_SRC);
      el.preload = "auto";
      el.loop = true;
      el.volume = 1;
      audioRef = el;
    }
    return audioRef;
  } catch {
    return null;
  }
}

function stopAudio() {
  try {
    audioRef?.pause();
  } catch {
    /* ignore */
  }
}

export function WarningScreen({ warning }: { warning: Warning }) {
  const [hidden, setHidden] = useState(false);
  const fired = useRef(false);

  const play = useCallback((withBuzz: boolean) => {
    const el = fileAlarm();
    if (el) {
      el.currentTime = 0;
      const p = el.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          const ctx = getCtx();
          if (ctx) {
            void ctx.resume().then(() => playAlarm(ctx));
          }
        });
      }
    } else {
      const ctx = getCtx();
      if (ctx) {
        void ctx.resume().then(() => playAlarm(ctx));
      }
    }
    if (withBuzz) buzz();
  }, []);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const el = fileAlarm();
    if (el) {
      el.currentTime = 0;
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } else {
      const ctx = getCtx();
      if (ctx) {
        void ctx.resume().then(() => playAlarm(ctx));
      }
    }
    buzz();
    const onGesture = () => {
      const c = el ?? fileAlarm();
      if (c) {
        void c.play().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, []);

  useEffect(() => {
    if (hidden) return;
    return () => stopAudio();
  }, [hidden]);

  async function dismiss() {
    stopAudio();
    setHidden(true);
    clearShownWarning();
    await ackWarning();
  }

  if (hidden) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 overflow-y-auto bg-red-600 px-5 py-10 text-center text-white animate-[warn-flash_1.05s_ease-in-out_infinite]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.22),transparent_62%)]" />
      <Siren className="relative h-20 w-20 animate-pulse drop-shadow-lg sm:h-24 sm:w-24" />
      <h2 className="relative text-2xl font-black sm:text-4xl">تنبيه من الإدارة</h2>
      <p className="relative max-w-2xl text-lg font-bold leading-relaxed whitespace-pre-wrap sm:text-2xl">
        {warning.message}
      </p>
      {warning.at && (
        <div className="relative text-xs opacity-90 sm:text-sm">
          {new Date(warning.at).toLocaleString("ar", { dateStyle: "full", timeStyle: "short" })}
        </div>
      )}
      <div className="relative flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={() => play(true)}
          variant="secondary"
          className="gap-2 bg-white font-bold text-red-700 hover:bg-white/90"
        >
          <Volume2 className="h-4 w-4" /> إعادة تشغيل الصوت
        </Button>
        <Button
          onClick={dismiss}
          className="gap-2 bg-white/10 font-bold text-white ring-2 ring-white hover:bg-white/25"
        >
          قرأت التحذير — إغلاق
        </Button>
      </div>
    </div>
  );
}
