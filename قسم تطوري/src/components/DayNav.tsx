import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, fromKey, relativeLabel, toKey, todayKey } from "@/lib/weeks";

export default function DayNav({ day, setDay }: { day: string; setDay: (d: string) => void }) {
  const rel = relativeLabel(day);
  return (
    <div className="flex items-center justify-center gap-2">
      <button
        disabled={day === todayKey()}
        onClick={() => setDay(toKey(addDays(fromKey(day), 1)))}
        className="chip"
      >
        <ChevronRight size={14} />
      </button>
      <div className="min-w-[130px] text-center">
        <div className="text-sm font-black">
          {rel ||
            fromKey(day).toLocaleDateString("ar-EG", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
        </div>
        <div className="text-[10px] font-bold text-ink-soft">{day}</div>
      </div>
      <button onClick={() => setDay(toKey(addDays(fromKey(day), -1)))} className="chip">
        <ChevronLeft size={14} />
      </button>
    </div>
  );
}