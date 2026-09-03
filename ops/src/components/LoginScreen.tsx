import { useState } from "react";
import { Lock, KeyRound, AlertTriangle } from "lucide-react";

interface Props {
  onLogin: (password: string) => Promise<void>;
  failed: number;
}

export function LoginScreen({ onLogin, failed }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("أدخل كلمة المرور");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onLogin(password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <svg width="100%" height="100%" className="ops-grid">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#00d4ff" strokeWidth="0.5" opacity="0.3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative z-10 mx-4 w-full max-w-sm">
        <div className="ops-panel relative overflow-hidden p-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 overflow-hidden">
            <div className="h-full w-full animate-scan bg-gradient-to-b from-transparent via-ops-cyan/10 to-transparent" />
          </div>

          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-ops-cyan/50 bg-ops-cyan/10 shadow-[0_0_20px_rgba(0,212,255,0.3)]">
              <KeyRound className="h-7 w-7 text-ops-cyan" />
            </div>
            <h1 className="font-mono text-2xl font-bold tracking-widest text-ops-cyan glow-cyan">
              MADARIK OPS
            </h1>
            <p className="mt-1 font-mono text-[11px] text-ops-dim">
              ACCESS CONTROL // CLEARANCE REQUIRED
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 font-mono text-[10px] text-ops-dim">
              <span className="inline-block h-1.5 w-1.5 animate-blink rounded-full bg-ops-green" />
              SYSTEM ONLINE
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="ops-label flex items-center gap-2">
                <Lock className="h-3 w-3" /> كلمة المرور
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••••••"
                autoComplete="current-password"
                className="ops-input font-mono tracking-widest"
                autoFocus
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md border border-ops-red/40 bg-ops-red/10 px-3 py-2 text-xs text-ops-red">
                <AlertTriangle className="h-3.5 w-3.5" />
                {error}
              </div>
            )}

            {failed > 0 && (
              <div className="text-center font-mono text-[10px] text-ops-amber">
                محاولات فاشلة: {failed}/5
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="ops-btn-primary w-full disabled:opacity-50"
            >
              {busy ? "جارٍ التحقق..." : "دخول"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center font-mono text-[10px] text-ops-dim">
          © MADARIK OPS v0.1 // RESTRICTED ACCESS
        </p>
      </div>
    </div>
  );
}
