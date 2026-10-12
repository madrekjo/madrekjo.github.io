import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Ban, Trash2, Loader2, Plus } from "lucide-react";

interface GlobalBanRow {
  email: string;
  reason: string | null;
  banned_by: string | null;
  banned_at: string;
}

export default function GlobalBansPanel() {
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState<GlobalBanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("global_bans")
      .select("email, reason, banned_by, banned_at")
      .order("banned_at", { ascending: false });
    if (error) {
      toast.error("تعذر تحميل قائمة الحظر الموحد: " + error.message);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const addBan = async () => {
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      toast.error("أدخل بريداً إلكترونياً صحيحاً");
      return;
    }
    if (rows.some((r) => r.email.toLowerCase() === em)) {
      toast.error("هذا البريد محظور موحداً بالفعل");
      return;
    }
    setBusy(true);
    const { error } = await (supabase as any)
      .from("global_bans")
      .insert({ email: em, reason: reason.trim() || null, banned_by: user?.id || null });
    setBusy(false);
    if (error) {
      toast.error("فشل إضافة الحظر الموحد: " + error.message);
      return;
    }
    toast.success("تم الحظر الموحد — لن يدخل هذا الحساب أي قسم حتى إزالته");
    setEmail("");
    setReason("");
    void load();
  };

  const removeBan = async (em: string) => {
    if (!confirm(`إزالة الحظر الموحد عن ${em}؟`)) return;
    const { error } = await (supabase as any)
      .from("global_bans")
      .delete()
      .eq("email", em);
    if (error) {
      toast.error("فشل إزالة الحظر: " + error.message);
      return;
    }
    toast.success("تم رفع الحظر الموحد");
    void load();
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="py-3.5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold">الحظر الموحد</p>
              <p className="text-xs text-muted-foreground">
                الأقسام كلها تشارك هذه القائمة عبر الوركر — المحظور هنا لا يدخل أيّ قسم حتى إزالة حظره.
              </p>
            </div>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-muted-foreground">البريد الإلكتروني للحساب (Google)</label>
              <Input
                dir="ltr"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addBan()}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-muted-foreground">السبب (اختياري)</label>
              <Input
                placeholder="مثال: مخالفة قوانين الدردشة"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addBan()}
              />
            </div>
            <Button onClick={() => void addBan()} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              حظر موحد
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">لا يوجد محظورون موحدون حالياً</p>
      ) : (
        rows.map((r) => (
          <Card key={r.email}>
            <CardContent className="py-3.5">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[160px]">
                  <p className="font-semibold" dir="ltr">{r.email}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.reason ? `السبب: ${r.reason}` : "لا سبب"} · حُظر في {new Date(r.banned_at).toLocaleString("ar")}
                  </p>
                </div>
                {(isAdmin) && (
                  <Button size="sm" variant="outline" onClick={() => void removeBan(r.email)}>
                    <Trash2 className="w-4 h-4" /> رفع الحظر
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}