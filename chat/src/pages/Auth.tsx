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
    try {
      // التحقق من الحظر قبل المتابعة
      const banned = await checkDeviceBanned();
      if (banned) {
        toast.error("جهازك تم حظره من المنصة نهائياً");
        setLoading(false);
        return;
      }

      window.location.href = `${SSO_AUTH_BASE_URL}/login?target=${encodeURIComponent(SSO_TARGET)}`;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "فشل تسجيل الدخول");
      setLoading(false);
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
            {loading ? "جاري التحويل..." : "تسجيل الدخول باستخدام Google"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
