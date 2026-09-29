import { useState } from "react";
import { RotateCcw, Search, X } from "lucide-react";
import {
  recoverCandidates,
  recoverAccount,
  type RecoverCandidate,
} from "@/lib/api";

export default function RecoverAccountModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (id: string, username: string) => void;
}) {
  const [rq, setRq] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<RecoverCandidate[] | null>(null);

  if (!open) return null;

  const doSearch = async () => {
    setError("");
    setCandidates(null);
    if (rq.trim().length < 2) {
      setError("اكتب اسمك القديم بالضبط");
      return;
    }
    setBusy(true);
    try {
      const rows = await recoverCandidates(rq);
      setCandidates(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر البحث");
    } finally {
      setBusy(false);
    }
  };

  const doRecover = async (c: RecoverCandidate) => {
    setError("");
    setBusy(true);
    try {
      const id = await recoverAccount(c.username);
      onDone(id, c.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر الاسترجاع");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-night/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gold/40 bg-card p-6 text-center shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gold text-2xl">
            🧡
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <h2 className="mt-3 font-serif text-2xl font-bold text-ink">
          استرجاع حسابي القديم
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          بعد تغيير رابط المنصة بدنا نرجّع حسابك: اكتب اسمك القديم، واختار
          حسابك من القائمة، ورح نربط جهازك الحالي فيه.
        </p>

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
                disabled={busy}
                className="grid shrink-0 place-items-center rounded-xl bg-gold px-4 text-white transition hover:bg-gold-deep disabled:opacity-50"
                aria-label="ابحث عن حسابي"
              >
                <Search size={18} />
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </p>
          )}

          {busy && (
            <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
              {candidates === null && !error
                ? "جاري البحث..."
                : "جاري ربط الحساب..."}
            </p>
          )}

          {candidates && candidates.length === 0 && !busy && (
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
                  disabled={busy}
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
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm text-ink-soft transition hover:text-ink"
          >
            <RotateCcw size={15} />
            رجوع
          </button>
        </div>
      </div>
    </div>
  );
}