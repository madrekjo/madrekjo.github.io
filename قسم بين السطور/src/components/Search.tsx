import { useMemo, useState } from "react";
import { Search as SearchIcon, User as UserIcon, X } from "lucide-react";
import type { Line } from "@/lib/api";
import Avatar from "./Avatar";

interface Person {
  name: string;
  user_id: string | null;
  card_count: number;
  last_at: string;
}

function buildPeople(lines: Line[]): Person[] {
  const map = new Map<string, Person>();
  for (const l of lines) {
    const key = l.user_id ?? `anon:${l.submitter}`;
    const prev = map.get(key);
    const name = l.submitter;
    if (prev) {
      prev.card_count += 1;
      if (l.created_at > prev.last_at) prev.last_at = l.created_at;
    } else {
      map.set(key, {
        name,
        user_id: l.user_id,
        card_count: 1,
        last_at: l.created_at,
      });
    }
  }
  return [...map.values()].sort(
    (a, b) => (b.card_count - a.card_count) || (b.last_at.localeCompare(a.last_at))
  );
}

export default function Search({
  lines,
  onOpenUser,
  onClose,
}: {
  lines: Line[];
  onOpenUser: (id: string) => void;
  onClose: () => void;
}) {
  const people = useMemo(() => buildPeople(lines), [lines]);
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((p) => p.name.toLowerCase().includes(needle));
  }, [people, q]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-night">
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <button
          onClick={onClose}
          aria-label="إغلاق البحث"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <X size={20} />
        </button>
        <div className="flex flex-1 items-center gap-2 rounded-2xl bg-white/10 px-3.5 py-2.5 text-white">
          <SearchIcon size={18} className="shrink-0 opacity-70" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث عن اسم مستخدم..."
            className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-white/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <p className="mb-3 text-xs font-bold text-white/60">
          {results.length} {results.length === 1 ? "مستخدم" : "مستخدمين"}
        </p>
        {results.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center text-white/70">
            <UserIcon size={44} className="mb-3 opacity-60" />
            <p className="text-sm font-medium">
              ما في مستخدم بهذا الاسم بعد
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {results.map((p, i) =>
              p.user_id ? (
                <button
                  key={p.user_id}
                  onClick={() => onOpenUser(p.user_id!)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/10 p-3 text-right text-white transition hover:bg-white/20"
                >
                  <Avatar
                    name={p.name}
                    className="size-11 shrink-0 text-xs"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {p.name}
                    </span>
                    <span className="block text-xs text-white/60">
                      {p.card_count} {p.card_count === 1 ? "بطاقة" : "بطاقات"}
                    </span>
                  </span>
                  <span className="text-[11px] font-bold text-gold">
                    افتح البروفايل ←
                  </span>
                </button>
              ) : (
                <div
                  key={`${i}-${p.name}`}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/5 p-3 text-right text-white/70"
                >
                  <Avatar name={p.name} className="size-11 shrink-0 text-xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {p.name}
                    </span>
                    <span className="block text-xs text-white/50">
                      {p.card_count} {p.card_count === 1 ? "بطاقة" : "بطاقات"} · زائر بلا حساب
                    </span>
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}