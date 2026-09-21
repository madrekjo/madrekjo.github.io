import { Medal, Crown, Users, UserCircle2, Star } from "lucide-react";
import type { LeaderboardEntry } from "@/data";

const METRICS: { key: string; label: string; short: string }[] = [
  { key: "score", label: "أعلى مؤشر أسبوعي", short: "المؤشر" },
  { key: "streak", label: "أطول ستريك", short: "الستريك" },
  { key: "achievements", label: "أكثر إنجازات", short: "الإنجازات" },
  { key: "commitment", label: "أعلى التزام عادات", short: "الالتزام" },
];

function rankIcon(i: number) {
  if (i === 0) return <Crown size={16} className="text-sun" />;
  if (i === 1) return <Medal size={16} className="text-[#c0c7d8]" />;
  if (i === 2) return <Medal size={16} className="text-[#c98a4b]" />;
  return <span className="w-4 text-center text-[11px] font-black text-ink-soft">{i + 1}</span>;
}

function fmtValue(metric: string, v: number): string {
  if (metric === "commitment" || metric === "score") return `${Math.round(v)}%`;
  if (metric === "streak") return `${Math.round(v)} يوم`;
  return String(Math.round(v));
}

export default function Leaderboard({
  metric,
  setMetric,
  entries,
  meId,
  loading,
  weekLabel,
}: {
  metric: string;
  setMetric: (m: string) => void;
  entries: LeaderboardEntry[];
  meId: string | null;
  loading: boolean;
  weekLabel: string;
}) {
  const myRank = entries.findIndex((e) => e.user_id === meId);

  return (
    <div className="fade-up space-y-4">
      <div>
        <h1 className="font-display text-xl font-black">منافسة صحية</h1>
        <p className="text-[11px] font-bold text-ink-soft">هذا الأسبوع: {weekLabel}</p>
      </div>

      <div className="card-scrub flex gap-1.5 overflow-x-auto pb-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={"chip shrink-0 py-2 " + (metric === m.key ? "on" : "")}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="glass-soft flex items-center justify-center gap-2 rounded-xl px-4 py-10 text-sm font-bold text-ink-soft">
          <Users size={16} /> جارٍ الترتيب...
        </div>
      ) : entries.length === 0 ? (
        <div className="glass-soft rounded-xl px-4 py-10 text-center text-sm font-bold text-ink-soft">
          لا يوجد طلاب نشطون في هذه الفئة بعد — كن الأول!
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-2xl p-2">
          {entries.slice(0, 10).map((e, i) => {
            const isMe = e.user_id === meId;
            return (
              <div
                key={e.user_id}
                className={
                  "flex items-center gap-2.5 rounded-xl px-3 py-2.5 " +
                  (isMe ? "glass-soft" : "border-b border-line/50 last:border-0")
                }
                style={isMe ? { border: "1px solid rgba(var(--growth-rgb),0.4)", background: "rgba(var(--growth-rgb),0.08)" } : undefined}
              >
                {rankIcon(i)}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-growth/30 to-vib/30 text-[10px] font-black">
                  {isMe ? <UserCircle2 size={17} className="text-growth" /> : e.username.slice(0, 1)}
                </span>
                <span className={"min-w-0 flex-1 truncate text-sm font-bold " + (isMe ? "text-growth" : "text-ink")}>
                  {e.username}
                  {isMe && <span className="ms-1.5 rounded-full bg-growth/15 px-1.5 py-0.5 text-[9px] font-black text-growth">أنت</span>}
                </span>
                <span className="font-display text-base font-black">{fmtValue(metric, e.value)}</span>
              </div>
            );
          })}

          {myRank >= 10 && (
            <div className="mt-1 rounded-xl border border-dashed border-line px-3 py-2.5 text-center text-xs font-bold text-ink-soft">
              ...<br />
              <Star size={12} className="ms-auto me-auto mt-1 text-sun" /> مركزك الحالي: {myRank + 1} — تسلّق القائمة!
            </div>
          )}
        </div>
      )}

      <p className="text-center text-[11px] font-bold leading-5 text-ink-soft">
        المنافسة للتحفيز الصحي فقط — ابدأ بأفعال صغيرة اليوم، وسترى اسمك يصعد
      </p>
    </div>
  );
}