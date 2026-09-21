import { useState } from "react";
import {
  Plus,
  X,
  Trash2,
  Check,
  Library,
  Star,
} from "lucide-react";
import { HABIT_LIBRARY, HABIT_CATEGORIES, CUSTOM_ICON_CHOICES, type HabitLibraryItem, type MyHabit } from "@/data";
import { iconByName } from "@/lib/icons";
import DayNav from "./DayNav";

export default function HabitsTab({
  habits,
  day,
  setDay,
  onToggle,
  onAdd,
  onDelete,
}: {
  habits: MyHabit[];
  day: string;
  setDay: (d: string) => void;
  onToggle: (id: string) => void;
  onAdd: (key: string, name: string, icon: string, category: string, isCustom: boolean) => Promise<string>;
  onDelete: (id: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [mode, setMode] = useState<"library" | "custom" | null>(null);
  const [manage, setManage] = useState(false);
  const [cName, setCName] = useState("");
  const [cIcon, setCIcon] = useState("Target");
  const [cCat, setCCat] = useState<string>("تطوير ذاتي");
  const [busy, setBusy] = useState(false);

  const addedKeys = new Set(habits.map((h) => h.key));

  const startAddLibrary = () => {
    setMode("library");
    setAddOpen(true);
  };
  const startAddCustom = () => {
    setMode("custom");
    setAddOpen(true);
  };

  const pickLibrary = async (item: HabitLibraryItem) => {
    if (addedKeys.has(item.key)) return;
    setBusy(true);
    await onAdd(item.key, item.name, item.icon, item.category, false);
    setBusy(false);
  };

  const addCustom = async () => {
    if (cName.trim().length < 2) return;
    setBusy(true);
    const rand = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await onAdd(`custom-${rand}`, cName.trim(), cIcon, cCat, true);
    setBusy(false);
    setCName("");
    setAddOpen(false);
    setMode(null);
  };

  const toggleAddPanel = () => {
    setAddOpen((o) => !o);
    setMode(null);
  };

  return (
    <div className="fade-up space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-black">عاداتك</h1>
        <div className="flex gap-2">
          <button onClick={() => setManage((m) => !m)} className={"chip " + (manage ? "on" : "")}>
            <Trash2 size={13} /> إدارة
          </button>
          <button onClick={toggleAddPanel} className="chip" style={{ color: "var(--color-glow)", borderColor: "rgba(var(--glow-rgb),0.4)" }}>
            <Plus size={13} /> إضافة عادة
          </button>
        </div>
      </div>

      <DayNav day={day} setDay={setDay} />

      {habits.length === 0 ? (
        <button onClick={startAddLibrary} className="glass-soft mx-auto block w-full rounded-xl px-4 py-6 text-center text-xs font-bold text-ink-soft">
          ما عندك عادات بعد... ابدأ بمجموعة بسيطة: 3 عادات تكفي لبناء الانضباط
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {habits.map((h) => {
            const Icon = iconByName(h.icon) ?? Star;
            return (
              <div
                key={h.id}
                onClick={() => void onToggle(h.id)}
                className={
                  "glass-soft pop-in relative flex cursor-pointer flex-col items-center gap-1.5 px-2 py-3.5 transition " +
                  (h.done ? "halo" : "")
                }
                style={h.done ? { borderColor: "rgba(var(--growth-rgb),0.4)" } : undefined}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: h.done ? "rgba(var(--growth-rgb),0.16)" : "rgba(var(--line-rgb),0.6)", color: h.done ? "var(--color-growth)" : "var(--color-ink-soft)" }}>
                  <Icon size={20} />
                </span>
                <span className={"text-center text-[11px] font-bold leading-4 " + (h.done ? "text-growth" : "text-ink")}>
                  {h.name}
                </span>
                {manage && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void onDelete(h.id);
                    }}
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full border border-line bg-card p-1 text-rose shadow"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addOpen && (
        <div className="glass-soft pop-in p-3">
          {mode === null ? (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={startAddLibrary} className="glass flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-sm font-extrabold">
                <Library size={16} className="text-growth" /> من مكتبة جاهزة
              </button>
              <button onClick={startAddCustom} className="glass flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-sm font-extrabold">
                <Star size={16} className="text-vib" /> عادة خاصة بي
              </button>
            </div>
          ) : mode === "library" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-ink-soft">مكتبة العادات</span>
                <button onClick={() => setMode(null)} className="text-ink-soft"><X size={15} /></button>
              </div>
              {HABIT_CATEGORIES.map((cat) => {
                const items = HABIT_LIBRARY.filter((h) => h.category === cat);
                return (
                  <div key={cat}>
                    <div className="mb-1.5 text-[10px] font-extrabold text-ink-soft">{cat}</div>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {items.map((item) => {
                        const Icon = iconByName(item.icon);
                        const added = addedKeys.has(item.key);
                        return (
                          <button
                            key={item.key}
                            onClick={() => void pickLibrary(item)}
                            disabled={busy || added}
                            className={
                              "glass-soft flex items-center gap-2 rounded-xl px-2.5 py-2 text-start transition " +
                              (added ? "opacity-50" : "hover:border-growth/40")
                            }
                            style={added ? { borderColor: "rgba(var(--growth-rgb),0.45)" } : undefined}
                          >
                            {Icon && <Icon size={15} className="shrink-0 text-growth" />}
                            <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{item.name}</span>
                            {added && <Check size={12} className="shrink-0 text-growth" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-ink-soft">عادة خاصة بي</span>
                <button onClick={() => setMode(null)} className="text-ink-soft"><X size={15} /></button>
              </div>
              <input
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="اسم العادة (مثال: حفظ 10 كلمات إنجليزية)"
                maxLength={40}
                className="w-full rounded-lg border border-line bg-night-soft px-3 py-2 text-sm font-bold outline-none focus:border-glow/50"
              />
              <div>
                <div className="mb-1.5 text-[10px] font-extrabold text-ink-soft">أيقونة</div>
                <div className="card-scrub flex gap-1.5 overflow-x-auto pb-1">
                  {CUSTOM_ICON_CHOICES.map((ic) => {
                    const Icon = iconByName(ic);
                    return (
                      <button
                        key={ic}
                        onClick={() => setCIcon(ic)}
                        className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border " + (cIcon === ic ? "border-growth/60 text-growth" : "border-line text-ink-soft")}
                      >
                        {Icon && <Icon size={17} />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[10px] font-extrabold text-ink-soft">الفئة</div>
                <div className="flex flex-wrap gap-1.5">
                  {HABIT_CATEGORIES.map((c) => (
                    <button key={c} onClick={() => setCCat(c)} className={"chip " + (cCat === c ? "on" : "")}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => void addCustom()}
                disabled={busy || cName.trim().length < 2}
                className="grad-btn w-full rounded-xl py-2.5 font-display text-sm font-extrabold text-white disabled:opacity-40"
              >
                {busy ? "جارٍ الإضافة..." : "أضف العادة"}
              </button>
            </div>
          )}
        </div>
      )}

      <p className="text-center text-[11px] font-bold text-ink-soft">
        بإمكانك متابعة حتى 24 عادة — {habits.length} حالياً
      </p>
    </div>
  );
}