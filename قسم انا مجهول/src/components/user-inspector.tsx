import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Ban, ShieldPlus, ShieldMinus, Trash2, Copy, Ghost, MessageCircle, FileText, Heart, TriangleAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";
import { addGlobalBan } from "@/lib/global-bans";
import { adminUserWarning } from "@/lib/warnings";
import { WarnDialog } from "@/components/warn-dialog";

type PostRow = { id: string; content: string; created_at: string; status: string; hidden: boolean; pinned: boolean };
type CommentRow = { id: string; post_id: string; content: string; created_at: string };
type ChatRow = { id: string; content: string; created_at: string };
type ChatCommentRow = { id: string; post_id: string; content: string; created_at: string };

type Dossier = {
  user_id: string;
  email: string;
  created_at: string | null;
  last_sign_in_at: string | null;
  is_admin: boolean;
  post_count: number;
  comment_count: number;
  chat_post_count: number;
  chat_comment_count: number;
  like_count: number;
  recent_posts: PostRow[];
  recent_comments: CommentRow[];
  recent_chat_posts: ChatRow[];
  recent_chat_comments: ChatCommentRow[];
};

type WarningInfo = { message: string; at: string | null; seen_at: string | null };

function timeAgo(d: string) {
  try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ar }); } catch { return ""; }
}

export function UserInspector({
  userId, open, onOpenChange, onChanged,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged?: () => void;
}) {
  const { session } = useAuth();
  const adminEmail = session?.user?.email ?? "";
  const [data, setData] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<WarningInfo | null>(null);
  const [warnOpen, setWarnOpen] = useState(false);

  async function load() {
    if (!userId) return;
    setLoading(true);
    const [{ data: d, error }, w] = await Promise.all([
      (supabase.rpc as any)("admin_user_dossier", { p_user_id: userId }),
      adminUserWarning(userId).catch(() => null),
    ]);
    setLoading(false);
    if (error) { toast.error("فشل تحميل الملف: " + error.message); return; }
    setData(d as Dossier);
    setWarn(w);
  }

  useEffect(() => {
    if (open && userId) { setData(null); void load(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  if (!userId) return null;

  async function copyId() {
    try { await navigator.clipboard.writeText(userId!); toast.success("نُسخ المعرّف"); } catch { /* ignore */ }
  }

  async function banEmail() {
    if (!data) return;
    if (!confirm(`حظر ${data.email} موحداً (من كل الأقسام)؟`)) return;
    setBusy(true);
    try {
      await addGlobalBan(adminEmail, data.email, "حظر من ملف الحساب");
      toast.success("تم الحظر الموحّد");
      onChanged?.();
    } catch (e) {
      toast.error("فشل الحظر: " + ((e as Error)?.message || ""));
    } finally { setBusy(false); }
  }

  async function toggleAdmin() {
    if (!data) return;
    const makeAdmin = !data.is_admin;
    if (!confirm(makeAdmin ? `تعيين ${data.email} أدمن؟` : `إزالة صلاحية الأدمن عن ${data.email}؟`)) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("admin_set_user_admin", { p_user_id: userId, p_admin: makeAdmin });
    setBusy(false);
    if (error) toast.error("فشل: " + error.message);
    else { toast.success("تم"); void load(); onChanged?.(); }
  }

  async function del(table: string, id: string, label: string) {
    if (!confirm(`حذف ${label}؟`)) return;
    const { error } = await supabase.from(table as any).delete().eq("id", id);
    if (error) toast.error("فشل: " + error.message);
    else { toast.success("تم الحذف"); void load(); onChanged?.(); }
  }

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // لا نغلق ملف الحساب إذا كان حوار التحذير مفتوحاً فوقه
        if (!o && warnOpen) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>ملف الحساب</DialogTitle></DialogHeader>
        {loading && <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {data && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-base font-black text-primary" dir="ltr">{data.email}</div>
                  <span className="break-all font-mono text-[10px] text-muted-foreground">{data.user_id}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={copyId}><Copy className="h-3 w-3" /></Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="destructive" size="sm" onClick={banEmail} disabled={busy}>
                <Ban className="h-3 w-3 ml-1" /> حظر موحد
              </Button>
              <Button
                variant={data.is_admin ? "secondary" : "default"}
                size="sm"
                onClick={toggleAdmin}
                disabled={busy}
              >
                {data.is_admin ? <ShieldMinus className="h-3 w-3 ml-1" /> : <ShieldPlus className="h-3 w-3 ml-1" />}
                {data.is_admin ? "إزالة أدمن" : "تعيين أدمن"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWarnOpen(true)}
                className="col-span-2 border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400"
              >
                <TriangleAlert className="h-3 w-3 ml-1" /> {warn ? "تعديل التحذير / إلغاؤه" : "إرسال تحذير"}
              </Button>
            </div>

            {warn && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs">
                <div className="font-bold text-red-600 dark:text-red-400">التحذير الحالي</div>
                <p className="mt-1 whitespace-pre-wrap">{warn.message}</p>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {warn.seen_at ? "قرأه المستخدم" : "لم يقرأه بعد"}
                  {warn.at ? ` · ${new Date(warn.at).toLocaleString("ar")}` : ""}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-xs">
              <div>التسجيل: <b>{data.created_at ? timeAgo(data.created_at) : "—"}</b></div>
              <div>آخر دخول: <b>{data.last_sign_in_at ? timeAgo(data.last_sign_in_at) : "—"}</b></div>
              <div className="flex items-center gap-1"><FileText className="h-3 w-3" /> المنشورات: <b>{data.post_count}</b></div>
              <div className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> التعليقات: <b>{data.comment_count}</b></div>
              <div className="flex items-center gap-1"><Ghost className="h-3 w-3" /> شات-منشور: <b>{data.chat_post_count}</b></div>
              <div className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> شات-تعليق: <b>{data.chat_comment_count}</b></div>
              <div className="flex items-center gap-1"><Heart className="h-3 w-3" /> الإعجابات: <b>{data.like_count}</b></div>
            </div>

            {data.recent_posts.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold">أحدث المنشورات ({data.post_count})</div>
                <div className="space-y-1">
                  {data.recent_posts.map((p) => (
                    <div key={p.id} className="flex items-start justify-between gap-2 rounded border border-border bg-card p-2 text-xs">
                      <div className="flex-1">
                        <div className="text-[10px] text-muted-foreground">
                          {timeAgo(p.created_at)} · {p.status}{p.hidden ? " · مخفي" : ""}{p.pinned ? " · مثبّت" : ""}
                        </div>
                        <div className="line-clamp-3 whitespace-pre-wrap">{p.content}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => del("posts", p.id, "المنشور")}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.recent_comments.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold">أحدث التعليقات ({data.comment_count})</div>
                <div className="space-y-1">
                  {data.recent_comments.map((c) => (
                    <div key={c.id} className="flex items-start justify-between gap-2 rounded border border-border bg-card p-2 text-xs">
                      <div className="flex-1">
                        <div className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</div>
                        <div className="line-clamp-3 whitespace-pre-wrap">{c.content}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => del("comments", c.id, "التعليق")}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.recent_chat_posts.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold">أحدث منشورات الشات ({data.chat_post_count})</div>
                <div className="space-y-1">
                  {data.recent_chat_posts.map((c) => (
                    <div key={c.id} className="flex items-start justify-between gap-2 rounded border border-border bg-card p-2 text-xs">
                      <div className="flex-1">
                        <div className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</div>
                        <div className="line-clamp-3 whitespace-pre-wrap">{c.content}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => del("chat_posts", c.id, "منشور الشات")}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.recent_chat_comments.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold">أحدث تعليقات الشات ({data.chat_comment_count})</div>
                <div className="space-y-1">
                  {data.recent_chat_comments.map((c) => (
                    <div key={c.id} className="flex items-start justify-between gap-2 rounded border border-border bg-card p-2 text-xs">
                      <div className="flex-1">
                        <div className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</div>
                        <div className="line-clamp-3 whitespace-pre-wrap">{c.content}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => del("chat_comments", c.id, "تعليق الشات")}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.post_count === 0 && data.comment_count === 0 && data.chat_post_count === 0 && data.chat_comment_count === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">لا يوجد محتوى لهذا الحساب.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
    <WarnDialog
      userId={userId}
      email={data?.email ?? null}
      open={warnOpen}
      onOpenChange={setWarnOpen}
      onSent={() => { void load(); onChanged?.(); }}
    />
    </>
  );
}
