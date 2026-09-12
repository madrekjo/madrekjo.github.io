import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { GraduationCap, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ADMIN_ACCESS_EMAIL as ADMIN_EMAIL,
  ADMIN_ACCESS_PASSWORD as ADMIN_PASSWORD,
} from "@/config/supabase-config";

function AdminCodeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let { error: signInErr } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });
      if (signInErr) {
        const { error: suErr } = await supabase.auth.signUp({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        });
        if (suErr) throw suErr;
        const { error: signInErr2 } = await supabase.auth.signInWithPassword({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        });
        if (signInErr2) throw signInErr2;
      }
      const { data, error: rpcErr } = await supabase.rpc("login_admin_by_code", {
        p_code: pin.trim(),
      });
      if (rpcErr) throw rpcErr;
      if (!data) {
        setError("الرمز غير صحيح");
        return;
      }
      toast.success("مرحباً بك في لوحة الإدارة");
      window.location.href = "/teacher-files/admin";
    } catch (err: any) {
      setError(err?.message ?? "حدث خطأ، تأكد من تهيئة قاعدة البيانات");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" /> رمز الوصول
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>أدخل الرمز</Label>
            <Input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••••"
              dir="ltr"
              autoFocus
              required
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
            دخول
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SiteHeader({ showAdminLink = false }: { showAdminLink?: boolean }) {
  const { session, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [codeOpen, setCodeOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link
          to="/"
          onClick={(e) => {
            e.preventDefault();
            setCodeOpen(true);
          }}
          className="flex items-center gap-2"
        >
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
      <AdminCodeDialog open={codeOpen} onOpenChange={setCodeOpen} />
    </header>
  );
}