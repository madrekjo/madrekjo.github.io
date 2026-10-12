import { useEffect } from "react";
import { unifiedLoginUrl } from "@/lib/sso";

export default function LoginGate() {
  useEffect(() => {
    window.location.replace(unifiedLoginUrl());
  }, []);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 text-center">
      <p className="font-serif text-3xl font-bold text-gold-deep">بين السطور</p>
      <p className="mt-2 text-sm text-ink-soft">
        جارٍ تحويلك إلى صفحة الدخول الموحّدة...
      </p>
      <div className="mt-4 size-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
    </div>
  );
}