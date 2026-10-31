import { useCallback, useEffect, useMemo, useState } from "react";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

interface CodeAccount {
  user_id: string;
  name: string | null;
  email: string | null;
}

interface AccessCode {
  id: string;
  code: string;
  max_uses: number;
  used_count: number;
  expires_at: string;
  message: string | null;
  created_at: string;
  active: boolean;
  accounts?: CodeAccount[];
}

const db = achievementSupabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

const errorText = (err: any): string => {
  const raw = String(err?.message || err?.details || err || "");
  if (/does not exist|schema cache|Could not find the function/i.test(raw)) {
    return "نفّذ ملف SQL الخاص بالأكواد أولاً: 20261031150000_access_codes.sql";
  }
  if (/admins_only/i.test(raw)) return "هذه العملية للمسؤولين فقط";
  if (/max_uses_must_be_positive/i.test(raw)) return "عدد الاستخدامات يجب أن يكون 1 على الأقل";
  if (/duration_must_be_positive/i.test(raw)) return "المدة يجب أن تكون ساعة على الأقل";
  return "تعذّر تنفيذ العملية، حاول مجدداً";
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString("ar", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export const AdminAccessCodes = () => {
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [maxUses, setMaxUses] = useState("1");
  const [durationHours, setDurationHours] = useState("24");
  const [message, setMessage] = useState("");
  const [newCode, setNewCode] = useState<AccessCode | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AccessCode | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data, error } = await db.rpc("list_access_codes");
      if (error) {
        toast.error(errorText(error));
        return;
      }
      const list = Array.isArray(data) ? data : [];
      setCodes(list as AccessCode[]);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const now = Date.now();
    return codes.reduce(
      (acc, c) => {
        const expired = new Date(c.expires_at).getTime() <= now;
        const usedUp = c.used_count >= c.max_uses;
        if (!expired && !usedUp) acc.active += 1;
        return acc;
      },
      { active: 0 }
    );
  }, [codes]);

  const createCode = async () => {
    const uses = parseInt(maxUses, 10);
    const hours = parseInt(durationHours, 10);
    if (!uses || uses < 1) {
      toast.error("عدد الاستخدامات غير صحيح");
      return;
    }
    if (!hours || hours < 1) {
      toast.error("مدة الصلاحية غير صحيحة");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await db.rpc("create_access_code", {
        p_max_uses: uses,
        p_duration_hours: hours,
        p_message: message.trim(),
      });
      if (error) {
        toast.error(errorText(error));
        return;
      }
      setNewCode(data as AccessCode);
      setMessage("");
      toast.success("تم إنشاء رمز الدخول");
      await load(true);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("تم نسخ الرمز");
    } catch {
      toast.error("تعذّر النسخ — انسخه يدوياً");
    }
  };

  const reactivate = async (row: AccessCode) => {
    setBusyId(row.id);
    try {
      const { error } = await db.rpc("reactivate_access_code", {
        p_id: row.id,
        p_duration_hours: 24,
      });
      if (error) {
        toast.error(errorText(error));
        return;
      }
      toast.success(`تم إعادة تفعيل الرمز ${row.code} لمدة 24 ساعة`);
      await load(true);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    setBusyId(revokeTarget.id);
    try {
      const { error } = await db.rpc("revoke_access_code", { p_id: revokeTarget.id });
      if (error) {
        toast.error(errorText(error));
        return;
      }
      toast.success("تم إلغاء الرمز");
      setRevokeTarget(null);
      await load(true);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5 text-right" dir="rtl">
      {/* إنشاء رمز */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">إنشاء رمز دخول جديد</h3>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          رمز مكوّن من 6 أرقام يسمح لمن لا يملك حساب Google بإنشاء حساب والدخول إلى منصة الإنجاز
          بدون تأكيد بريد. الرمز يُربط بالحسابات التي تستخدمه لتظهر هنا.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>عدد الاستخدامات المسموح</Label>
            <Input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1.5">
            <Label>مدة الصلاحية (بالساعات)</Label>
            <Input
              type="number"
              min={1}
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1.5">
            <Label>رسالة تظهر عند إدخال الرمز (اختياري)</Label>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={160}
              placeholder="مثال: أهلاً بك في منصة الإنجاز"
            />
          </div>
        </div>

        <Button className="mt-3 gap-1.5" onClick={createCode} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          إنشاء الرمز
        </Button>
      </div>

      {/* الرمز الجديد */}
      {newCode && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                <CheckCircle2 className="h-4 w-4" />
                تم إنشاء الرمز — انسخه وأرسله لمن تريد دعوته
              </p>
              <div className="mt-2 flex items-center gap-3">
                <span className="font-mono text-3xl font-bold tracking-[0.35em] text-foreground">
                  {newCode.code}
                </span>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => copyCode(newCode.code)}>
                  <Copy className="h-4 w-4" />
                  نسخ
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                صالح حتى {formatDate(newCode.expires_at)} · عدد الاستخدامات {newCode.max_uses}
                {newCode.message ? ` · الرسالة: ${newCode.message}` : ""}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setNewCode(null)}>
              إخفاء
            </Button>
          </div>
        </div>
      )}

      {/* قائمة الأكواد */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">أكواد الدخول ({codes.length})</h3>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
            نشط: {totals.active}
          </span>
        </div>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          تحديث
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : codes.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/50 px-4 py-10 text-center">
          <KeyRound className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-2 text-sm font-medium">لا توجد أكواد بعد</p>
          <p className="text-xs text-muted-foreground">أنشئ رمزاً من الأعلى وشاركه مع من تريد دعوته.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {codes.map((row) => {
            const expired = new Date(row.expires_at).getTime() <= Date.now();
            const usedUp = row.used_count >= row.max_uses;
            const active = !expired && !usedUp;
            const accounts = row.accounts ?? [];

            return (
              <div key={row.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-2xl font-bold tracking-[0.25em]">{row.code}</span>
                      {active ? (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
                          نشط
                        </span>
                      ) : expired ? (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-600">
                          منتهي
                        </span>
                      ) : (
                        <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive">
                          مستنفد
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {row.used_count}/{row.max_uses} استخدام
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      أُنشئ {formatDate(row.created_at)} · ينتهي {formatDate(row.expires_at)}
                    </p>
                    {row.message ? (
                      <p className="mt-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm">💬 {row.message}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => copyCode(row.code)}
                    >
                      <Copy className="h-4 w-4" />
                      نسخ
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1"
                      disabled={busyId === row.id}
                      onClick={() => void reactivate(row)}
                    >
                      {busyId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      إعادة تفعيل
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1"
                      disabled={busyId === row.id}
                      onClick={() => setRevokeTarget(row)}
                    >
                      <Trash2 className="h-4 w-4" />
                      إلغاء
                    </Button>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-dashed px-3 py-2">
                  <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                    <UserRound className="h-3.5 w-3.5" />
                    الحسابات المرتبطة ({accounts.length})
                  </p>
                  {accounts.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">لم يستخدم الرمز أحد بعد.</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {accounts.map((account) => (
                        <li key={account.user_id} className="text-xs">
                          <span className="font-medium text-foreground">
                            {account.name?.trim() || "بدون اسم"}
                          </span>
                          {account.email ? (
                            <span className="text-muted-foreground"> — {account.email}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إلغاء رمز الدخول</DialogTitle>
            <DialogDescription>
              سيُحذف الرمز {revokeTarget?.code} نهائياً ولن يستطيع أحد استخدامه للدخول. الحسابات التي
              أُنشئت به تبقى محفوظة.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={!!busyId}>
              تراجع
            </Button>
            <Button variant="destructive" onClick={() => void revoke()} disabled={!!busyId} className="gap-1">
              {busyId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              إلغاء الرمز
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
