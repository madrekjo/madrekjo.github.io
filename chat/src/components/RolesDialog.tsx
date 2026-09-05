import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invalidateAppConfig } from "@/lib/appCache";
import { invalidateCache } from "@/lib/dataLayer";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Shield, ShieldCheck, UserCog, Users } from "lucide-react";

const ROLE_DEFS: { key: string; label: string; description: string; icon: any; adminOnly?: boolean }[] = [
  { key: "moderator", label: "مشرف", description: "صلاحيات إشرافية قابلة للتحكم من صفحة الصلاحيات", icon: ShieldCheck },
  { key: "supervisor", label: "مسؤول", description: "رتبة إدارية أخف من المشرف — صلاحياتها من صفحة الصلاحيات", icon: UserCog },
  { key: "rounds_manager", label: "مسؤول جولات", description: "يقدر ينشئ جولات دراسية جديدة", icon: Users },
  { key: "admin", label: "أدمن", description: "صلاحية كاملة — استخدمها بحذر", icon: Shield, adminOnly: true },
];

interface Props {
  userId: string | null;
  userName?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged?: () => void;
}

const RolesDialog = ({ userId, userName, open, onOpenChange, onChanged }: Props) => {
  const { isAdmin } = useAuth();
  const [current, setCurrent] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId || !open) return;
    supabase.from("user_roles").select("role").eq("user_id", userId).then(({ data }) => {
      const list = (data || []).map((r: any) => r.role as string);
      setCurrent(list);
      setSelected(new Set(list));
    });
  }, [userId, open]);

  const toggle = (role: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(role)) n.delete(role); else n.add(role);
      return n;
    });
  };

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    const toAdd = [...selected].filter(r => !current.includes(r));
    const toRemove = current.filter(r => !selected.has(r));

    let failed = false;
    for (const r of toAdd) {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: r as any });
      if (error) { failed = true; toast.error(`فشل إضافة ${r}: ${error.message}`); }
    }
    for (const r of toRemove) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", r as any);
      if (error) { failed = true; toast.error(`فشل إزالة ${r}: ${error.message}`); }
    }
    setSaving(false);
    if (!failed) toast.success("تم حفظ الرتب");
    if (toAdd.length || toRemove.length) {
      invalidateAppConfig(); // تحديث مجموعة الأدمن/الرتب فوراً
      invalidateCache(`auth:roles:${userId}`); // كاش رتب المستخدم الهدف نفسه
    }
    onChanged?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>الرتب — {userName || ""}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {ROLE_DEFS.filter(r => !r.adminOnly || isAdmin).map(r => {
            const Icon = r.icon;
            return (
              <label key={r.key} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                <Checkbox checked={selected.has(r.key)} onCheckedChange={() => toggle(r.key)} className="mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium flex items-center gap-1"><Icon className="w-4 h-4" /> {r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                </div>
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RolesDialog;
