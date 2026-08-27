import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Ban, ShieldPlus, Trash2, Copy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { invalidateDeviceLabel } from "@/lib/device-labels";
import { BanDialog } from "@/components/ban-dialog";

type Dossier = {
  device_id: string;
  label: string | null;
  is_admin: boolean;
  is_blocked: boolean;
  presence: { first_seen: string; last_seen: string; total_seconds: number; visits: number } | null;
  post_count: number;
  comment_count: number;
  chat_post_count: number;
  chat_comment_count: number;
  recent_posts: { id: string; content: string; created_at: string; status: string }[];
  recent_comments: { id: string; post_id: string; content: string; created_at: string }[];
};

function fmtDuration(sec: number) {
  if (!sec) return "0د";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}س ${m}د`;
  return `${m}د`;
}
function timeAgo(d: string) {
  try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ar }); } catch { return ""; }
}

export function DeviceInspector({ deviceId, open, onOpenChange }: { deviceId: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [data, setData] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const [banOpen, setBanOpen] = useState(false);


  async function load() {
    if (!deviceId) return;
    setLoading(true);
    const { data: d, error } = await supabase.rpc("get_device_dossier", { p_device_id: deviceId });
    setLoading(false);
    if (error) { toast.error("فشل التحميل"); return; }
    const r = d as unknown as Dossier;
    setData(r);
    setLabel(r?.label ?? "");
  }

  useEffect(() => { if (open && deviceId) { setData(null); load(); } }, [open, deviceId]);

  if (!deviceId) return null;

  async function saveLabel() {
    const { error } = await supabase.rpc("set_device_label", { p_device_id: deviceId!, p_label: label.trim() });
    if (error) toast.error("فشل الحفظ"); else { toast.success("تم"); invalidateDeviceLabel(deviceId!); load(); }
  }
  async function toggleBlock() {
    if (!data) return;
    if (data.is_blocked) {
      const { error } = await supabase.from("blocked_devices").delete().eq("device_id", deviceId!);
      if (error) toast.error("فشل"); else { toast.success("رُفع الحظر"); load(); }
    } else {
      setBanOpen(true);
    }
  }
  async function toggleAdmin() {
    if (!data) return;
    if (data.is_admin) {
      if (!confirm("إزالة صلاحيات الأدمن؟")) return;
      const { error } = await supabase.from("admin_devices").delete().eq("device_id", deviceId!);
      if (error) toast.error("فشل"); else { toast.success("تم"); load(); }
    } else {
      const { error } = await supabase.from("admin_devices").upsert({ device_id: deviceId!, note: "from inspector" });
      if (error) toast.error("فشل"); else { toast.success("أصبح أدمن"); load(); }
    }
  }
  async function copyId() {
    try { await navigator.clipboard.writeText(deviceId!); toast.success("نُسخ المعرف"); } catch {}
  }
  async function deletePost(id: string) {
    if (!confirm("حذف المنشور؟")) return;
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) toast.error("فشل"); else { toast.success("تم"); load(); }
  }
  async function deleteComment(id: string) {
    if (!confirm("حذف التعليق؟")) return;
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) toast.error("فشل"); else { toast.success("تم"); load(); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>ملف الجهاز</DialogTitle></DialogHeader>
        {loading && <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {data && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] break-all">{data.device_id}</span>
                <Button size="sm" variant="ghost" onClick={copyId}><Copy className="h-3 w-3" /></Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">اسم/ملاحظة خاصة (تظهر للأدمن فقط)</label>
              <div className="flex gap-2">
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثلاً: أحمد من الحي" maxLength={80} />
                <Button size="sm" onClick={saveLabel}>حفظ</Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant={data.is_blocked ? "secondary" : "destructive"} size="sm" onClick={toggleBlock}>
                <Ban className="h-3 w-3 ml-1" /> {data.is_blocked ? "رفع الحظر" : "حظر"}
              </Button>
              <Button variant={data.is_admin ? "secondary" : "default"} size="sm" onClick={toggleAdmin}>
                <ShieldPlus className="h-3 w-3 ml-1" /> {data.is_admin ? "إزالة أدمن" : "تعيين أدمن"}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-xs">
              <div>الوقت الكلي: <b>{fmtDuration(data.presence?.total_seconds ?? 0)}</b></div>
              <div>الزيارات: <b>{data.presence?.visits ?? 0}</b></div>
              <div>أول ظهور: <b>{data.presence ? timeAgo(data.presence.first_seen) : "—"}</b></div>
              <div>آخر ظهور: <b>{data.presence ? timeAgo(data.presence.last_seen) : "—"}</b></div>
              <div>المنشورات: <b>{data.post_count}</b></div>
              <div>التعليقات: <b>{data.comment_count}</b></div>
              <div>شات-منشور: <b>{data.chat_post_count}</b></div>
              <div>شات-تعليق: <b>{data.chat_comment_count}</b></div>
            </div>

            {data.recent_posts.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold">أحدث المنشورات</div>
                <div className="space-y-1">
                  {data.recent_posts.map((p) => (
                    <div key={p.id} className="flex items-start justify-between gap-2 rounded border border-border bg-card p-2 text-xs">
                      <div className="flex-1">
                        <div className="text-[10px] text-muted-foreground">{timeAgo(p.created_at)} · {p.status}</div>
                        <div className="line-clamp-2">{p.content}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => deletePost(p.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.recent_comments.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold">أحدث التعليقات</div>
                <div className="space-y-1">
                  {data.recent_comments.map((c) => (
                    <div key={c.id} className="flex items-start justify-between gap-2 rounded border border-border bg-card p-2 text-xs">
                      <div className="flex-1">
                        <div className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</div>
                        <div className="line-clamp-2">{c.content}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => deleteComment(c.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
      <BanDialog deviceId={deviceId!} open={banOpen} onOpenChange={setBanOpen} onBanned={load} />
    </Dialog>
  );
}
