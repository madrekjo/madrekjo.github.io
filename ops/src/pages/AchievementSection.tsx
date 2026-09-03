import { useEffect, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Search, Trash2, Trophy, Timer, Users, Check, Minus, Send } from "lucide-react";
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
  const [adminRoles, setAdminRoles] = useState<any[]>([]);
  const [roundCreators, setRoundCreators] = useState<any[]>([]);
  const [inbox, setInbox] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [activeConv, setActiveConv] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [u, r, t, roles, creators, msgs] = await Promise.all([
      achievementClient.from("profiles").select("*").order("created_at", { ascending: false }).limit(200),
      achievementClient.from("rounds").select("*").order("created_at", { ascending: false }).limit(100),
      achievementClient.from("tasks").select("*").order("created_at", { ascending: false }).limit(150),
      achievementClient.from("user_roles").select("user_id, role").eq("role", "admin"),
      achievementClient.from("round_creators").select("user_id"),
      achievementClient.from("messages").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setUsers(u.data ?? []);
    setRounds(r.data ?? []);
    setTasks(t.data ?? []);
    setAdminRoles(roles.data ?? []);
    setRoundCreators(creators.data ?? []);
    setInbox(msgs.data ?? []);
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
      applyLocal(action, params as any);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // تحديث موضعي بلا إعادة تحميل كامل — يوفّر 6 طلبات بعد كل زر.
  function applyLocal(action: string, p: any) {
    if (action === "set_admin_role") setAdminRoles((rs) => p.remove ? (rs ?? []).filter((x: any) => !(x.user_id === p.user_id && x.role === "admin")) : (rs ?? []).some((x: any) => x.user_id === p.user_id && x.role === "admin") ? rs : [...(rs ?? []), { user_id: p.user_id, role: "admin" }]);
    if (action === "set_round_creator") setRoundCreators((cs) => p.remove ? (cs ?? []).filter((x: any) => x.user_id !== p.user_id) : (cs ?? []).some((x: any) => x.user_id === p.user_id) ? cs : [...(cs ?? []), { user_id: p.user_id }]);
    if (action === "delete_task") setTasks((ts) => (ts ?? []).filter((x: any) => x.id !== p.task_id));
    if (action === "end_round") setRounds((rs) => (rs ?? []).map((x: any) => x.id === p.round_id ? { ...x, status: "ended", credited: true } : x));
    if (action === "achievement_delete_user") {
      setUsers((us) => (us ?? []).filter((x: any) => x.user_id !== p.user_id));
      setAdminRoles((rs) => (rs ?? []).filter((x: any) => x.user_id !== p.user_id));
      setRoundCreators((cs) => (cs ?? []).filter((x: any) => x.user_id !== p.user_id));
    }
    if (action === "send_message") setInbox((ms) => [...(ms ?? []), { id: `local-${Date.now()}`, sender_id: p.sender_id, receiver_id: p.receiver_id, content: p.content, is_read: false, created_at: new Date().toISOString() }]);
    if (action === "delete_conversation") setInbox((ms) => (ms ?? []).filter((x: any) => x.sender_id !== p.user_id && x.receiver_id !== p.user_id));
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
            { v: "inbox", l: "الدعم", c: inbox.filter((m) => !m.is_read && m.sender_id !== "admin").length },
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
                        <div className="flex items-center gap-1.5">
                          {adminRoles.some((a) => a.user_id === u.user_id) ? (
                            <button
                              onClick={() => runAction("set_admin_role", { user_id: u.user_id, remove: true }, `${u.id}-a`)}
                              disabled={busy === `${u.id}-a`}
                              className="ops-btn px-2 py-1 text-xs"
                              title="إزالة صلاحية أدمن"
                            >
                              <Minus className="h-3 w-3" /> إزالة أدمن
                            </button>
                          ) : (
                            <button
                              onClick={() => runAction("set_admin_role", { user_id: u.user_id }, `${u.id}-a`)}
                              disabled={busy === `${u.id}-a`}
                              className="ops-btn px-2 py-1 text-xs"
                              title="منح صلاحية أدمن"
                            >
                              <Check className="h-3 w-3" /> أدمن
                            </button>
                          )}
                          {roundCreators.some((c) => c.user_id === u.user_id) ? (
                            <button
                              onClick={() => runAction("set_round_creator", { user_id: u.user_id, remove: true }, `${u.id}-c`)}
                              disabled={busy === `${u.id}-c`}
                              className="ops-btn px-2 py-1 text-xs"
                              title="إزالة صلاحية إنشاء جولات"
                            >
                              <Minus className="h-3 w-3" /> إزالة جولات
                            </button>
                          ) : (
                            <button
                              onClick={() => runAction("set_round_creator", { user_id: u.user_id }, `${u.id}-c`)}
                              disabled={busy === `${u.id}-c`}
                              className="ops-btn px-2 py-1 text-xs"
                              title="منح صلاحية إنشاء جولات"
                            >
                              <Trophy className="h-3 w-3" /> جولات
                            </button>
                          )}
                          <button
                            onClick={() => runAction("achievement_delete_user", { user_id: u.user_id }, u.id)}
                            disabled={busy === u.id}
                            className="ops-btn-danger px-2 py-1 text-xs"
                          >
                            <Trash2 className="h-3 w-3" /> حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tabs.Content>

        {/* INBOX */}
        <Tabs.Content value="inbox" className="mt-4">
          {loading ? (
            <LoadingScanner text="LOADING INBOX" />
          ) : inbox.length === 0 ? (
            <EmptyState message="لا توجد رسائل دعم" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="ops-panel p-2">
                <div className="max-h-[480px] divide-y divide-ops-border overflow-y-auto">
                  {Object.entries(
                    inbox
                      .filter((m) => !!m.sender_id)
                      .reduce<Record<string, { msg: any; count: number }>>((acc, m) => {
                        const key = m.sender_id;
                        if (!acc[key] || new Date(m.created_at) > new Date(acc[key].msg.created_at)) {
                          acc[key] = {
                            msg: m,
                            count: inbox.filter((x) => x.sender_id === key && !x.is_read).length,
                          };
                        }
                        return acc;
                      }, {})
                  ).map(([uid, { msg, count }]) => {
                    const profile = users.find((u) => u.user_id === uid);
                    return (
                      <button
                        key={uid}
                        onClick={() => setActiveConv(uid)}
                        className={cn(
                          "flex w-full flex-col gap-1 px-3 py-2.5 text-start hover:bg-ops-card/60",
                          activeConv === uid && "bg-ops-card/80"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-ops-text">
                            {profile?.display_name ?? "مجهول"}
                          </span>
                          {count > 0 && (
                            <span className="rounded-full bg-ops-cyan/20 px-1.5 py-0.5 font-mono text-[9px] text-ops-cyan">
                              {count} جديد
                            </span>
                          )}
                        </div>
                        <span className="truncate text-xs text-ops-dim">{msg.content}</span>
                        <span className="font-mono text-[9px] text-ops-dim">{timeAgo(msg.created_at)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="ops-panel p-4">
                {activeConv ? (
                  <ConversationThread
                    userId={activeConv}
                    inbox={inbox}
                    busy={busy}
                    onAction={runAction}
                  />
                ) : (
                  <EmptyState message="اختر محادثة من القائمة لبدء التفاعل" />
                )}
              </div>
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
                    <th>إجراءات</th>
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
                      <td>
                        <button
                          onClick={() => runAction("delete_task", { task_id: t.id }, t.id)}
                          disabled={busy === t.id}
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
      </Tabs.Root>
    </div>
  );
}

function ConversationThread({
  userId,
  inbox,
  busy,
  onAction,
}: {
  userId: string;
  inbox: any[];
  busy: string | null;
  onAction: (action: string, params: Record<string, unknown>, id: string) => void;
}) {
  const [reply, setReply] = useState("");
  const messages = inbox.filter(
    (m) => m.sender_id === userId || (m.sender_id !== userId && m.receiver_id === userId)
  );

  return (
    <div className="flex h-[480px] flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-bold text-ops-text">المحادثة مع {userId.slice(0, 8)}..</h4>
        <div className="flex gap-1.5">
          <button
            onClick={() => onAction("delete_conversation", { user_id: userId, admin_id: "ops-root" }, `${userId}-del`)}
            disabled={busy === `${userId}-del`}
            className="ops-btn-danger px-2 py-1 text-xs"
          >
            <Trash2 className="h-3 w-3" /> حذف المحادثة
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto rounded-md border border-ops-border bg-ops-bg p-3">
        {messages
          .slice()
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[80%] rounded-md px-3 py-1.5 text-sm",
                m.sender_id === userId
                  ? "bg-ops-cyan/10 text-ops-text"
                  : "bg-ops-green/10 text-ops-text ms-auto"
              )}
            >
              <p>{m.content}</p>
              <p className="mt-1 font-mono text-[9px] text-ops-dim">{formatDate(m.created_at)}</p>
            </div>
          ))}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          className="ops-input flex-1"
          placeholder="اكتب رسالة الدعم..."
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && reply.trim()) {
              onAction(
                "send_message",
                { sender_id: "ops-root", receiver_id: userId, content: reply.trim() },
                `${userId}-send`
              );
              setReply("");
            }
          }}
        />
        <button
          onClick={() => {
            if (reply.trim()) {
              onAction(
                "send_message",
                { sender_id: "ops-root", receiver_id: userId, content: reply.trim() },
                `${userId}-send`
              );
              setReply("");
            }
          }}
          disabled={busy === `${userId}-send`}
          className="ops-btn px-3 py-2 text-xs"
        >
          <Send className="h-3 w-3" /> إرسال
        </button>
      </div>
    </div>
  );
}
