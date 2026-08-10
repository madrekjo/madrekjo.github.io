import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Trophy } from "lucide-react";
import { SSO_AUTH_BASE_URL, SSO_TARGET } from "@/config/sso-config";

const Login = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !loading) navigate("/dashboard");
  }, [user, loading, navigate]);

  const [authLoading, setAuthLoading] = useState(false);

  const startGoogleLogin = () => {
    setAuthLoading(true);
    window.location.href = `${SSO_AUTH_BASE_URL}/login?target=${encodeURIComponent(SSO_TARGET)}`;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-4 w-full max-w-sm space-y-8 text-center">
        <div className="space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Trophy className="h-9 w-9 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">الإنجاز</h1>
          <p className="text-muted-foreground">
            منصة تتبع إنجازاتك الدراسية وتنافس مع زملائك
          </p>
        </div>

        <Button
          onClick={startGoogleLogin}
          variant="outline"
          className="w-full gap-3 py-6 text-base"
          disabled={authLoading}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {authLoading ? "جاري التحويل..." : "تسجيل الدخول باستخدام Google"}
        </Button>
      </div>
    </div>
  );
};

export default Login;
