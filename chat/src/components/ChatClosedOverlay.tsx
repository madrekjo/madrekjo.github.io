import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

const BG_URL = import.meta.env.BASE_URL + "chat-closed-bg.png";
const AUDIO_URL = import.meta.env.BASE_URL + "audio/chat-closed.mp3";

function isChatPath() {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname || "";
  const href = window.location.href || "";
  return path.startsWith("/chat") || href.includes("/chat/") || path === "/chat" || href.includes("madrekjo") && href.includes("/chat");
}

export default function ChatClosedOverlay() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [inChat, setInChat] = useState(false);

  const tryPlay = async () => {
    if (!inChat) return;
    const el = audioRef.current;
    if (!el) return;
    try {
      el.volume = 0.7;
      await el.play();
      setPlaying(true);
      setStarted(true);
      setShowHint(false);
    } catch {
      setPlaying(false);
    }
  };

  const toggleSound = () => {
    if (!inChat) return;
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      tryPlay();
    }
  };

  useEffect(() => {
    const allowed = isChatPath();
    setInChat(allowed);
    if (!allowed) return;

    const el = new Audio(AUDIO_URL);
    el.loop = true;
    el.preload = "none";
    el.volume = 0.7;
    audioRef.current = el;
    void tryPlay();

    const unlock = () => {
      if (!started && allowed) void tryPlay();
    };
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

    const hintTimer = setTimeout(() => setShowHint(false), 6000);

    return () => {
      clearTimeout(hintTimer);
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("keydown", unlock);
      el.pause();
      el.src = "";
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!inChat) return null;

  return (
    <div className="relative min-h-[calc(100dvh-56px)] w-full overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center scale-[1.02]"
        style={{ backgroundImage: `url(${BG_URL})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.9)_100%)]" />

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[40%] bg-gradient-to-b from-cyan-400/10 to-transparent blur-3xl" />
        <div className="absolute bottom-0 left-0 right-0 h-[30%] bg-gradient-to-t from-black to-transparent" />
      </div>

      <div className="relative z-10 flex min-h-[calc(100dvh-56px)] flex-col items-center justify-center px-4 text-center">
        <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-1000">
          <div className="relative">
            <div className="absolute -inset-4 rounded-full bg-cyan-400/20 blur-2xl" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-cyan-300/40 bg-black/40 backdrop-blur-xl">
              <div className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_40px_10px_rgba(34,211,238,0.25)]" />
            </div>
          </div>
        </div>

        <div className="max-w-2xl space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-150">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
            <span className="bg-gradient-to-b from-white via-white to-white/60 bg-clip-text text-transparent">
              الدردشة مغلقة للأبد
            </span>
          </h1>
          <p className="mx-auto max-w-xl text-base leading-relaxed text-white/70 sm:text-lg md:text-xl">
            انتهى عهد الدردشة العامة.. بقيت الذكريات، وبقي الأثر
          </p>
        </div>

        <div className="mt-12 flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
          <button
            onClick={toggleSound}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-white/20 bg-black/40 px-6 py-2.5 text-sm text-white/80 backdrop-blur-xl transition-all hover:border-cyan-300/60 hover:text-white"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-400/10 to-cyan-400/0 opacity-0 transition-opacity group-hover:opacity-100" />
            {playing ? <VolumeX className="relative h-4 w-4" /> : <Volume2 className="relative h-4 w-4" />}
            <span className="relative">{playing ? "إيقاف الموسيقى" : "تشغيل الموسيقى"}</span>
          </button>
          {showHint && !playing && (
            <p className="text-xs text-white/40 animate-pulse">اضغط في أي مكان لتشغيل الموسيقى</p>
          )}
        </div>

        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-center text-[11px] text-white/30">
          مدارك جو
        </div>
      </div>

      <audio ref={audioRef} src={AUDIO_URL} loop preload="auto" playsInline />
    </div>
  );
}
