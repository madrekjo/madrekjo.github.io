import { Link, useNavigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function SiteHeader({ showAdminLink = false }: { showAdminLink?: boolean }) {
  const { session, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold">ملفات المعلمين</span>
        </Link>
        <div className="flex items-center gap-2">
          {!loading && isAdmin && showAdminLink && (
            <Link to="/admin">
              <Button variant="secondary" size="sm">
                الإدارة
              </Button>
            </Link>
          )}
          {!loading &&
            (session ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  supabase.auth.signOut();
                  navigate("/");
                }}
              >
                خروج
              </Button>
            ) : (
              <Link to="/login">
                <Button size="sm" variant="ghost">
                  دخول
                </Button>
              </Link>
            ))}
        </div>
      </div>
    </header>
  );
}
