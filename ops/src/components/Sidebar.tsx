import {
  LayoutDashboard,
  MessageSquare,
  GraduationCap,
  Ghost,
  Flag,
  Trophy,
  ListChecks,
  FileQuestion,
  Mic,
  BookOpen,
  Activity,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SectionId =
  | "dashboard"
  | "chat"
  | "rounds"
  | "anon"
  | "reports"
  | "achievement"
  | "tasks"
  | "questions"
  | "talaawat"
  | "ajr"
  | "logs"
  | "system";

interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ElementType;
  future?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: "COMMAND",
    items: [{ id: "dashboard", label: "Overview", icon: LayoutDashboard }],
  },
  {
    title: "OPERATIONS",
    items: [
      { id: "chat", label: "Chat Network", icon: MessageSquare },
      { id: "rounds", label: "Study Rounds", icon: GraduationCap },
    ],
  },
  {
    title: "CONTENT",
    items: [
      { id: "anon", label: "Anonymous System", icon: Ghost },
      { id: "reports", label: "Reports Center", icon: Flag },
    ],
  },
  {
    title: "PROGRESSION",
    items: [
      { id: "achievement", label: "Achievements", icon: Trophy },
      { id: "tasks", label: "Tasks", icon: ListChecks },
    ],
  },
  {
    title: "FUTURE MODULES",
    items: [
      { id: "questions", label: "Question Bank", icon: FileQuestion, future: true },
      { id: "talaawat", label: "Quran Recitations", icon: Mic, future: true },
      { id: "ajr", label: "Rewards System", icon: BookOpen, future: true },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { id: "logs", label: "Audit Logs", icon: Activity, future: true },
      { id: "system", label: "Configuration", icon: Settings, future: true },
    ],
  },
];

const GROUP_CYAN: Record<string, string> = {
  COMMAND: "text-ops-cyan",
  OPERATIONS: "text-ops-cyan",
  CONTENT: "text-ops-violet",
  PROGRESSION: "text-ops-green",
};

interface Props {
  active: SectionId;
  onNavigate: (id: SectionId) => void;
}

function groupAccent(title: string, active: boolean) {
  if (title === "PROGRESSION")
    return active
      ? "bg-ops-green/10 text-ops-green border-ops-green/40"
      : "text-ops-text border-transparent hover:bg-ops-card";
  if (title === "CONTENT")
    return active
      ? "bg-ops-violet/10 text-ops-violet border-ops-violet/40"
      : "text-ops-text border-transparent hover:bg-ops-card";
  return active
    ? "bg-ops-cyan/10 text-ops-cyan border-ops-cyan/40"
    : "text-ops-text border-transparent hover:bg-ops-card";
}

export function Sidebar({ active, onNavigate }: Props) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-e border-ops-border bg-ops-panel/40">
      <div className="border-b border-ops-border px-4 py-3.5">
        <p className="font-mono text-[10px] tracking-[0.2em] text-ops-dim">
          MADARIK.JO
        </p>
        <p className="mt-0.5 text-sm font-bold tracking-widest text-ops-cyan glow-cyan">
          CONTROL CENTER
        </p>
        <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-ops-dim">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ops-green animate-blink" />
          CLEARANCE: ROOT
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            <p
              className={cn(
                "mb-1.5 px-2 font-mono text-[9px] uppercase tracking-[0.2em]",
                group.title === "SYSTEM" || group.title === "FUTURE MODULES"
                  ? "text-ops-dim"
                  : GROUP_CYAN[group.title] ?? "text-ops-dim"
              )}
            >
              {group.title}
            </p>
            <nav className="space-y-0.5">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors",
                    groupAccent(group.title, active === item.id),
                    item.future && active !== item.id && "text-ops-dim"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                  {item.future && (
                    <span className="ms-auto font-mono text-[8px] text-ops-dim">
                      SOON
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        ))}
      </div>

      <div className="border-t border-ops-border p-3">
        <div className="flex items-center gap-2 rounded-md border border-ops-border bg-ops-bg px-3 py-2">
          <Settings className="h-4 w-4 text-ops-dim" />
          <div className="font-mono text-[10px] text-ops-dim">
            <p className="text-ops-text">ROOT OPERATOR</p>
            <p className="text-ops-green">SESSION ACTIVE</p>
          </div>
        </div>
      </div>
    </aside>
  );
}