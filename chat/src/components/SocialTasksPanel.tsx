import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, XCircle, Loader2, Link2, ClipboardList, BadgeCheck } from "lucide-react";
import {
  fetchSocialTasks,
  createSocialTask,
  completeSocialTask,
  verifySocialTask,
  deleteSocialTask,
  SOCIAL_TASK_STATUS,
  type SocialTask,
} from "@/lib/socialTasks";

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} س`;
  const d = Math.floor(h / 24);
  return `قبل ${d} يوم`;
};

const errMsg = (e: unknown, fb: string) =>
  (e as { message?: string } | null)?.message || fb;

const TaskRow = ({ task, canCreate, canVerify, onChanged }: { task: SocialTask; canCreate: boolean; canVerify: boolean; onChanged: () => void }) => {
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState("");
  const [showProof, setShowProof] = useState(false);

  const st = SOCIAL_TASK_STATUS[task.status];

  const doComplete = async () => {
    if (!proof.trim()) { toast.error("أضف رابط المنشور قبل تعليم ✓"); return; }
    setBusy(true);
    try {
      await completeSocialTask(task.id, proof.trim());
      toast.success("تم تعليم المهمة ✓ بانتظار تصديق المالك");
      onChanged();
    } catch (e) {
      toast.error(errMsg(e, "تعذر تعليم المهمة"));
    } finally { setBusy(false); }
  };

  const doVerify = async (approved: boolean) => {
    let reason: string | null = null;
    if (!approved) {
      reason = window.prompt("سبب الرفض (يظهر للموظف):");
      if (reason === null) return;
    }
    setBusy(true);
    try {
      await verifySocialTask(task.id, approved, reason);
      toast.success(approved ? "تم تصديق المهمة ✓" : "تم رفض المهمة");
      onChanged();
    } catch (e) {
      toast.error(errMsg(e, "تعذر التحديث"));
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!confirm("حذف المهمة نهائياً؟")) return;
    setBusy(true);
    try {
      await deleteSocialTask(task.id);
      toast.success("حُذفت المهمة");
      onChanged();
    } catch (e) {
      toast.error(errMsg(e, "تعذر الحذف"));
    } finally { setBusy(false); }
  };

  return (
    <Card className="mb-3">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
              <span className="font-bold">{task.title}</span>
            </div>
            {task.details && <p className="text-sm text-muted-foreground mt-1.5 whitespace-pre-wrap">{task.details}</p>}
          </div>
          {canVerify && task.status !== "pending" && (
            <Button variant="ghost" size="sm" className="text-red-500 shrink-0" onClick={doDelete} disabled={busy}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        {(task.proof_link || task.done_at) && (
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            {task.proof_link && (
              <a href={task.proof_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                <Link2 className="w-3.5 h-3.5" /> فتح رابط المنشور
              </a>
            )}
            {task.doer_name && <span>— نفّذها <b>{task.doer_name}</b> {task.done_at ? timeAgo(task.done_at) : ""}</span>}
          </div>
        )}
        {task.verified_by && task.verified_at && (
          <div className="mt-1 text-xs text-muted-foreground">
            — راجعها {task.verifier_name || "—"} ({task.status === "verified" ? "صدّقها" : "رفضها"}) {timeAgo(task.verified_at)}
          </div>
        )}
        {task.reject_reason && (
          <div className="mt-2 text-xs rounded-md bg-red-500/10 text-red-600 border border-red-200 px-2 py-1.5">
            سبب الرفض: {task.reject_reason}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {task.status === "pending" && canCreate && (
            <>
              {showProof ? (
                <>
                  <Input value={proof} onChange={(e) => setProof(e.target.value)} placeholder="رابط المنشور (https://...)" className="max-w-xs h-9" dir="ltr" />
                  <Button size="sm" onClick={doComplete} disabled={busy} className="gap-1">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} تعليم ✓
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowProof(false)} disabled={busy}>إلغاء</Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setShowProof(true)} className="gap-1">
                  <CheckCircle2 className="w-4 h-4" /> إنجاز المهمة
                </Button>
              )}
            </>
          )}
          {task.status === "done" && canVerify && (
            <>
              <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700" onClick={() => doVerify(true)} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />} صدّقها
              </Button>
              <Button size="sm" variant="outline" className="gap-1 text-red-600" onClick={() => doVerify(false)} disabled={busy}>
                <XCircle className="w-4 h-4" /> ارفضها
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const SocialTasksPanel = () => {
  const { user, isOwner, isAdmin, isModerator, isSupervisor, isSocialAdmin } = useAuth();
  const [tasks, setTasks] = useState<SocialTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [creating, setCreating] = useState(false);

  const canCreateTask = isOwner || isAdmin || isModerator || isSupervisor;
  const canVerify = isOwner || isAdmin || isModerator;
  const canExecute = canCreateTask || isSocialAdmin;

  const refresh = useCallback(async () => {
    try {
      setTasks(await fetchSocialTasks());
    } catch {
      toast.error("تعذر تحميل المهام");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const doCreate = async () => {
    if (!title.trim()) { toast.error("اكتب عنوان المهمة"); return; }
    setCreating(true);
    try {
      await createSocialTask(title.trim(), details.trim() || null);
      setTitle(""); setDetails("");
      toast.success("نُشرت المهمة للموظف");
      void refresh();
    } catch (e) {
      toast.error(errMsg(e, "تعذر إنشاء المهمة"));
    } finally { setCreating(false); }
  };

  if (!user) return null;

  const pending = tasks.filter((t) => t.status === "pending").length;
  const awaiting = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-pink-500/15 text-pink-600 flex items-center justify-center">
          <ClipboardList className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold">{isSocialAdmin && !canCreateTask ? "مهام صفحة الانستغرام" : "مهام السوشيال ميديا"}</h2>
          <p className="text-xs text-muted-foreground">
            {pending} بانتظار التنفيذ · {awaiting} معلَّمة بانتظار تصديق المالك
          </p>
        </div>
      </div>

      {canCreateTask && (
        <Card className="mb-5">
          <CardContent className="pt-4 space-y-2.5">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="المهمة: مثل «انشري ستوري عن مسابقة الجولة المقبلة»" />
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="تفاصيل إضافية (اختياري): النص المطلوب، التوقيت، الشروط..." rows={2} />
            <Button onClick={doCreate} disabled={creating || !title.trim()} className="gap-1">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} نشر المهمة
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : tasks.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-10">لا توجد مهام بعد</p>
      ) : (
        tasks.map((t) => (
          <TaskRow key={t.id} task={t} canCreate={canExecute} canVerify={canVerify} onChanged={refresh} />
        ))
      )}
    </div>
  );
};

export default SocialTasksPanel;