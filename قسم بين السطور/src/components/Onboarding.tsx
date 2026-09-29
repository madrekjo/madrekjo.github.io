import { useState, type FormEvent } from "react";
import { PenLine, Check, RotateCcw, Search } from "lucide-react";
import { ensureUser, recoverCandidates, recoverAccount, type RecoverCandidate } from "@/lib/api";

type Mode = "signup" | "recover";

export default function Onboarding({
  onDone,
  onSkip,
}: {
  onDone: (id: string, username: string) => void;
  onSkip: () => void;
}) {
  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rq, setRq] = useState("");
  const [recoverBusy, setRecoverBusy] = useState(false);
  const [recoverError, setRecoverError] = useState("");
  const [candidates, setCandidates] = useState<RecoverCandidate[] | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2) {
      setError("اكتب اسمك أولاً لنجهّز بطاقتك");
      return;
    }
    setBusy(true);
    try {
      const id = await ensureUser(name.trim(), bio.trim());
      onDone(id, name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  const doSearch = async () => {
    setRecoverError("");
    setCandidates(null);
    if (rq.trim().length < 2) {
      setRecoverError("اكتب اسمك القديم بالضبط");
      return;
    }
    setRecoverBusy(true);
    try {
      const rows = await recoverCandidates(rq);
      setCandidates(rows);
    } catch (err) {
      setRecoverError(err instanceof Error ? err.message : "تعذّر البحث");
    } finally {
      setRecoverBusy(false);
    }
  };

  const doRecover = async (c: RecoverCandidate) => {
    setRecoverError("");
    setRecoverBusy(true);
    try {
      const id = await recoverAccount(c.username);
      onDone(id, c.username);
    } catch (err) {
      setRecoverError(err instanceof Error ? err.message : "تعذّر الاسترجاع");
    } finally {
      setRecoverBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-night/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gold/40 bg-card p-6 text-center shadow-2xl">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gold text-3xl">
          🧡
        </div>
        <h2 className="mt-3 font-serif text-2xl font-bold text-ink">
          {mode === "signup"
            ? "أهلاً بيك على جدار بين السطور"
            : "استرجاع حسابي القديم"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          {mode === "signup"
            ? "سجّل اسمك حتى تُنسب بطاقاتك إلك، وتتابع سطورك وإحصائياتها من تبويب «الرئيسية» وتتنافس في قمة الأسبوع."
            : "بعد تغيير رابط المنصة بدنا نرجّع حسابك: اكتب اسمك القديم، واختار حسابك من القائمة، ورح نربط جهازك الحالي فيه."}
        </p>

        {mode === "signup" ? (
        <form onSubmit={submit} className="mt-5 space-y-3 text-right">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              اسمك (كيف بتحب نناديك) *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="مثلاً: أحمد من عجمان"
              className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-ink outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              عنك بجملة (اختياري)
            </label>
            <input
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={120}
              placeholder="مثلاً: قارئ بلا توقف، أحب الشعر"
              className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-ink outline-none focus:border-gold"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gold py-3 font-bold text-white transition hover:bg-gold-deep disabled:opacity-50"
          >
            <PenLine size={16} />
            {busy ? "التحقاق..." : "سجّل اسمي"}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-ink-soft transition hover:text-ink"
          >
            <Check size={15} />
            تخطّي الآن — أستكشف أولاً
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("recover");
              setError("");
            }}
            className="flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-gold-deep transition hover:text-gold"
          >
            <RotateCcw size={15} />
            عندي حساب قديم — استرجعه
          </button>
          <p className="text-center text-[11px] leading-5 text-ink-soft">
            بيتحفظ اسمك على جهازك ويرتبط مع بطاقاتك — تقدر تغيّره لاحقاً
          </p>
        </form>
        ) : (
        <div className="mt-5 space-y-3 text-right">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              اسمك القديم
            </label>
            <div className="flex gap-2">
              <input
                value={rq}
                onChange={(e) => setRq(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
                maxLength={40}
                placeholder="بالضبط مثل ما كان"
                className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-ink outline-none focus:border-gold"
              />
              <button
                type="button"
                onClick={doSearch}
                disabled={recoverBusy}
                className="grid shrink-0 place-items-center rounded-xl bg-gold px-4 text-white transition hover:bg-gold-deep disabled:opacity-50"
                aria-label="ابحث عن حسابي"
              >
                <Search size={18} />
              </button>
            </div>
          </div>

          {recoverError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {recoverError}
            </p>
          )}

          {recoverBusy && (
            <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
              {candidates === null && !recoverError ? "جاري البحث..." : "جاري ربط الحساب..."}
            </p>
          )}

          {candidates && candidates.length === 0 && !recoverBusy && (
            <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
              ما لقينا حساب بهذا الاسم على المنصة القديمة — تأكد من الاسم أو
              سجّل اسمك من جديد.
            </p>
          )}

          {candidates && candidates.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-ink-soft">
                اختر حسابك — رح يرتبط جهازك الحالي فيه مباشرة:
              </p>
              {candidates.map((c) => (
                <button
                  key={c.username}
                  type="button"
                  disabled={recoverBusy}
                  onClick={() => doRecover(c)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-paper p-3 text-right transition hover:border-gold disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">
                      {c.username}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      {c.card_count} {c.card_count === 1 ? "بطاقة" : "بطاقات"}
                      {c.bio ? ` · ${c.bio}` : ""}
                    </span>
                  </span>
                  <span className="text-[11px] font-bold text-gold-deep">
                    هذا أنا ←
                  </span>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setRecoverError("");
              setCandidates(null);
              setRq("");
            }}
            className="flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm text-ink-soft transition hover:text-ink"
          >
            رجوع — سجّل اسمي من جديد
          </button>
        </div>
        )}
      </div>
    </div>
  );
}