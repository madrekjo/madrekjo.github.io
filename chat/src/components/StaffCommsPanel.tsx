import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Send, Trash2, CheckCircle2, Loader2, MessageSquareText, ClipboardCheck, ChevronDown, ImagePlus, X, Undo2, Image as ImageIcon } from "lucide-react";
import { uploadToCloudinary } from "@/lib/cloudinary";
import {
  fetchOwnerComms,
  sendOwnerComms,
  replyOwnerComms,
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

const ImagePick = ({ onPick, busy }: { onPick: (file: File) => void; busy: boolean }) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Input
        ref={ref as never}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="ghost" size="sm" className="gap-1" disabled={busy} onClick={() => ref.current?.click()}>
        <ImagePlus className="w-4 h-4" /> صورة
      </Button>
    </>
  );
};

const ReplyComposer = ({ rootId, onSent, isTask }: { rootId: string; onSent: () => void; isTask: boolean }) => {
  const [content, setContent] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickImage = (f: File) => {
    setImage(f);
    setPreview(URL.createObjectURL(f));
  };

  const sendReply = async () => {
    if (!content.trim() && !image) { toast.error("اكتب ردّك أو أرفق صورة"); return; }
    setBusy(true);
    try {
      let url: string | null = null;
      if (image) url = await uploadToCloudinary(image);
      await replyOwnerComms(rootId, content.trim(), url);
      setContent(""); setImage(null); setPreview(null);
      toast.success("تم إرسال الردّ للمالك ✓");
      onSent();
    } catch (e) {
      toast.error(errMsg(e, "تعذر إرسال الردّ"));
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      {preview && (
        <div className="relative inline-block">
          <img src={preview} alt="" className="h-20 w-20 object-cover rounded-lg" />
          <button
            type="button"
            className="absolute -top-1.5 -left-1.5 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center"
            onClick={() => { setImage(null); setPreview(null); }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <ImagePick onPick={pickImage} busy={busy} />
        <Button variant="outline" size="sm" className="gap-1" disabled={busy || (!content.trim() && !image)} onClick={sendReply}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {isTask ? "ردّ على المهمة" : "ردّ"}
        </Button>
      </div>
      <Textarea className="h-16" value={content} onChange={(e) => setContent(e.target.value)} placeholder="ردّك على المالك..." />
    </div>
  );
};

const CommRow = ({ root, canComplete, isOwner, canReply, onChanged }: {
  root: OwnerCommunication;
  canComplete: boolean;
  isOwner: boolean;
  canReply: boolean;
  onChanged: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [replying, setReplying] = useState(false);

  const doComplete = async () => {
    setBusy(true);
    try {
      await completeOwnerTask(root.id);
      toast.success(root.task_status === "done" ? "أُلغيت علامة الإنجاز" : "تم تعليم المهمة ✓");
      onChanged();
    } catch (e) {
      toast.error(errMsg(e, "تعذر التحديث"));
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!confirm("حذف هذه الرسالة وردودها نهائياً؟")) return;
    setBusy(true);
    try {
      await deleteOwnerComms(root.id);
      toast.success("حُذف");
      onChanged();
    } catch (e) {
      toast.error(errMsg(e, "تعذر الحذف"));
    } finally { setBusy(false); }
  };

  const isTask = root.kind === "task";
  const done = root.task_status === "done";

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
                إلى: {COMM_TARGET_LABEL[root.target_role] || "—"}
              </span>
            </div>
            <p className={`mt-2 whitespace-pre-wrap ${isTask ? "font-bold" : ""}`}>{root.content}</p>
            {root.image_url && <img src={root.image_url} alt="" className="mt-2 rounded-lg max-h-60 object-cover" />}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {root.author_name ? <b>{root.author_name}</b> : "—"} · {timeAgo(root.created_at)}
              {done && root.doer_name && <> · أُنجزت بواسطة <b>{root.doer_name}</b> {root.done_at ? timeAgo(root.done_at) : ""}</>}
            </p>
          </div>
          {isOwner && (
            <Button variant="ghost" size="sm" className="text-red-500 shrink-0" onClick={doDelete} disabled={busy}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          {isTask && canComplete && (
            <Button size="sm" variant={done ? "outline" : "default"} className="gap-1" onClick={doComplete} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <Undo2 className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              {done ? "إلغاء الإنجاز" : "أُنجزت المهمة ✓"}
            </Button>
          )}
          {canReply && (
            <Button size="sm" variant="ghost" className="gap-1" onClick={() => setReplying((r) => !r)}>
              <MessageSquareText className="w-4 h-4" /> {replying ? "إلغاء" : isTask ? "ردّ على المهمة" : "ردّ"}
            </Button>
          )}
        </div>

        {replying && canReply && (
          <ReplyComposer rootId={root.id} onSent={onChanged} isTask={isTask} />
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
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
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

  const pickImage = (f: File) => {
    setImage(f);
    setPreview(URL.createObjectURL(f));
  };

  const doSend = async () => {
    if (!content.trim() && !image) { toast.error("اكتب النص أو أرفق صورة"); return; }
    setSending(true);
    try {
      let url: string | null = null;
      if (image) url = await uploadToCloudinary(image);
      await sendOwnerComms(kind, content.trim(), target, url);
      setContent(""); setImage(null); setPreview(null);
      toast.success(kind === "task" ? "أُرسلت المهمة مع إشعار للفريق" : "أُرسلت الرسالة مع إشعار للفريق");
      void refresh();
    } catch (e) {
      toast.error(errMsg(e, "تعذر الإرسال"));
    } finally { setSending(false); }
  };

  const roots = comms.filter((c) => !c.parent_id);
  const pending = roots.filter((c) => c.kind === "task" && c.task_status === "pending").length;

  const canReplyTo = (root: OwnerCommunication) =>
    !isOwner && (() => {
      if (root.target_role === "all") return isAdmin || isModerator || isSupervisor;
      if (root.target_role === "admin") return isAdmin;
      if (root.target_role === "moderator") return isModerator;
      if (root.target_role === "supervisor") return isSupervisor;
      return false;
    })();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-500/15 text-blue-600 flex items-center justify-center">
          <MessageSquareText className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold">تواصل الفريق</h2>
          <p className="text-xs text-muted-foreground">
            {isOwner ? "رسائل ومهام منك إلى فريق الإدارة — وردودهم تظهر تحت كل رسالة" : "رسائل ومهام المالك — تردّ عليه أو تعلّم المهمة"} · {pending} مهام معلّقة
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
            {preview && (
              <div className="relative inline-block">
                <img src={preview} alt="" className="h-24 w-24 object-cover rounded-lg" />
                <button
                  type="button"
                  className="absolute -top-1.5 -left-1.5 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center"
                  onClick={() => { setImage(null); setPreview(null); }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} placeholder={kind === "task" ? "اكتب المهمة المطلوبة من الفريق..." : "اكتب الرسالة..."} />
            <div className="flex items-center gap-2">
              <Button onClick={doSend} disabled={sending || (!content.trim() && !image)} className="gap-1">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} إرسال
              </Button>
              <ImagePick onPick={pickImage} busy={sending} />
              {image && <span className="text-xs text-muted-foreground flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" /> مرفقة</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : roots.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-10">لا توجد رسائل بعد</p>
      ) : (
        roots.map((root) => {
          const replies = comms
            .filter((c) => c.parent_id === root.id)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          return (
            <div key={root.id}>
              <CommRow root={root} canComplete={canComplete} isOwner={!!isOwner} canReply={canReplyTo(root)} onChanged={refresh} />
              {replies.length > 0 && (
                <div className="mr-6 space-y-2">
                  {replies.map((r) => (
                    <Card key={r.id} className="bg-muted/30">
                      <CardContent className="py-3">
                        <p className="whitespace-pre-wrap text-sm">{r.content}</p>
                        {r.image_url && <img src={r.image_url} alt="" className="mt-1.5 rounded-lg max-h-40 object-cover" />}
                        <p className="mt-1 text-xs text-muted-foreground">
                          <b>{r.author_name || "—"}</b> · {timeAgo(r.created_at)}
                          <span className="mr-1 inline-flex items-center gap-0.5 text-[11px]"><ClipboardCheck className="w-3 h-3" /> ردّ</span>
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

export default StaffCommsPanel;