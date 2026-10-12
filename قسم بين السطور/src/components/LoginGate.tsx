import { GraduationCap } from "lucide-react";
import { ssoLoginUrl } from "@/lib/sso";

export default function LoginGate() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 py-12 text-center">
      <div className="w-full max-w-md rounded-3xl border border-gold/40 bg-card p-8 shadow-xl">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gold text-white">
          <GraduationCap size={28} />
        </div>
        <h1 className="mt-4 font-serif text-3xl font-bold text-ink">بين السطور</h1>
        <p className="mt-1 text-sm text-ink-soft">
          منصة القرّاء والكتّاب · مدارك جو
        </p>
        <p className="mt-5 text-sm leading-7 text-ink-soft">
          أصبح القسم جزءاً من المنصة الموحّدة — سجّل دخولك بحساب جوجل
          لمتابعة القراءة والكتابة.
        </p>
        <a
          href={ssoLoginUrl()}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold px-6 py-3 text-base font-bold text-white transition hover:bg-gold-deep"
        >
          تسجيل الدخول بحساب جوجل
        </a>
        <p className="mt-4 text-xs text-ink-soft">
          لأي مشكلة في الدخول راسل إدارة المنصة.
        </p>
      </div>
      <a href="/" className="mt-6 text-sm text-ink-soft underline">
        العودة للرئيسية
      </a>
    </div>
  );
}