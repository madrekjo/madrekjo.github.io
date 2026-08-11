import { useState } from "react";
import { checkDeviceBanned } from "@/lib/deviceId";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { SSO_AUTH_BASE_URL, SSO_TARGET } from "@/config/sso-config";

const Auth = () => {
  const [loading, setLoading] = useState(false);

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
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
