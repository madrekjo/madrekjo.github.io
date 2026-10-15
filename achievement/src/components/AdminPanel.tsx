import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/hooks/useAuth";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Loader2, Trash2, Users, MessageCircle, RotateCcw, Inbox, Shield, ShieldOff, Sparkles, Pencil, Search, X, UserRoundSearch } from "lucide-react";
import { toast } from "sonner";
import { matchesSearch } from "@/lib/search";

type RoleFilter = "all" | "admin" | "creator";

export const AdminPanel = () => {
  const { allUsers, loadingUsers, deleteUser, resetAllTasks, refetchUsers } = useAdmin();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [togglingRoundId, setTogglingRoundId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  // Load all admin user_ids
  const { data: adminIds = [] } = useQuery({
    queryKey: ["all-admin-ids"],
    queryFn: async () => {
      const { data, error } = await achievementSupabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (error) throw error;
      return (data ?? []).map((r) => r.user_id as string);
    },
  });
  const adminSet = new Set(adminIds);

  // Load round-creator ids
  const { data: roundCreatorIds = [] } = useQuery({
    queryKey: ["all-round-creator-ids"],
    queryFn: async () => {
      const { data, error } = await (achievementSupabase as unknown as { from: (t: string) => ReturnType<typeof achievementSupabase.from> })
        .from("round_creators")
        .select("user_id" as never);
      if (error) throw error;
      return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
    },
  });
  const roundCreatorSet = new Set(roundCreatorIds);

  const toggleRoundCreator = async (userId: string, makeCreator: boolean) => {
    setTogglingRoundId(userId);
    try {
      const db = achievementSupabase as unknown as { from: (t: string) => ReturnType<typeof achievementSupabase.from> };
      if (makeCreator) {
        const { error } = await db.from("round_creators").insert({ user_id: userId } as never);
        if (error) throw error;
        toast.success("تم منح صلاحية إنشاء الجولات");
      } else {
        const { error } = await db.from("round_creators").delete().eq("user_id" as never, userId);
        if (error) throw error;
        toast.success("تم إزالة صلاحية إنشاء الجولات");
      }
      queryClient.invalidateQueries({ queryKey: ["all-round-creator-ids"] });
      queryClient.invalidateQueries({ queryKey: ["can-create-round"] });
    } catch {
      toast.error("تعذّر تحديث الصلاحية");
    } finally {
      setTogglingRoundId(null);
    }
  };


  const toggleAdmin = async (userId: string, makeAdmin: boolean) => {
    setTogglingId(userId);
    try {
      if (makeAdmin) {
        const { error } = await achievementSupabase
          .from("user_roles")
          .insert({ user_id: userId, role: "admin" });
        if (error) throw error;
        toast.success("تم تعيين المستخدم كمسؤول");
      } else {
        const { error } = await achievementSupabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "admin");
        if (error) throw error;
        toast.success("تم إزالة صلاحيات المسؤول");
      }
      queryClient.invalidateQueries({ queryKey: ["all-admin-ids"] });
      queryClient.invalidateQueries({ queryKey: ["is-admin"] });
    } catch (e) {
      toast.error("تعذّر تحديث الصلاحيات");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;
    try {
      await deleteUser(deleteUserId);
      toast.success("تم حذف المستخدم بنجاح");
      setDeleteUserId(null);
    } catch {
      toast.error("حدث خطأ أثناء حذف المستخدم");
    }
  };

  const handleResetAll = async () => {
    setResetting(true);
    try {
      await resetAllTasks();
      toast.success("تم تصفير جميع المهام والساعات لكل المستخدمين");
      setConfirmReset(false);
    } catch {
      toast.error("تعذّر تنفيذ التصفير");
    } finally {
      setResetting(false);
    }
  };

  const openRename = (userId: string, currentName: string) => {
    setRenameTarget({ id: userId, name: currentName });
    setRenameValue(currentName);
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.error("الاسم لا يمكن أن يكون فارغاً");
      return;
    }
    setRenaming(true);
    try {
      const { error } = await achievementSupabase
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("user_id", renameTarget.id);
      if (error) throw error;
      toast.success("تم تحديث الاسم");
      setRenameTarget(null);
      await refetchUsers();
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["all-successful-tasks"] });
    } catch {
      toast.error("تعذّر تحديث الاسم");
    } finally {
      setRenaming(false);
    }
  };

  // البحث + التصفية حسب الصلاحية
  const filteredUsers = useMemo(() => {
    const adminIdsSet = new Set(adminIds);
    const creatorIdsSet = new Set(roundCreatorIds);
    return allUsers.filter((user) => {
      if (roleFilter === "admin" && !adminIdsSet.has(user.user_id)) return false;
      if (roleFilter === "creator" && !creatorIdsSet.has(user.user_id)) return false;
      return matchesSearch(user.display_name?.trim() || "بدون اسم", userSearch);
    });
  }, [allUsers, userSearch, roleFilter, adminIds, roundCreatorIds]);

  const roleFilters: { key: RoleFilter; label: string; count: number }[] = [
    { key: "all", label: "الكل", count: allUsers.length },
    { key: "admin", label: "المسؤولون", count: adminIds.length },
    { key: "creator", label: "منشئو الجولات", count: roundCreatorIds.length },
  ];
  const isFiltering = userSearch.trim().length > 0 || roleFilter !== "all";

  if (loadingUsers) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">المستخدمين ({allUsers.length})</h3>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => navigate("/admin/messages")}
          >
            <Inbox className="h-4 w-4" />
            صندوق الرسائل
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="gap-1"
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw className="h-4 w-4" />
            تصفير الجميع
          </Button>
        </div>
      </div>

      {/* شريط البحث والتصفية */}
      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="ابحث باسم المستخدم..."
            aria-label="بحث في المستخدمين"
            className="ps-10"
          />
          {userSearch.length > 0 && (
            <button
              type="button"
              onClick={() => setUserSearch("")}
              aria-label="مسح البحث"
              className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {roleFilters.map((f) => {
              const active = roleFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setRoleFilter(f.key)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/70 bg-background/70 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {f.label}
                  <span className="ms-1.5 text-[10px] opacity-70">{f.count}</span>
                </button>
              );
            })}
          </div>
          {isFiltering && (
            <p className="text-xs text-muted-foreground">
              يظهر {filteredUsers.length} من {allUsers.length}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-3 shadow-sm space-y-2">
        {filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <UserRoundSearch className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">لا يوجد مستخدم مطابق</p>
            <p className="text-xs text-muted-foreground">جرّب اسمًا آخر أو أزل التصفية.</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => {
                setUserSearch("");
                setRoleFilter("all");
              }}
            >
              إزالة الفلترة
            </Button>
          </div>
        ) : (
          filteredUsers.map((user) => {
          const isUserAdmin = adminSet.has(user.user_id);
          const isRoundCreator = roundCreatorSet.has(user.user_id);
          const isSelf = user.user_id === currentUser?.id;

          return (
            <div
              key={user.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3 transition-colors hover:border-primary/30 hover:bg-muted/30"
            >
              <div className="flex items-center gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">
                      {user.display_name?.trim() || "بدون اسم"}
                    </span>
                    {isUserAdmin && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                        مسؤول
                      </span>
                    )}
                    {isRoundCreator && !isUserAdmin && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent/30 text-accent-foreground border border-accent/40">
                        منشئ جولات
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString("ar")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => openRename(user.user_id, user.display_name || "")}
                >
                  <Pencil className="h-4 w-4" />
                  الاسم
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => navigate(`/admin/messages?user=${user.user_id}`)}
                >
                  <MessageCircle className="h-4 w-4" />
                  رسالة
                </Button>
                {!isSelf && (
                  <Button
                    size="sm"
                    variant={isUserAdmin ? "outline" : "default"}
                    className="gap-1"
                    disabled={togglingId === user.user_id}
                    onClick={() => toggleAdmin(user.user_id, !isUserAdmin)}
                  >
                    {togglingId === user.user_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isUserAdmin ? (
                      <ShieldOff className="h-4 w-4" />
                    ) : (
                      <Shield className="h-4 w-4" />
                    )}
                    {isUserAdmin ? "إزالة المسؤول" : "تعيين كمسؤول"}
                  </Button>
                )}
                {!isSelf && !isUserAdmin && (
                  <Button
                    size="sm"
                    variant={isRoundCreator ? "outline" : "secondary"}
                    className="gap-1"
                    disabled={togglingRoundId === user.user_id}
                    onClick={() => toggleRoundCreator(user.user_id, !isRoundCreator)}
                  >
                    {togglingRoundId === user.user_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {isRoundCreator ? "إلغاء صلاحية الجولات" : "صلاحية إنشاء جولات"}
                  </Button>
                )}

                {!isSelf && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1"
                    onClick={() => setDeleteUserId(user.user_id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف
                  </Button>
                )}
              </div>
            </div>
          );
        })
        )}
      </div>

      <Dialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>حذف المستخدم</DialogTitle>
            <DialogDescription>
              سيتم حذف حساب المستخدم وجميع بياناته نهائياً. هل أنت متأكد؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUserId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDeleteUser}>حذف نهائي</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmReset} onOpenChange={(o) => !o && setConfirmReset(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تصفير جميع المستخدمين</DialogTitle>
            <DialogDescription>
              سيتم حذف كل المهام لكل المستخدمين (الساعات، الأيام، الدقائق، المنجزات، قيد الإنجاز). هذا الإجراء لا يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)} disabled={resetting}>إلغاء</Button>
            <Button variant="destructive" onClick={handleResetAll} disabled={resetting} className="gap-1">
              {resetting && <Loader2 className="h-4 w-4 animate-spin" />}
              نعم، صفّر الجميع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تغيير اسم المستخدم</DialogTitle>
            <DialogDescription>
              كإدارة، يمكنك تغيير اسم أي مستخدم دون قيود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-input">الاسم الجديد</Label>
            <Input
              id="rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="اكتب الاسم الجديد"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)} disabled={renaming}>إلغاء</Button>
            <Button onClick={handleRename} disabled={renaming} className="gap-1">
              {renaming && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};
