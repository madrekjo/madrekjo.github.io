import { Home, ListChecks, Trophy, BarChart3, Users } from "lucide-react";

export type NavTab = "home" | "habits" | "achievements" | "progress" | "board";

const TABS: { key: NavTab; label: string; icon: typeof Home }[] = [
  { key: "home", label: "الرئيسية", icon: Home },
  { key: "habits", label: "العادات", icon: ListChecks },
  { key: "achievements", label: "إنجازاتي", icon: Trophy },
  { key: "progress", label: "تقدمي", icon: BarChart3 },
  { key: "board", label: "المتصدرون", icon: Users },
];

export default function BottomNav({
  active,
  onChange,
}: {
  active: NavTab;
  onChange: (t: NavTab) => void;
}) {
  return (
    <nav className="bottom-nav flex items-center justify-between px-2 py-1.5">
      {TABS.map(({ key, label, icon: Icon }) => {
        const on = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={
              "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[10px] font-bold transition-colors " +
              (on ? "text-growth" : "text-ink-soft hover:text-ink")
            }
          >
            {on && (
              <span className="absolute -top-0.5 h-1 w-6 rounded-full bg-gradient-to-l from-growth to-glow" />
            )}
            <Icon size={20} strokeWidth={on ? 2.4 : 2} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}