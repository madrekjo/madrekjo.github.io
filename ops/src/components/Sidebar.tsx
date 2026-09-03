import {
  LayoutDashboard,
  MessageSquare,
  Ghost,
  Trophy,
  FileQuestion,
  Mic,
  BookOpen,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SectionId =
  | "dashboard"
  | "chat"
  | "anon"
  | "achievement"
  | "questions"
  | "talaawat"
  | "ajr"
  | "system";

interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV: NavItem[] = [
  { id: "dashboard", label: "لوحة القيادة", icon: LayoutDashboard },
  { id: "chat", label: "الشات", icon: MessageSquare },
  { id: "anon", label: "أنا مجهول", icon: Ghost },
  { id: "achievement", label: "الإنجازات", icon: Trophy },
];

const FUTURE: NavItem[] = [
  { id: "questions", label: "بنك الأسئلة", icon: FileQuestion },
  { id: "talaawat", label: "التلاوات", icon: Mic },
  { id: "ajr", label: "الأجر والثواب", icon: BookOpen },
];

interface Props {
  active: SectionId;
  onNavigate: (id: SectionId) => void;
}

export function Sidebar({ active, onNavigate }: Props) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-e border-ops-border bg-ops-panel/50">
      <div className="border-b border-ops-border px-4 py-3">
        <p className="font-mono text-[10px] uppercase text-ops-dim">منظومة</p>
        <p className="text-sm font-bold text-ops-text">مدارك جو</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <p className="mb-2 px-2 font-mono text-[10px] uppercase text-ops-dim">
          التحكم النشط
        </p>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                active === item.id
                  ? "bg-ops-cyan/10 text-ops-cyan border border-ops-cyan/40 shadow-[0_0_12px_rgba(0,212,255,0.15)]"
                  : "text-ops-text border border-transparent hover:bg-ops-card hover:text-ops-cyan"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <p className="mb-2 mt-5 px-2 font-mono text-[10px] uppercase text-ops-dim">
          قريباً
        </p>
        <nav className="space-y-1">
          {FUTURE.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                active === item.id
                  ? "bg-ops-violet/10 text-ops-violet border border-ops-violet/40"
                  : "text-ops-dim border border-transparent hover:bg-ops-card hover:text-ops-violet"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              <span className="ms-auto font-mono text-[9px] text-ops-dim">SOON</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="border-t border-ops-border p-3">
        <div className="flex items-center gap-2 rounded-md border border-ops-border bg-ops-bg px-3 py-2">
          <Settings className="h-4 w-4 text-ops-dim" />
          <div className="font-mono text-[10px] text-ops-dim">
            <p>CLEARANCE: ROOT</p>
            <p className="text-ops-green">SESSION ACTIVE</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
