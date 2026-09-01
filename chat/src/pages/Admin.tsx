import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Shield, Ban, Trash2, Plus, Users, MessageCircle, BarChart3, Edit2, Archive, Lock, AlertTriangle, Search, Layers, Flag, UserMinus, ShieldCheck, Key, Activity, Clock, KeyRound, Copy, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Navigate, Link } from "react-router-dom";
import RoundsBadge from "@/components/RoundsBadge";
import { formatDisplayName, FIELD_LABEL_AR, FIELD_PREFIX, FIELD_ADMIN_ONLY } from "@/lib/displayName";
import BanDialog from "@/components/BanDialog";
import RolesDialog from "@/components/RolesDialog";
import PermissionsPanel from "@/components/PermissionsPanel";
import AdminReportsPanel from "@/components/AdminReportsPanel";
import ActivityPanel from "@/components/ActivityPanel";

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  is_banned: boolean;
  chat_banned?: boolean;
  timeout_until?: string | null;
  generation?: string | null;
  field?: string | null;
}

interface UserRole {
  user_id: string;
  role: string;
}

type Tab = "stats" | "users" | "staff" | "banned" | "reports" | "words" | "deleted" | "sections" | "permissions" | "audit" | "pending" | "codes";

const Admin = () => {
  const { isAdmin, isModerator, isSupervisor, hasPermission, user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [bannedWords, setBannedWords] = useState<{ id: string; word: string }[]>([]);
  const [newWord, setNewWord] = useState("");
  const [tab, setTab] = useState<Tab>("stats");
  const [renameUserId, setRenameUserId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [fieldUserId, setFieldUserId] = useState<string | null>(null);
  const [newField, setNewField] = useState<string | null>(null);
  const [deletedPosts, setDeletedPosts] = useState<any[]>([]);
  const [deletedComments, setDeletedComments] = useState<any[]>([]);
  const [warnUser, setWarnUser] = useState<string | null>(null);
  const [warnReason, setWarnReason] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [genFilter, setGenFilter] = useState<"all" | "09" | "10">("all");
  const [sectionLocks, setSectionLocks] = useState<Record<string, any>>({});
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [pendingReports, setPendingReports] = useState(0);
  const [banDialogUser, setBanDialogUser] = useState<string | null>(null);
  const [rolesDialogUser, setRolesDialogUser] = useState<{ id: string; name: string } | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const [channelSettings, setChannelSettings] = useState<Record<string, boolean>>({ all: true, male: true, female: true, "09": true, "10": true });
  const [pendingPosts, setPendingPosts] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [accessCodes, setAccessCodes] = useState<any[]>([]);
  const [newCodeUses, setNewCodeUses] = useState("1");
  const [newCodeDuration, setNewCodeDuration] = useState("24");
  const [newCodeMessage, setNewCodeMessage] = useState("");
  const [creatingCode, setCreatingCode] = useState(false);

  const canManageWords = hasPermission("can_manage_words");
  const canLockSections = hasPermission("can_lock_sections");
  const canManageReports = hasPermission("can_manage_reports");
  const canWarn = hasPermission("can_warn");
  const canBanUsers = hasPermission("can_ban_users");
  const canTimeout = hasPermission("can_timeout");

  const logAction = async (action_type: string, target_user_id: string | null, details: string) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await (supabase as any).from("admin_actions").insert({
      admin_id: u.user.id, target_user_id, action_type, details,
    });
  };

  const fetchAuditLog = async () => {
    const { data } = await (supabase as any)
      .from("admin_actions").select("*").order("created_at", { ascending: false }).limit(200);
    if (!data) { setAuditLog([]); return; }
    const ids = Array.from(new Set([...data.map((d: any) => d.admin_id), ...data.map((d: any) => d.target_user_id).filter(Boolean)])) as string[];
    const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
    const map: Record<string, string> = {};
    (profs || []).forEach((p: any) => { map[p.user_id] = p.full_name; });
    setAuditLog(data.map((d: any) => ({ ...d, admin_name: map[d.admin_id] || "—", target_name: d.target_user_id ? (map[d.target_user_id] || "—") : null })));
  };

  const hardDeletePost = async (postId: string) => {
    if (!confirm("حذف نهائي؟ هذا لا يمكن التراجع عنه.")) return;
    const { error } = await (supabase as any).rpc("hard_delete_post", { _post_id: postId });
    if (error) { toast.error("فشل الحذف"); return; }
    toast.success("تم الحذف نهائياً");
    logAction("hard_delete_post", null, `post:${postId}`);
    fetchDeleted();
  };
  const hardDeleteComment = async (commentId: string) => {
    if (!confirm("حذف نهائي؟")) return;
    const { error } = await (supabase as any).rpc("hard_delete_comment", { _comment_id: commentId });
    if (error) { toast.error("فشل الحذف"); return; }
    toast.success("تم الحذف نهائياً");
    logAction("hard_delete_comment", null, `comment:${commentId}`);
    fetchDeleted();
  };

  const fetchPendingPosts = async () => {
    if (!(isAdmin || isModerator)) return;
    const { data } = await (supabase.from("posts") as any)
      .select("id, content, image_url, image_urls, video_url, user_id, created_at, status, reviewed_by, reviewed_at, profiles!posts_user_id_profiles_fkey(full_name, avatar_url)")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (data) { setPendingPosts(data); setPendingCount(data.length); }
  };

  useEffect(() => {
    if (isAdmin || isModerator || isSupervisor) {
      fetchUsers();
      fetchUserRoles();
      if (isAdmin) { fetchBannedWords(); fetchDeleted(); fetchSectionLocks(); fetchChannelSettings(); fetchAccessCodes(); }
      (supabase as any).from("post_reports").select("*", { count: "exact", head: true }).eq("status", "pending").then((r: any) => setPendingReports(r.count || 0));
    }
    if (isAdmin || isModerator) fetchPendingPosts();
  }, [isAdmin, isModerator, isSupervisor]);

  useEffect(() => {
    if (!(isAdmin || isModerator)) return;
    const channel = (supabase as any)
      .channel("admin-pending-posts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts", filter: "status=eq.pending" }, () => fetchPendingPosts())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "posts", filter: "status=eq.pending" }, () => fetchPendingPosts())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts", filter: "status=eq.pending" }, () => fetchPendingPosts())
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [isAdmin, isModerator]);

  const approvePost = async (postId: string) => {
    const { error } = await (supabase.from("posts") as any)
      .update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", postId);
    if (error) { toast.error("فشل الموافقة"); return; }
    toast.success("تمت الموافقة على المنشور");
    logAction("approve_post", null, `post:${postId}`);
    fetchPendingPosts();
  };

  const rejectPost = async (postId: string) => {
    if (!confirm("حذف المنشور المرفوض نهائياً؟")) return;
    const { error } = await (supabase.from("posts") as any).delete().eq("id", postId);
    if (error) { toast.error("فشل الرفض"); return; }
    toast.success("تم رفض وحذف المنشور");
    logAction("reject_post", null, `post:${postId}`);
    fetchPendingPosts();
  };

  const fetchChannelSettings = async () => {
    const { data } = await supabase.from("channel_settings" as any).select("*");
    if (data) {
      const map: Record<string, boolean> = { all: true, male: true, female: true, "09": true, "10": true };
      (data as any[]).forEach((r: any) => { map[r.channel] = r.enabled; });
      setChannelSettings(map);
    }
  };

  const toggleChannel = async (ch: string, enabled: boolean) => {
    const { data, error } = await (supabase as any)
      .from("channel_settings")
      .upsert({ channel: ch, enabled, updated_at: new Date().toISOString() }, { onConflict: "channel" });
    if (error) {
      console.error("toggleChannel error:", error);
      toast.error("فشل الحفظ: " + (error.message || error.details || "خطأ غير معروف"));
      return;
    }
    setChannelSettings(prev => ({ ...prev, [ch]: enabled }));
    toast.success(enabled ? "تم تفعيل القناة" : "تم تعطيل القناة");
  };

  const toggleSelect = (uid: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });
  };
  const executeMassDelete = async () => {
    if (deleteConfirm !== "حذف") { toast.error("اكتب كلمة 'حذف' بالضبط للتأكيد"); return; }
    const ids = Array.from(selectedIds);
    let ok = 0, fail = 0;
    for (const uid of ids) {
      const { error } = await (supabase as any).rpc("admin_delete_user", { _user_id: uid });
      if (error) fail++; else { ok++; logAction("delete_user", uid, ""); }
    }
    toast.success(`حُذف ${ok} مستخدم${fail ? ` — فشل ${fail}` : ""}`);
    setSelectedIds(new Set()); setDeleteStep(0); setDeleteConfirm("");
    fetchUsers();
  };

  const fetchSectionLocks = async () => {
    const { data } = await (supabase as any).from("section_locks").select("*");
    const map: Record<string, any> = {};
    (data || []).forEach((l: any) => { map[l.section] = l; });
    setSectionLocks(map);
  };
  const saveSectionLock = async (section: string, patch: any) => {
    const { error } = await (supabase as any).from("section_locks").upsert(
      { section, updated_at: new Date().toISOString(), ...patch }, { onConflict: "section" }
    );
    if (error) toast.error("فشل الحفظ"); else { toast.success("تم الحفظ"); fetchSectionLocks(); }
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
    if (data) setUsers(data);
  };
  const fetchDeleted = async () => {
    const { data: posts } = await (supabase.from("posts") as any)
      .select("id, content, image_url, video_url, user_id, created_at, deleted_at, deleted_by, profiles!posts_user_id_profiles_fkey(full_name, avatar_url)")
      .not("deleted_at", "is", null).not("deleted_by", "is", null)
      .order("deleted_at", { ascending: false }).limit(100);
    const postIds = (posts || []).map((p: any) => p.id);
    let postsWithComments = posts || [];
    if (postIds.length > 0) {
      const { data: cmts } = await (supabase.from("comments") as any)
        .select("id, content, user_id, post_id, created_at, deleted_at, profiles!comments_user_id_profiles_fkey(full_name, avatar_url)")
        .in("post_id", postIds).order("created_at", { ascending: true });
      postsWithComments = (posts || []).map((p: any) => ({
        ...p, comments: (cmts || []).filter((c: any) => c.post_id === p.id),
      }));
    }
    setDeletedPosts(postsWithComments);
    const { data: comments } = await (supabase.from("comments") as any)
      .select("id, content, user_id, post_id, created_at, deleted_at, deleted_by, profiles!comments_user_id_profiles_fkey(full_name, avatar_url)")
      .not("deleted_at", "is", null).not("deleted_by", "is", null)
      .order("deleted_at", { ascending: false }).limit(100);
    setDeletedComments(comments || []);
  };
  const fetchUserRoles = async () => {
    const { data } = await supabase.from("user_roles").select("user_id, role");
    if (data) setUserRoles(data);
  };
  const fetchBannedWords = async () => {
    const { data } = await supabase.from("banned_words").select("*").order("word");
    if (data) setBannedWords(data);
  };

  const fetchAccessCodes = async () => {
    const { data } = await (supabase as any).rpc("list_access_codes");
    if (data) setAccessCodes(data);
  };
  const createAccessCode = async () => {
    const uses = parseInt(newCodeUses, 10);
    const hours = parseInt(newCodeDuration, 10);
    if (!uses || uses < 1) { toast.error("عدد الاستخدامات غير صحيح"); return; }
    if (!hours || hours < 1) { toast.error("مدة الصلاحية غير صحيحة"); return; }
    setCreatingCode(true);
    const { data, error } = await (supabase as any).rpc("create_access_code", {
      p_max_uses: uses,
      p_duration_hours: hours,
      p_message: newCodeMessage.trim(),
    });
    setCreatingCode(false);
    if (error) { console.error("create_access_code error", error); toast.error("فشل إنشاء الكود: " + (error.message || "")); return; }
    toast.success("تم إنشاء الكود بنجاح");
    setNewCodeUses("1"); setNewCodeDuration("24"); setNewCodeMessage("");
    fetchAccessCodes();
  };
  const revokeAccessCode = async (id: string) => {
    if (!confirm("إلغاء هذا الكود؟ لن يتمكن أحد من استخدامه بعد الآن.")) return;
    const { error } = await (supabase as any).rpc("revoke_access_code", { p_id: id });
    if (error) toast.error("فشل إلغاء الكود");
    else { toast.success("تم إلغاء الكود"); fetchAccessCodes(); }
  };
  const copyCode = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("تم نسخ الكود: " + text); }
    catch { toast.error("تعذر النسخ"); }
  };

  const userRolesFor = (uid: string) => userRoles.filter(r => r.user_id === uid).map(r => r.role);
  const hasAnyStaffRole = (uid: string) => userRolesFor(uid).some(r => ["admin", "moderator", "supervisor"].includes(r));

  const handleRenameUser = async () => {
    if (!renameUserId || !newName.trim()) return;
    const { error } = await supabase.from("profiles").update({ full_name: newName.trim() }).eq("user_id", renameUserId);
    if (error) toast.error("فشل تغيير الاسم");
    else { toast.success("تم تغيير الاسم"); logAction("rename", renameUserId, `→ ${newName.trim()}`); setRenameUserId(null); setNewName(""); fetchUsers(); }
  };

  const toggleUserGender = async (uid: string, currentGender: string | null) => {
    const newGender = currentGender === "male" ? "female" : "male";
    const { error } = await supabase.from("profiles").update({ gender: newGender } as any).eq("user_id", uid);
    if (error) toast.error("فشل تغيير الجنس");
    else { toast.success(`تم تغيير الجنس إلى ${newGender === "male" ? "ذكر" : "أنثى"}`); logAction("change_gender", uid, `→ ${newGender}`); fetchUsers(); }
  };

  const setUserTheme = async (uid: string, newTheme: string) => {
    const { error } = await supabase.from("profiles").update({ theme: newTheme } as any).eq("user_id", uid);
    if (error) toast.error("فشل تغيير الثيم");
    else { toast.success(`تم تغيير الثيم`); logAction("change_theme", uid, `→ ${newTheme}`); fetchUsers(); }
  };

  const handleChangeField = async () => {
    if (!fieldUserId) return;
    const { error } = await supabase.from("profiles").update({ field: newField } as any).eq("user_id", fieldUserId);
    if (error) toast.error(`فشل تغيير التخصص: ${(error as any).message || JSON.stringify(error)}`);
    else {
      toast.success(newField ? `تم تعيين التخصص: ${FIELD_LABEL_AR[newField]}` : "تم إزالة التخصص");
      logAction("change_field", fieldUserId, newField ? `→ ${newField}` : "→ (بدون تخصص)");
      setFieldUserId(null); setNewField(null); fetchUsers();
    }
  };
  const addBannedWord = async () => {
    if (!newWord.trim()) return;
    const { error } = await supabase.from("banned_words").insert({ word: newWord.trim().toLowerCase() });
    if (error) toast.error("فشل"); else { logAction("add_banned_word", null, newWord.trim()); setNewWord(""); fetchBannedWords(); }
  };
  const removeBannedWord = async (id: string) => {
    const w = bannedWords.find(x => x.id === id)?.word;
    await supabase.from("banned_words").delete().eq("id", id);
    logAction("remove_banned_word", null, w || id); fetchBannedWords();
  };
  const sendWarning = async () => {
    if (!warnUser || !warnReason.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("user_warnings").insert({
      user_id: warnUser, issued_by: u.user?.id, reason: warnReason.trim(),
    });
    if (error) toast.error("فشل"); else { toast.success("تم إرسال التحذير"); logAction("warn", warnUser, warnReason.trim()); setWarnUser(null); setWarnReason(""); }
  };
  const clearTimeout_ = async (uid: string) => {
    await supabase.from("profiles").update({ timeout_until: null } as any).eq("user_id", uid);
    toast.success("تم رفع التايم اوت"); logAction("clear_timeout", uid, ""); fetchUsers();
  };
  const toggleChatBan = async (uid: string, current: boolean) => {
    const { error } = await supabase.from("profiles").update({ chat_banned: !current } as any).eq("user_id", uid);
    if (error) toast.error("فشل"); else { toast.success(current ? "تم رفع حظر الشات" : "تم الحظر"); logAction(current ? "unban_chat" : "ban_chat", uid, ""); fetchUsers(); }
  };
  const toggleBan = async (uid: string, current: boolean) => {
    const { error } = await supabase.from("profiles").update({ is_banned: !current }).eq("user_id", uid);
    if (error) toast.error("فشل"); else { toast.success(current ? "تم الرفع" : "تم الحظر"); logAction(current ? "unban" : "ban", uid, ""); fetchUsers(); }
  };

  if (!isAdmin && !isModerator && !isSupervisor) return <Navigate to="/" replace />;

  const totalUsers = users.length;
  const bannedUsers = users.filter(u => u.is_banned).length;
  const activeUsers = totalUsers - bannedUsers;
  const staffCount = userRoles.filter(r => ["admin", "moderator", "supervisor"].includes(r.role)).length;

  const displayedUsers = users.filter(u => {
    if (hasAnyStaffRole(u.user_id)) return false;
    if (userSearch && !u.full_name?.toLowerCase().includes(userSearch.toLowerCase())) return false;
    if (genFilter !== "all" && u.generation !== genFilter) return false;
    return true;
  });

  const staffUsers = users.filter(u => hasAnyStaffRole(u.user_id));

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">{isAdmin ? "لوحة الإدارة" : isModerator ? "لوحة المشرف" : "لوحة المسؤول"}</h1>
      </div>

      {isAdmin && (
        <div className="mb-4">
          <Button variant={showActivity ? "default" : "outline"} onClick={() => setShowActivity(!showActivity)} className="gap-2 w-full">
            <Activity className="w-4 h-4" />
            {showActivity ? "إخفاء النشاط والمتصلين" : "عرض النشاط والمتصلين"}
          </Button>
        </div>
      )}

      {isAdmin && showActivity && (
        <div className="mb-4">
          <ActivityPanel onClose={() => setShowActivity(false)} />
        </div>
      )}

      <Link to="/staff-meeting" className="block mb-4">
        <Button variant="secondary" className="w-full gap-2">
          <Lock className="w-4 h-4" /> فتح اجتماع الإدارة
        </Button>
      </Link>

      <div className="flex gap-2 mb-6 flex-wrap">
        <Button variant={tab === "stats" ? "default" : "outline"} onClick={() => setTab("stats")} className="gap-1"><BarChart3 className="w-4 h-4" /> الإحصائيات</Button>
        <Button variant={tab === "users" ? "default" : "outline"} onClick={() => setTab("users")} className="gap-1"><Users className="w-4 h-4" /> المستخدمين</Button>
        <Button variant={tab === "staff" ? "default" : "outline"} onClick={() => setTab("staff")} className="gap-1"><ShieldCheck className="w-4 h-4" /> الإدارة والمشرفين</Button>
        <Button variant={tab === "banned" ? "default" : "outline"} onClick={() => setTab("banned")} className="gap-1"><Ban className="w-4 h-4" /> المحظورين</Button>
        {(canManageReports || isAdmin) && (
          <Button variant={tab === "reports" ? "default" : "outline"} onClick={() => setTab("reports")} className="gap-1 relative">
            <Flag className="w-4 h-4" /> البلاغات
            {pendingReports > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {pendingReports > 99 ? "99+" : pendingReports}
              </span>
            )}
          </Button>
        )}
        {isAdmin && <Button variant={tab === "permissions" ? "default" : "outline"} onClick={() => setTab("permissions")} className="gap-1"><Key className="w-4 h-4" /> الصلاحيات</Button>}
        {isAdmin && <Button variant={tab === "codes" ? "default" : "outline"} onClick={() => setTab("codes")} className="gap-1"><KeyRound className="w-4 h-4" /> أكواد الدخول</Button>}
        {(canManageWords || isAdmin) && <Button variant={tab === "words" ? "default" : "outline"} onClick={() => setTab("words")} className="gap-1"><MessageCircle className="w-4 h-4" /> الكلمات المحظورة</Button>}
        {isAdmin && <Button variant={tab === "deleted" ? "default" : "outline"} onClick={() => setTab("deleted")} className="gap-1"><Archive className="w-4 h-4" /> المحذوفات</Button>}
        {(canLockSections || isAdmin) && <Button variant={tab === "sections" ? "default" : "outline"} onClick={() => setTab("sections")} className="gap-1"><Layers className="w-4 h-4" /> الأقسام</Button>}
        <Button variant={tab === "audit" ? "default" : "outline"} onClick={() => { setTab("audit"); fetchAuditLog(); }} className="gap-1"><Archive className="w-4 h-4" /> سجل الإدارة</Button>
        {(isAdmin || isModerator) && (
          <Button variant={tab === "pending" ? "default" : "outline"} onClick={() => setTab("pending")} className="gap-1 relative">
            <Clock className="w-4 h-4" /> للمراجعة
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </Button>
        )}
      </div>

      {tab === "stats" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-primary">{totalUsers}</p><p className="text-sm text-muted-foreground mt-1">إجمالي المستخدمين</p></CardContent></Card>
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-green-500">{activeUsers}</p><p className="text-sm text-muted-foreground mt-1">نشط</p></CardContent></Card>
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-destructive">{bannedUsers}</p><p className="text-sm text-muted-foreground mt-1">محظور</p></CardContent></Card>
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-amber-500">{staffCount}</p><p className="text-sm text-muted-foreground mt-1">فريق الإدارة</p></CardContent></Card>
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="بحث..." className="pr-9" />
            </div>
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {[{k:"all",l:"الكل"},{k:"09",l:"09"},{k:"10",l:"10"}].map(o => (
                <button key={o.k} onClick={() => setGenFilter(o.k as any)} className={`text-xs px-3 py-1 rounded-md ${genFilter===o.k ? "bg-primary text-primary-foreground" : ""}`}>{o.l}</button>
              ))}
            </div>
          </div>
          {isAdmin && selectedIds.size > 0 && (
            <Card className="border-destructive">
              <CardContent className="py-3 flex items-center justify-between">
                <span className="text-sm font-medium">محدد: <b>{selectedIds.size}</b> مستخدم</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>إلغاء التحديد</Button>
                  <Button size="sm" variant="destructive" className="gap-1" onClick={() => setDeleteStep(1)}>
                    <UserMinus className="w-4 h-4" /> حذف نهائي
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {(() => {
            const now = Date.now();
            const DAY = 86400000;
            const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
            const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
            const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
            const times = users.map(u => new Date((u as any).created_at).getTime()).filter(t => !isNaN(t));
            const today = times.filter(t => t >= startOfToday.getTime()).length;
            const last24h = times.filter(t => now - t <= DAY).length;
            const week = times.filter(t => t >= startOfWeek.getTime()).length;
            const month = times.filter(t => t >= startOfMonth.getTime()).length;
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Card><CardContent className="py-3 text-center"><p className="text-2xl font-bold text-primary">{today}</p><p className="text-[11px] text-muted-foreground mt-0.5">مستخدمون اليوم</p></CardContent></Card>
                <Card><CardContent className="py-3 text-center"><p className="text-2xl font-bold text-primary">{last24h}</p><p className="text-[11px] text-muted-foreground mt-0.5">آخر 24 ساعة</p></CardContent></Card>
                <Card><CardContent className="py-3 text-center"><p className="text-2xl font-bold text-primary">{week}</p><p className="text-[11px] text-muted-foreground mt-0.5">هذا الأسبوع</p></CardContent></Card>
                <Card><CardContent className="py-3 text-center"><p className="text-2xl font-bold text-primary">{month}</p><p className="text-[11px] text-muted-foreground mt-0.5">هذا الشهر</p></CardContent></Card>
              </div>
            );
          })()}
          <p className="text-xs text-muted-foreground">
            📌 المستخدمين فقط. لعرض المشرفين/المسؤولين استخدم تبويب "الإدارة والمشرفين".
          </p>
          {[...displayedUsers].reverse().map((u, idx) => {
            const number = displayedUsers.length - idx;
            const selected = selectedIds.has(u.user_id);
            const inTimeout = u.timeout_until && new Date(u.timeout_until) > new Date();
            return (
              <Card key={u.id} className={selected ? "ring-2 ring-destructive" : ""}>
                <CardContent className="flex items-center justify-between py-3 gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    {isAdmin && (
                      <input type="checkbox" checked={selected} onChange={() => toggleSelect(u.user_id)} className="w-4 h-4 shrink-0" />
                    )}
                    <span className="text-sm font-bold text-muted-foreground bg-muted rounded-full w-7 h-7 flex items-center justify-center shrink-0">{number}</span>
                    <div>
                      <p className="font-medium flex items-center gap-1">
                        {formatDisplayName(u)}
                        <RoundsBadge userId={u.user_id} />
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        {u.generation && <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono">{u.generation}</span>}
                        {u.field && <span className="bg-muted rounded px-1.5 py-0.5">{FIELD_LABEL_AR[u.field]}</span>}
                        {u.is_banned ? "🚫 محظور" : u.chat_banned ? "🔇 محظور شات" : "✅ نشط"}
                        {inTimeout && <span className="text-amber-500">⏱ حتى {new Date(u.timeout_until!).toLocaleTimeString("ar")}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => toggleUserGender(u.user_id, (u as any).gender)} className="gap-1" title="تغيير الجنس">
                        {(u as any).gender === "male" ? "♂ ذكر" : (u as any).gender === "female" ? "♀ أنثى" : "؟"}
                      </Button>
                    )}
                    {isAdmin && (
                      <div className="flex gap-0.5">
                        {(["light", "dark", "blue", "pink"] as const).map(t => (
                          <Button key={t} variant="ghost" size="sm" onClick={() => setUserTheme(u.user_id, t)}
                            className={`px-1.5 py-0.5 h-auto text-[10px] ${(u as any).theme === t ? "bg-primary/20 text-primary font-bold" : "text-muted-foreground"}`}
                            title={`ثيم ${t}`}>
                            {t === "light" ? "☀️" : t === "dark" ? "🌙" : t === "blue" ? "💙" : "🩷"}
                          </Button>
                        ))}
                      </div>
                    )}
                    {isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => { setRenameUserId(u.user_id); setNewName(u.full_name); }} className="gap-1" title="تغيير الاسم">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => { setFieldUserId(u.user_id); setNewField(u.field ?? null); }} className="gap-1" title="تغيير التخصص">
                        <Layers className="w-4 h-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="outline" size="sm" onClick={() => setRolesDialogUser({ id: u.user_id, name: u.full_name })} className="gap-1">
                        <ShieldCheck className="w-4 h-4" /> الرتب
                      </Button>
                    )}
                    {canWarn && (
                      <Button variant="outline" size="sm" onClick={() => setWarnUser(u.user_id)} className="gap-1" title="تحذير">
                        <AlertTriangle className="w-4 h-4" /> تحذير
                      </Button>
                    )}
                    {(canBanUsers || canTimeout || isAdmin) && (
                      <Button variant="destructive" size="sm" onClick={() => setBanDialogUser(u.user_id)} className="gap-1">
                        <Ban className="w-4 h-4" /> الحظر
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {displayedUsers.length === 0 && (
            <p className="text-center text-muted-foreground py-8">لا توجد نتائج</p>
          )}
        </div>
      )}

      {tab === "staff" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">قائمة أعضاء فريق الإدارة (أدمن / مشرف / مسؤول / مسؤول جولات).</p>
          {staffUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد أعضاء في فريق الإدارة بعد.</p>
          ) : staffUsers.map(u => {
            const rs = userRolesFor(u.user_id);
            return (
              <Card key={u.id}>
                <CardContent className="py-3 flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-medium">{formatDisplayName(u)}</p>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {rs.includes("admin") && <span className="text-xs bg-primary text-primary-foreground rounded px-2 py-0.5">👑 أدمن</span>}
                      {rs.includes("moderator") && <span className="text-xs bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded px-2 py-0.5">🛡️ مشرف</span>}
                      {rs.includes("supervisor") && <span className="text-xs bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded px-2 py-0.5">🧑‍💼 مسؤول</span>}
                      {rs.includes("rounds_manager") && <span className="text-xs bg-green-500/20 text-green-600 dark:text-green-400 rounded px-2 py-0.5">📚 مسؤول جولات</span>}
                    </div>
                  </div>
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={() => setRolesDialogUser({ id: u.user_id, name: u.full_name })} className="gap-1">
                      <ShieldCheck className="w-4 h-4" /> تعديل الرتب
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "banned" && (
        <div className="space-y-2">
          {users.filter(u => u.is_banned || u.chat_banned || (u.timeout_until && new Date(u.timeout_until) > new Date())).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد مستخدمين محظورين حالياً</p>
          ) : users.filter(u => u.is_banned || u.chat_banned || (u.timeout_until && new Date(u.timeout_until) > new Date())).map(u => (
            <Card key={u.id}>
              <CardContent className="py-3 flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="font-medium">{formatDisplayName(u)}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.is_banned && "🚫 محظور كامل "}
                    {u.chat_banned && "🔇 محظور شات "}
                    {u.timeout_until && new Date(u.timeout_until) > new Date() && `⏱ حتى ${new Date(u.timeout_until).toLocaleString("ar")}`}
                  </p>
                </div>
                {(isAdmin || canBanUsers || canTimeout) && (
                  <div className="flex gap-1 flex-wrap">
                    {u.is_banned && canBanUsers && <Button size="sm" variant="outline" onClick={() => toggleBan(u.user_id, true)}>رفع الحظر</Button>}
                    {u.chat_banned && canBanUsers && <Button size="sm" variant="outline" onClick={() => toggleChatBan(u.user_id, true)}>رفع حظر الشات</Button>}
                    {u.timeout_until && new Date(u.timeout_until) > new Date() && canTimeout && <Button size="sm" variant="outline" onClick={() => clearTimeout_(u.user_id)}>رفع التايم اوت</Button>}
                    <Button size="sm" variant="destructive" onClick={() => setBanDialogUser(u.user_id)}>خيارات الحظر</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "reports" && (canManageReports || isAdmin) && <AdminReportsPanel />}
      {tab === "permissions" && isAdmin && <PermissionsPanel />}

      {tab === "words" && (canManageWords || isAdmin) && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input value={newWord} onChange={e => setNewWord(e.target.value)} placeholder="أضف كلمة محظورة..." onKeyDown={e => e.key === "Enter" && addBannedWord()} />
            <Button onClick={addBannedWord} className="gap-1"><Plus className="w-4 h-4" /> إضافة</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {bannedWords.map(w => (
              <div key={w.id} className="flex items-center gap-1 bg-destructive/10 text-destructive rounded-full px-3 py-1 text-sm">
                <span>{w.word}</span>
                <button onClick={() => removeBannedWord(w.id)} className="hover:bg-destructive/20 rounded-full p-0.5"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "deleted" && isAdmin && (
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Archive className="w-4 h-4" /> منشورات محذوفة ({deletedPosts.length})</h3>
            {deletedPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">لا يوجد محتوى محذوف</p>
            ) : (
              <div className="space-y-3">
                {deletedPosts.map((p: any) => (
                  <Card key={p.id} className="border-destructive/30">
                    <CardContent className="py-3 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>👤 {p.profiles?.full_name || "—"}</span>
                        <span>🗑️ حُذف {new Date(p.deleted_at).toLocaleString("ar")}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words bg-muted/50 p-2 rounded">{p.content}</p>
                      {p.image_url && <img src={p.image_url} alt="" className="rounded-lg max-h-60 object-cover" />}
                      {p.video_url && <video src={p.video_url} controls className="rounded-lg max-h-60 w-full" />}
                      {p.comments && p.comments.length > 0 && (
                        <div className="border-t pt-2 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">💬 التعليقات ({p.comments.length}):</p>
                          {p.comments.map((c: any) => (
                            <div key={c.id} className={`text-xs p-2 rounded ${c.deleted_at ? "bg-destructive/10 line-through text-muted-foreground" : "bg-muted/50"}`}>
                              <span className="font-semibold">{c.profiles?.full_name}: </span><span>{c.content}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-end">
                        <Button variant="destructive" size="sm" onClick={() => hardDeletePost(p.id)} className="gap-1">
                          <Trash2 className="w-4 h-4" /> حذف نهائي
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Archive className="w-4 h-4" /> تعليقات محذوفة ({deletedComments.length})</h3>
            {deletedComments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">لا يوجد محتوى محذوف</p>
            ) : (
              <div className="space-y-2">
                {deletedComments.map((c: any) => (
                  <Card key={c.id}>
                    <CardContent className="py-3 space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{c.profiles?.full_name || "—"}</span>
                        <span>حُذف {new Date(c.deleted_at).toLocaleDateString("ar")}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words">{c.content}</p>
                      <div className="flex justify-end">
                        <Button variant="destructive" size="sm" onClick={() => hardDeleteComment(c.id)} className="gap-1">
                          <Trash2 className="w-3 h-3" /> حذف نهائي
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "sections" && (canLockSections || isAdmin) && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">يمكنك إغلاق أي قسم مؤقتاً وإضافة رسالة وعدّاد تنازلي يظهر للمستخدمين.</p>
          {[
            { key: "chat", label: "الدردشة (كامل القسم)" },
            { key: "chat_all", label: "دردشة الجميع (المشتركة)" },
            { key: "chat_09", label: "دردشة جيل 09" },
            { key: "chat_10", label: "دردشة جيل 10" },
            { key: "rounds", label: "الجولات" },
            { key: "schedules", label: "الجداول" },
            { key: "changes", label: "التغيير" },
            { key: "suggestions", label: "الاقتراحات" },
          ].map(s => {
            const cur = sectionLocks[s.key] || {};
            return (
              <Card key={s.key}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{s.label}</p>
                    <Switch checked={!!cur.locked} onCheckedChange={(v) => saveSectionLock(s.key, { locked: v, message: cur.message || null, locked_until: cur.locked_until || null })} />
                  </div>
                  {cur.locked && (
                    <>
                      <Textarea defaultValue={cur.message || ""} onBlur={e => saveSectionLock(s.key, { locked: true, message: e.target.value || null, locked_until: cur.locked_until || null })} placeholder="رسالة تظهر للمستخدمين..." className="text-sm" />
                      <div className="flex gap-2 items-center text-xs">
                        <label className="text-muted-foreground">يُفتح في:</label>
                        <Input type="datetime-local" defaultValue={cur.locked_until ? new Date(cur.locked_until).toISOString().slice(0, 16) : ""} onBlur={e => saveSectionLock(s.key, { locked: true, message: cur.message || null, locked_until: e.target.value ? new Date(e.target.value).toISOString() : null })} className="text-xs" />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <p className="text-sm font-medium text-muted-foreground mt-4">قنوات الدردشة (تحدد القناة الواحدة فقط — الجميع/شباب/بنات/09/10):</p>
          {[
            { key: "all", label: "قناة الجميع", color: "text-primary" },
            { key: "male", label: "قناة شباب", color: "text-blue-500" },
            { key: "female", label: "قناة بنات", color: "text-pink-500" },
            { key: "09", label: "قناة جيل 09", color: "text-emerald-600" },
            { key: "10", label: "قناة جيل 10", color: "text-orange-600" },
          ].map(ch => (
            <Card key={ch.key}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <p className={`font-semibold ${ch.color}`}>{ch.label}</p>
                  <Switch checked={channelSettings[ch.key] ?? true} onCheckedChange={(v) => toggleChannel(ch.key, v)} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{channelSettings[ch.key] ?? true ? "مفعّلة — المستخدمون يرونها وينشرون فيها" : "معطّلة — لا يظهر لأحد"}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "audit" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">آخر 200 إجراء قام به فريق الإدارة.</p>
          {auditLog.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">لا يوجد سجل بعد.</p>
          ) : auditLog.map(a => (
            <Card key={a.id}>
              <CardContent className="py-2 text-sm flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-primary">{a.admin_name}</span>
                  <span className="mx-1 text-muted-foreground">·</span>
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{a.action_type}</span>
                  {a.target_name && <><span className="mx-1 text-muted-foreground">→</span><span className="font-medium">{a.target_name}</span></>}
                  {a.details && <p className="text-xs text-muted-foreground mt-0.5">{a.details}</p>}
                </div>
                <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("ar")}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "codes" && isAdmin && (
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold flex items-center gap-2 mb-1">
              <KeyRound className="w-4 h-4 text-primary" /> إنشاء كود دخول جديد
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              الكود المكوّن من 6 أرقام يسمح لمن لا يملك حساب Google بإنشاء حساب والدخول بدون تأكيد بريد.
            </p>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">عدد الاستخدامات المسموح</Label>
                    <Input
                      type="number"
                      min={1}
                      value={newCodeUses}
                      onChange={(e) => setNewCodeUses(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">مدة الصلاحية (ساعات)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={newCodeDuration}
                      onChange={(e) => setNewCodeDuration(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">رسالة تظهر للمستخدم (اختياري)</Label>
                  <Textarea
                    placeholder="مثال: أهلاً بك، أكمل إنشاء حسابك وستدخل مباشرة إلى الدردشة."
                    value={newCodeMessage}
                    onChange={(e) => setNewCodeMessage(e.target.value)}
                    rows={2}
                  />
                </div>
                <Button onClick={createAccessCode} disabled={creatingCode} className="gap-2">
                  {creatingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  إنشاء الكود
                </Button>
              </CardContent>
            </Card>
          </div>

          <div>
            <h3 className="font-semibold flex items-center gap-2 mb-3">
              <KeyRound className="w-4 h-4 text-primary" /> الأكواد الحالية
            </h3>
            {accessCodes.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">لا توجد أكواد بعد.</p>
            ) : (
              <div className="space-y-2">
                {accessCodes.map((c) => (
                  <Card key={c.id}>
                    <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-mono font-bold tracking-widest">{c.code}</span>
                        <button onClick={() => copyCode(c.code)} className="text-muted-foreground hover:text-primary" aria-label="نسخ">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          مستخدم {c.used_count} / {c.max_uses}
                        </span>
                        <span>ينتهي: {new Date(c.expires_at).toLocaleString("ar")}</span>
                        {c.message && <span className="italic max-w-[200px] truncate">"{c.message}"</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                          {c.active ? "نشط" : "منتهي / مستنفذ"}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => revokeAccessCode(c.id)} className="text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "pending" && (isAdmin || isModerator) && (
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" /> منشورات بانتظار المراجعة ({pendingCount})
          </h3>
          {pendingPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">لا توجد منشورات بانتظار المراجعة</p>
          ) : (
            pendingPosts.map((p: any) => (
              <Card key={p.id} className="border-amber-500/40">
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {p.profiles?.avatar_url ? (
                      <img src={p.profiles.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                        {(p.profiles?.full_name || "؟").charAt(0)}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{p.profiles?.full_name || "عضو"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("ar")}</p>
                    </div>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words bg-muted/50 p-2 rounded">{p.content}</p>
                  {p.image_url && <img src={p.image_url} alt="" className="rounded-lg max-h-60 object-cover" />}
                  {p.image_urls && Array.isArray(p.image_urls) && p.image_urls.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {p.image_urls.map((u: string, i: number) => (
                        <img key={i} src={u} alt="" className="rounded-lg max-h-60 object-cover" />
                      ))}
                    </div>
                  )}
                  {p.video_url && <video src={p.video_url} controls className="rounded-lg max-h-60 w-full" />}
                  <div className="flex justify-end gap-2">
                    <Button variant="destructive" size="sm" onClick={() => rejectPost(p.id)} className="gap-1">
                      <Trash2 className="w-4 h-4" /> رفض وحذف
                    </Button>
                    <Button size="sm" onClick={() => approvePost(p.id)} className="gap-1">
                      <ShieldCheck className="w-4 h-4" /> موافقة ونشر
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <Dialog open={!!renameUserId} onOpenChange={(o) => { if (!o) setRenameUserId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>تغيير اسم المستخدم</DialogTitle></DialogHeader>
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="الاسم الجديد" onKeyDown={e => e.key === "Enter" && handleRenameUser()} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameUserId(null)}>إلغاء</Button>
            <Button onClick={handleRenameUser} disabled={!newName.trim()}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fieldUserId} onOpenChange={(o) => { if (!o) { setFieldUserId(null); setNewField(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>تغيير التخصص</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(FIELD_LABEL_AR).map(([k, l]) => (
              <Button key={k} type="button" variant={newField === k ? "default" : "outline"}
                onClick={() => setNewField(k)} className="justify-start">
                {l} <span className="text-xs opacity-70 ml-1">{FIELD_PREFIX[k]}</span>
              </Button>
            ))}
            <Button type="button" variant={newField === null ? "default" : "outline"} onClick={() => setNewField(null)} className="justify-start">
              بدون تخصص
            </Button>
          </div>
          {FIELD_ADMIN_ONLY.size > 0 && (
            <p className="text-xs text-muted-foreground">
              ⚖️ خانات التخصص المميزة (مثل {FIELD_LABEL_AR["law"]}) لا يختارها المستخدم نفسه — إسنادها حصري للإدارة.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFieldUserId(null)}>إلغاء</Button>
            <Button onClick={handleChangeField}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!warnUser} onOpenChange={(o) => { if (!o) { setWarnUser(null); setWarnReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>إرسال تحذير</DialogTitle></DialogHeader>
          <Textarea value={warnReason} onChange={e => setWarnReason(e.target.value)} placeholder="سبب التحذير..." className="min-h-[100px]" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setWarnUser(null); setWarnReason(""); }}>إلغاء</Button>
            <Button onClick={sendWarning} disabled={!warnReason.trim()}>إرسال</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BanDialog userId={banDialogUser} open={!!banDialogUser} onOpenChange={(o) => { if (!o) setBanDialogUser(null); }} onChanged={fetchUsers} />

      <RolesDialog
        userId={rolesDialogUser?.id || null}
        userName={rolesDialogUser?.name}
        open={!!rolesDialogUser}
        onOpenChange={(o) => { if (!o) setRolesDialogUser(null); }}
        onChanged={fetchUserRoles}
      />

      <Dialog open={deleteStep > 0} onOpenChange={(o) => { if (!o) { setDeleteStep(0); setDeleteConfirm(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-destructive">حذف نهائي لـ {selectedIds.size} مستخدم</DialogTitle></DialogHeader>
          {deleteStep === 1 ? (
            <>
              <p className="text-sm">سيتم حذف كل بيانات المستخدمين المحددين نهائياً (منشورات، تعليقات، جولات، رسائل، حسابات). لا يمكن التراجع.</p>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDeleteStep(0)}>إلغاء</Button>
                <Button variant="destructive" onClick={() => setDeleteStep(2)}>متابعة</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <p className="text-sm">للتأكيد اكتب كلمة <b className="text-destructive">حذف</b> بالضبط:</p>
              <Input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="حذف" />
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setDeleteStep(0); setDeleteConfirm(""); }}>إلغاء</Button>
                <Button variant="destructive" onClick={executeMassDelete} disabled={deleteConfirm !== "حذف"}>حذف نهائي</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
