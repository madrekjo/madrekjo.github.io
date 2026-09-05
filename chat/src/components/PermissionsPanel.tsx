import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, invalidatePermissions } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ShieldCheck, UserCog } from "lucide-react";

const PERMS: { key: string; label: string }[] = [
  { key: "can_delete_posts", label: "حذف المنشورات" },
  { key: "can_delete_comments", label: "حذف التعليقات" },
  { key: "can_ban_users", label: "حظر المستخدمين (عادي/شات)" },
  { key: "can_timeout", label: "تطبيق تايم اوت" },
  { key: "can_warn", label: "إرسال تحذيرات" },
  { key: "can_manage_reports", label: "إدارة البلاغات" },
  { key: "can_lock_sections", label: "إغلاق الأقسام" },
  { key: "can_manage_words", label: "إدارة الكلمات المحظورة" },
];

const ROLES: { key: string; label: string; icon: any; color: string }[] = [
  { key: "moderator", label: "صلاحيات المشرف", icon: ShieldCheck, color: "text-primary" },
  { key: "supervisor", label: "صلاحيات المسؤول", icon: UserCog, color: "text-accent-foreground" },
];

const PermissionsPanel = () => {
  const { refreshProfile } = useAuth();
  const [matrix, setMatrix] = useState<Record<string, any>>({});

  const load = async () => {
    const { data } = await (supabase as any).from("role_permissions").select("*");
    const map: Record<string, any> = {};
    (data || []).forEach((row: any) => { map[row.role] = row; });
    setMatrix(map);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (role: string, perm: string, value: boolean) => {
    const { error } = await (supabase as any).from("role_permissions")
      .upsert({ role, [perm]: value, updated_at: new Date().toISOString() }, { onConflict: "role" });
    if (error) toast.error("فشل الحفظ");
    else {
      toast.success("تم الحفظ");
      // إبطال كاش الصلاحيات فوراً ليبقى لكل الأجهزة وتعكس الجلسة الحالية بعد الخفض.
      invalidatePermissions();
      refreshProfile().catch(() => {});
      load();
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        تحكّم في ما يقدر كل من المشرف والمسؤول يعمله. الأدمن دائماً عنده كل الصلاحيات.
      </p>
      {ROLES.map(r => {
        const row = matrix[r.key] || {};
        const Icon = r.icon;
        return (
          <Card key={r.key}>
            <CardHeader className="pb-3">
              <CardTitle className={`text-base flex items-center gap-2 ${r.color}`}>
                <Icon className="w-5 h-5" /> {r.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {PERMS.map(p => (
                <div key={p.key} className="flex items-center justify-between border-b last:border-0 py-2">
                  <span className="text-sm">{p.label}</span>
                  <Switch
                    checked={!!row[p.key]}
                    onCheckedChange={(v) => toggle(r.key, p.key, v)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PermissionsPanel;
