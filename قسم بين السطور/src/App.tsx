import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Camera,
  GraduationCap,
  Heart,
  Home,
  Quote,
  MessagesSquare,
  Plus,
  Sparkles,
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
  myProfile,
  type Line,
  type WeeklyTopRow,
} from "./lib/api";
import { downloadBlob, renderCardImage } from "./lib/cardImage";
import AddLineModal from "./components/AddLineModal";
import ProfileHome from "./components/ProfileHome";
import ReelsFeed from "./components/ReelsFeed";
import Onboarding from "./components/Onboarding";
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
    user_id: null,
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
  const [likedIds, setLikedIds] = useState<string[]>(restoreLikedIds);
  const [top, setTop] = useState<WeeklyTopRow[]>([]);
  const [busyAction, setBusyAction] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [proofLine, setProofLine] = useState<Line | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [tab, setTab] = useState<"home" | "reels" | "corner">("home");
  const [focusReel, setFocusReel] = useState("");
  const [profileUser, setProfileUser] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [onboarding, setOnboarding] = useState(false);
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
          user_id: null,
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
        if (dbLines.some((l) => l.id === card)) {
          setCategory("الكل");
          setFocusReel(card);
          setTab("reels");
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

  const totalHearts = displayLines.reduce((a, b) => a + b.likes, 0);

  const PROFILE_KEY = "bayn-al-sutur:profile";
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = localStorage.getItem(PROFILE_KEY);
        if (raw) {
          const p = JSON.parse(raw);
          if (p?.id) {
            return setProfileUser(p);
          }
        }
      } catch {
        /* ignore */
      }
      const prof = await myProfile();
      if (!active) return;
      if (prof && prof.id) {
        setProfileUser({ id: prof.id, username: prof.username });
        try {
          localStorage.setItem(
            PROFILE_KEY,
            JSON.stringify({ id: prof.id, username: prof.username })
          );
        } catch {
          /* ignore */
        }
      } else {
        setOnboarding(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleOnboarded = (id: string, username: string) => {
    setProfileUser({ id, username });
    setOnboarding(false);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ id, username }));
    } catch {
      /* ignore */
    }
    void loadLines();
  };

  const patchLine = (id: string, patch: Partial<Line>) => {
    setDbLines((prev) =>
      prev ? prev.map((l) => (l.id === id ? { ...l, ...patch } : l)) : prev
    );
  };

  const flash = (t: string) => {
    setNotice(t);
    wait(2200).then(() => setNotice(""));
  };

  const onLike = async (line: Line) => {
    if (likedIds.includes(line.id)) return;
    setLikedIds((s) => [...s, line.id]);
    if (demo) {
      patchLine(line.id, { likes: line.likes + 1 });
      return;
    }
    try {
      const n = await likeLine(line.id);
      patchLine(line.id, { likes: n });
    } catch {
      setLikedIds((s) => s.filter((id) => id !== line.id));
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

  const onCopy = async (l: Line) => {
    try {
      await navigator.clipboard.writeText(shareText(l));
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
    if (!displayLines.some((l) => l.id === id)) return;
    setCategory("الكل");
    setFocusReel(id);
    setTab("reels");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

if (dbLines === null) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 text-center">
        <p className="font-serif text-3xl font-bold text-gold-deep">
          بين السطور
        </p>
        <p className="mt-2 text-sm text-ink-soft">جارٍ فتح الجدار...</p>
      </div>
    );
  }

  const TABS = [
    { id: "home" as const, label: "الرئيسية", Icon: Home },
    { id: "reels" as const, label: "عبارات", Icon: Quote },
    { id: "corner" as const, label: "ملتقى القرّاء", Icon: MessagesSquare },
  ];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 pb-10">
      <header className="pt-6 pb-4 text-center">
        <p className="text-xs font-medium tracking-wide text-gold-deep">
          مدارك جو · قسم جديد
        </p>
        <h1 className="mt-1 font-serif text-4xl font-bold text-ink">
          بين السطور
        </h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          بطاقة بتحكي قصته — ومشاركتها بتوصلها لغيرك
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
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink px-5 py-2 text-sm text-paper shadow-lg">
          {notice}
        </div>
      )}

      <nav className="mb-5 grid grid-cols-3 gap-1 rounded-full border border-line bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition " +
              (tab === t.id
                ? "bg-gold text-white shadow-sm"
                : "text-ink-soft hover:bg-gold/10 hover:text-gold-deep")
            }
          >
            <t.Icon size={15} />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "home" && (
        <div className="space-y-8">
          {top.length > 0 && !demo && (
            <section className="rounded-2xl border border-line bg-card p-5">
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

          <ProfileHome
            profileUser={profileUser}
            onRegister={() => setOnboarding(true)}
            onAddCard={() => setAddOpen(true)}
          />
        </div>
      )}

      {tab === "reels" && (
        <>
          <nav className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
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

          <ReelsFeed
            lines={deck}
            likedIds={likedIds}
            busyAction={busyAction}
            focusId={focusReel}
            onFocusDone={() => setFocusReel("")}
            onToggleLike={(l) => void onLike(l)}
            onWhatsApp={(l) => void onWhatsApp(l)}
            onShareImage={(l, p) => void shareWithImage(l, p)}
            onDownloadImg={(l) => void onDownload(l)}
            onCopy={(l) => void onCopy(l)}
          />
        </>
      )}

      {tab === "corner" && <ReaderChat />}

      <footer className="mt-10 pt-10 text-center text-xs leading-6 text-ink-soft">
        <p>
          أُضيف السطر وينشر مباشرة — شاركه على{" "}
          <span className="text-gold-deep">ستوري انستغرام وسناب</span> ووثّق
          تفاعلك من تبويب «الرئيسية»
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
        }}
        defaultName={profileUser?.username ?? ""}
      />

      {proofLine && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
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

      {onboarding && (
        <Onboarding
          onDone={handleOnboarded}
          onSkip={() => setOnboarding(false)}
        />
      )}
    </div>
  );
}