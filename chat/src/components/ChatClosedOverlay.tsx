const BG_URL = import.meta.env.BASE_URL + "chat-closed-bg.png";

export default function ChatClosedOverlay() {
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

        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-center text-[11px] text-white/30">
          مدارك جو
        </div>
      </div>
    </div>
  );
}
