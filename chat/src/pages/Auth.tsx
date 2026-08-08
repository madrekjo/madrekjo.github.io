import { useState } from "react";
import { supabase } from "@/integrations/supabase/client"; // استيراد العميل الرسمي
import { checkDeviceBanned } from "@/lib/deviceId";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";

const Auth = () => {
  const [loading, setLoading] = useState<null | "google" | "apple">(null);

  const handleOAuth = async (provider: "google" | "apple") => {
    setLoading(provider);
    try {
      // التحقق من الحظر قبل المتابعة
      const banned = await checkDeviceBanned();
      if (banned) {
        toast.error("جهازك تم حظره من المنصة نهائياً");
        setLoading(null);
        return;
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: window.location.origin + import.meta.env.BASE_URL + "auth/callback",
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        console.error(error);
        toast.error("فشل الاتصال بخدمة Google");
        setLoading(null);
        return;
      }

      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        data.url,
        "google-login",
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!popup) {
        toast.error("الرجاء السماح للنوافذ المنبثقة (popups)");
        setLoading(null);
      }
    } catch (error: any) {
      toast.error(error.message || "فشل تسجيل الدخول");
      setLoading(null);
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
            onClick={() => handleOAuth("google")}
            disabled={loading !== null}
          >
            {loading === "google" ? "جاري التحويل..." : "تسجيل الدخول باستخدام Google"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;