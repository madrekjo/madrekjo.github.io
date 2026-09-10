import { BookOpen, Quote, User } from "lucide-react";

export type NavTab = "me" | "daf" | "reels";

export default function BottomNav({
  active,
  onChange,
}: {
  active: NavTab;
  onChange: (t: NavTab) => void;
}) {
  const tabs: Array<{ id: NavTab; label: string; Icon: typeof User }> = [
    { id: "me", label: "البروفايل", Icon: User },
    { id: "daf", label: "الدفتر", Icon: BookOpen },
    { id: "reels", label: "عبارات", Icon: Quote },
  ];

  return (
    <nav className="bottom-nav">
      <div className="grid grid-cols-3 rounded-2xl border border-line bg-card/95 p-1.5 shadow-[0_12px_30px_-12px_rgba(51,41,29,0.5)] backdrop-blur">
        {tabs.map((t) => {
          const on = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={
                "flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[11px] font-bold transition " +
                (on ? "bg-gold text-white shadow-sm" : "text-ink-soft")
              }
            >
              <t.Icon size={20} className={on ? "" : "opacity-80"} />
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}