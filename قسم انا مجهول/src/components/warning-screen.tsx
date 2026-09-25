import { useCallback, useEffect, useRef, useState } from "react";
import { Siren, Volume2 } from "lucide-react";
import { ackWarning } from "@/lib/visitor.functions";
import { clearShownWarning } from "@/hooks/use-visitor-gate";
import { Button } from "@/components/ui/button";

type Warning = { message: string; at: string | null };

function beeps(ctx: AudioContext) {
  const now = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const t0 = now + i * 0.55;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(920, t0);
    osc.frequency.setValueAtTime(620, t0 + 0.16);
    osc.frequency.setValueAtTime(920, t0 + 0.32);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.9, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.55);
  }
}

export function WarningScreen({ warning }: { warning: Warning }) {
  const [hidden, setHidden] = useState(false);
  const fired = useRef(false);

  const sound = useCallback(() => {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      if (ctx.state === "suspended") {
        const onGesture = () => {
          window.removeEventListener("pointerdown", onGesture);
          window.removeEventListener("keydown", onGesture);
          void ctx.resume().then(() => beeps(ctx));
        };
        window.addEventListener("pointerdown", onGesture);
        window.addEventListener("keydown", onGesture);
        return;
      }
      beeps(ctx);
    } catch {
      /* المتصفحات قد تمنع الصوت — الإنذار المرئي يكفي */
    }
  }, []);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    sound();
  }, [sound]);

  useEffect(() => {
    const onWake = () => {
      if (!document.hidden) sound();
    };
    document.addEventListener("visibilitychange", onWake);
    return () => document.removeEventListener("visibilitychange", onWake);
  }, [sound]);

  async function dismiss() {
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
          onClick={sound}
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
