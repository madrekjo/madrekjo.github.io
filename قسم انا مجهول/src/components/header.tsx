import { Link } from "@tanstack/react-router";
import { Shield, Ghost } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function Header() {
  const { session, isAdmin } = useAuth();

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
            <Button size="sm" variant="ghost" onClick={() => supabase.auth.signOut()}>
              خروج
            </Button>
          ) : (
            <Link to="/login">
              <Button size="sm" variant="ghost">دخول</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
