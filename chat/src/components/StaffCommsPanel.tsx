import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Send, Trash2, CheckCircle2, Loader2, MessageSquareText, ClipboardCheck, ChevronDown } from "lucide-react";
import {
  fetchOwnerComms,
  sendOwnerComms,
  completeOwnerTask,
  deleteOwnerComms,
  COMM_TARGET_LABEL,
  type OwnerCommunication,
  type CommKind,
  type TargetRole,
} from "@/lib/staffComms";

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

const CommRow = ({ c, isOwner, canComplete, onChanged }: { c: OwnerCommunication; isOwner: boolean; canComplete: boolean; onChanged: () => void }) => {
  const [busy, setBusy] = useState(false);

  const doComplete = async () => {
    setBusy(true);
    try {
      await completeOwnerTask(c.id);
      toast.success("تم تعليم المهمة ✓");
      onChanged();
    } catch (e) {
      toast.error(errMsg(e, "تعذر التحديث"));
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!confirm("حذف هذا المنشور نهائياً؟")) return;
    setBusy(true);
    try {
      await deleteOwnerComms(c.id);
      toast.success("حُذف");
      onChanged();
    } catch (e) {
      toast.error(errMsg(e, "تعذر الحذف"));
    } finally { setBusy(false); }
  };

  const isTask = c.kind === "task";
  const done = c.task_status === "done";

  return (
    <Card className="mb-3">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {isTask ? (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${done ? "bg-green-500/15 text-green-600 border border-green-300" : "bg-amber-500/15 text-amber-600 border border-amber-300"}`}>
                  {done ? "مهمة مُنجزة ✓" : "مهمة"}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground border">رسالة</span>
              )}
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-primary">
                إلى: {COMM_TARGET_LABEL[c.target_role]}
              </span>
            </div>
            <p className={`mt-2 whitespace-pre-wrap ${isTask ? "font-bold" : ""}`}>{c.content}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {c.author_name ? <b>{c.author_name}</b> : "—"} · {timeAgo(c.created_at)}
              {done && c.doer_name && <> · أُنجزت بواسطة <b>{c.doer_name}</b> {c.done_at ? timeAgo(c.done_at) : ""}</>}
            </p>
          </div>
          {isOwner && (
            <Button variant="ghost" size="sm" className="text-red-500 shrink-0" onClick={doDelete} disabled={busy}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        {isTask && !done && canComplete && (
          <div className="mt-3">
            <Button size="sm" className="gap-1" onClick={doComplete} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} أُنجزت المهمة ✓
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const StaffCommsPanel = () => {
  const { user, isOwner, isAdmin, isModerator, isSupervisor } = useAuth();
  const [comms, setComms] = useState<OwnerCommunication[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<CommKind>("note");
  const [target, setTarget] = useState<TargetRole>("all");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setComms(await fetchOwnerComms());
    } catch {
      toast.error("تعذر تحميل رسائل الفريق");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!user) return null;

  const canComplete = isOwner || isAdmin || isModerator || isSupervisor;

  const doSend = async () => {
    if (!content.trim()) { toast.error("اكتب النص أولاً"); return; }
    setSending(true);
    try {
      await sendOwnerComms(kind, content.trim(), target);
      setContent("");
      toast.success("أُرسلت إلى الفريق");
      void refresh();
    } catch (e) {
      toast.error(errMsg(e, "تعذر الإرسال"));
    } finally { setSending(false); }
  };

  const pending = comms.filter((c) => c.kind === "task" && c.task_status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-500/15 text-blue-600 flex items-center justify-center">
          <MessageSquareText className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold">تواصل الفريق</h2>
          <p className="text-xs text-muted-foreground">
            {isOwner ? "رسائل ومهام منك إلى فريق الإدارة" : "رسائل ومهام المالك"} · {pending} مهام معلّقة
          </p>
        </div>
      </div>

      {isOwner && (
        <Card>
          <CardContent className="pt-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border overflow-hidden">
                {(["note", "task"] as CommKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`px-3 py-1.5 text-xs font-medium ${kind === k ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
                  >
                    {k === "note" ? "رسالة" : "مهمة"}
                  </button>
                ))}
              </div>
              <div className="relative">
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value as TargetRole)}
                  className="h-9 text-sm rounded-lg border bg-transparent px-3 pr-8 appearance-none cursor-pointer"
                >
                  {(Object.keys(COMM_TARGET_LABEL) as TargetRole[]).map((t) => (
                    <option key={t} value={t}>إلى: {COMM_TARGET_LABEL[t]}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-2 top-2.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} placeholder={kind === "task" ? "اكتب المهمة المطلوبة من الفريق..." : "اكتب الرسالة..."} />
            <Button onClick={doSend} disabled={sending || !content.trim()} className="gap-1">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} إرسال
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : comms.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-10">لا توجد رسائل بعد</p>
      ) : (
        comms.map((c) => (
          <CommRow key={c.id} c={c} isOwner={isOwner} canComplete={canComplete} onChanged={refresh} />
        ))
      )}
    </div>
  );
};

export default StaffCommsPanel;