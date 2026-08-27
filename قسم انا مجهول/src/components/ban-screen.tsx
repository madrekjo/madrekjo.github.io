import { useEffect, useState } from "react";
import { Ban, ShieldAlert, KeyRound, X, Timer } from "lucide-react";
import { getDeviceId } from "@/lib/device";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bypassOwnBan } from "@/lib/visitor.functions";
import { refreshVisitorStatus } from "@/hooks/use-visitor-gate";
import { toast } from "sonner";

function useCountdown(iso: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  if (!iso) return null;
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return "انتهى";
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}ي ${h}س ${m}د`;
  if (h) return `${h}س ${m}د ${sec}ث`;
  return `${m}د ${sec}ث`;
}

export function BanScreen({ reason, expiresAt, evidenceUrl }: { reason: string | null; expiresAt?: string | null; evidenceUrl?: string | null }) {
  const deviceId = typeof window !== "undefined" ? getDeviceId() : "";
  const [showBypass, setShowBypass] = useState(false);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previewImg, setPreviewImg] = useState(false);
  const countdown = useCountdown(expiresAt ?? null);

  useEffect(() => {
    if (!expiresAt) return;
    const t = setTimeout(() => refreshVisitorStatus(), Math.max(500, new Date(expiresAt).getTime() - Date.now() + 500));
    return () => clearTimeout(t);
  }, [expiresAt]);

  async function tryBypass() {
    if (!code.trim()) return;
    setSubmitting(true);
    try {
      const r = await bypassOwnBan({ data: { device_id: deviceId, code: code.trim() } });
      if (r.ok) {
        toast.success("تم رفع الحظر");
        setCode("");
        setShowBypass(false);
        refreshVisitorStatus();
      } else {
        toast.error("رمز غير صحيح");
      }
    } catch {
      toast.error("فشل الطلب");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-destructive/10 text-destructive">
          <Ban className="h-10 w-10" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-destructive">
          <button
            onClick={() => setShowBypass(true)}
            className="cursor-pointer underline decoration-dotted underline-offset-4 hover:text-destructive/80"
            title="اضغط لإدخال رمز الاستثناء"
          >أنت</button>
          {" "}محظور من استخدام المنصة
        </h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          إذا كنت تعتقد أن هذا الحظر بالخطأ أو ترغب بالاستفسار،
          يرجى التواصل مع الإدارة من خلال قسم <span className="font-semibold text-foreground">الإنجاز</span>.
        </p>

        {expiresAt && (
          <div className="mt-4 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <Timer className="h-4 w-4" /> يُرفع الحظر خلال {countdown}
          </div>
        )}

        {reason && (
          <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <div className="flex items-center justify-center gap-1 font-semibold">
              <ShieldAlert className="h-4 w-4" /> سبب الحظر
            </div>
            <p className="mt-1 whitespace-pre-wrap opacity-90">{reason}</p>
          </div>
        )}

        {evidenceUrl && (
          <div className="mt-4">
            <button onClick={() => setPreviewImg(true)} className="mx-auto block">
              <img src={evidenceUrl} alt="دليل" className="mx-auto max-h-64 rounded-lg border border-border" />
            </button>
            <p className="mt-1 text-[10px] text-muted-foreground">اضغط للتكبير</p>
          </div>
        )}

        <div className="mt-8 rounded-lg bg-muted/50 p-3 font-mono text-[10px] text-muted-foreground">
          <div>معرف الجهاز:</div>
          <div dir="ltr" className="mt-1 break-all">{deviceId}</div>
        </div>

        {showBypass && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowBypass(false)}>
            <div className="w-full max-w-sm rounded-2xl bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1 font-bold"><KeyRound className="h-4 w-4" /> رمز الاستثناء</h3>
                <button onClick={() => setShowBypass(false)}><X className="h-4 w-4" /></button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">أدخل الرمز لرفع الحظر عن جهازك.</p>
              <Input
                autoFocus
                type="password"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="الرمز"
                className="mt-3 text-center tracking-widest"
                onKeyDown={(e) => { if (e.key === "Enter") tryBypass(); }}
              />
              <Button className="mt-3 w-full" onClick={tryBypass} disabled={submitting}>تأكيد</Button>
            </div>
          </div>
        )}

        {previewImg && evidenceUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewImg(false)}>
            <img src={evidenceUrl} alt="دليل" className="max-h-[90vh] max-w-full rounded-lg" />
          </div>
        )}
      </main>
    </div>
  );
}
