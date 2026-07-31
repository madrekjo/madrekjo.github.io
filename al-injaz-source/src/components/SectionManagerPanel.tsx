import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Loader2, RotateCcw, Pencil } from "lucide-react";
import { toast } from "sonner";

export const SectionManagerPanel = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const { data: allUsers = [], isLoading: loadingUsers, refetch: refetchUsers } = useQuery({
    queryKey: ["section-manager-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentUser,
  });

  const resetUserTasks = async (userId: string) => {
    const { error } = await supabase.from("tasks").delete().eq("user_id", userId);
    if (error) throw error;
  };

  const reduceUserHours = async (userId: string, minutesToRemove: number) => {
    const { data: userTasks, error: fetchError } = await supabase
      .from("tasks")
      .select("id, duration, daily_unit")
      .eq("user_id", userId)
      .eq("completed", false);
    if (fetchError) throw fetchError;
    if (!userTasks || userTasks.length === 0) return;
    const targetMs = minutesToRemove * 60 * 1000;
    let remaining = targetMs;
    for (const task of userTasks) {
      if (remaining <= 0) break;
      const currentDuration = task.duration;
      const durMs = currentDuration * 60 * 1000;
      if (durMs >= remaining) {
        const newDuration = Math.max(0, Math.floor((durMs - remaining) / (60 * 1000)));
        await supabase.from("tasks").update({ duration: newDuration }).eq("id", task.id);
        remaining = 0;
      } else {
        await supabase.from("tasks").update({ duration: 0 }).eq("id", task.id);
        remaining -= durMs;
      }
    }
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [reduceTarget, setReduceTarget] = useState<{ id: string; name: string } | null>(null);
  const [reduceValue, setReduceValue] = useState("");
  const [reducing, setReducing] = useState(false);

  const openRename = (userId: string, currentName: string) => {
    setRenameTarget({ id: userId, name: currentName });
    setRenameValue(currentName);
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) { toast.error("الاسم لا يمكن أن يكون فارغاً"); return; }
    setRenaming(true);
    try {
      const { error } = await supabase.from("profiles").update({ username: trimmed }).eq("id", renameTarget.id);
      if (error) throw error;
      toast.success("تم تحديث الاسم");
      setRenameTarget(null);
      await refetchUsers();
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    } catch { toast.error("تعذّر تحديث الاسم"); }
    finally { setRenaming(false); }
  };

  const handleResetUser = async () => {
    if (!resetUserId) return;
    setResetting(true);
    try {
      await resetUserTasks(resetUserId);
      toast.success("تم تصفير المستخدم");
      setResetUserId(null);
    } catch { toast.error("تعذّر التصفير"); }
    finally { setResetting(false); }
  };

  const handleReduceHours = async () => {
    if (!reduceTarget || !reduceValue) return;
    const minutes = parseInt(reduceValue);
    if (isNaN(minutes) || minutes <= 0) { toast.error("أدخل دقائق صالحة"); return; }
    setReducing(true);
    try {
      await reduceUserHours(reduceTarget.id, minutes);
      toast.success(`تم خصم ${minutes} دقيقة من المستخدم`);
      setReduceTarget(null);
      setReduceValue("");
    } catch { toast.error("تعذّر الخصم"); }
    finally { setReducing(false); }
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
        <h3 className="text-lg font-semibold">إدارة القسم - المستخدمين ({allUsers.length})</h3>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
        {allUsers.map((user) => {
          const isSelf = (user as any).id === currentUser?.id;
          return (
            <div key={user.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <div className="font-medium text-foreground">{(user as any).username?.trim() || "بدون اسم"}</div>
                <p className="text-xs text-muted-foreground">{new Date(user.created_at).toLocaleDateString("ar")}</p>
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                <Button size="sm" variant="outline" className="gap-1"
                  onClick={() => openRename((user as any).id, (user as any).username || "")}>
                  <Pencil className="h-4 w-4" /> الاسم
                </Button>
                {!isSelf && (
                  <>
                    <Button size="sm" variant="outline" className="gap-1"
                      onClick={() => setReduceTarget({ id: (user as any).id, name: (user as any).username || "مستخدم" })}>
                      ⏬ خصم ساعات
                    </Button>
                    <Button size="sm" variant="destructive" className="gap-1"
                      onClick={() => setResetUserId((user as any).id)}>
                      <RotateCcw className="h-4 w-4" /> تصفير
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>تغيير اسم المستخدم</DialogTitle>
            <DialogDescription>يمكنك تغيير اسم أي مستخدم في هذا القسم.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-input">الاسم الجديد</Label>
            <Input id="rename-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="اكتب الاسم الجديد" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)} disabled={renaming}>إلغاء</Button>
            <Button onClick={handleRename} disabled={renaming} className="gap-1">
              {renaming && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetUserId} onOpenChange={(o) => !o && setResetUserId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>تصفير المستخدم</DialogTitle>
            <DialogDescription>سيتم حذف جميع مهام وساعات هذا المستخدم. هذا الإجراء لا يمكن التراجع عنه.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUserId(null)} disabled={resetting}>إلغاء</Button>
            <Button variant="destructive" onClick={handleResetUser} disabled={resetting} className="gap-1">
              {resetting && <Loader2 className="h-4 w-4 animate-spin" />} نعم، صفّر
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reduceTarget} onOpenChange={(o) => !o && setReduceTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>خصم ساعات</DialogTitle>
            <DialogDescription>أدخل عدد الدقائق المراد خصمها من {reduceTarget?.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reduce-input">الدقائق المراد خصمها</Label>
            <Input id="reduce-input" type="number" min="1" value={reduceValue} onChange={(e) => setReduceValue(e.target.value)} placeholder="مثال: 30" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReduceTarget(null)} disabled={reducing}>إلغاء</Button>
            <Button variant="destructive" onClick={handleReduceHours} disabled={reducing} className="gap-1">
              {reducing && <Loader2 className="h-4 w-4 animate-spin" />} خصم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
