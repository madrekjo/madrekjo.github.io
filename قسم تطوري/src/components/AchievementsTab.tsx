import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { ACHIEVEMENT_CATEGORIES, type Achievement, type AchievementCategory } from "@/data";
import { iconByName } from "@/lib/icons";
import { fromKey, relativeLabel, todayKey } from "@/lib/weeks";
import DayNav from "./DayNav";

function dayLabel(key: string): string {
  const rel = relativeLabel(key);
  if (rel) return rel;
  const d = fromKey(key);
  return d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
}

export default function AchievementsTab({
  achievements,
  day,
  setDay,
  onAdd,
  onDelete,
}: {
  achievements: Achievement[];
  day: string;
  setDay: (d: string) => void;
  onAdd: (category: string, desc: string, day: string) => Promise<string>;
  onDelete: (id: string) => void;
}) {
  const [cat, setCat] = useState<AchievementCategory>("دراسة");
  const [desc, setDesc] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const today = todayKey();

  const grouped = useMemo(() => {
    const map = new Map<string, Achievement[]>();
    for (const a of achievements) {
      if (!map.has(a.day)) map.set(a.day, []);
      map.get(a.day)!.push(a);
    }
    return [...map.entries()].slice(0, 14);
  }, [achievements]);

  const dayItems = (achievements || []).filter((a) => a.day === day);

  const submit = async () => {
    if (desc.trim().length < 3) return;
    setBusy(true);
    await onAdd(cat, desc.trim(), day);
    setBusy(false);
    setDesc("");
  };

  return (
    <div className="fade-up space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-black">إنجازاتك</h1>
        <button
          onClick={() => setFormOpen((o) => !o)}
          className="chip"
          style={{ color: "var(--color-glow)", borderColor: "rgba(var(--glow-rgb),0.4)" }}
        >
          {formOpen ? <X size={13} /> : <Plus size={13} />}
          {formOpen ? "إغلاق" : "سجّل إنجازاً"}
        </button>
      </div>

      <DayNav day={day} setDay={setDay} />

      {formOpen && (
        <div className="glass-soft pop-in space-y-2.5 p-3">
          <div className="card-scrub flex gap-1.5 overflow-x-auto pb-1">
            {ACHIEVEMENT_CATEGORIES.map(({ key, icon, color }) => {
              const Icon = iconByName(icon);
              return (
                <button
                  key={key}
                  onClick={() => setCat(key)}
                  className={
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition " +
                    (cat === key ? "" : "border-line text-ink-soft")
                  }
                  style={
                    cat === key
                      ? { background: `color-mix(in srgb, ${color} 12%, transparent)`, borderColor: color, color }
                      : undefined
                  }
                >
                  {Icon && <Icon size={13} />} {key}
                </button>
              );
            })}
          </div>
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder={`مثال: أنهيت الوحدة الثالثة كيمياء (${dayLabel(day)})`}
            maxLength={160}
            className="w-full rounded-lg border border-line bg-night-soft px-3 py-2.5 text-sm font-bold outline-none focus:border-growth/50"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-ink-soft">خلّي الوصف محدداً: {desc.length}/160</span>
            <button
              onClick={() => void submit()}
              disabled={busy || desc.trim().length < 3}
              className="grad-btn rounded-lg px-4 py-2 text-xs font-extrabold text-white disabled:opacity-40"
            >
              {busy ? "جارٍ الحفظ..." : "أضف ✓"}
            </button>
          </div>
        </div>
      )}

      {dayItems.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-extrabold text-ink-soft">
            {dayLabel(day)} · {dayItems.length} إنجاز
          </div>
          <div className="space-y-1.5">
            {dayItems.map((a) => {
              const m = ACHIEVEMENT_CATEGORIES.find((c) => c.key === a.category);
              const Icon = iconByName(m?.icon ?? "Star");
              const color = m?.color ?? "#93a5b8";
              return (
                <div key={a.id} className="glass-soft pop-in flex items-center gap-2.5 px-3 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
                    {Icon && <Icon size={15} />}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-bold">{a.description}</span>
                  <button onClick={() => void onDelete(a.id)} className="shrink-0 text-ink-soft hover:text-rose">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {dayItems.length === 0 && !formOpen && (
        <button onClick={() => setFormOpen(true)} className="glass-soft mx-auto block w-full rounded-xl px-4 py-6 text-center text-xs font-bold text-ink-soft">
          ما سجّلت شيئاً لهذا اليوم — أنجزت شيئاً؟ سجّله الآن ليُحتسب في مؤشرك
        </button>
      )}

      {grouped.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-extrabold text-ink-soft">أيام سابقة</div>
          <div className="space-y-2">
            {grouped
              .filter(([d]) => d !== day)
              .map(([d, items]) => (
                <button
                  key={d}
                  onClick={() => setDay(d)}
                  className="glass-soft flex w-full items-center justify-between rounded-xl px-3 py-2"
                >
                  <span className="text-xs font-bold text-ink">{dayLabel(d)}</span>
                  <span className="chip">{items.length} إنجاز</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {today === day && (
        <p className="text-center text-[11px] font-bold text-ink-soft">
          التركيز على الإنجاز الفعلي، لا على عدد المهام المكتوبة
        </p>
      )}
    </div>
  );
}