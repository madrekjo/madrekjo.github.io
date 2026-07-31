import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Loader2, Trash2, Users, MessageCircle, RotateCcw, Inbox, Shield, ShieldOff, Pencil } from "lucide-react";
import { toast } from "sonner";

export const AdminPanel = () => {
  const { allUsers, loadingUsers, deleteUser, resetAllTasks, refetchUsers } = useAdmin();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  // Load all admin user_ids (site uses profiles.role)
  const { data: adminIds = [] } = useQuery({
    queryKey: ["all-admin-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin");
      if (error) throw error;
      return (data ?? []).map((r) => (r as any).id as string);
    },
  });
  const adminSet = new Set(adminIds);


  const toggleAdmin = async (userId: string, makeAdmin: boolean) => {
    setTogglingId(userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: makeAdmin ? "admin" : "user" })
        .eq("id", userId);
      if (error) throw error;
      toast.success(makeAdmin ? "تم تعيين المستخدم كمسؤول" : "تم إزالة صلاحيات المسؤول");
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
      const { error } = await supabase
        .from("profiles")
        .update({ username: trimmed })
        .eq("id", renameTarget.id);
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

  if (loadingUsers) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
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

      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
        {allUsers.map((user) => {
          const isUserAdmin = adminSet.has((user as any).id);
          const isSelf = (user as any).id === currentUser?.id;

          return (
            <div
              key={user.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">
                      {(user as any).username?.trim() || "بدون اسم"}
                    </span>
                    {isUserAdmin && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                        مسؤول
                      </span>
                    )}
                    
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString("ar")}
                  </p>
                </div>
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => openRename((user as any).id, (user as any).username || "")}
                >
                  <Pencil className="h-4 w-4" />
                  الاسم
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => navigate(`/admin/messages?user=${(user as any).id}`)}
                >
                  <MessageCircle className="h-4 w-4" />
                  رسالة
                </Button>
                {!isSelf && (
                  <Button
                    size="sm"
                    variant={isUserAdmin ? "outline" : "default"}
                    className="gap-1"
                    disabled={togglingId === (user as any).id}
                    onClick={() => toggleAdmin((user as any).id, !isUserAdmin)}
                  >
                    {togglingId === (user as any).id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isUserAdmin ? (
                      <ShieldOff className="h-4 w-4" />
                    ) : (
                      <Shield className="h-4 w-4" />
                    )}
                    {isUserAdmin ? "إزالة المسؤول" : "تعيين كمسؤول"}
                  </Button>
                )}
                {!isSelf && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1"
                    onClick={() => setDeleteUserId((user as any).id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف
                  </Button>
                )}
              </div>
            </div>
          );
        })}
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
