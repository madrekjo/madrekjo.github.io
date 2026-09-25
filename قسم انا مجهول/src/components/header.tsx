import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Shield, Ghost, Sun, Moon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("anon-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <Button size="sm" variant="ghost" onClick={toggle} title={dark ? "الوضع الفاتح" : "الوضع الداكن"}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function Header() {
  const { session, isAdmin, adminChecked, adminError } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <Ghost className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold">أنا مجهول</span>
        </Link>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link to="/admin">
              <Button variant="secondary" size="sm" className="gap-1">
                <Shield className="h-4 w-4" /> الإدارة
              </Button>
            </Link>
          )}
          {session ? (
            <div className="flex items-center gap-1.5">
              {adminChecked && !isAdmin && !adminError && (
                <span
                  dir="ltr"
                  title="هذا الحساب بدون صلاحية أدمن"
                  className="hidden max-w-[150px] truncate text-[11px] text-muted-foreground sm:inline"
                >
                  {session.user.email}
                </span>
              )}
              {adminError && (
                <span
                  title={`فشل التحقق من الصلاحية: ${adminError}`}
                  className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500"
                />
              )}
              <Button size="sm" variant="ghost" onClick={() => supabase.auth.signOut()}>
                خروج
              </Button>
            </div>
          ) : (
            <Link to="/login">
              <Button size="sm" variant="ghost">دخول</Button>
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
