import { useEffect, useState } from "react";

// Arabic Tawjihi exam: 23 / 7 / 2026
const TARGET = new Date(2026, 6, 23, 8, 0, 0).getTime();

const calc = () => {
  const d = TARGET - Date.now();
  if (d <= 0) return null;
  return {
    days: Math.floor(d / 86400000),
    hours: Math.floor((d / 3600000) % 24),
    mins: Math.floor((d / 60000) % 60),
    secs: Math.floor((d / 1000) % 60),
  };
};

const Box = ({ v, l }: { v: number; l: string }) => (
  <div className="flex flex-col items-center bg-primary/10 border border-primary/30 rounded-lg px-2 py-1 min-w-[44px]">
    <span className="text-base font-bold tabular-nums text-primary leading-none">{String(v).padStart(2, "0")}</span>
    <span className="text-[9px] text-muted-foreground mt-0.5">{l}</span>
  </div>
);

const ExamCountdown = () => {
  const [t, setT] = useState(calc());
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const i = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(i);
  }, []);

  if (!t) return null;

  return (
    <div className="bg-card/90 backdrop-blur border-b">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-primary">⏳ متبقي على وزاري عربي:</span>
          <button
            className="text-[10px] text-muted-foreground underline"
            onClick={() => setOpen(o => !o)}
          >
            {open ? "إخفاء" : "عرض"}
          </button>
        </div>
        {open && (
          <div className="flex items-center gap-1.5">
            <Box v={t.days} l="يوم" />
            <Box v={t.hours} l="ساعة" />
            <Box v={t.mins} l="دقيقة" />
            <Box v={t.secs} l="ثانية" />
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamCountdown;
