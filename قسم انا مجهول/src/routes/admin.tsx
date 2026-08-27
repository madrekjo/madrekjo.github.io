import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Trash2, Check, X, Ghost, ShieldPlus, Settings, MessageSquare, Ban, UserCircle2, ImagePlus, Loader2, Settings2, Flag, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { getProfile, setProfile, type ChatProfile } from "@/lib/profile";
import { uploadFile } from "@/lib/upload";
import { getDeviceId } from "@/lib/device";
import { DeviceInspector } from "@/components/device-inspector";
import { useDeviceLabel } from "@/lib/device-labels";
import { BanDialog } from "@/components/ban-dialog";

function AdminProfileEditor() {
  const [p, setP] = useState<ChatProfile>({ name: "", avatar_url: null });
  const [uploading, setUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { setP(getProfile()); setLoaded(true); }, []);

  async function onAvatar(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    try {
      const r = await uploadFile("avatars", f);
      setP((prev) => ({ ...prev, avatar_url: r.url }));
    } catch (err: any) {
      toast.error("فشل رفع الصورة: " + (err?.message || ""));
    } finally { setUploading(false); }
  }

  async function save() {
    const name = p.name.trim();
    if (!name) { toast.error("اكتب اسماً"); return; }
    const next = { name, avatar_url: p.avatar_url };
    setProfile(next);
    setP(next);
    const { error } = await supabase.from("admin_devices").upsert({ device_id: getDeviceId(), note: "admin profile" });
    if (error) toast.error("فشل: " + error.message); else toast.success("تم الحفظ");
  }

  if (!loaded) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div>
        <Label className="text-base flex items-center gap-1"><UserCircle2 className="h-4 w-4" /> ملف الأدمن للشات</Label>
        <p className="text-xs text-muted-foreground">الاسم والصورة اللي بتظهر مع منشوراتك وتعليقاتك في الشات التفاعلي. منشوراتك بتظهر بلون مميز.</p>
      </div>
      <div className="flex items-center gap-3">
        <Avatar className="h-16 w-16 ring-2 ring-amber-400">
          <AvatarImage src={p.avatar_url ?? undefined} />
          <AvatarFallback><UserCircle2 className="h-7 w-7" /></AvatarFallback>
        </Avatar>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-muted px-3 py-2 text-sm hover:bg-accent">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} صورة / GIF
          <input type="file" accept="image/*,image/gif" className="hidden" onChange={onAvatar} />
        </label>
        {p.avatar_url && (
          <Button size="sm" variant="ghost" onClick={() => setP((prev) => ({ ...prev, avatar_url: null }))}>إزالة</Button>
        )}
      </div>
      <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="اسم الظهور" maxLength={40} />
      <Button onClick={save} className="w-full">حفظ الملف</Button>
    </section>
  );
}

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "الإدارة — أنا مجهول" }] }),
  component: Admin,
});

function timeAgo(d: string) {
  try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ar }); } catch { return ""; }
}

function PendingCard({ p, onApprove, onReject }: { p: any; onApprove: (id: string) => void; onReject: (id: string) => void }) {
  const [inspect, setInspect] = useState(false);
  const label = useDeviceLabel(p.device_id, true);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Ghost className="h-3 w-3" /> مجهول {p.anon_number ?? "?"}
          {label && <span className="rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-purple-600 dark:text-purple-300">🔖 {label}</span>}
          <button onClick={() => setInspect(true)} className="rounded-full p-1 hover:bg-accent hover:text-foreground" title="ملف الجهاز">
            <Settings2 className="h-3 w-3" />
          </button>
        </span>
        <span>{timeAgo(p.created_at)}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{p.content}</p>
      {p.attachments?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {p.attachments.map((a: any, i: number) =>
            a.type?.startsWith("image/") ? (
              <a key={i} href={a.url} target="_blank" rel="noreferrer">
                <img src={a.url} alt={a.name} className="h-24 w-24 rounded border border-border object-cover" />
              </a>
            ) : (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className="rounded border border-border bg-muted px-2 py-1 text-xs">📎 {a.name}</a>
            )
          )}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground" title={p.device_id}>ID: {p.device_id.slice(0, 12)}…</span>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onApprove(p.id)} className="gap-1"><Check className="h-4 w-4" /> قبول</Button>
          <Button size="sm" variant="destructive" onClick={() => onReject(p.id)} className="gap-1"><X className="h-4 w-4" /> رفض</Button>
        </div>
      </div>
      <DeviceInspector deviceId={p.device_id} open={inspect} onOpenChange={setInspect} />
    </div>
  );
}

const REASON_LABELS: Record<string, string> = {
  spam: "سبام / إعلان",
  harassment: "تنمر",
  hate: "كراهية",
  sexual: "محتوى جنسي",
  violence: "عنف",
  misinformation: "معلومات مضللة",
  other: "أخرى",
};

function ReportCard({ r, onResolve }: { r: any; onResolve: (id: string, action: "dismissed" | "resolved" | "content_deleted" | "ban_owner", note?: string) => void }) {
  const [inspect, setInspect] = useState(false);
  const statusColor =
    r.status === "open" ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
    : r.status === "content_deleted" ? "bg-red-500/15 text-red-700 dark:text-red-400"
    : r.status === "resolved" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : "bg-muted text-muted-foreground";
  const typeLabel =
    r.content_type === "post" ? "منشور"
    : r.content_type === "comment" ? "تعليق"
    : r.content_type === "chat_post" ? "منشور شات"
    : "تعليق شات";
  const canDeepLink = r.status !== "content_deleted" && (r.content_type === "post" || r.content_type === "comment");
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${statusColor}`}>{r.status === "open" ? "مفتوح" : r.status === "content_deleted" ? "المحتوى محذوف" : r.status === "resolved" ? "مغلق" : "متجاهل"}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{typeLabel}</span>
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">{REASON_LABELS[r.reason_code] ?? r.reason_code}</span>
        </div>
        <span className="text-muted-foreground">{timeAgo(r.created_at)}</span>
      </div>
      {r.reason_text && (
        <div className="rounded-md bg-muted/50 p-2 text-sm">
          <div className="text-[10px] font-bold text-muted-foreground">تفاصيل من المبلّغ:</div>
          <div className="mt-0.5 whitespace-pre-wrap">{r.reason_text}</div>
        </div>
      )}
      <div className="rounded-md border border-border bg-background p-2 text-sm">
        <div className="text-[10px] font-bold text-muted-foreground">لقطة من المحتوى المُبلَّغ عنه:</div>
        <div className="mt-1 whitespace-pre-wrap">{r.content_snapshot || <span className="text-muted-foreground italic">فارغ</span>}</div>
      </div>
      <div className="grid grid-cols-1 gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
        <div><span className="font-semibold">المبلّغ:</span> <span className="font-mono">{r.reporter_device_id?.slice(0, 14)}…</span></div>
        <div className="flex items-center gap-1">
          <span className="font-semibold">صاحب المحتوى:</span>
          <span className="font-mono">{r.content_owner_device_id?.slice(0, 14) ?? "—"}…</span>
          {r.content_owner_device_id && (
            <button onClick={() => setInspect(true)} className="rounded p-0.5 hover:bg-accent" title="ملف الجهاز"><Settings2 className="h-3 w-3" /></button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {r.status === "open" && (
          <>
            <Button size="sm" variant="destructive" onClick={() => onResolve(r.id, "content_deleted")} className="gap-1"><Trash2 className="h-3 w-3" /> حذف المحتوى</Button>
            <Button size="sm" variant="destructive" onClick={() => onResolve(r.id, "ban_owner", "report:" + r.reason_code)} className="gap-1"><Ban className="h-3 w-3" /> حظر الجهاز</Button>
            <Button size="sm" variant="outline" onClick={() => onResolve(r.id, "dismissed")}>تجاهل</Button>
            <Button size="sm" variant="ghost" onClick={() => onResolve(r.id, "resolved")}>إغلاق</Button>
          </>
        )}
        {canDeepLink && r.content_type === "post" && (
          <a href={`/#post-${r.content_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
            <ExternalLink className="h-3 w-3" /> فتح
          </a>
        )}
      </div>
      {r.content_owner_device_id && <DeviceInspector deviceId={r.content_owner_device_id} open={inspect} onOpenChange={setInspect} />}
    </div>
  );
}

function Admin() {
  const { isAdmin, adminChecked, loading, session } = useAuth();
  const navigate = useNavigate();
  const { settings, reload: reloadSettings } = useSiteSettings();
  const [pending, setPending] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [chat, setChat] = useState<any[]>([]);
  const [hiddenPosts, setHiddenPosts] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [reportFilter, setReportFilter] = useState<"open" | "all">("open");
  const [newBlockId, setNewBlockId] = useState("");
  const [banTarget, setBanTarget] = useState<string | null>(null);
  const [newAdminId, setNewAdminId] = useState("");
  const [newAdminNote, setNewAdminNote] = useState("");
  const [maintMsg, setMaintMsg] = useState("");
  const [reopenLocal, setReopenLocal] = useState("");
  const [postBg, setPostBg] = useState("#fef3c7");
  const [postText, setPostText] = useState("#78350f");
  const [commentBg, setCommentBg] = useState("#fef3c7");
  const [commentText, setCommentText] = useState("#78350f");

  useEffect(() => { setMaintMsg(settings.maintenance_message ?? ""); }, [settings.maintenance_message]);
  useEffect(() => {
    if (settings.site_reopen_at) {
      const d = new Date(settings.site_reopen_at);
      const off = d.getTime() - d.getTimezoneOffset() * 60000;
      setReopenLocal(new Date(off).toISOString().slice(0, 16));
    } else setReopenLocal("");
  }, [settings.site_reopen_at]);
  useEffect(() => {
    if (settings.admin_post_bg) setPostBg(settings.admin_post_bg);
    if (settings.admin_post_text) setPostText(settings.admin_post_text);
    if (settings.admin_comment_bg) setCommentBg(settings.admin_comment_bg);
    if (settings.admin_comment_text) setCommentText(settings.admin_comment_text);
  }, [settings.admin_post_bg, settings.admin_post_text, settings.admin_comment_bg, settings.admin_comment_text]);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  async function loadAll() {
    const [{ data: p, error: postsError }, { data: b, error: blocksError }, { data: a, error: adminsError }, { data: cm }, { data: hp }, { data: rp }] = await Promise.all([
      supabase.from("posts").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("blocked_devices").select("*").order("created_at", { ascending: false }),
      supabase.from("admin_devices").select("*").order("created_at", { ascending: false }),
      supabase.from("chat_messages").select("*").order("created_at", { ascending: false }).limit(50),
      (supabase.from("posts") as any).select("*").eq("hidden", true).order("created_at", { ascending: false }).limit(100),
      (supabase.from("reports") as any).select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if (postsError || blocksError || adminsError) {
      toast.error(postsError?.message || blocksError?.message || adminsError?.message || "تعذر تحميل لوحة الإدارة");
      return;
    }
    setPending(p ?? []);
    setBlocks(b ?? []);
    setAdmins(a ?? []);
    setChat(cm ?? []);
    setHiddenPosts(hp ?? []);
    setReports(rp ?? []);
  }

  useEffect(() => {
    if (!isAdmin) return;
    loadAll();
    const ch = supabase.channel("admin-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdmin]);

  if (loading || !adminChecked) {
    return <div className="min-h-screen bg-background"><Header /><p className="p-10 text-center text-muted-foreground">جاري التحقق...</p></div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <p className="p-10 text-center text-muted-foreground">ليس لديك صلاحية الوصول.</p>
      </div>
    );
  }

  async function approve(id: string) {
    const { error } = await supabase.from("posts").update({ status: "approved" }).eq("id", id);
    if (error) toast.error("فشل: " + error.message); else { toast.success("تم النشر"); loadAll(); }
  }

  async function reject(id: string) {
    if (!confirm("رفض وحذف المنشور؟")) return;
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) toast.error("فشل: " + error.message); else { toast.success("تم الرفض"); loadAll(); }
  }

  function addBlock() {
    if (!newBlockId.trim()) return;
    setBanTarget(newBlockId.trim());
  }

  async function unblock(id: string) {
    if (!confirm("رفع الحظر عن هذا الجهاز؟ سيتم مسح البصمة المرتبطة به.")) return;
    const { error } = await supabase.from("blocked_devices").delete().eq("device_id", id);
    if (error) toast.error("فشل: " + error.message); else { toast.success("تم رفع الحظر"); loadAll(); }
  }

  async function addAdmin() {
    if (!newAdminId.trim()) return;
    const { error } = await supabase.from("admin_devices").upsert({
      device_id: newAdminId.trim(),
      note: newAdminNote.trim() || null,
    });
    if (error) toast.error("فشل: " + error.message); else {
      toast.success("تمت إضافة الأدمن المساعد");
      setNewAdminId(""); setNewAdminNote(""); loadAll();
    }
  }

  async function removeAdmin(id: string) {
    if (!confirm("إزالة هذا الأدمن المساعد؟")) return;
    const { error } = await supabase.from("admin_devices").delete().eq("device_id", id);
    if (error) toast.error("فشل: " + error.message); else { toast.success("تم"); loadAll(); }
  }

  async function updateSettings(patch: Record<string, any>) {
    const { error } = await (supabase.from("site_settings") as any).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) toast.error("فشل: " + error.message); else { toast.success("تم"); reloadSettings(); }
  }

  async function saveReopen() {
    const iso = reopenLocal ? new Date(reopenLocal).toISOString() : null;
    await updateSettings({ site_reopen_at: iso });
  }

  async function saveAdminColors() {
    await updateSettings({
      admin_post_bg: postBg,
      admin_post_text: postText,
      admin_comment_bg: commentBg,
      admin_comment_text: commentText,
    });
  }

  async function clearAdminColors() {
    await updateSettings({ admin_post_bg: null, admin_post_text: null, admin_comment_bg: null, admin_comment_text: null });
  }

  async function unhidePost(id: string) {
    const { error } = await (supabase.from("posts") as any).update({ hidden: false }).eq("id", id);
    if (error) toast.error("فشل: " + error.message); else { toast.success("تم الإظهار"); loadAll(); }
  }

  async function delChatMsg(id: string) {
    if (!confirm("حذف الرسالة؟")) return;
    const { error } = await supabase.from("chat_messages").delete().eq("id", id);
    if (error) toast.error("فشل: " + error.message); else loadAll();
  }

  function blockFromChat(deviceId: string) {
    setBanTarget(deviceId);
  }

  async function resolveReport(id: string, action: "dismissed" | "resolved" | "content_deleted" | "ban_owner", note?: string) {
    if (action === "ban_owner") {
      const r = reports.find((x) => x.id === id);
      if (r?.content_owner_device_id) { setBanTarget(r.content_owner_device_id); }
      return;
    }
    const label = action === "content_deleted" ? "حذف المحتوى نهائياً؟" : null;
    if (label && !confirm(label)) return;
    const { error } = await (supabase.rpc as any)("admin_resolve_report", { p_report_id: id, p_action: action, p_note: note || null });
    if (error) toast.error("فشل: " + error.message); else { toast.success("تم"); loadAll(); }
  }

  const visibleReports = reportFilter === "open" ? reports.filter((r) => r.status === "open") : reports;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold">لوحة الإدارة</h1>

        <Tabs defaultValue="settings" className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="settings"><Settings className="h-3 w-3 ml-1" />الإعدادات</TabsTrigger>
            <TabsTrigger value="pending">للمراجعة ({pending.length})</TabsTrigger>
            <TabsTrigger value="reports"><Flag className="h-3 w-3 ml-1" />البلاغات ({reports.filter((r) => r.status === "open").length})</TabsTrigger>
            <TabsTrigger value="hidden">مخفي ({hiddenPosts.length})</TabsTrigger>
            <TabsTrigger value="chat"><MessageSquare className="h-3 w-3 ml-1" />الشات</TabsTrigger>
            <TabsTrigger value="blocks">المحظورون ({blocks.length})</TabsTrigger>
            <TabsTrigger value="admins">الأدمن ({admins.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="mt-4 space-y-4">
            <AdminProfileEditor />
            <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">تفعيل الموقع</Label>
                  <p className="text-xs text-muted-foreground">عند الإيقاف، يرى الزوار صفحة صيانة. الأدمن يبقى يدخل.</p>
                </div>
                <Switch checked={settings.site_enabled} onCheckedChange={(v) => updateSettings({ site_enabled: v })} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">رسالة الصيانة</Label>
                <Textarea value={maintMsg} onChange={(e) => setMaintMsg(e.target.value)} placeholder="نعمل على صيانة الموقع..." className="min-h-[60px]" />
                <Button size="sm" onClick={() => updateSettings({ maintenance_message: maintMsg.trim() || null })}>حفظ الرسالة</Button>
              </div>
              <div className="space-y-2 border-t border-border pt-3">
                <Label className="text-sm">موعد إعادة الفتح (عدّاد تنازلي للمستخدمين)</Label>
                <p className="text-xs text-muted-foreground">حدد وقت وتاريخ إعادة فتح الموقع. سيظهر عداد تنازلي لكل الزوار.</p>
                <div className="flex flex-wrap gap-2">
                  <Input type="datetime-local" value={reopenLocal} onChange={(e) => setReopenLocal(e.target.value)} className="max-w-[220px]" />
                  <Button size="sm" onClick={saveReopen}>حفظ الموعد</Button>
                  {settings.site_reopen_at && (
                    <Button size="sm" variant="ghost" onClick={() => { setReopenLocal(""); updateSettings({ site_reopen_at: null }); }}>إلغاء الموعد</Button>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div>
                <Label className="text-base">ألوان الأدمن الافتراضية</Label>
                <p className="text-xs text-muted-foreground">هذه الألوان تُطبَّق تلقائياً على كل منشور/تعليق تكتبه كأدمن. تُحفظ مرة واحدة.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-xs">خلفية المنشور</Label>
                  <input type="color" value={postBg} onChange={(e) => setPostBg(e.target.value)} className="h-9 w-full rounded border border-border" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">نص المنشور</Label>
                  <input type="color" value={postText} onChange={(e) => setPostText(e.target.value)} className="h-9 w-full rounded border border-border" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">خلفية التعليق</Label>
                  <input type="color" value={commentBg} onChange={(e) => setCommentBg(e.target.value)} className="h-9 w-full rounded border border-border" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">نص التعليق</Label>
                  <input type="color" value={commentText} onChange={(e) => setCommentText(e.target.value)} className="h-9 w-full rounded border border-border" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: postBg, color: postText }}>معاينة منشور الأدمن</div>
                <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: commentBg, color: commentText }}>معاينة تعليق الأدمن</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveAdminColors}>حفظ الألوان</Button>
                <Button size="sm" variant="ghost" onClick={clearAdminColors}>مسح (استخدم الافتراضي)</Button>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base flex items-center gap-1"><MessageSquare className="h-4 w-4" /> الشات التفاعلي</Label>
                  <p className="text-xs text-muted-foreground">عند التفعيل، تختفي صفحة المنشورات ويظهر الشات بدلاً منها.</p>
                </div>
                <Switch checked={settings.chat_mode_enabled} onCheckedChange={(v) => updateSettings({ chat_mode_enabled: v })} />
              </div>
            </section>
          </TabsContent>

          <TabsContent value="hidden" className="mt-4 space-y-3">
            {hiddenPosts.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">لا منشورات مخفية.</p>}
            {hiddenPosts.map((h) => (
              <div key={h.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Ghost className="h-3 w-3" /> مجهول {h.anon_number ?? "?"}</span>
                  <span>{timeAgo(h.created_at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{h.content}</p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="sm" onClick={() => unhidePost(h.id)}>إظهار</Button>
                </div>
              </div>
            ))}
          </TabsContent>


          <TabsContent value="chat" className="mt-4 space-y-3">
            {chat.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">لا رسائل شات.</p>}
            {chat.map((m) => (
              <div key={m.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{m.display_name}</span>
                  <span>{timeAgo(m.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{m.content}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-muted-foreground" title={m.device_id}>ID: {m.device_id.slice(0, 14)}…</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => delChatMsg(m.id)}><Trash2 className="h-3 w-3" /></Button>
                    <Button size="sm" variant="destructive" onClick={() => blockFromChat(m.device_id)}><Ban className="h-3 w-3 ml-1" />حظر</Button>
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>


          <TabsContent value="pending" className="mt-4 space-y-3">
            {pending.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">لا منشورات بانتظار المراجعة.</p>}
            {pending.map((p) => (
              <PendingCard key={p.id} p={p} onApprove={approve} onReject={reject} />
            ))}
          </TabsContent>

          <TabsContent value="reports" className="mt-4 space-y-3">
            <div className="flex gap-2">
              <Button size="sm" variant={reportFilter === "open" ? "default" : "outline"} onClick={() => setReportFilter("open")}>
                المفتوحة ({reports.filter((r) => r.status === "open").length})
              </Button>
              <Button size="sm" variant={reportFilter === "all" ? "default" : "outline"} onClick={() => setReportFilter("all")}>
                الكل ({reports.length})
              </Button>
            </div>
            {visibleReports.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">لا بلاغات.</p>}
            {visibleReports.map((r) => (
              <ReportCard key={r.id} r={r} onResolve={resolveReport} />
            ))}
          </TabsContent>




          <TabsContent value="blocks" className="mt-4 space-y-4">
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-semibold">حظر يدوي</h2>
              <div className="mt-3 flex gap-2">
                <Input value={newBlockId} onChange={(e) => setNewBlockId(e.target.value)} placeholder="معرف الجهاز" />
                <Button onClick={addBlock}>حظر</Button>
              </div>
            </section>
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-semibold">الأجهزة المحظورة</h2>
              <div className="mt-3 space-y-2">
                {blocks.length === 0 && <p className="text-sm text-muted-foreground">لا يوجد.</p>}
                {blocks.map((b) => {
                  const expired = b.expires_at && new Date(b.expires_at).getTime() <= Date.now();
                  return (
                    <div key={b.device_id} className="space-y-1 rounded-lg bg-muted/40 p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs">{b.device_id}</span>
                        <Button size="sm" variant="ghost" onClick={() => unblock(b.device_id)} title="رفع الحظر">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {b.reason && <div className="text-xs text-muted-foreground"><b>السبب:</b> {b.reason}</div>}
                      {b.expires_at && (
                        <div className={`text-[10px] ${expired ? "text-emerald-600" : "text-amber-600"}`}>
                          {expired ? "انتهت المدة" : `ينتهي: ${new Date(b.expires_at).toLocaleString("ar")}`}
                        </div>
                      )}
                      {b.evidence_url && (
                        <a href={b.evidence_url} target="_blank" rel="noreferrer" className="inline-block">
                          <img src={b.evidence_url} alt="دليل" className="mt-1 h-16 rounded border border-border object-cover" />
                        </a>
                      )}
                      <div className="text-[10px] text-muted-foreground">
                        الصورة {b.evidence_visible === false ? "مخفية عن المحظور" : "ظاهرة للمحظور"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="admins" className="mt-4 space-y-4">
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-1 font-semibold"><ShieldPlus className="h-4 w-4" /> إضافة أدمن مساعد بمعرف جهاز</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                منشورات الجهاز المضاف ستُنشر مباشرة دون مراجعة. يمكنه أيضاً اختيار اسم ظاهر له.
              </p>
              <div className="mt-3 space-y-2">
                <Input value={newAdminId} onChange={(e) => setNewAdminId(e.target.value)} placeholder="معرف الجهاز" />
                <Input value={newAdminNote} onChange={(e) => setNewAdminNote(e.target.value)} placeholder="ملاحظة (اختياري)" />
                <Button onClick={addAdmin} className="w-full">إضافة</Button>
              </div>
            </section>
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-semibold">الأدمن المساعدون</h2>
              <div className="mt-3 space-y-2">
                {admins.length === 0 && <p className="text-sm text-muted-foreground">لا يوجد.</p>}
                {admins.map((a) => (
                  <div key={a.device_id} className="flex items-center justify-between rounded-lg bg-muted/40 p-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs">{a.device_id}</div>
                      {a.note && <div className="text-xs text-muted-foreground">{a.note}</div>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeAdmin(a.device_id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                لمعرفة معرف الجهاز: اطلب من الشخص فتح الموقع، ثم في الصفحة الرئيسية يجد معرفه أسفل المنشور إذا كنت أنت مسؤول، أو افتح أدوات المطور وانسخ قيمة <code className="font-mono">anon_device_id</code> من localStorage.
              </p>
            </section>
          </TabsContent>
        </Tabs>
        {banTarget && (
          <BanDialog
            deviceId={banTarget}
            open={!!banTarget}
            onOpenChange={(o) => { if (!o) setBanTarget(null); }}
            onBanned={() => { setNewBlockId(""); loadAll(); }}
          />
        )}
      </main>
    </div>
  );
}
