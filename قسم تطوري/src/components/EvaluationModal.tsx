import { useEffect, useState } from "react";
import { BatteryCharging, Smile, Heart, X } from "lucide-react";
import type { Evaluation } from "@/data";

function Slider({
  label,
  icon,
  color,
  value,
  setValue,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  value: number;
  setValue: (n: number) => void;
}) {
  return (
    <div className="glass-soft px-4 py-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-bold text-ink">
          {icon} {label}
        </span>
        <span
          className="font-display rounded-lg px-2 py-0.5 text-sm font-black"
          style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
        >
          {value}
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="slider-thumb w-full"
        style={{ accentColor: color }}
      />
      <div className="mt-0.5 flex justify-between text-[9px] font-bold text-ink-soft">
        <span>منخفض</span>
        <span>مرتفع</span>
      </div>
    </div>
  );
}

export default function EvaluationModal({
  open,
  existing,
  dayLabel,
  onSave,
  onClose,
}: {
  open: boolean;
  existing: Evaluation | null;
  dayLabel: string;
  onSave: (e: Evaluation) => void;
  onClose: () => void;
}) {
  const [energy, setEnergy] = useState(6);
  const [mood, setMood] = useState(6);
  const [satisfaction, setSatisfaction] = useState(6);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEnergy(existing?.energy ?? 6);
      setMood(existing?.mood ?? 6);
      setSatisfaction(existing?.satisfaction ?? 6);
      setNote(existing?.note ?? "");
      setBusy(false);
    }
  }, [open, existing]);

  if (!open) return null;

  const save = async () => {
    setBusy(true);
    await onSave({ energy, mood, satisfaction, note: note.trim() });
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-5">
      <div className="pop-in w-full sm:max-w-sm">
        <div className="glass px-5 pb-5 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-black">قيّم يومك — {dayLabel}</h3>
              <p className="text-[11px] font-bold text-ink-soft">
                يستغرق دقيقة ويحسّن مؤشرك اليومي
              </p>
            </div>
            <button onClick={onClose} className="rounded-full border border-line p-2 text-ink-soft">
              <X size={15} />
            </button>
          </div>

          <div className="space-y-2.5">
            <Slider label="مستوى الطاقة" icon={<BatteryCharging size={15} className="text-growth" />} color="var(--color-growth)" value={energy} setValue={setEnergy} />
            <Slider label="المزاج" icon={<Smile size={15} className="text-sun" />} color="var(--color-sun)" value={mood} setValue={setMood} />
            <Slider label="الرضا عن اليوم" icon={<Heart size={15} className="text-rose" />} color="var(--color-rose)" value={satisfaction} setValue={setSatisfaction} />
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ملاحظة قصيرة عن يومك..."
            maxLength={500}
            rows={2}
            className="mt-3 w-full resize-none rounded-xl border border-line bg-night-soft px-4 py-3 text-sm font-semibold outline-none transition focus:border-growth/60"
          />

          <button onClick={() => void save()} disabled={busy} className="grad-btn mt-3 w-full rounded-xl py-3 font-display text-sm font-extrabold text-white disabled:opacity-40">
            {busy ? "جارٍ الحفظ..." : "احفظ تقييمي"}
          </button>
        </div>
      </div>
    </div>
  );
}