import { useEffect, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Ban, Check, Search, Trash2, Pin, PinOff, ShieldAlert, Shield, Clock, Plus, X, Pencil } from "lucide-react";
import { chatClient } from "@/lib/supabase-clients";
import { opsCall } from "@/lib/ops-client";
import { StatusBadge, LoadingScanner, EmptyState } from "@/components/ui";
import { formatDate, timeAgo, initials, cn } from "@/lib/utils";

interface Props {
  token: string | null;
}

export function ChatSection({ token }: Props) {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [bannedWords, setBannedWords] = useState<any[]>([]);
  const [deletedPosts, setDeletedPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [newWord, setNewWord] = useState("");
  const [timeoutMin, setTimeoutMin] = useState<number>(60);

  async function load() {
    setLoading(true);
    const [u, p, r, w, d] = await Promise.all([
      chatClient.from("profiles").select("*").order("created_at", { ascending: false }).limit(200),
      chatClient.from("posts").select("*").order("created_at", { ascending: false }).limit(100),
      chatClient.from("study_rounds").select("*").order("created_at", { ascending: false }).limit(100),
      chatClient.from("banned_words").select("*").order("word").limit(200),
      chatClient
        .from("posts")
        .select("id, content, channel, created_at, deleted_at, profile_id")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(100),
    ]);
    setUsers(u.data ?? []);
    setPosts(p.data ?? []);
    setRounds(r.data ?? []);
    setBannedWords(w.data ?? []);
    setDeletedPosts(d.data ?? []);
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
      await opsCall({ target: "chat", action, params }, token);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const filteredUsers = useMemo(
    () =>
      users.filter((u) =>
        (u.full_name ?? "").toLowerCase().includes(search.toLowerCase())
      ),
    [users, search]
  );

  const channelFilter = (p: any, ch: string) =>
    posts.filter((p) => (ch === "all" ? true : p.channel === ch));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ops-text">قسم الشات</h1>
        <p className="text-sm text-ops-dim">إدارة المستخدمين والمنشورات والجولات</p>
      </div>

      {error && (
        <div className="rounded-md border border-ops-red/40 bg-ops-red/10 px-3 py-2 text-sm text-ops-red">
          {error}
        </div>
      )}

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex gap-1 border-b border-ops-border">
          {[
            { v: "users", l: "المستخدمين", c: users.length },
            { v: "posts", l: "المنشورات", c: posts.length },
            { v: "pending", l: "قيد المراجعة", c: posts.filter((p) => p.status === "pending").length },
            { v: "banned", l: "كلمات محظورة", c: bannedWords.length },
            { v: "deleted", l: "المحذوفة", c: deletedPosts.length },
            { v: "rounds", l: "الجولات", c: rounds.length },
          ].map((t) => (
            <Tabs.Trigger
              key={t.v}
              value={t.v}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition-colors",
                tab === t.v
                  ? "border-ops-cyan text-ops-cyan"
                  : "border-transparent text-ops-dim hover:text-ops-text"
              )}
            >
              {t.l}
              <span className="rounded-full bg-ops-card px-1.5 py-0.5 font-mono text-[10px] text-ops-dim">
                {t.c}
              </span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* USERS TAB */}
        <Tabs.Content value="users" className="mt-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ops-dim" />
              <input
                className="ops-input pe-9"
                placeholder="ابحث عن مستخدم..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-[11px] text-ops-dim">
              تقييد (د):
              <input
                type="number"
                className="ops-input w-20 py-1.5"
                value={timeoutMin}
                min={1}
                onChange={(e) => setTimeoutMin(Number(e.target.value) || 60)}
              />
            </label>
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
                    <th>الجيل</th>
                    <th>النوع</th>
                    <th>آخر ظهور</th>
                    <th>الحالة</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="border-b border-ops-border/50 last:border-0 hover:bg-ops-card/50">
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ops-cyan/10 text-xs font-bold text-ops-cyan">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} className="h-8 w-8 rounded-full" alt="" referrerPolicy="no-referrer" />
                            ) : (
                              initials(u.full_name)
                            )}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-ops-text">{u.full_name}</p>
                            <p className="font-mono text-[10px] text-ops-dim">{u.user_id?.slice(0, 8)}..</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-sm">{u.generation ?? "—"}</td>
                      <td className="text-sm">{u.gender ?? "—"}</td>
                      <td className="text-sm text-ops-dim">{timeAgo(u.last_seen_at)}</td>
                      <td>
                        {u.is_banned || u.chat_banned ? (
                          <span className="text-xs font-bold text-ops-red">محظور</span>
                        ) : (
                          <span className="text-xs font-bold text-ops-green">نشط</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {(u.is_banned || u.chat_banned) ? (
                            <button
                              onClick={() => runAction("unban_user", { user_id: u.user_id }, u.id)}
                              disabled={busy === u.id}
                              className="ops-btn-green px-2 py-1 text-xs"
                            >
                              <Check className="h-3 w-3" /> إلغاء الحظر
                            </button>
                          ) : (
                            <button
                              onClick={() => runAction("ban_user", { user_id: u.user_id }, u.id)}
                              disabled={busy === u.id}
                              className="ops-btn px-2 py-1 text-xs"
                            >
                              <Ban className="h-3 w-3" /> حظر
                            </button>
                          )}
                          <button
                            onClick={() => runAction("toggle_chat_ban", { user_id: u.user_id, chat_banned: !u.chat_banned }, u.id)}
                            disabled={busy === u.id}
                            className="ops-btn px-2 py-1 text-xs"
                            title="حظر الشات فقط"
                          >
                            <Shield className="h-3 w-3" /> {u.chat_banned ? "فك شات" : "حظر شات"}
                          </button>
                          <button
                            onClick={() => runAction("set_timeout", { user_id: u.user_id, timeout_until: new Date(Date.now() + timeoutMin * 60000).toISOString() }, u.id)}
                            disabled={busy === u.id}
                            className="ops-btn px-2 py-1 text-xs"
                            title={`تقييد ${timeoutMin} دقيقة`}
                          >
                            <Clock className="h-3 w-3" /> تقييد
                          </button>
                          <button
                            onClick={() => {
                              const name = prompt("الاسم الجديد:", u.full_name ?? "");
                              if (name) runAction("rename_user", { user_id: u.user_id, full_name: name }, u.id);
                            }}
                            disabled={busy === u.id}
                            className="ops-btn px-2 py-1 text-xs"
                            title="إعادة تسمية"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => runAction("delete_user", { user_id: u.user_id }, u.id)}
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

        {/* POSTS TAB */}
        <Tabs.Content value="posts" className="mt-4">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {["all", "general", "male", "female", "09", "10"].map((c) => (
              <button
                key={c}
                onClick={() => setTab("posts")}
                className="ops-btn px-2 py-1 text-xs"
              >
                {c}
              </button>
            ))}
          </div>
          {loading ? (
            <LoadingScanner text="SCANNING POSTS" />
          ) : posts.length === 0 ? (
            <EmptyState message="لا توجد منشورات" />
          ) : (
            <div className="ops-panel overflow-x-auto">
              <table className="ops-table w-full">
                <thead>
                  <tr className="border-b border-ops-border">
                    <th>المحتوى</th>
                    <th>القناة</th>
                    <th>التاريخ</th>
                    <th>تثبيت</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr key={p.id} className="border-b border-ops-border/50 last:border-0 hover:bg-ops-card/50">
                      <td className="max-w-[300px]">
                        <p className="truncate text-sm text-ops-text">{p.content}</p>
                        {p.image_urls?.length > 0 && (
                          <span className="font-mono text-[10px] text-ops-cyan">{p.image_urls.length} صورة</span>
                        )}
                      </td>
                      <td className="text-sm">{p.channel ?? "عام"}</td>
                      <td className="text-sm text-ops-dim">{formatDate(p.created_at)}</td>
                      <td>
                        <button
                          onClick={() => runAction("toggle_pin", { post_id: p.id, is_pinned: !p.is_pinned }, p.id)}
                          className="text-sm"
                        >
                          {p.is_pinned ? (
                            <Pin className="h-4 w-4 text-ops-amber" />
                          ) : (
                            <PinOff className="h-4 w-4 text-ops-dim" />
                          )}
                        </button>
                      </td>
                      <td>
                        {p.status === "pending" && (
                          <button
                            onClick={() => runAction("approve_post", { post_id: p.id }, p.id)}
                            disabled={busy === p.id}
                            className="ops-btn-green px-2 py-1 text-xs"
                          >
                            <Check className="h-3 w-3" /> اعتماد
                          </button>
                        )}
                        <button
                          onClick={() => runAction("delete_post", { post_id: p.id }, p.id)}
                          disabled={busy === p.id}
                          className="ms-1.5 ops-btn-danger px-2 py-1 text-xs"
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

        {/* PENDING POSTS TAB */}
        <Tabs.Content value="pending" className="mt-4">
          {loading ? (
            <LoadingScanner text="SCANNING PENDING" />
          ) : posts.filter((p) => p.status === "pending").length === 0 ? (
            <EmptyState message="لا توجد منشورات قيد المراجعة" />
          ) : (
            <div className="space-y-2">
              {posts
                .filter((p) => p.status === "pending")
                .map((p) => (
                  <div key={p.id} className="ops-card p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <StatusBadge status="pending" />
                      <span className="font-mono text-[10px] text-ops-dim">{formatDate(p.created_at)}</span>
                    </div>
                    <p className="text-sm text-ops-text">{p.content}</p>
                    <p className="mt-1 font-mono text-[10px] text-ops-dim">القناة: {p.channel ?? "عام"}</p>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        onClick={() => runAction("approve_post", { post_id: p.id }, p.id)}
                        disabled={busy === p.id}
                        className="ops-btn-green px-2 py-1 text-xs"
                      >
                        <Check className="h-3 w-3" /> اعتماد
                      </button>
                      <button
                        onClick={() => runAction("reject_post", { post_id: p.id }, p.id)}
                        disabled={busy === p.id}
                        className="ops-btn-danger px-2 py-1 text-xs"
                      >
                        <X className="h-3 w-3" /> رفض
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Tabs.Content>

        {/* BANNED WORDS TAB */}
        <Tabs.Content value="banned" className="mt-4">
          <div className="mb-3 flex max-w-md items-center gap-2">
            <input
              className="ops-input flex-1"
              placeholder="أضف كلمة محظورة..."
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newWord.trim()) {
                  runAction("add_banned_word", { word: newWord.trim() }, "word");
                  setNewWord("");
                }
              }}
            />
            <button
              onClick={() => {
                if (newWord.trim()) {
                  runAction("add_banned_word", { word: newWord.trim() }, "word");
                  setNewWord("");
                }
              }}
              className="ops-btn px-2 py-2 text-xs"
            >
              <Plus className="h-3 w-3" /> إضافة
            </button>
          </div>
          {loading ? (
            <LoadingScanner text="SCANNING WORDS" />
          ) : bannedWords.length === 0 ? (
            <EmptyState message="لا توجد كلمات محظورة" />
          ) : (
            <div className="ops-panel overflow-x-auto">
              <table className="ops-table w-full">
                <thead>
                  <tr className="border-b border-ops-border">
                    <th>الكلمة</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {bannedWords.map((w) => (
                    <tr key={w.id} className="border-b border-ops-border/50 last:border-0 hover:bg-ops-card/50">
                      <td className="text-sm text-ops-text">
                        <span className="rounded bg-ops-red/10 px-2 py-0.5 font-mono text-xs text-ops-red">{w.word}</span>
                      </td>
                      <td>
                        <button
                          onClick={() => runAction("remove_banned_word", { id: w.id }, w.id)}
                          disabled={busy === w.id}
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

        {/* DELETED POSTS TAB */}
        <Tabs.Content value="deleted" className="mt-4">
          {loading ? (
            <LoadingScanner text="SCANNING DELETED" />
          ) : deletedPosts.length === 0 ? (
            <EmptyState message="لا توجد منشورات محذوفة" />
          ) : (
            <div className="ops-panel overflow-x-auto">
              <table className="ops-table w-full">
                <thead>
                  <tr className="border-b border-ops-border">
                    <th>المحتوى</th>
                    <th>القناة</th>
                    <th>تاريخ الحذف</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedPosts.map((p) => (
                    <tr key={p.id} className="border-b border-ops-border/50 last:border-0 hover:bg-ops-card/50">
                      <td className="max-w-[300px]">
                        <p className="truncate text-sm text-ops-text">{p.content}</p>
                      </td>
                      <td className="text-sm">{p.channel ?? "عام"}</td>
                      <td className="text-sm text-ops-dim">{formatDate(p.deleted_at)}</td>
                      <td>
                        <button
                          onClick={() => {
                            if (confirm("حذف نهائي؟ لا يمكن التراجع.")) runAction("delete_post", { post_id: p.id }, p.id);
                          }}
                          disabled={busy === p.id}
                          className="ops-btn-danger px-2 py-1 text-xs"
                        >
                          <ShieldAlert className="h-3 w-3" /> حذف نهائي
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tabs.Content>

        {/* ROUNDS TAB */}
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
                    <th>المدة</th>
                    <th>البداية</th>
                    <th>الحالة</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {rounds.map((r) => (
                    <tr key={r.id} className="border-b border-ops-border/50 last:border-0 hover:bg-ops-card/50">
                      <td className="max-w-[250px]">
                        <p className="truncate text-sm text-ops-text">{r.title}</p>
                      </td>
                      <td className="text-sm">{r.duration_minutes ? `${r.duration_minutes} د` : "—"}</td>
                      <td className="text-sm text-ops-dim">{formatDate(r.starts_at)}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>
                        {r.status === "active" || r.status === "scheduled" ? (
                          <button
                            onClick={() => runAction("cancel_round", { round_id: r.id }, r.id)}
                            disabled={busy === r.id}
                            className="ops-btn-danger px-2 py-1 text-xs"
                          >
                            <ShieldAlert className="h-3 w-3" /> إنهاء
                          </button>
                        ) : null}
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
