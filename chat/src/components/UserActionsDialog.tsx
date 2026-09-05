import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCache } from "@/lib/dataLayer";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Ban, Edit2, AlertTriangle, Clock, Smartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

const UserActionsDialog = ({ userId, open, onOpenChange, onChanged }: Props) => {
  const { isAdmin, isModerator, user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<null | "rename" | "warn" | "timeout" | "device">(null);
  const [val, setVal] = useState("");
  const [minutes, setMinutes] = useState(15);
  const isStaff = isAdmin || isModerator;

  useEffect(() => {
    if (!userId || !open) return;
    setMode(null); setVal(""); setMinutes(15);
    setLoading(true);
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
      setProfile(data);
      setLoading(false);
    })();
  }, [userId, open]);

  const refresh = async () => {
    if (!userId) return;
    const { data } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
    setProfile(data);
    // إبطال كاش البيانات المسؤولة عن الحظر/التايم اوت/الاسم للهدف فوراً
    // حتى لا تتأخر العقوبة بانتهاء TTL القديم على الأجهزة الأخرى.
    invalidateCache(`auth:profile:${userId}`);
    invalidateCache(`auth:roles:${userId}`);
    onChanged?.();
  };

  const toggleNormalBan = async () => {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update({ is_banned: !profile.is_banned }).eq("user_id", profile.user_id);
    if (error) toast.error("فشل");
    else { toast.success(profile.is_banned ? "تم رفع الحظر" : "تم تطبيق الحظر العادي"); refresh(); }
  };

  const deviceBan = async () => {
    if (!userId) return;
    const { data: devs } = await (supabase as any).from("user_devices").select("device_id").eq("user_id", userId);
    if (!devs || devs.length === 0) {
      toast.error("لا يوجد أجهزة مسجّلة لهذا المستخدم بعد");
      return;
    }
    const rows = devs.map((d: any) => ({ device_id: d.device_id, reason: val || "حظر من المشرف", banned_by: user?.id }));
    const { error } = await (supabase as any).from("banned_devices").upsert(rows, { onConflict: "device_id" });
    if (error) toast.error("فشل حظر الجهاز"); else { toast.success(`تم حظر ${devs.length} جهاز`); setMode(null); setVal(""); }
  };

  const sendWarning = async () => {
    if (!userId || !val.trim()) return;
    const { error } = await (supabase as any).from("user_warnings").insert({ user_id: userId, issued_by: user?.id, reason: val.trim() });
    if (error) toast.error("فشل"); else { toast.success("تم إرسال التحذير"); setMode(null); setVal(""); }
  };

  const applyTimeout = async () => {
    if (!userId) return;
    const until = new Date(Date.now() + minutes * 60000).toISOString();
    const { error } = await supabase.from("profiles").update({ timeout_until: until } as any).eq("user_id", userId);
    if (error) toast.error("فشل"); else { toast.success(`تم تطبيق تايم اوت ${minutes} دقيقة`); setMode(null); refresh(); }
  };

  const renameUser = async () => {
    if (!userId || !val.trim()) return;
    const { error } = await supabase.from("profiles").update({ full_name: val.trim() }).eq("user_id", userId);
    if (error) toast.error("فشل"); else { toast.success("تم تغيير الاسم"); setMode(null); setVal(""); refresh(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>إجراءات المستخدم</DialogTitle></DialogHeader>
        {loading || !profile ? (
          <div className="py-8 flex justify-center"><Loader2 className="animate-spin w-6 h-6 text-primary" /></div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar><AvatarImage src={profile.avatar_url || ""} /><AvatarFallback>{profile.full_name?.charAt(0)}</AvatarFallback></Avatar>
              <div>
                <p className="font-bold">{profile.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {profile.is_banned ? "🚫 محظور (عادي)" : "✅ نشط"}
                </p>
              </div>
            </div>

            {!isStaff ? (
              <p className="text-sm text-muted-foreground text-center py-2">لا تملك صلاحيات</p>
            ) : mode === null ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => { setMode("rename"); setVal(profile.full_name); }}>
                  <Edit2 className="w-4 h-4" /> تغيير الاسم
                </Button>
                <Button variant={profile.is_banned ? "secondary" : "destructive"} size="sm" className="gap-1" onClick={toggleNormalBan}>
                  <Ban className="w-4 h-4" /> {profile.is_banned ? "رفع الحظر" : "حظر عادي"}
                </Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setMode("warn")}>
                  <AlertTriangle className="w-4 h-4" /> تحذير
                </Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setMode("timeout")}>
                  <Clock className="w-4 h-4" /> تايم اوت
                </Button>
                {isAdmin && (
                  <Button variant="destructive" size="sm" className="gap-1 col-span-2" onClick={() => setMode("device")}>
                    <Smartphone className="w-4 h-4" /> حظر الجهاز (نهائي)
                  </Button>
                )}
              </div>
            ) : mode === "rename" ? (
              <>
                <Input value={val} onChange={e => setVal(e.target.value)} placeholder="الاسم الجديد" />
                <DialogFooter><Button variant="ghost" onClick={() => setMode(null)}>إلغاء</Button><Button onClick={renameUser}>حفظ</Button></DialogFooter>
              </>
            ) : mode === "warn" ? (
              <>
                <Textarea value={val} onChange={e => setVal(e.target.value)} placeholder="سبب التحذير..." className="min-h-[100px]" />
                <DialogFooter><Button variant="ghost" onClick={() => setMode(null)}>إلغاء</Button><Button onClick={sendWarning} disabled={!val.trim()}>إرسال</Button></DialogFooter>
              </>
            ) : mode === "timeout" ? (
              <>
                <label className="text-sm">المدة (دقائق)</label>
                <Input type="number" min={1} value={minutes} onChange={e => setMinutes(Number(e.target.value))} />
                <div className="flex gap-1 flex-wrap">
                  {[5, 15, 30, 60, 180, 1440].map(m => (
                    <Button key={m} size="sm" variant="outline" onClick={() => setMinutes(m)}>{m < 60 ? `${m}د` : m === 1440 ? "يوم" : `${m / 60}س`}</Button>
                  ))}
                </div>
                <DialogFooter><Button variant="ghost" onClick={() => setMode(null)}>إلغاء</Button><Button onClick={applyTimeout}>تطبيق</Button></DialogFooter>
              </>
            ) : mode === "device" ? (
              <>
                <p className="text-sm text-destructive">سيتم حظر جميع الأجهزة المسجّلة لهذا المستخدم، ولن يقدر يسجّل من نفس الجهاز مرة ثانية.</p>
                <Input value={val} onChange={e => setVal(e.target.value)} placeholder="سبب الحظر (اختياري)" />
                <DialogFooter><Button variant="ghost" onClick={() => setMode(null)}>إلغاء</Button><Button variant="destructive" onClick={deviceBan}>حظر الجهاز نهائياً</Button></DialogFooter>
              </>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserActionsDialog;
