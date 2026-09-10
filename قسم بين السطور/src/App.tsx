import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Download,
  Camera,
  GraduationCap,
  Heart,
  Instagram,
  MessageCircle,
  Plus,
  Sparkles,
  Ghost,
  X,
} from "lucide-react";
import {
  fetchLines,
  fetchMyLikedIds,
  likeLine,
  recordShare,
  confirmShare,
  uploadProof,
  recordVisit,
  weeklyTop,
  type Line,
  type WeeklyTopRow,
} from "./lib/api";
import { downloadBlob, renderCardImage } from "./lib/cardImage";
import CardComponent from "./components/Card";
import AddLineModal from "./components/AddLineModal";
import MyCards from "./components/MyCards";
import ReaderChat from "./components/ReaderChat";
import { lines as sampleLines } from "./data";
import { wait } from "./lib/helpers";

const seedLikes: Record<string, number> = {
  l1: 214,
  l2: 189,
  l3: 233,
  l4: 176,
  l5: 154,
  l6: 205,
  l7: 141,
  l8: 122,
  l9: 167,
  l10: 148,
  l11: 196,
  l12: 201,
};

const CATS = ["الكل", "رواية", "ديني", "تنمية", "شعر", "تاريخ"] as const;

const LIKED_KEY = "bayn-al-sutur:liked";

function restoreLikedIds(): string[] {
  try {
    const raw = localStorage.getItem(LIKED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function toLine(row: WeeklyTopRow): Line {
  return {
    id: row.line_id,
    text: row.text,
    book: row.book,
    author: row.author,
    category: row.category,
    submitter: row.submitter,
    likes: row.likes,
    shares: row.shares,
    visits: 0,
    featured_date: null,
    created_at: "",
  };
}

function openWhatsApp(text: string): boolean {
  const win = window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener,noreferrer"
  );
  return Boolean(win);
}

export default function App() {
  const [dbLines, setDbLines] = useState<Line[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [category, setCategory] = useState<(typeof CATS)[number]>("الكل");
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "leaving" | "entering">("idle");
  const [dir, setDir] = useState(1);
  const [likedIds, setLikedIds] = useState<string[]>(restoreLikedIds);
  const [top, setTop] = useState<WeeklyTopRow[]>([]);
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [proofLine, setProofLine] = useState<Line | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const visitedRef = useRef<string | null>(null);

  const loadLines = useCallback(async () => {
    try {
      const rows = await fetchLines();
      setDbLines(rows);
      setDemo(false);
    } catch {
      setDbLines(
        sampleLines.map((l) => ({
          id: l.id,
          text: l.text,
          book: l.book,
          author: l.author,
          category: l.category,
          submitter: "معاينة تجريبية",
          likes: seedLikes[l.id] ?? 0,
          shares: 0,
          visits: 0,
          featured_date: null,
          created_at: "",
        }))
      );
      setDemo(true);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LIKED_KEY, JSON.stringify(likedIds));
    } catch {
      /* ignore */
    }
  }, [likedIds]);

  useEffect(() => {
    void loadLines();
    weeklyTop(3)
      .then(setTop)
      .catch(() => setTop([]));
    fetchMyLikedIds().then((ids) =>
      setLikedIds((prev) => [...new Set([...prev, ...ids])])
    );
  }, [loadLines]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const card = params.get("card");
      if (card && dbLines && visitedRef.current !== card) {
        visitedRef.current = card;
        const lidx = dbLines.findIndex((l) => l.id === card);
        if (lidx >= 0) {
          setCategory("الكل");
          setIndex(lidx);
          setPhase("idle");
        }
        void recordVisit(card);
      }
    } catch {
      /* ignore */
    }
  }, [dbLines]);

  const displayLines = useMemo(() => dbLines ?? [], [dbLines]);
  const deck = useMemo(
    () =>
      category === "الكل"
        ? displayLines
        : displayLines.filter((l) => l.category === category),
    [displayLines, category]
  );

  const safeIndex = Math.min(index, deck.length - 1);
  const current = deck[safeIndex];
  const today = todayStr();
  const isToday = current ? current.featured_date === today : false;
  const totalHearts = displayLines.reduce((a, b) => a + b.likes, 0);

  useEffect(() => {
    setIndex(0);
    setPhase("idle");
  }, [category, demo]);

  const goTo = useCallback(
    (d: number) => {
      if (phase !== "idle") return;
      const next = safeIndex + d;
      if (next < 0 || next >= deck.length) return;
      setDir(d);
      setPhase("leaving");
      window.setTimeout(() => {
        setIndex(next);
        setPhase("entering");
        window.setTimeout(() => setPhase("idle"), 430);
      }, 380);
    },
    [phase, safeIndex, deck.length]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goTo(1);
      else if (e.key === "ArrowRight") goTo(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  const patchLine = (id: string, patch: Partial<Line>) => {
    setDbLines((prev) =>
      prev ? prev.map((l) => (l.id === id ? { ...l, ...patch } : l)) : prev
    );
  };

  const flash = (t: string) => {
    setNotice(t);
    wait(2200).then(() => setNotice(""));
  };

  const onLike = async () => {
    if (!current || likedIds.includes(current.id)) return;
    setLikedIds((s) => [...s, current.id]);
    if (demo) {
      patchLine(current.id, { likes: current.likes + 1 });
      return;
    }
    try {
      const n = await likeLine(current.id);
      patchLine(current.id, { likes: n });
    } catch {
      setLikedIds((s) => s.filter((id) => id !== current.id));
    }
  };

  const markShare = async (line: Line, platform: string) => {
    if (demo) {
      patchLine(line.id, { shares: line.shares + 1 });
      return;
    }
    try {
      await recordShare(line.id, platform);
    } catch {
      /* ignore */
    }
    setProofLine(line);
  };

  const shareText = (l: Line) =>
    `"${l.text}" — ${l.book} (${l.author})\n\nبين السطور · مدارك جو\nاسمي: ${l.submitter}`;

  const onWhatsApp = async (l: Line) => {
    const ok = openWhatsApp(shareText(l));
    if (ok) await markShare(l, "whatsapp");
  };

  const shareWithImage = async (l: Line, platform: "instagram" | "snapchat") => {
    setBusyAction(platform);
    try {
      const blob = await renderCardImage(l);
      const name = `${l.category}-${l.id}.jpg`;
      const file = new File([blob], name, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: "بين السطور" });
        await markShare(l, platform);
      } else {
        downloadBlob(blob, name);
        window.open(
          platform === "instagram"
            ? "https://www.instagram.com/"
            : "https://www.snapchat.com/",
          "_blank",
          "noopener,noreferrer"
        );
        await markShare(l, platform);
      }
    } catch (e: unknown) {
      const err = e as { name?: string };
      if (err?.name !== "AbortError") {
        flash(e instanceof Error ? e.message : "تعذّرت المشاركة — جرّب «نزّل صورة»");
      }
    } finally {
      setBusyAction("");
    }
  };

  const onDownload = async (l: Line) => {
    setBusyAction("image");
    try {
      const blob = await renderCardImage(l);
      downloadBlob(blob, `${l.category}-${l.id}.jpg`);
      await markShare(l, "image");
    } catch (e) {
      flash(e instanceof Error ? e.message : "تعذّر إنشاء الصورة");
    } finally {
      setBusyAction("");
    }
  };

  const downloadCard = async (l: Line) => {
    setBusyAction("image");
    try {
      const blob = await renderCardImage(l);
      downloadBlob(blob, `${l.category}-${l.id}.jpg`);
      if (!demo) await markShare(l, "image");
      flash("نزّلت صورة البطاقة ✓");
    } catch (e) {
      flash(e instanceof Error ? e.message : "تعذّر إنشاء الصورة");
    } finally {
      setBusyAction("");
    }
  };

  const onSystemShare = async (l: Line) => {
    if (!navigator.share) {
      await onDownload(l);
      return;
    }
    try {
      await navigator.share({ title: "بين السطور", text: shareText(l) });
      await markShare(l, "system");
    } catch {
      /* cancelled */
    }
  };

  const onCopy = async (l: Line) => {
    try {
      await navigator.clipboard.writeText(shareText(l));
      setCopied(true);
      wait(1500).then(() => setCopied(false));
    } catch {
      flash("انسخ يدوياً من البطاقة");
    }
  };

  const onAdded = () => {
    void loadLines();
  };

  const onProofPicked = async (file: File) => {
    const line = proofLine;
    if (!line || !file) return;
    setProofBusy(true);
    try {
      await uploadProof(line.id, file);
      const n = await confirmShare(line.id);
      if (!demo) patchLine(line.id, { shares: n });
      weeklyTop(3).then(setTop).catch(() => null);
      setProofLine(null);
      flash("تأكدت مشاركتك ✓ +١ نقطة بالمتصدر");
    } catch (e) {
      flash(e instanceof Error ? e.message : "تعذّر رفع الدليل");
    } finally {
      setProofBusy(false);
    }
  };

  const openTopCard = (id: string) => {
    const lidx = displayLines.findIndex((l) => l.id === id);
    if (lidx >= 0) {
      setCategory("الكل");
      setIndex(lidx);
      setPhase("idle");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (!current) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 pb-16 text-center">
        <Ghost className="text-gold-deep" size={48} />
        <h1 className="mt-4 font-serif text-3xl font-bold text-ink">
          القسم جديد
        </h1>
        <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
          {category === "الكل"
            ? "ما حدا كتب سطراً بعد — كن أنت أول من يفتح الجدران ✨"
            : `ما في سطور في تصنيف ${category} بعد`}
        </p>
        <button
          onClick={() => setAddOpen(true)}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gold px-7 py-3 font-bold text-white shadow-sm transition hover:bg-gold-deep"
        >
          <Plus size={18} />
          أضف أول سطر
        </button>
        {category === "الكل" && (
          <p className="mt-4 text-xs text-ink-soft">
            نصف السطر: من الكتاب، واسمه، واسمك، وينشر على الجدار مباشرة
          </p>
        )}
        <AddLineModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            onAdded();
          }}
        />
        <ReaderChat />
      </div>
    );
  }

  const liked = likedIds.includes(current.id);
  const shownLikes = current.likes;

  const pageClass =
    "page " +
    (phase === "leaving"
      ? dir > 0
        ? "leave-f"
        : "leave-b"
      : dir > 0
        ? "enter-f"
        : "enter-b");

  const shareBtn =
    "flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-2 text-sm text-ink-soft transition hover:border-gold-deep hover:text-gold-deep disabled:opacity-50";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 pb-10">
      <header className="py-6 text-center">
        <p className="text-xs font-medium tracking-wide text-gold-deep">
          مدارك جو · قسم جديد
        </p>
        <h1 className="mt-1 font-serif text-4xl font-bold text-ink">
          بين السطور
        </h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          بطاقات تقلّبها زي الكتاب — كل سطر بتحبه، فيه غيرك بيعيشه
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-ink-soft">
            <Heart size={13} className="fill-rose-400 text-rose-400" />
            {totalHearts} قلب
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-ink-soft">
            {displayLines.length} سطراً
          </span>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-1.5 font-bold text-white shadow-sm transition hover:bg-gold-deep"
          >
            <Plus size={14} />
            أضف سطرك
          </button>
        </div>
      </header>

      {demo && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
          ⚠️ وضع المعاينة المبدئية — تُنشر السطور من الطلاب بعد ربط القاعدة
          (نفّذ ملف migration)
        </div>
      )}

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2 text-sm text-paper shadow-lg">
          {notice}
        </div>
      )}

      <nav className="no-scrollbar mb-5 flex gap-2 overflow-x-auto">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={
              "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition " +
              (category === c
                ? "border-gold bg-gold text-white shadow-sm"
                : "border-line bg-card text-ink-soft hover:border-gold-deep hover:text-gold-deep")
            }
          >
            {c}
          </button>
        ))}
      </nav>

      <main className="relative" style={{ perspective: "1400px" }}>
        <div className="relative h-96">
          <div key={current.id} className={pageClass}>
            <CardComponent
              line={current}
              liked={liked}
              onToggle={() => void onLike()}
              onShare={() => void onSystemShare(current)}
              isToday={isToday}
              demo={demo}
            />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-between">
          <button
            onClick={() => goTo(1)}
            disabled={phase !== "idle" || safeIndex >= deck.length - 1}
            aria-label="التالي"
            className="pointer-events-auto -mr-12 grid size-11 place-items-center rounded-full border border-line bg-card text-ink-soft shadow-md transition hover:border-gold-deep hover:text-gold-deep disabled:opacity-30"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={() => goTo(-1)}
            disabled={phase !== "idle" || safeIndex <= 0}
            aria-label="السابق"
            className="pointer-events-auto -ml-12 grid size-11 place-items-center rounded-full border border-line bg-card text-ink-soft shadow-md transition hover:border-gold-deep hover:text-gold-deep disabled:opacity-30"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </main>

      <p className="mt-5 text-center text-sm text-ink-soft">
        سطر {safeIndex + 1} من {deck.length}
      </p>
      <div className="mx-auto mt-2 h-1 w-40 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-gold transition-all"
          style={{ width: `${((safeIndex + 1) / deck.length) * 100}%` }}
        />
      </div>

      <div className="mx-auto mt-5 flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => void onLike()} disabled={liked} className={shareBtn}>
          <Heart className={liked ? "fill-rose-500 text-rose-500" : ""} size={16} />
          {shownLikes}
        </button>
        <button
          onClick={() => void onWhatsApp(current)}
          className={shareBtn}
          aria-label="مشاركة واتساب"
        >
          <MessageCircle size={16} />
          واتساب
        </button>
        <button
          onClick={() => void shareWithImage(current, "instagram")}
          disabled={busyAction !== ""}
          className={shareBtn}
          aria-label="ستوري إنستغرام"
        >
          <Instagram size={16} />
          {busyAction === "instagram" ? "جارٍ..." : "ستوري انستا"}
        </button>
        <button
          onClick={() => void shareWithImage(current, "snapchat")}
          disabled={busyAction !== ""}
          className={shareBtn}
          aria-label="سناب شات"
        >
          <Ghost size={16} />
          {busyAction === "snapchat" ? "جارٍ..." : "سناب"}
        </button>
        <button
          onClick={() => void onDownload(current)}
          disabled={busyAction !== ""}
          className={shareBtn}
        >
          <Download size={16} />
          {busyAction === "image" ? "تحضير..." : "نزّل صورة"}
        </button>
        <button onClick={() => void onCopy(current)} className={shareBtn}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "نُسخ" : "انسخ"}
        </button>
      </div>

      {top.length > 0 && !demo && (
        <section className="mt-10 rounded-2xl border border-line bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-serif text-2xl font-bold text-ink">
            <Sparkles size={20} className="text-gold-deep" />
            قمة الأسبوع
          </h2>
          <p className="mb-4 text-xs text-ink-soft">
            البطاقات الأكثر مشاركة فعليةً هذا الأسبوع — كل مشاركة مكتملة تحسب
          </p>
          <div className="space-y-2">
            {top.map((row, i) => (
              <div
                key={row.line_id}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-paper p-3 text-right transition hover:border-gold-deep"
              >
                <button
                  onClick={() => openTopCard(row.line_id)}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <span
                    className={
                      "grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold " +
                      (i === 0
                        ? "bg-gold text-white"
                        : i === 1
                          ? "bg-slate-300 text-slate-700"
                          : "bg-amber-700 text-white")
                    }
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-serif text-base text-ink">
                      {row.text}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {row.submitter} · {row.book}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-gold-deep">
                    📤 {row.week_shares}
                  </span>
                </button>
                <button
                  onClick={() => void downloadCard(toLine(row))}
                  disabled={busyAction !== ""}
                  aria-label="نزّل صورة هذه البطاقة"
                  className="shrink-0 rounded-full border border-line bg-card px-3 py-1.5 text-xs text-ink-soft transition hover:border-gold-deep hover:text-gold-deep disabled:opacity-50"
                >
                  <Download size={14} className="inline" />
                  نزّل
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <MyCards />

      <footer className="mt-auto pt-12 text-center text-xs leading-6 text-ink-soft">
        <p>
          أُضيف السطر وينشر مباشرة — شاركها على{" "}
          <span className="text-gold-deep">ستوري انستغرام وسناب</span> ووثّق
          التفاعل من «بطاقتي»
        </p>
        <p className="mt-1 flex items-center justify-center gap-1">
          <GraduationCap size={13} className="text-gold-deep" />
          مدارك جو · رفيق جيل كامل
        </p>
      </footer>

      <AddLineModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          setAddOpen(false);
          onAdded();
          setCategory("الكل");
          setIndex(0);
        }}
      />

      {proofLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-gold/40 bg-card p-5 text-center shadow-2xl">
            <button
              onClick={() => setProofLine(null)}
              aria-label="إغلاق"
              className="absolute top-3 left-3 rounded-full p-1 text-ink-soft transition hover:text-ink"
            >
              <X size={18} />
            </button>
            <p className="text-3xl">📸</p>
            <h3 className="mt-2 font-serif text-xl font-bold text-ink">
              أكّد مشاركتك!
            </h3>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              نقطتك بالمتصدر تنحسب فقط إذا قدّمت دليلاً أنك نشرت البطاقة فعلاً.
              شاركها على واتساب أو ستوري ثم ارفع سكرين شوت من النشر.
            </p>
            <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-right font-serif text-sm leading-snug text-ink">
              {proofLine.text}
            </p>
            <label
              className={
                "mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-gold px-4 py-2.5 text-sm font-bold text-white transition hover:bg-gold-deep " +
                (proofBusy ? "opacity-50" : "")
              }
            >
              <Camera size={16} />
              {proofBusy ? "جارٍ الاعتماد..." : "ارفع سكرين شوت النشر"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={proofBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onProofPicked(f);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="mt-2 text-[11px] text-ink-soft">
              يمكنك المشاركة لاحقاً من «بطاقتي» ورفع الدليل هناك أيضاً
            </p>
          </div>
        </div>
      )}

      <ReaderChat />
    </div>
  );
}