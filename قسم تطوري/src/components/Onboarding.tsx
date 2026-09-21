import { useState } from "react";
import { Flame, ListChecks, Rocket, BarChart3, Trophy } from "lucide-react";

export default function Onboarding({
  onDone,
  onSkip,
}: {
  onDone: (username: string) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = name.trim();
    if (n.length < 2) return;
    setBusy(true);
    await onDone(n);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm">
      <div className="pop-in w-full max-w-sm">
        <div className="glass px-6 pb-6 pt-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl grad-btn">
            <Rocket size={30} className="text-white" />
          </div>
          <h2 className="font-display text-2xl font-black">أهلاً بك في <span className="grad-text">تطوري</span></h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            كل طالب يخطط كثيراً، لكن قليلون من يراجعون ما أنجزوه فعلاً.
            هنا تسجّل عاداتك وإنجازاتك يومياً، وتشاهد تقدّمك بالأرقام.
          </p>

          <div className="mt-4 space-y-2 text-right">
            {[
              { icon: <Flame size={15} className="text-sun" />, t: "ستريك يومي يدفعك للاستمرار" },
              { icon: <ListChecks size={15} className="text-growth" />, t: "متابعة عاداتك اليومية بضغطة" },
              { icon: <BarChart3 size={15} className="text-glow" />, t: "مؤشر يومي وأسبوعي بالأرقام" },
              { icon: <Trophy size={15} className="text-vib" />, t: "منافسة صحية بين الطلاب" },
            ].map((x, i) => (
              <div key={i} className="glass-soft flex items-center gap-2 px-3 py-2 text-xs font-bold">
                {x.icon} <span className="text-ink">{x.t}</span>
              </div>
            ))}
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اكتب اسمك أو لقبك"
            maxLength={25}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            className="mt-5 w-full rounded-xl border border-line bg-night-soft px-4 py-3 text-center font-bold outline-none transition focus:border-growth/60"
          />
          <button
            onClick={() => void submit()}
            disabled={busy || name.trim().length < 2}
            className="grad-btn mt-3 w-full rounded-xl py-3 font-display text-sm font-extrabold text-white disabled:opacity-40"
          >
            {busy ? "جارٍ الإنشاء..." : "ابدأ رحلتك"}
          </button>
          <button
            onClick={onSkip}
            className="mt-3 w-full text-xs font-bold text-ink-soft underline-offset-4 hover:underline"
          >
            لاحقاً — أستكشف أولاً
          </button>
        </div>
      </div>
    </div>
  );
}