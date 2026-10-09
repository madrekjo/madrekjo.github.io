import { BarChart3, Check } from "lucide-react";
import type { PollData } from "@/lib/polls";

interface PollViewProps {
  poll: PollData;
  onVote: (optionId: string) => void;
}

/** عرض رسالة التصويت داخل منشور الدردشة: خيارات + نسب + صوت المستخدم. */
const PollView = ({ poll, onVote }: PollViewProps) => {
  const total = poll.total;

  return (
    <div className="mb-3 rounded-xl border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-primary">
        <BarChart3 className="w-3.5 h-3.5" />
        تصويت {poll.closed && <span className="text-muted-foreground font-normal">— مغلق</span>}
      </div>

      <div className="space-y-2">
        {poll.options.map((opt) => {
          const pct = total > 0 ? Math.round((opt.count / total) * 100) : 0;
          const mine = poll.myOptionId === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={poll.closed}
              onClick={() => !poll.closed && onVote(opt.id)}
              className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-right text-sm transition-colors ${
                mine ? "border-primary" : "border-border"
              } ${poll.closed ? "cursor-default opacity-90" : "hover:border-primary/60"}`}
            >
              <span
                className="absolute inset-y-0 right-0 bg-primary/15 transition-all"
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  {mine && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  <span className="break-words">{opt.text}</span>
                </span>
                <span className="tabular-nums text-xs text-muted-foreground shrink-0">
                  {pct}%
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {total} صوت
        {poll.closed
          ? " • أُغلق التصويت"
          : poll.myOptionId
            ? " • اضغط خياراً آخر لتغيير صوتك"
            : " • اضغط للتصويت"}
      </p>
    </div>
  );
};

export default PollView;
