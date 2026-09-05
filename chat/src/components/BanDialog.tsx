import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ban, MessageSquareOff, Clock, Smartphone } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged?: () => void;
}

const BanDialog = ({ userId, open, onOpenChange, onChanged }: Props) => {
  const { isAdmin, hasPermission, user: me } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [minutes, setMinutes] = useState(15);
  const [deviceReason, setDeviceReason] = useState("");

  useEffect(() => {
    if (!userId || !open) { setProfile(null); return; }
    supabase.from("profiles").select("user_id, full_name, avatar_url, is_banned, chat_banned, timeout_until, generation, gender, email, created_at").eq("user_id", userId).maybeSingle().then(({ data }) => setProfile(data));
  }, [userId, open]);

  const refresh = async () => {
    if (!userId) return;
    const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url, is_banned, chat_banned, timeout_until, generation, gender, email, created_at").eq("user_id", userId).maybeSingle();
    setProfile(data);
    onChanged?.();
  };

  if (!userId) return null;
  const inTimeout = profile?.timeout_until && new Date(profile.timeout_until) > new Date();

  const canBan = hasPermission("can_ban_users");
  const canTimeout = hasPermission("can_timeout");

  const toggleNormalBan = async () => {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update({ is_banned: !profile.is_banned }).eq("user_id", userId);
    if (error) toast.error("فشل"); else { toast.success(profile.is_banned ? "تم رفع الحظر" : "تم الحظر العادي"); refresh(); }
  };
  const toggleChatBan = async () => {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update({ chat_banned: !profile.chat_banned } as any).eq("user_id", userId);
    if (error) toast.error("فشل"); else { toast.success(profile.chat_banned ? "تم رفع حظر الشات" : "تم حظر الشات"); refresh(); }
  };
  const applyTimeout = async () => {
    const until = new Date(Date.now() + minutes * 60000).toISOString();
    const { error } = await supabase.from("profiles").update({ timeout_until: until } as any).eq("user_id", userId);
    if (error) toast.error("فشل"); else { toast.success(`تايم اوت ${minutes}د`); refresh(); }
  };
  const clearTimeoutNow = async () => {
    const { error } = await supabase.from("profiles").update({ timeout_until: null } as any).eq("user_id", userId);
    if (error) toast.error("فشل"); else { toast.success("تم رفع التايم اوت"); refresh(); }
  };
  const banDevice = async () => {
    const { data: devs } = await (supabase as any).from("user_devices").select("device_id").eq("user_id", userId);
    if (!devs || devs.length === 0) { toast.error("لا يوجد أجهزة مسجّلة"); return; }
    const rows = devs.map((d: any) => ({ device_id: d.device_id, reason: deviceReason || "حظر من الإدارة", banned_by: me?.id }));
    const { error } = await (supabase as any).from("banned_devices").upsert(rows, { onConflict: "device_id" });
    if (error) toast.error("فشل"); else { toast.success(`تم حظر ${devs.length} جهاز`); setDeviceReason(""); onOpenChange(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>خيارات الحظر — {profile?.full_name || ""}</DialogTitle></DialogHeader>
        <Tabs defaultValue="normal">
          <TabsList className="grid grid-cols-4 h-auto">
            {canBan && <TabsTrigger value="normal" className="text-xs gap-1"><Ban className="w-3 h-3" />عادي</TabsTrigger>}
            {canBan && <TabsTrigger value="chat" className="text-xs gap-1"><MessageSquareOff className="w-3 h-3" />شات</TabsTrigger>}
            {canTimeout && <TabsTrigger value="timeout" className="text-xs gap-1"><Clock className="w-3 h-3" />تايم اوت</TabsTrigger>}
            {isAdmin && <TabsTrigger value="device" className="text-xs gap-1"><Smartphone className="w-3 h-3" />جهاز</TabsTrigger>}
          </TabsList>

          <TabsContent value="normal" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">يمنع المستخدم من الوصول لكل الأقسام باستثناء الدعم.</p>
            <p className="text-xs">الحالة الحالية: {profile?.is_banned ? "🚫 محظور" : "✅ غير محظور"}</p>
            <Button className="w-full" variant={profile?.is_banned ? "outline" : "destructive"} onClick={toggleNormalBan}>
              {profile?.is_banned ? "رفع الحظر العادي" : "تطبيق الحظر العادي"}
            </Button>
          </TabsContent>

          <TabsContent value="chat" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">يمنعه من الدردشة العامة فقط. باقي الأقسام تبقى متاحة.</p>
            <p className="text-xs">الحالة: {profile?.chat_banned ? "🔇 محظور شات" : "✅ غير محظور"}</p>
            <Button className="w-full" variant={profile?.chat_banned ? "outline" : "destructive"} onClick={toggleChatBan}>
              {profile?.chat_banned ? "رفع حظر الشات" : "حظر من الشات"}
            </Button>
          </TabsContent>

          <TabsContent value="timeout" className="space-y-3 pt-3">
            {inTimeout ? (
              <>
                <p className="text-sm text-amber-500">⏱ حالياً في تايم اوت حتى {new Date(profile.timeout_until).toLocaleString("ar")}</p>
                <Button className="w-full" variant="outline" onClick={clearTimeoutNow}>رفع التايم اوت</Button>
              </>
            ) : (
              <>
                <label className="text-sm">المدة (دقائق)</label>
                <Input type="number" min={1} value={minutes} onChange={e => setMinutes(Number(e.target.value))} />
                <div className="flex gap-1 flex-wrap">
                  {[5, 15, 30, 60, 180, 1440].map(m => (
                    <Button key={m} size="sm" variant="outline" onClick={() => setMinutes(m)}>
                      {m < 60 ? `${m}د` : m === 1440 ? "يوم" : `${m / 60}س`}
                    </Button>
                  ))}
                </div>
                <Button className="w-full" onClick={applyTimeout}>تطبيق</Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="device" className="space-y-3 pt-3">
            <p className="text-sm text-destructive">⚠ حظر نهائي — لن يقدر يفتح المنصة من نفس الجهاز حتى بحساب جديد.</p>
            <Input value={deviceReason} onChange={e => setDeviceReason(e.target.value)} placeholder="سبب الحظر (اختياري)" />
            <Button className="w-full" variant="destructive" onClick={banDevice}>حظر الأجهزة نهائياً</Button>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BanDialog;
