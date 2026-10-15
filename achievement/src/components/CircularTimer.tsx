import { cn } from "@/lib/utils";

type Tone = "primary" | "amber" | "success" | "danger";

interface CircularTimerProps {
  /** نسبة الامتلاء في الحلقة (0 → 1) */
  progress: number;
  /** النص الرئيسي في المنتصف (مثال: 00:39:39) */
  value: string;
  /** تسمية صغيرة تحت الوقت داخل الحلقة (مثال: متبقٍ) */
  label?: string;
  /** سطر توضيحي أسفل الحلقة */
  caption?: string;
  size?: number;
  stroke?: number;
  tone?: Tone;
  /** تخفيت الحلقة (يُستخدم عند الإيقاف المؤقت) */
  muted?: boolean;
  className?: string;
}

const toneStyles: Record<Tone, { ring: string; glow: string; text: string }> = {
  primary: { ring: "stroke-primary", glow: "bg-primary/20", text: "text-primary" },
  amber: { ring: "stroke-amber-500", glow: "bg-amber-500/20", text: "text-amber-600 dark:text-amber-400" },
  success: { ring: "stroke-emerald-500", glow: "bg-emerald-500/20", text: "text-emerald-600 dark:text-emerald-400" },
  danger: { ring: "stroke-destructive", glow: "bg-destructive/20", text: "text-destructive" },
};

/**
 * حلقة عدّاد دائرية (SVG) تُستخدم لعرض المهمة قيد الإنجاز بشكل مرتب:
 * حلقة تتقدم مع الوقت + الوقت في المنتصف.
 */
export const CircularTimer = ({
  progress,
  value,
  label,
  caption,
  size = 184,
  stroke = 11,
  tone = "primary",
  muted = false,
  className,
}: CircularTimerProps) => {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  const styles = toneStyles[tone];

  const fontSize = value.length > 8 ? size * 0.145 : value.length > 5 ? size * 0.175 : size * 0.22;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* توهّج خلفي ناعم */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-3 rounded-full blur-2xl transition-opacity",
            styles.glow,
            muted ? "opacity-30" : "opacity-60",
          )}
        />

        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-muted"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn(styles.ring, "transition-[stroke-dashoffset] duration-700 ease-linear")}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "font-mono font-bold leading-none tabular-nums transition-opacity",
              styles.text,
              muted && "opacity-70",
            )}
            style={{ fontSize }}
          >
            {value}
          </span>
          {label && (
            <span className="mt-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">{label}</span>
          )}
        </div>
      </div>

      {caption && <p className="text-[11px] text-muted-foreground">{caption}</p>}
    </div>
  );
};
