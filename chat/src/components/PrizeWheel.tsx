import { useEffect, useRef, useState } from "react";
import { Gift, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { usePoints } from "@/contexts/PointsContext";
import { getWheelStatus, spinWheel, WHEEL_PRIZES } from "@/lib/wheel";
import { MAX_BALANCE } from "@/lib/roundSchedule";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SEGMENT_COLORS = [
  "#f43f5e",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#06b6d4",
  "#6366f1",
  "#a855f7",
  "#fb7185",
  "#f59e0b",
];

const SEGMENT_COUNT = WHEEL_PRIZES.length;
const SEGMENT_ANGLE = 360 / SEGMENT_COUNT;

const arNum = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

/** تصميم عجلة عبر conic-gradient — المقاطع تبدأ من الأعلى وتسير مع عقارب الساعة. */
function buildConic(): string {
  const stops = SEGMENT_COLORS.map((color, i) => {
    const from = i * SEGMENT_ANGLE;
    const to = (i + 1) * SEGMENT_ANGLE;
    if (i === 0) return `${color} 0deg ${to}deg`;
    return `${color} ${from}deg ${to}deg`;
  });
  return `conic-gradient(from 0deg, ${stops.join(", ")})`;
}

/** مصابيح العجلة: حلقة أضواء تسير حولها ببطء، وتسرّع أثناء الدوران. */
const BULB_COUNT = 28;
const Bulbs = ({ spinning }: { spinning: boolean }) => (
  <div className="pointer-events-none absolute -inset-3" aria-hidden="true">
    {Array.from({ length: BULB_COUNT }).map((_, i) => (
      <span
        key={i}
        className="absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-full"
        style={{
          transform: `rotate(${(360 / BULB_COUNT) * i}deg) translateY(-134px)`,
          background: "#fff7ae",
          boxShadow: "0 0 10px 3px rgba(253,224,71,.9)",
          animation: `bulb-chase ${spinning ? 0.45 : 1.4}s linear infinite`,
          animationDelay: `${((BULB_COUNT - i) / BULB_COUNT) * (spinning ? 0.45 : 1.4)}s`,
          opacity: spinning ? 1 : 0.85,
        }}
      />
    ))}
  </div>
);

const Pointer = () => (
  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[8px] z-20">
    <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[18px] border-l-transparent border-r-transparent border-t-yellow-300 drop-shadow" />
  </div>
);

const PrizeWheel = () => {
  const { user } = useAuth();
  const { balance, refreshPoints } = usePoints();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [everVisible, setEverVisible] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<{ prize: number; newBalance: number; credited: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const spun = useRef(false);

  // الاستعلام مرة واحدة عند التحميل: إن كان المستخدم جرّب سابقاً → لا تظهر إطلاقاً.
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const status = await getWheelStatus();
      if (!active) return;
      setChecking(false);
      if (status && !status.spun) {
        setEverVisible(true);
        setOpen(true);
      }
    })();
    return () => { active = false; };
  }, [user]);

  // إغلاق خارجي (Esc/خلفية) ممكن فقط بعدما أنهى الدوران بنجاح وبعد التأشير.
  const canClose = spun.current || error !== null;

  const handleSpin = async () => {
    if (spinning || spun.current) return;
    setSpinning(true);
    setError(null);
    setResult(null);
    setRevealed(false);

    const res = await spinWheel();
    if (!res.success) {
      setSpinning(false);
      if (res.alreadySpun) {
        setError("استخدمت العجلة مسبقاً");
        spun.current = true;
      } else {
        setError(res.errorMessage ?? "تعذر السحب الآن");
      }
      return;
    }

    // توجيه العجلة ليقف مقبضها على جائزة الخادم (آمن ضد الغش).
    const prizeIndex = WHEEL_PRIZES.indexOf(res.prizePoints as (typeof WHEEL_PRIZES)[number]);
    const center = (prizeIndex >= 0 ? prizeIndex : 0) * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
    const jitter = (Math.random() - 0.5) * SEGMENT_ANGLE * 0.6;
    const target = center + jitter;
    const spins = 5 + Math.floor(Math.random() * 3); // 5-7 لفات كاملة
    setRotation((prev) => prev + spins * 360 + (360 - target));

    window.setTimeout(() => {
      setResult({ prize: res.prizePoints, newBalance: res.newBalance, credited: res.newBalance - balance });
      setRevealed(true);
      setSpinning(false);
      spun.current = true;
      void refreshPoints();
      window.setTimeout(() => setEverVisible(false), 0);
    }, 4400);
  };

  if (!user || !everVisible) return null;
  if (checking) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && canClose) setOpen(false);
      }}
    >
      <DialogContent className="max-w-sm text-center overflow-y-auto max-h-[92vh]">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-1 flex items-center gap-2">
            <Gift className="h-6 w-6 text-yellow-500" />
            <DialogTitle className="text-xl font-bold">عجلة الجوائز</DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed">
            لف العجلة مرة واحدة واربح نقاطاً تدخل إلى رصيدك فوراً!
          </DialogDescription>
        </DialogHeader>

        <div className="relative mx-auto w-[260px] h-[260px] select-none">
          <Bulbs spinning={spinning} />
          <Pointer />
          <div
            className="relative w-full h-full rounded-full border-4 border-yellow-300 shadow-[0_0_30px_rgba(250,204,21,0.55),0_0_70px_rgba(249,115,22,0.35)]"
            style={{
              background: buildConic(),
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? "transform 4.4s cubic-bezier(.12,.75,.2,1)" : "none",
            }}
          >
            {WHEEL_PRIZES.map((prize, i) => {
              const angDeg = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
              const rad = (angDeg * Math.PI) / 180;
              const r = 108;
              const cx = 130;
              const cy = 130;
              return (
                <span
                  key={prize}
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-white font-bold text-lg drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                  style={{ left: cx + r * Math.sin(rad), top: cy - r * Math.cos(rad) }}
                >
                  {arNum(prize)}
                </span>
              );
            })}
          </div>
          {/* المركز */}
          <div className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-gradient-to-b from-yellow-300 to-amber-500 flex items-center justify-center text-amber-950 font-black text-sm z-10 border-2 border-white/70 shadow-inner">
            {spinning ? "…" : "النقاط"}
          </div>
        </div>

        {/* النتيجة */}
        {revealed && result ? (
          <div className="mt-4 rounded-xl bg-gradient-to-br from-yellow-100 to-amber-100 border border-yellow-300 p-3">
            <p className="text-amber-950 font-bold text-lg">
              مبروك! ربحت <span className="text-xl">{arNum(result.prize)}</span> نقطة
            </p>
            <p className="text-amber-900 text-sm mt-1">رصيدك الحالي: {arNum(result.newBalance)}</p>
            {result.credited < result.prize && (
              <p className="text-amber-800 text-xs mt-1">
               وصلتَ للسقف ({arNum(MAX_BALANCE)})، فأُضيف لرصيدك {arNum(result.credited)} فعلياً.
              </p>
            )}
            <Button className="mt-3 w-full" onClick={() => setOpen(false)}>
              ممتاز
            </Button>
          </div>
        ) : null}

        {!result && !error && (
          <Button
            className="mt-4 w-full"
            disabled={spinning}
            onClick={handleSpin}
          >
            {spinning ? "جارٍ الدوران…" : "دور العجلة 🎡"}
          </Button>
        )}

        {error ? (
          <div className="mt-4 rounded-xl bg-muted p-3 text-sm">
            {error} — رصيدك الحالي: {arNum(balance)}
            <Button className="mt-2 w-full" variant="outline" onClick={() => setOpen(false)}>
              حسناً
            </Button>
          </div>
        ) : null}

        {!result && !error && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            هدية مرة واحدة فقط لكل مستخدم
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PrizeWheel;