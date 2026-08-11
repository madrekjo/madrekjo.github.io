import { useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * Dialog مزامنة الحساب بين قسمي المنصة.
 *
 * يظهر عندما يفتح المستخدم قسم الدردشة دون جلسة دردشة بينما لديه جلسة صحيحة
 * في قسم الإنجاز. "نعم" تزامن حساب الإنجاز الحالي إلى الدردشة بنفس البريد
 * (دون طلب تسجيل دخول Google مرة ثانية)، و"ليس الآن" تُبقي الجلسة الحالية
 * دون أي كسر.
 */
const SsoSyncDialog = () => {
  const { siblingSync, dismissSiblingSync, syncWithAchievement } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const account = siblingSync?.user ?? null;

  const name =
    account?.user_metadata?.full_name ??
    account?.user_metadata?.name ??
    account?.email ??
    "";

  const avatarUrl: string | undefined =
    account?.user_metadata?.avatar_url ??
    account?.user_metadata?.picture ??
    undefined;

  const initials = (name || account?.email || "؟")
    .slice(0, 2)
    .toUpperCase();

  const handleSync = async () => {
    setBusy(true);
    setError(null);

    const res = await syncWithAchievement();

    setBusy(false);

    if (!res.ok) {
      setError(res.error ?? "تعذرت المزامنة، حاول مرة أخرى");
    }
  };

  return (
    <Dialog
      open={Boolean(siblingSync)}
      onOpenChange={(open) => {
        if (!open && !busy) dismissSiblingSync();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-2">
            <Avatar className="h-16 w-16">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={name} />
              ) : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </div>
          <DialogTitle className="text-xl font-bold">
            مزامنة الحساب
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            أنت مسجل الدخول بالفعل في قسم{" "}
            <span className="font-semibold text-foreground">
              الإنجاز
            </span>
            .
            <br />
            هل تريد استخدام نفس الحساب والصورة في قسم{" "}
            <span className="font-semibold text-foreground">
              الدردشة
            </span>
            ؟
          </DialogDescription>
        </DialogHeader>

        {account ? (
          <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
            <Avatar className="h-11 w-11">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={name} />
              ) : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 text-right">
              <p className="truncate font-semibold text-foreground">
                {name}
              </p>
              {account.email ? (
                <p
                  dir="ltr"
                  className="truncate text-xs text-muted-foreground"
                >
                  {account.email}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              فشلت المزامنة: {error}. يمكنك المحاولة مجدداً أو تسجيل الدخول
              مباشرة.
            </span>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button
            variant="outline"
            onClick={() => {
              if (!busy) dismissSiblingSync();
            }}
            disabled={busy}
          >
            ليس الآن
          </Button>
          <Button onClick={handleSync} disabled={busy}>
            {busy ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                جاري المزامنة...
              </>
            ) : (
              "نعم، مزامنة الحساب"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SsoSyncDialog;
