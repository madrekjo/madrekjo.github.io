import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, KeyRound, ArrowRight, Loader2, Mail, UserRound, Lock } from "lucide-react";
import { toast } from "sonner";
import { SSO_AUTH_BASE_URL, SSO_TARGET } from "@/config/sso-config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CodeStep = "closed" | "code" | "choose" | "signup" | "email";

const errorMessage = (code: string | null | undefined): string => {
  switch (code) {
    case "code_required":
      return "أدخل الرمز المكوّن من 6 أرقام";
    case "wrong_code":
      return "الرمز غير صحيح — تأكد منه وأعد المحاولة";
    case "code_expired":
      return "انتهت صلاحية هذا الرمز — اطلب رمزاً جديداً من الإدارة";
    case "code_used_up":
      return "تم استهلاك هذا الرمز بالكامل — اطلب رمزاً جديداً من الإدارة";
    case "code_invalid":
      return "رمز الدخول غير صالح";
    case "too_many_attempts":
      return "محاولات كثيرة جداً — انتظر عدة دقائق ثم حاول مجدداً";
    case "invalid_email":
      return "أدخل بريداً إلكترونياً بصيغة صحيحة";
    case "weak_password":
      return "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
    case "name_required":
      return "أدخل اسمك أولاً";
    case "email_exists":
      return "هذا البريد مسجّل مسبقاً — سجّل الدخول بالبريد وكلمة المرور";
    case "email_mismatch":
      return "هذا البريد لا يطابق الحساب المرتبط بالرمز";
    case "account_missing_email":
      return "تعذّر العثور على بريد الحساب المرتبط بالرمز";
    case "link_failed":
      return "تعذّر إنشاء جلسة الدخول — حاول مرة أخرى";
    default:
      return "حدث خطأ غير متوقع — حاول مرة أخرى";
  }
};

const callFunction = async (name: string, body: Record<string, unknown>) => {
  const { data, error } = await achievementSupabase.functions.invoke(name, { body });

  if (error) {
    let serverMsg: string | null = null;
    try {
      const ctx = await (error as { context?: { json?: () => Promise<{ error?: string }> } })
        .context?.json?.();
      serverMsg = ctx?.error ?? null;
    } catch { /* تجاهل */ }
    if (!serverMsg && data && typeof data === "object" && "error" in data) {
      serverMsg = String((data as { error?: string }).error || "");
    }
    throw new Error(errorMessage(serverMsg));
  }

  if (data && typeof data === "object" && "error" in data && (data as { ok?: boolean }).ok !== true) {
    throw new Error(errorMessage(String((data as { error?: string }).error || "")));
  }

  return data as Record<string, unknown>;
};

const Login = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [authLoading, setAuthLoading] = useState(false);

  const [step, setStep] = useState<CodeStep>("closed");
  const [code, setCode] = useState("");
  const [codeMessage, setCodeMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && !loading) navigate("/dashboard");
  }, [user, loading, navigate]);

  const startGoogleLogin = () => {
    setAuthLoading(true);

    // فتح نافذة Popup صغيرة متمركزة في الشاشة.
    // مهم: تُفتح فوراً ضمن ضغطة المستخدم (قبل أي await)
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
      setAuthLoading(false);
      return;
    }

    // مراقبة إغلاق النافذة المنبثقة: عند إغلاقها دون تسجيل دخول
    // نوقف التحميل ونعيد تفعيل الزر دون أي خطأ أو تسجيل خروج.
    const timer = setInterval(() => {
      if (popup!.closed) {
        clearInterval(timer);
        setAuthLoading(false);
      }
    }, 500);
  };

  const resetCodeFlow = () => {
    setStep("closed");
    setCode("");
    setCodeMessage("");
    setName("");
    setEmail("");
    setPassword("");
  };

  const verifyAndGo = async (tokenHash: string) => {
    const { error } = await achievementSupabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    if (error) {
      toast.error("تعذّر تسجيل الدخول بالرمز — حاول مجدداً");
      return;
    }
    toast.success("تم تسجيل الدخول بنجاح");
    navigate("/dashboard");
  };

  const submitCode = async (withEmail?: string) => {
    const value = code.trim();
    if (!/^\d{6}$/.test(value)) {
      toast.error("أدخل الرمز المكوّن من 6 أرقام");
      return;
    }

    setBusy(true);
    try {
      const data = await callFunction("code-login", {
        code: value,
        email: withEmail ? withEmail.trim() : undefined,
      });

      if (data.mode === "signup") {
        setCodeMessage(String(data.message || ""));
        setStep("signup");
        return;
      }

      if (data.mode === "choose") {
        setStep("choose");
        toast.info("هذا الرمز مرتبط بأكثر من حساب — أدخل بريدك للمتابعة");
        return;
      }

      if (data.mode === "login" && typeof data.token_hash === "string") {
        await verifyAndGo(data.token_hash);
        return;
      }

      toast.error("استجابة غير متوقعة من الخادم — حاول مرة أخرى");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : errorMessage(null));
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async () => {
    if (!name.trim()) {
      toast.error("أدخل اسمك أولاً");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      toast.error("أدخل بريداً إلكترونياً بصيغة صحيحة");
      return;
    }
    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    setBusy(true);
    try {
      const data = await callFunction("code-signup", {
        code: code.trim(),
        email: email.trim(),
        password,
        name: name.trim(),
      });

      if (typeof data.token_hash === "string" && data.token_hash) {
        await verifyAndGo(data.token_hash);
        return;
      }

      const { error } = await achievementSupabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        toast.success("تم إنشاء حسابك! سجّل الدخول الآن بالبريد وكلمة المرور.");
        setStep("email");
        return;
      }

      toast.success("تم إنشاء حسابك بنجاح");
      navigate("/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : errorMessage(null));
    } finally {
      setBusy(false);
    }
  };

  const loginWithPassword = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      toast.error("أدخل بريداً إلكترونياً بصيغة صحيحة");
      return;
    }
    if (!password) {
      toast.error("أدخل كلمة المرور");
      return;
    }

    setBusy(true);
    try {
      const { error } = await achievementSupabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        toast.error("البريد الإلكتروني أو كلمة المرور غير صحيحة");
        return;
      }
      toast.success("تم تسجيل الدخول بنجاح");
      navigate("/dashboard");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-20 right-1/4 h-72 w-72 animate-float rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
      </div>

      <div className="surface w-full max-w-sm animate-fade-up p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl brand-gradient text-primary-foreground shadow-glow">
          <Trophy className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-3xl font-bold text-foreground">الإنجاز</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          منصة تتبّع إنجازاتك الدراسية وتنافس مع زملائك
        </p>

        <Button
          onClick={startGoogleLogin}
          variant="outline"
          className="mt-8 w-full gap-3 py-6 text-base"
          disabled={authLoading || busy}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {authLoading ? "جاري فتح نافذة تسجيل الدخول..." : "تسجيل الدخول باستخدام Google"}
        </Button>

        {step === "closed" ? (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              أو
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button
              onClick={() => setStep("code")}
              variant="secondary"
              className="w-full gap-2 py-5 text-base"
              disabled={authLoading || busy}
            >
              <KeyRound className="h-5 w-5" />
              الدخول برمز دعوة
            </Button>

            <button
              type="button"
              onClick={() => {
                setEmail("");
                setPassword("");
                setStep("email");
              }}
              className="mt-3 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              لديك حساب برمز؟ سجّل الدخول بالبريد وكلمة المرور
            </button>
          </>
        ) : (
          <div className="mt-6 rounded-2xl border bg-card/60 p-4 text-right">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="h-4 w-4 text-primary" />
                {step === "code" && "أدخل رمز الدعوة"}
                {step === "choose" && "اختر حسابك"}
                {step === "signup" && "أنشئ حسابك"}
                {step === "email" && "الدخول بالبريد"}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs"
                onClick={resetCodeFlow}
                disabled={busy}
              >
                <ArrowRight className="h-3.5 w-3.5" />
                رجوع
              </Button>
            </div>

            {(step === "code" || step === "signup") && (
              <div className="space-y-3">
                {step === "code" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="access-code">الرمز المكوّن من 6 أرقام</Label>
                    <Input
                      id="access-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="000000"
                      className="text-center font-mono text-2xl tracking-[0.35em]"
                      dir="ltr"
                    />
                  </div>
                ) : (
                  <>
                    {codeMessage ? (
                      <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs leading-relaxed text-primary">
                        {codeMessage}
                      </p>
                    ) : null}
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-name">الاسم</Label>
                      <div className="relative">
                        <UserRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="signup-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="اسمك الذي يظهر في المنصة"
                          maxLength={40}
                          className="pr-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-email">البريد الإلكتروني</Label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="signup-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          dir="ltr"
                          className="pr-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-password">كلمة المرور</Label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="signup-password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="6 أحرف على الأقل"
                          dir="ltr"
                          className="pr-9"
                        />
                      </div>
                    </div>
                  </>
                )}

                <Button
                  className="w-full gap-2"
                  disabled={busy}
                  onClick={() => {
                    if (step === "code") void submitCode();
                    else void createAccount();
                  }}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {step === "code" ? "متابعة" : "إنشاء الحساب والدخول"}
                </Button>
              </div>
            )}

            {step === "choose" && (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  هذا الرمز استُخدم لإنشاء أكثر من حساب. أدخل بريد الحساب الذي تريد الدخول به.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="choose-email">البريد الإلكتروني</Label>
                  <Input
                    id="choose-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    dir="ltr"
                  />
                </div>
                <Button
                  className="w-full gap-2"
                  disabled={busy}
                  onClick={() => void submitCode(email)}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  متابعة
                </Button>
              </div>
            )}

            {step === "email" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">البريد الإلكتروني</Label>
                  <Input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password">كلمة المرور</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <Button
                  className="w-full gap-2"
                  disabled={busy}
                  onClick={() => void loginWithPassword()}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  تسجيل الدخول
                </Button>
              </div>
            )}
          </div>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          بالمتابعة أنت توافق على قوانين المنصة وسياسة الاستخدام
        </p>
      </div>
    </div>
  );
};

export default Login;
