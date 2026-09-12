import { useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("تم الدخول");
      navigate("/admin");
    } catch (err: any) {
      toast.error(err?.message ?? "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-xl font-bold">تسجيل الدخول</h1>
          <p className="mt-1 text-xs text-muted-foreground">الدخول مخصص للمسؤولين فقط.</p>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div>
              <Label>البريد الإلكتروني</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>كلمة المرور</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              دخول
            </Button>
          </form>
          <Link
            to="/"
            className="mt-2 block text-center text-xs text-muted-foreground hover:text-foreground"
          >
            العودة للرئيسية
          </Link>
        </div>
      </main>
    </div>
  );
}

export default Login;
