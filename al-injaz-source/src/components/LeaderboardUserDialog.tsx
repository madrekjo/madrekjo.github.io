import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { AdminMessageDialog } from "./AdminMessageDialog";
import { UserAnalyticsDialog } from "./UserAnalyticsDialog";
import { useAdmin } from "@/hooks/useAdmin";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  MessageCircle,
  Trash2,
  ListTodo,
  Loader2,
  Pencil,
  RotateCcw,
  Minus,
  BarChart3,
  Ban,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

const formatDailyDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
};

const getDurationDisplay = (task: { category: string; duration: number }) => {
  if (task.category === "daily") return formatDailyDuration(task.duration);
  if (task.category === "weekly") return `${task.duration} يوم`;
  return `${task.duration} أسبوع`;
};

export const LeaderboardUserDialog = ({ open, onOpenChange, userId, userName }: Props) => {
  const { isAdmin, deleteUser, adminDeleteTask, adminUpdateTask, adminResetUser, adminReduceHours } = useAdmin();
  const [messageOpen, setMessageOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [reduceOpen, setReduceOpen] = useState(false);
  const [reduceMinutes, setReduceMinutes] = useState("");
  const [editTask, setEditTask] = useState<{ id: string; title: string; duration: number; category: string } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !isAdmin || !userId) {
      setUserEmail(null);
      return;
    }
    setUserEmail(null);
    (async () => {
      const { data, error } = await supabase.functions.invoke("admin-user-actions", {
        body: { action: "get_user_email", userId },
      });
      if (!error && data?.email) setUserEmail(data.email);
    })();
  }, [open, isAdmin, userId]);



  // Admins can read full task rows via RLS. Non-admins get only the safe fields
  // via the `get_user_successful_tasks` RPC (no task titles leaked).
  const { data: userTasks = [], isLoading: loadingTasks, refetch } = useQuery({
    queryKey: ["leaderboard-user-tasks", userId, isAdmin],
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from("tasks")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as any[];
      }
      const { data, error } = await (supabase.rpc as any)("get_user_successful_tasks", {
        _user_id: userId,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((t) => ({
        ...t,
        title: "",
        completed: true,
        is_success: true,
      }));
    },
    enabled: open,
  });

  const activeTasks = userTasks.filter((t) => !t.completed);
  const completedTasks = userTasks.filter((t) => t.completed && t.is_success);

  const handleDeleteUser = async () => {
    setBusy(true);
    try {
      await deleteUser(userId);
      toast.success("تم حذف المستخدم");
      setDeleteOpen(false);
      onOpenChange(false);
    } catch {
      toast.error("حدث خطأ");
    } finally { setBusy(false); }
  };

  const handleResetUser = async () => {
    setBusy(true);
    try {
      await adminResetUser(userId);
      await refetch();
      toast.success("تم تصفير حساب المستخدم");
      setResetOpen(false);
    } catch {
      toast.error("حدث خطأ");
    } finally { setBusy(false); }
  };

  const handleReduceHours = async () => {
    const m = parseInt(reduceMinutes);
    if (!m || m <= 0) { toast.error("أدخل عدد دقائق صحيح"); return; }
    setBusy(true);
    try {
      await adminReduceHours(userId, m);
      await refetch();
      toast.success(`تم خصم ${m} دقيقة من إجمالي الساعات`);
      setReduceOpen(false);
      setReduceMinutes("");
    } catch {
      toast.error("حدث خطأ");
    } finally { setBusy(false); }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await adminDeleteTask(taskId);
      await refetch();
      toast.success("تم حذف المهمة");
    } catch {
      toast.error("حدث خطأ");
    }
  };

  const handleSaveTaskEdit = async () => {
    if (!editTask) return;
    const updates: Record<string, unknown> = {};
    if (editTitle.trim() && editTitle.trim() !== editTask.title) updates.title = editTitle.trim();
    const dur = parseInt(editDuration);
    if (dur && dur !== editTask.duration && dur >= 1) updates.duration = dur;
    if (Object.keys(updates).length === 0) { setEditTask(null); return; }
    try {
      await adminUpdateTask(editTask.id, updates);
      await refetch();
      toast.success("تم التعديل");
      setEditTask(null);
    } catch {
      toast.error("حدث خطأ");
    }
  };

  return (
    <>
      <Dialog open={open && !messageOpen && !analyticsOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{userName}</DialogTitle>
            <DialogDescription>
              {isAdmin ? "بروفايل المستخدم وأدوات الإدارة" : "بروفايل المستخدم"}
            </DialogDescription>
            {isAdmin && (
              <p className="text-xs text-muted-foreground pt-1" dir="ltr">
                📧 {userEmail ?? "..."}
              </p>
            )}
          </DialogHeader>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="gap-1.5" onClick={() => setAnalyticsOpen(true)}>
              <BarChart3 className="h-4 w-4" />
              التحليلات
            </Button>
            {isAdmin && (
              <>
                <Button variant="outline" className="gap-1.5" onClick={() => setMessageOpen(true)}>
                  <MessageCircle className="h-4 w-4" />
                  إرسال رسالة
                </Button>
                <Button variant="outline" className="gap-1.5" onClick={() => setReduceOpen(true)}>
                  <Minus className="h-4 w-4" />
                  تقليل الساعات
                </Button>
                <Button variant="outline" className="gap-1.5 text-amber-600 hover:text-amber-600" onClick={() => setResetOpen(true)}>
                  <RotateCcw className="h-4 w-4" />
                  تصفير الحساب
                </Button>
                <Button variant="destructive" className="col-span-2 gap-1.5" onClick={() => setDeleteOpen(true)}>
                  <Ban className="h-4 w-4" />
                  حظر المستخدم نهائياً
                </Button>
              </>
            )}
          </div>

          <Tabs defaultValue="completed" className="flex-1 min-h-0">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="completed">منجزة ({completedTasks.length})</TabsTrigger>
              <TabsTrigger value="active">قيد الإنجاز ({activeTasks.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="completed" className="mt-3 overflow-y-auto max-h-[40vh] space-y-2">
              {loadingTasks ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : completedTasks.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">لا توجد إنجازات</p>
              ) : (
                completedTasks.map((task) => (
                  <div key={task.id} className="rounded-lg border px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground truncate">{task.title}</span>
                          <Badge variant="secondary" className="text-xs">
                            {task.category === "daily" ? "يومي" : task.category === "weekly" ? "أسبوعي" : "شهري"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">المدة: {getDurationDisplay(task)}</p>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                            setEditTask({ id: task.id, title: task.title, duration: task.duration, category: task.category });
                            setEditTitle(task.title);
                            setEditDuration(String(task.duration));
                          }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDeleteTask(task.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="active" className="mt-3 overflow-y-auto max-h-[40vh] space-y-2">
              {activeTasks.length === 0 ? (
                <div className="py-6 text-center">
                  <ListTodo className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-1 text-sm text-muted-foreground">لا توجد مهام نشطة</p>
                </div>
              ) : (
                activeTasks.map((task) => (
                  <div key={task.id} className="rounded-lg border px-3 py-2.5 flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm text-foreground truncate">{task.title}</span>
                      <p className="text-xs text-muted-foreground">المدة: {getDurationDisplay(task)}</p>
                    </div>
                    {isAdmin && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDeleteTask(task.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Edit task dialog */}
      <Dialog open={!!editTask} onOpenChange={() => setEditTask(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل المهمة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>الاسم</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>المدة ({editTask?.category === "daily" ? "دقائق" : editTask?.category === "weekly" ? "أيام" : "أسابيع"})</Label>
              <Input type="number" min="1" value={editDuration} onChange={(e) => setEditDuration(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTask(null)}>إلغاء</Button>
            <Button onClick={handleSaveTaskEdit}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reduce hours dialog */}
      <Dialog open={reduceOpen} onOpenChange={setReduceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تقليل إجمالي الساعات</DialogTitle>
            <DialogDescription>
              أدخل عدد الدقائق المراد خصمها من إجمالي إنجازات {userName} (تطبق على المهام اليومية).
            </DialogDescription>
          </DialogHeader>
          <Input type="number" min="1" placeholder="مثال: 60" value={reduceMinutes} onChange={(e) => setReduceMinutes(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReduceOpen(false)}>إلغاء</Button>
            <Button disabled={busy} onClick={handleReduceHours}>{busy ? "جاري..." : "خصم"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset user dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تصفير حساب المستخدم</DialogTitle>
            <DialogDescription>
              سيتم حذف جميع مهام {userName} (نشطة ومنجزة) نهائياً. الحساب يبقى موجود.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>إلغاء</Button>
            <Button variant="destructive" disabled={busy} onClick={handleResetUser}>{busy ? "جاري..." : "تصفير الحساب"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban user */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>حظر المستخدم</DialogTitle>
            <DialogDescription>
              سيتم حذف حساب "{userName}" وجميع بياناته نهائياً. هل أنت متأكد؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>إلغاء</Button>
            <Button variant="destructive" disabled={busy} onClick={handleDeleteUser}>حذف نهائي</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {messageOpen && (
        <AdminMessageDialog
          open={messageOpen}
          onOpenChange={setMessageOpen}
          targetUserId={userId}
          targetUserName={userName}
        />
      )}

      {analyticsOpen && (
        <UserAnalyticsDialog
          open={analyticsOpen}
          onOpenChange={setAnalyticsOpen}
          userId={userId}
          userName={userName}
        />
      )}
    </>
  );
};
