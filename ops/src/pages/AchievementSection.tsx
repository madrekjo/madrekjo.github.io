import { useEffect, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Search, Trash2, Trophy, Timer, Users } from "lucide-react";
import { achievementClient } from "@/lib/supabase-clients";
import { opsCall } from "@/lib/ops-client";
import { StatusBadge, LoadingScanner, EmptyState } from "@/components/ui";
import { formatDate, timeAgo, initials, cn } from "@/lib/utils";

interface Props {
  token: string | null;
}

export function AchievementSection({ token }: Props) {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [u, r, t] = await Promise.all([
      achievementClient.from("profiles").select("*").order("created_at", { ascending: false }).limit(200),
      achievementClient.from("rounds").select("*").order("created_at", { ascending: false }).limit(100),
      achievementClient.from("tasks").select("*").order("created_at", { ascending: false }).limit(150),
    ]);
    setUsers(u.data ?? []);
    setRounds(r.data ?? []);
    setTasks(t.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function runAction(action: string, params: Record<string, unknown>, id: string) {
    if (!token) {
      setError("وضع القراءة فقط — انشر خادم الإدارة (madarik-ops worker) لتفعيل الإجراءات الإدارية.");
      return;
    }
    setBusy(id);
    setError("");
    try {
      await opsCall({ target: "achievement", action, params }, token);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const filteredUsers = useMemo(
    () => users.filter((u) => (u.display_name ?? "").toLowerCase().includes(search.toLowerCase())),
    [users, search]
  );

  const activeRounds = rounds.filter((r) => r.status === "active").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ops-text">قسم الإنجازات</h1>
        <p className="text-sm text-ops-dim">إدارة المستخدمين والجولات والمهام</p>
      </div>

      {error && (
        <div className="rounded-md border border-ops-red/40 bg-ops-red/10 px-3 py-2 text-sm text-ops-red">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="ops-card p-3 text-center">
          <Users className="mx-auto mb-1 h-4 w-4 text-ops-cyan" />
          <div className="font-mono text-2xl font-bold text-ops-cyan">{users.length}</div>
          <div className="text-[11px] text-ops-dim">مستخدم</div>
        </div>
        <div className="ops-card p-3 text-center">
          <Trophy className="mx-auto mb-1 h-4 w-4 text-ops-green" />
          <div className="font-mono text-2xl font-bold text-ops-green">{activeRounds}</div>
          <div className="text-[11px] text-ops-dim">جولة نشطة</div>
        </div>
        <div className="ops-card p-3 text-center">
          <Timer className="mx-auto mb-1 h-4 w-4 text-ops-violet" />
          <div className="font-mono text-2xl font-bold text-ops-violet">{tasks.length}</div>
          <div className="text-[11px] text-ops-dim">مهمة</div>
        </div>
      </div>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex gap-1 border-b border-ops-border">
          {[
            { v: "users", l: "المستخدمين", c: users.length },
            { v: "rounds", l: "الجولات", c: rounds.length },
            { v: "tasks", l: "المهام", c: tasks.length },
          ].map((t) => (
            <Tabs.Trigger
              key={t.v}
              value={t.v}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition-colors",
                tab === t.v ? "border-ops-green text-ops-green" : "border-transparent text-ops-dim hover:text-ops-text"
              )}
            >
              {t.l}
              <span className="rounded-full bg-ops-card px-1.5 py-0.5 font-mono text-[10px] text-ops-dim">{t.c}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* USERS */}
        <Tabs.Content value="users" className="mt-4">
          <div className="mb-3">
            <div className="relative">
              <Search className="absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ops-dim" />
              <input
                className="ops-input pe-9"
                placeholder="ابحث عن مستخدم..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          {loading ? (
            <LoadingScanner text="SCANNING USERS" />
          ) : filteredUsers.length === 0 ? (
            <EmptyState message="لا يوجد مستخدمون" />
          ) : (
            <div className="ops-panel overflow-x-auto">
              <table className="ops-table w-full">
                <thead>
                  <tr className="border-b border-ops-border">
                    <th>المستخدم</th>
                    <th>آخر ظهور</th>
                    <th>التسجيل</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="border-b border-ops-border/50 last:border-0 hover:bg-ops-card/50">
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ops-green/10 text-xs font-bold text-ops-green">
                            {initials(u.display_name ?? "؟")}
                          </span>
                          <p className="text-sm font-semibold text-ops-text">{u.display_name ?? "—"}</p>
                        </div>
                      </td>
                      <td className="text-sm text-ops-dim">{timeAgo(u.updated_at)}</td>
                      <td className="text-sm text-ops-dim">{formatDate(u.created_at)}</td>
                      <td>
                        <button
                          onClick={() => runAction("delete_user", { user_id: u.user_id }, u.id)}
                          disabled={busy === u.id}
                          className="ops-btn-danger px-2 py-1 text-xs"
                        >
                          <Trash2 className="h-3 w-3" /> حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tabs.Content>

        {/* ROUNDS */}
        <Tabs.Content value="rounds" className="mt-4">
          {loading ? (
            <LoadingScanner text="SCANNING ROUNDS" />
          ) : rounds.length === 0 ? (
            <EmptyState message="لا توجد جولات" />
          ) : (
            <div className="ops-panel overflow-x-auto">
              <table className="ops-table w-full">
                <thead>
                  <tr className="border-b border-ops-border">
                    <th>العنوان</th>
                    <th>الوقت</th>
                    <th>العمل</th>
                    <th>الحالة</th>
                    <th>البداية</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {rounds.map((r) => (
                    <tr key={r.id} className="border-b border-ops-border/50 last:border-0 hover:bg-ops-card/50">
                      <td className="max-w-[220px]">
                        <p className="truncate text-sm text-ops-text">{r.title}</p>
                      </td>
                      <td className="text-sm">{r.total_minutes ? `${r.total_minutes} د` : "—"}</td>
                      <td className="text-sm">{r.work_minutes ? `${r.work_minutes} د` : "—"}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="text-sm text-ops-dim">{formatDate(r.starts_at)}</td>
                      <td>
                        {r.status === "active" && (
                          <button
                            onClick={() => runAction("end_round", { round_id: r.id }, r.id)}
                            disabled={busy === r.id}
                            className="ops-btn px-2 py-1 text-xs"
                          >
                            إنهاء
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tabs.Content>

        {/* TASKS */}
        <Tabs.Content value="tasks" className="mt-4">
          {loading ? (
            <LoadingScanner text="SCANNING TASKS" />
          ) : tasks.length === 0 ? (
            <EmptyState message="لا توجد مهام" />
          ) : (
            <div className="ops-panel overflow-x-auto">
              <table className="ops-table w-full">
                <thead>
                  <tr className="border-b border-ops-border">
                    <th>المهمة</th>
                    <th>الوحدة</th>
                    <th>التصنيف</th>
                    <th>المدة</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id} className="border-b border-ops-border/50 last:border-0 hover:bg-ops-card/50">
                      <td className="max-w-[220px]">
                        <p className="truncate text-sm text-ops-text">{t.title}</p>
                      </td>
                      <td className="text-sm text-ops-dim">{t.daily_unit ?? "—"}</td>
                      <td className="text-sm">{t.category}</td>
                      <td className="text-sm">{t.duration ? `${t.duration} د` : "—"}</td>
                      <td>
                        {t.completed ? (
                          <span className="text-xs font-bold text-ops-green">مكتملة</span>
                        ) : (
                          <span className="text-xs font-bold text-ops-amber">جارية</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
