import { useState } from "react";
import { checkDeviceBanned } from "@/lib/deviceId";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { MessageCircle, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { SSO_AUTH_BASE_URL, SSO_TARGET } from "@/config/sso-config";
import { supabase } from "@/integrations/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CodeResult {
  valid: boolean;
  reason?: string;
  message?: string;
  remaining?: number;
}

const codeErrorMessage = (key: string) => {
  const map: Record<string, string> = {
    wrong_code: "الكود غير صحيح. تأكد من الرقم وأعد المحاولة.",
    code_expired: "انتهت صلاحية هذا الكود.",
    code_used_up: "تم استخدام هذا الكود بالكامل.",
    email_exists: "هذا الإيميل مستخدم من قبل، جرّب إيميلاً آخر.",
    invalid_email: "صيغة الإيميل غير صحيحة.",
    weak_password: "كلمة المرور قصيرة جداً (6 أحرف على الأقل).",
    name_required: "أدخل اسمك أولاً.",
    code_required: "أدخل الكود أولاً.",
  };
  return map[key] || key || "خطأ غير متوقع";
};

const Auth = () => {
  const [loading, setLoading] = useState(false);

  // حالة رمز الدعوة (أكواد الـ 6 أرقام)
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [codeResult, setCodeResult] = useState<CodeResult | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const startGoogleLogin = async () => {
    setLoading(true);

    // فتح نافذة Popup صغيرة متمركزة في الشاشة.
    // مهم: يتم فتحها فوراً ضمن ضغطة المستخدم (قبل أي await)
    // وإلا ستحجبها المتصفحات كـ Popup blocker.
    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const url = `${SSO_AUTH_BASE_URL}/login?target=${encodeURIComponent(SSO_TARGET)}`;

    let popup: Window | null = null;
    try {
      popup = window.open(
        url,
        "GoogleAuthPopup",
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      );
    } catch {
      popup = null;
    }

    if (!popup) {
      toast.error("تم منع النافذة المنبثقة، يرجى السماح بالنوافذ المنبثقة للموقع.");
      setLoading(false);
      return;
    }

    // مراقبة إغلاق النافذة المنبثقة
    const timer = setInterval(() => {
      if (popup!.closed) {
        clearInterval(timer);
        setLoading(false);
      }
    }, 500);

    // التحقق من الحظر بعد فتح النافذة
    try {
      const banned = await checkDeviceBanned();
      if (banned) {
        clearInterval(timer);
        try { popup.close(); } catch { /* ignore */ }
        toast.error("جهازك تم حظره من المنصة نهائياً");
        setLoading(false);
        return;
      }
    } catch (error: unknown) {
      // لا نكسر تدفق تسجيل الدخول إن فشل فحص الحظر
      console.error("[Auth] device ban check failed", error);
    }
  };

  const handleValidate = async () => {
    const value = code.trim();
    if (!/^\d{6}$/.test(value)) {
      toast.error("أدخل الكود المكوّن من 6 أرقام");
      return;
    }
    setChecking(true);
    const { data, error } = await (supabase.rpc as any)("validate_access_code", { p_code: value });
    setChecking(false);

    if (error) {
      console.error("[Auth] validate_access_code error", error);
      toast.error("تعذر التحقق من الكود، حاول مجدداً");
      return;
    }

    const result = data as unknown as CodeResult | null;
    setCodeResult(result);
    if (!result?.valid) {
      toast.error(codeErrorMessage(result?.reason || ""));
    }
  };

  const handleCreate = async () => {
    if (!codeResult?.valid) {
      toast.error("تحقق من الكود أولاً");
      return;
    }
    if (!name.trim()) {
      toast.error("أدخل اسمك الذي يظهر في الدردشة");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      toast.error("أدخل إيميلاً بصيغة صحيحة");
      return;
    }
    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    setCreating(true);
    try {
      const res = await supabase.functions.invoke("invite-signup", {
        body: { code: code.trim(), email: email.trim(), password, name: name.trim() },
      });
      const { data, error } = res as any;

      if (error) {
        let serverMsg: string | null = null;
        try {
          const ctx = await (error as any)?.context?.json?.();
          serverMsg = ctx?.error ?? null;
        } catch { /* ignore */ }
        toast.error(serverMsg ? codeErrorMessage(serverMsg) : "تعذر إنشاء الحساب، حاول مجدداً");
        return;
      }

      if (!data?.ok) {
        toast.error(codeErrorMessage(data?.error || ""));
        return;
      }

      // تسجيل الدخول الفوري بالإيميل وكلمة المرور اللذين أدخلهما المستخدم
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInErr) {
        console.error("[Auth] sign in after invite failed", signInErr);
        toast.success("تم إنشاء حسابك! سجّل الدخول الآن بإيميلك وكلمة المرور.");
        setCodeResult(null);
        setCode("");
      }
    } catch (e) {
      console.error("[Auth] invite-signup failed", e);
      toast.error("خطأ غير متوقع، حاول مجدداً");
    }
    setCreating(false);
  };

  const resetCode = () => {
    setCodeResult(null);
    setCode("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary">
            <MessageCircle className="w-8 h-8" />
          </div>
          <CardTitle className="text-2xl font-bold">تسجيل الدخول</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full flex items-center justify-center gap-2"
            variant="outline"
            onClick={startGoogleLogin}
            disabled={loading}
          >
            {loading ? "جاري فتح نافذة تسجيل الدخول..." : "تسجيل الدخول باستخدام Google"}
          </Button>

          <Separator className="my-2" />

          {!codeResult?.valid ? (
            <div className="space-y-3">
              <div>
                <Label className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4" />
                  الدخول برمز الدعوة
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  ليس لديك حساب Google؟ أدخل الرمز المكوّن من 6 أرقام الذي أعطاك إياه المشرف.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-lg tracking-[0.5em] font-mono"
                />
                <Button
                  onClick={handleValidate}
                  disabled={checking || code.length !== 6}
                  className="shrink-0"
                >
                  {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : "تحقق"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-2">
                <div className="flex items-center gap-2 text-green-600 font-medium">
                  <ShieldCheck className="w-4 h-4" />
                  تم التحقق من الكود
                  {typeof codeResult.remaining === "number" && (
                    <span className="text-xs text-muted-foreground font-normal">
                      (بقي {codeResult.remaining} استخدام)
                    </span>
                  )}
                </div>
                {codeResult.message && (
                  <p className="text-foreground leading-relaxed">{codeResult.message}</p>
                )}
                <button
                  onClick={resetCode}
                  className="text-xs text-primary underline underline-offset-2"
                >
                  تغيير الكود
                </button>
              </div>

              <div className="space-y-2">
                <Label>الاسم</Label>
                <Input
                  placeholder="الاسم الذي سيظهر في الدردشة"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>الإيميل</Label>
                <Input
                  type="email"
                  dir="ltr"
                  placeholder="example@mail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  لا حاجة لإيميل حقيقي — يُستخدم فقط للدخول لاحقاً.
                </p>
              </div>
              <div className="space-y-2">
                <Label>كلمة المرور</Label>
                <Input
                  type="password"
                  placeholder="6 أحرف على الأقل"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <Button className="w-full" onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري إنشاء الحساب...
                  </>
                ) : (
                  "إنشاء حساب والدخول"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;