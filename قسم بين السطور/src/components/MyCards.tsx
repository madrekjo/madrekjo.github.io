import { useCallback, useEffect, useState } from "react";
import { Camera, Download, Plus } from "lucide-react";
import {
  myLines,
  myProofs,
  myReports,
  submitReport,
  uploadProof,
  type Line,
  type MyProof,
  type MyReport,
} from "@/lib/api";
import { downloadBlob, renderCardImage } from "@/lib/cardImage";
import { publicFileUrl } from "@/integrations/supabase/client";

const platforms = ["انستغرام", "سناب شات", "واتساب", "تيك توك", "تويتر"];

export default function MyCards() {
  const [lines, setLines] = useState<Line[]>([]);
  const [reports, setReports] = useState<MyReport[]>([]);
  const [proofs, setProofs] = useState<MyProof[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [platform, setPlatform] = useState("انستغرام");
  const [reach, setReach] = useState("");
  const [reactions, setReactions] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const onDownload = async (l: Line, withStats = false) => {
    setMsg("");
    setBusy(true);
    try {
      const stats = withStats
        ? {
            likes: l.likes,
            shares: l.shares,
            visits: l.visits,
            reports: reports.filter((r) => r.line_id === l.id).length,
            proofShots: proofs.filter((p) => p.line_id === l.id).length,
          }
        : undefined;
      const blob = await renderCardImage(l, stats);
      downloadBlob(blob, `${l.category}-${l.id}${withStats ? "-تفاعل" : ""}.jpg`);
      setMsg(withStats ? "نزّلت صورة التوثيق ✓" : "نزّلت صورة البطاقة ✓");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "تعذّر إنشاء الصورة");
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(async () => {
    const [l, r, p] = await Promise.all([
      myLines(),
      myReports(),
      myProofs(),
    ]);
    setLines(l);
    setReports(r);
    setProofs(p);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mx-auto mt-8 flex items-center gap-2 rounded-full border border-line bg-card px-5 py-2.5 text-sm font-medium text-ink-soft transition hover:border-gold-deep hover:text-gold-deep"
      >
        <Plus size={16} />
        بطاقتي — تابع بطاقاتك وتوثيقها
      </button>
    );
  }

  const onReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setMsg("");
    setBusy(true);
    try {
      await submitReport({
        line_id: selectedId,
        platform,
        reach: Number(reach) || 0,
        reactions: Number(reactions) || 0,
        note: note.trim(),
      });
      setReach("");
      setReactions("");
      setNote("");
      setMsg("سجّلت تقرير التوثيق ✓");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "تعذّر حفظ التقرير");
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (file: File) => {
    if (!selectedId || !file) return;
    setMsg("");
    setBusy(true);
    try {
      await uploadProof(selectedId, file);
      setMsg("رُفع الدليل (سكرين شوت) ✓");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "تعذّر رفع الصورة");
    } finally {
      setBusy(false);
    }
  };

  const selected = lines.find((l) => l.id === selectedId);

  return (
    <section className="mx-auto mt-10 w-full max-w-2xl rounded-2xl border border-line bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-2xl font-bold text-ink">بطاقتي 🏷️</h2>
        <button
          onClick={() => setOpen(false)}
          className="rounded-full border border-line px-4 py-1.5 text-sm text-ink-soft transition hover:text-ink"
        >
          إغلاق
        </button>
      </div>

      {!loaded ? (
        <p className="py-6 text-center text-sm text-ink-soft">جارٍ التحميل...</p>
      ) : lines.length === 0 ? (
        <p className="rounded-xl bg-paper p-4 text-center text-sm text-ink-soft">
          ما عندك بطاقات بعد — أضف أول سطر لك من زر «أضف سطرك» ✍️
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {lines.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelectedId(l.id)}
                className={
                  "rounded-xl border p-3 text-right transition " +
                  (selectedId === l.id
                    ? "border-gold bg-gold/5"
                    : "border-line bg-paper hover:border-gold-deep")
                }
              >
                <p className="line-clamp-2 font-serif text-base leading-snug text-ink">
                  {l.text}
                </p>
                <p className="mt-2 text-xs text-ink-soft">
                  ❤️ {l.likes} · 📤 {l.shares} · 👁️ {l.visits}
                </p>
              </button>
            ))}
          </div>

          {selected && (
            <div className="mt-5 rounded-xl bg-paper p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-serif text-lg text-ink">{selected.text}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {selected.book} — {selected.author} · المكوِّن: {selected.submitter}
                  </p>
                </div>
                <button
                  onClick={() => void onDownload(selected)}
                  disabled={busy}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-gold/50 px-3 py-1.5 text-xs font-bold text-gold-deep transition hover:bg-gold hover:text-white disabled:opacity-50"
                >
                  <Download size={14} />
                  {busy ? "تحضير..." : "نزّل صورة"}
                </button>
                <button
                  onClick={() => void onDownload(selected, true)}
                  disabled={busy}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-bold text-white transition hover:bg-gold-deep disabled:opacity-50"
                >
                  <Download size={14} />
                  {busy ? "تحضير..." : "نزّل صورة التفاعل"}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-card p-2">
                  <p className="text-sm font-bold text-rose-500">❤️ {selected.likes}</p>
                  <p className="mt-0.5 text-[11px] text-ink-soft">قلوب</p>
                </div>
                <div className="rounded-xl bg-card p-2">
                  <p className="text-sm font-bold text-gold-deep">📤 {selected.shares}</p>
                  <p className="mt-0.5 text-[11px] text-ink-soft">مشاركات</p>
                </div>
                <div className="rounded-xl bg-card p-2">
                  <p className="text-sm font-bold text-ink">👁️ {selected.visits}</p>
                  <p className="mt-0.5 text-[11px] text-ink-soft">مشاهدات</p>
                </div>
              </div>

              <form onSubmit={onReport} className="mt-4 space-y-2">
                <p className="text-sm font-medium text-ink">
                  📣 وثّق تفاعل نشرتك على السوشيال ميديا
                </p>
                <div className="flex flex-wrap gap-2">
                  {platforms.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlatform(p)}
                      className={
                        "rounded-full border px-3 py-1 text-xs transition " +
                        (platform === p
                          ? "border-gold bg-gold font-bold text-white"
                          : "border-line bg-card text-ink-soft")
                      }
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={reach}
                    onChange={(e) => setReach(e.target.value)}
                    type="number"
                    min={0}
                    placeholder="وصلت لـ (مشاهدات)"
                    className="rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-gold"
                  />
                  <input
                    value={reactions}
                    onChange={(e) => setReactions(e.target.value)}
                    type="number"
                    min={0}
                    placeholder="عدد التفاعلات"
                    className="rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-gold"
                  />
                </div>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={120}
                  placeholder="ملاحظة (اختياري) — مثل: إنستغرام ستوري"
                  className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-gold"
                />
                {msg && (
                  <p
                    className={
                      "text-xs " +
                      (msg.startsWith("تعذّر") ? "text-rose-600" : "text-emerald-600")
                    }
                  >
                    {msg}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-white transition hover:bg-gold-deep disabled:opacity-50"
                  >
                    سجّل التوثيق
                  </button>
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-card px-4 py-2 text-sm text-ink-soft transition hover:border-gold-deep hover:text-gold-deep">
                    <Camera size={15} />
                    ارفع سكرين شوت الدليل
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onUpload(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </form>

              {(reports.some((r) => r.line_id === selected.id) ||
                proofs.some((p) => p.line_id === selected.id)) && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-2 text-xs font-medium text-ink-soft">
                    توثيقات هاي البطاقة:
                  </p>
                  {reports
                    .filter((r) => r.line_id === selected.id)
                    .map((r) => (
                      <p key={r.report_id} className="text-xs text-ink">
                        {r.platform} — وصلت لـ {r.reach} · تفاعلات {r.reactions}
                        {r.note ? ` · ${r.note}` : ""}
                      </p>
                    ))}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {proofs
                      .filter((p) => p.line_id === selected.id)
                      .map((p) => (
                        <img
                          key={p.proof_id}
                          src={publicFileUrl(p.storage_path)}
                          alt="دليل النشر"
                          className="h-24 w-20 rounded-lg border border-line object-cover"
                        />
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}