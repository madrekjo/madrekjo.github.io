import { useEffect, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Ban, Check, Eye, EyeOff, Trash2, Pin, PinOff, FileImage, Search, ShieldPlus, CalendarClock } from "lucide-react";
import { anonClient } from "@/lib/supabase-clients";
import { opsCall } from "@/lib/ops-client";
import { StatusBadge, LoadingScanner, EmptyState } from "@/components/ui";
import { formatDate, timeAgo, cn } from "@/lib/utils";

interface Props {
  token: string | null;
}

interface Attachment {
  url?: string;
  name?: string;
  type?: string;
}

export function AnonSection({ token }: Props) {
  const [tab, setTab] = useState("posts");
  const [posts, setPosts] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [blocked, setBlocked] = useState<any[]>([]);
  const [adminDevices, setAdminDevices] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [maintenance, setMaintenance] = useState("");
  const [reopenAt, setReopenAt] = useState("");

  async function load() {
    setLoading(true);
    const [p, r, b, a, s] = await Promise.all([
      anonClient.from("posts").select("*").order("created_at", { ascending: false }).limit(150),
      anonClient.from("reports").select("*").order("created_at", { ascending: false }).limit(100),
      anonClient.from("blocked_devices").select("*").order("created_at", { ascending: false }).limit(100),
      anonClient.from("admin_devices").select("*").order("created_at", { ascending: false }).limit(100),
      anonClient.from("site_settings").select("*").limit(1),
    ]);
    setPosts(p.data ?? []);
    setReports(r.data ?? []);
    setBlocked(b.data ?? []);
    setAdminDevices(a.data ?? []);
    setSettings(s.data?.[0] ?? null);
    setMaintenance(s.data?.[0]?.maintenance_message ?? "");
    setReopenAt(s.data?.[0]?.site_reopen_at ? s.data[0].site_reopen_at.slice(0, 16) : "");
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
      await opsCall({ target: "anon", action, params }, token);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const filteredPosts = useMemo(() => {
    let list = posts;
    if (!showHidden) list = list.filter((p) => !p.hidden);
    if (search) {
      list = list.filter((p) => (p.content ?? "").includes(search));
    }
    return list;
  }, [posts, showHidden, search]);

  const isImage = (t?: string) => t?.startsWith("image/");
  const isVideo = (t?: string) => t?.startsWith("video/");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ops-text">قسم أنا مجهول</h1>
          <p className="text-sm text-ops-dim">إدارة المنشورات المجهولة والبلاغات والأجهزة</p>
        </div>
        <div className="flex items-center gap-2 text-ops-dim">
          <span className="font-mono text-[10px]">حالة الموقع:</span>
          <StatusBadge status={settings?.site_enabled ? "نشط" : "مغلق"}
            mapping={{
              "نشط": { label: "مفتوح", cls: "bg-ops-green/15 text-ops-green border-ops-green/40" },
              "مغلق": { label: "مغلق", cls: "bg-ops-red/15 text-ops-red border-ops-red/40" },
            }} />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-ops-red/40 bg-ops-red/10 px-3 py-2 text-sm text-ops-red">
          {error}
        </div>
      )}

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex gap-1 border-b border-ops-border">
          {[
            { v: "posts", l: "المنشورات", c: posts.length },
            { v: "reports", l: "البلاغات", c: reports.filter((x) => x.status === "open").length },
            { v: "blocked", l: "الأجهزة المحظورة", c: blocked.length },
            { v: "admins", l: "أدمن الأجهزة", c: adminDevices.length },
            { v: "settings", l: "الإعدادات", c: 0 },
          ].map((t) => (
            <Tabs.Trigger
              key={t.v}
              value={t.v}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition-colors",
                tab === t.v ? "border-ops-violet text-ops-violet" : "border-transparent text-ops-dim hover:text-ops-text"
              )}
            >
              {t.l}
              {t.c > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 font-mono text-[10px]",
                    t.v === "reports" ? "bg-ops-red/15 text-ops-red" : "bg-ops-card text-ops-dim"
                  )}
                >
                  {t.c}
                </span>
              )}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* POSTS */}
        <Tabs.Content value="posts" className="mt-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ops-dim" />
              <input
                className="ops-input pe-9"
                placeholder="ابحث في المنشورات..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowHidden((v) => !v)}
              className={cn("ops-btn px-3 py-2 text-xs", showHidden && "border-ops-amber text-ops-amber")}
            >
              {showHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {showHidden ? "إخفاء المخفي" : "إظهار المخفي"}
            </button>
          </div>

          {loading ? (
            <LoadingScanner text="SCANNING POSTS" />
          ) : filteredPosts.length === 0 ? (
            <EmptyState message="لا توجد منشورات" />
          ) : (
            <div className="space-y-2">
              {filteredPosts.map((p) => {
                const atts = (Array.isArray(p.attachments) ? p.attachments : []) as Attachment[];
                const images = atts.filter((a) => isImage(a.type));
                return (
                  <div key={p.id} className={cn("ops-card p-3", p.hidden && "opacity-70")}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ops-violet">
                          {p.anon_number ? `مجهول #${p.anon_number}` : p.author_name ?? "مجهول"}
                        </span>
                        {p.is_admin && (
                          <span className="rounded-full bg-ops-cyan/10 px-1.5 py-0.5 text-[9px] font-bold text-ops-cyan">
                            إدارة
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {p.hidden && <span className="text-[10px] text-ops-amber">مخفي</span>}
                        <span className="font-mono text-[10px] text-ops-dim">{timeAgo(p.created_at)}</span>
                      </div>
                    </div>
                    <p className="text-sm text-ops-text">{p.content}</p>
                    {images.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {images.slice(0, 4).map((img, i) => (
                          <img
                            key={i}
                            src={img.url}
                            alt=""
                            className="h-16 w-16 rounded object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ))}
                        {images.length > 4 && (
                          <span className="flex h-16 w-16 items-center justify-center rounded bg-ops-card font-mono text-xs text-ops-dim">
                            +{images.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                    {atts.length > images.length && (
                      <div className="mt-2 flex items-center gap-1 font-mono text-[10px] text-ops-dim">
                        <FileImage className="h-3 w-3" /> {atts.length - images.length} ملف مرفق
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        onClick={() => runAction("toggle_pin", { post_id: p.id, pinned: !p.pinned }, p.id)}
                        className="ops-btn px-2 py-1 text-xs"
                        title="تثبيت"
                      >
                        {p.pinned ? <Pin className="h-3 w-3 text-ops-amber" /> : <PinOff className="h-3 w-3" />}
                      </button>
                      <button
                        onClick={() => runAction("toggle_hide", { post_id: p.id, hidden: !p.hidden }, p.id)}
                        disabled={busy === p.id}
                        className="ops-btn px-2 py-1 text-xs"
                      >
                        {p.hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        {p.hidden ? "إظهار" : "إخفاء"}
                      </button>
                      <button
                        onClick={() => runAction("delete_post", { post_id: p.id }, p.id)}
                        disabled={busy === p.id}
                        className="ops-btn-danger px-2 py-1 text-xs"
                      >
                        <Trash2 className="h-3 w-3" /> حذف
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Tabs.Content>

        {/* REPORTS */}
        <Tabs.Content value="reports" className="mt-4">
          {loading ? (
            <LoadingScanner text="SCANNING REPORTS" />
          ) : reports.length === 0 ? (
            <EmptyState message="لا توجد بلاغات" />
          ) : (
            <div className="space-y-2">
              {reports.map((r) => (
                <div key={r.id} className="ops-card p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      <span className="font-mono text-xs text-ops-dim">{r.content_type}</span>
                    </div>
                    <span className="font-mono text-[10px] text-ops-dim">{formatDate(r.created_at)}</span>
                  </div>
                  <p className="text-sm text-ops-text">
                    <span className="font-semibold text-ops-amber">السبب:</span> {r.reason_text ?? r.reason_code}
                  </p>
                  {r.content_snapshot && (
                    <p className="mt-1 line-clamp-2 text-sm text-ops-dim">{r.content_snapshot}</p>
                  )}
                  {r.status === "open" && (
                    <div className="mt-2 flex gap-1.5">
                      <button
                        onClick={() => runAction("resolve_report", { report_id: r.id, action: "resolved" }, r.id)}
                        disabled={busy === r.id}
                        className="ops-btn-green px-2 py-1 text-xs"
                      >
                        <Check className="h-3 w-3" /> إغلاق
                      </button>
                      <button
                        onClick={() => runAction("resolve_report", { report_id: r.id, action: "dismissed" }, r.id)}
                        disabled={busy === r.id}
                        className="ops-btn px-2 py-1 text-xs"
                      >
                        تجاهل
                      </button>
                      {r.content_owner_device_id && (
                        <button
                          onClick={() => runAction("ban_device", { device_id: r.content_owner_device_id, reason: `بلاغ: ${r.reason_code}` }, r.id)}
                          disabled={busy === r.id}
                          className="ops-btn-danger px-2 py-1 text-xs"
                        >
                          <Ban className="h-3 w-3" /> حظر الجهاز
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Tabs.Content>

        {/* BLOCKED */}
        <Tabs.Content value="blocked" className="mt-4">
          {loading ? (
            <LoadingScanner text="SCANNING DEVICES" />
          ) : blocked.length === 0 ? (
            <EmptyState message="لا توجد أجهزة محظورة" />
          ) : (
            <div className="ops-panel overflow-x-auto">
              <table className="ops-table w-full">
                <thead>
                  <tr className="border-b border-ops-border">
                    <th>معرف الجهاز</th>
                    <th>السبب</th>
                    <th>الانتهاء</th>
                    <th>التاريخ</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {blocked.map((b) => (
                    <tr key={b.device_id} className="border-b border-ops-border/50 last:border-0 hover:bg-ops-card/50">
                      <td className="font-mono text-xs text-ops-text">{b.device_id?.slice(0, 16)}...</td>
                      <td className="text-sm text-ops-dim">{b.reason ?? "—"}</td>
                      <td className="text-sm">{b.expires_at ? formatDate(b.expires_at) : "دائم"}</td>
                      <td className="text-sm text-ops-dim">{formatDate(b.created_at)}</td>
                      <td>
                        <button
                          onClick={() => runAction("unban_device", { device_id: b.device_id }, b.device_id)}
                          disabled={busy === b.device_id}
                          className="ops-btn-green px-2 py-1 text-xs"
                        >
                          <Check className="h-3 w-3" /> إلغاء الحظر
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tabs.Content>

        {/* ADMIN DEVICES */}
        <Tabs.Content value="admins" className="mt-4">
          <div className="mb-3 flex max-w-md items-center gap-2">
            <input id="admin-device-input" className="ops-input flex-1" placeholder="device_id..." />
            <button
              onClick={() => {
                const el = document.getElementById("admin-device-input") as HTMLInputElement;
                if (el?.value.trim()) {
                  runAction("set_admin_device", { device_id: el.value.trim() }, el.value.trim());
                  el.value = "";
                }
              }}
              className="ops-btn px-2 py-2 text-xs"
            >
              <ShieldPlus className="h-3 w-3" /> إضافة أدمن
            </button>
          </div>
          {loading ? (
            <LoadingScanner text="SCANNING ADMIN DEVICES" />
          ) : adminDevices.length === 0 ? (
            <EmptyState message="لا توجد أجهزة أدمن" />
          ) : (
            <div className="ops-panel overflow-x-auto">
              <table className="ops-table w-full">
                <thead>
                  <tr className="border-b border-ops-border">
                    <th>معرف الجهاز</th>
                    <th>ملاحظة</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {adminDevices.map((ad) => (
                    <tr key={ad.device_id} className="border-b border-ops-border/50 last:border-0 hover:bg-ops-card/50">
                      <td className="font-mono text-xs text-ops-cyan">{ad.device_id}</td>
                      <td className="text-sm text-ops-dim">{ad.note ?? "—"}</td>
                      <td>
                        <button
                          onClick={() => runAction("remove_admin_device", { device_id: ad.device_id }, ad.device_id)}
                          disabled={busy === ad.device_id}
                          className="ops-btn-danger px-2 py-1 text-xs"
                        >
                          <Trash2 className="h-3 w-3" /> إزالة
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tabs.Content>

        {/* SETTINGS */}
        <Tabs.Content value="settings" className="mt-4">
          <div className="ops-card max-w-md p-5">
            <h3 className="mb-4 text-sm font-bold text-ops-text">إعدادات الموقع</h3>
            {settings && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-md border border-ops-border bg-ops-bg px-4 py-3">
                  <span className="text-sm text-ops-text">فتح الموقع للزوار</span>
                  <button
                    onClick={() => runAction("set_site_enabled", { enabled: !settings.site_enabled }, "site")}
                    disabled={busy === "site"}
                    className={cn(
                      "relative h-6 w-11 rounded-full transition-colors",
                      settings.site_enabled ? "bg-ops-green" : "bg-ops-border"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                        settings.site_enabled ? "start-0.5" : "start-[22px]"
                      )}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between rounded-md border border-ops-border bg-ops-bg px-4 py-3">
                  <span className="text-sm text-ops-text">وضع الشات</span>
                  <button
                    onClick={() => runAction("set_chat_mode", { enabled: !settings.chat_mode_enabled }, "chat")}
                    disabled={busy === "chat"}
                    className={cn(
                      "relative h-6 w-11 rounded-full transition-colors",
                      settings.chat_mode_enabled ? "bg-ops-green" : "bg-ops-border"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                        settings.chat_mode_enabled ? "start-0.5" : "start-[22px]"
                      )}
                    />
                  </button>
                </div>
                {settings.site_reopen_at && (
                  <p className="font-mono text-[10px] text-ops-amber">
                    يعاد الفتح: {formatDate(settings.site_reopen_at)}
                  </p>
                )}

                <div className="border-t border-ops-border pt-4">
                  <h4 className="mb-3 text-xs font-bold text-ops-dim">رسالة الصيانة</h4>
                  <div className="flex gap-2">
                    <input
                      className="ops-input flex-1"
                      value={maintenance}
                      onChange={(e) => setMaintenance(e.target.value)}
                      placeholder="رسالة الصيانة..."
                    />
                    <button
                      onClick={() => runAction("set_maintenance", { message: maintenance }, "maint")}
                      className="ops-btn px-2 py-2 text-xs"
                    >
                      حفظ
                    </button>
                  </div>
                </div>

                <div className="border-t border-ops-border pt-4">
                  <h4 className="mb-3 text-xs font-bold text-ops-dim">موعد إعادة الفتح</h4>
                  <div className="flex gap-2">
                    <input
                      type="datetime-local"
                      className="ops-input flex-1"
                      value={reopenAt}
                      onChange={(e) => setReopenAt(e.target.value)}
                    />
                    <button
                      onClick={() =>
                        runAction(
                          "set_reopen_at",
                          { reopen_at: reopenAt ? new Date(reopenAt).toISOString() : null },
                          "reopen"
                        )
                      }
                      className="ops-btn px-2 py-2 text-xs"
                    >
                      <CalendarClock className="h-3 w-3" /> تعيين
                    </button>
                  </div>
                </div>

                <div className="border-t border-ops-border pt-4">
                  <h4 className="mb-3 text-xs font-bold text-ops-dim">ألوان الأدمن (تتخزن عند الإغلاق)</h4>
                  <button
                    onClick={() => {
                      const bg = prompt("لون خلفية منشور الأدمن (مثال #1e3a8a):", settings.admin_post_bg ?? "");
                      const text = prompt("لون نص منشور الأدمن (مثال #ffffff):", settings.admin_post_text ?? "");
                      if (bg || text) {
                        runAction("set_admin_colors", {
                          admin_post_bg: bg || settings.admin_post_bg || null,
                          admin_post_text: text || settings.admin_post_text || null,
                        }, "colors");
                      }
                    }}
                    disabled={busy === "colors"}
                    className="ops-btn px-3 py-2 text-xs"
                  >
                    ضبط ألوان منشور الأدمن
                  </button>
                </div>
              </div>
            )}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
