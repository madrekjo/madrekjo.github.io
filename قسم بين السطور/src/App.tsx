import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GraduationCap } from "lucide-react";
import {
  fetchLines,
  linesByUser,
  myProfile,
  myNotebook,
  addNotebookPage,
  updateNotebookPage,
  deleteNotebookPage,
  publicNotebook,
  publicProfile,
  reelsFeed,
  setBio,
  toggleFollow,
  toggleLike,
  toggleLineStar,
  toggleSave,
  myFollowingIds,
  fetchMyLikedIds,
  myStarredLineIds,
  mySavedIds,
  recordShare,
  recordVisit,
  type Line,
  type NotebookPage,
  type ReelRow,
  type UserProfile,
} from "./lib/api";
import { downloadBlob, renderCardImage } from "./lib/cardImage";
import { lines as sampleLines } from "./data";
import { wait } from "./lib/helpers";
import AddLineModal from "./components/AddLineModal";
import Onboarding from "./components/Onboarding";
import Profile from "./components/Profile";
import Reels from "./components/Reels";
import ShareSheet from "./components/ShareSheet";
import NotebookReader from "./components/NotebookReader";
import BottomNav, { type NavTab } from "./components/BottomNav";

function openWhatsAppText(text: string): boolean {
  const win = window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener,noreferrer"
  );
  return Boolean(win);
}

function reelToLine(r: ReelRow): Line {
  return {
    id: r.line_id,
    text: r.text,
    book: r.book,
    author: r.author,
    category: r.category,
    submitter: r.submitter,
    likes: r.likes,
    shares: r.shares,
    visits: r.visits,
    stars: r.stars,
    color: r.color,
    featured_date: null,
    created_at: r.created_at,
    user_id: r.user_id,
  };
}

function demoReels(lines: Line[]): ReelRow[] {
  return lines.map((l) => ({
    line_id: l.id,
    text: l.text,
    book: l.book,
    author: l.author,
    category: l.category,
    submitter: l.submitter,
    likes: l.likes,
    stars: 0,
    shares: l.shares,
    visits: l.visits,
    color: l.color,
    created_at: l.created_at,
    user_id: null,
    username: l.submitter,
    bio: null,
  }));
}

export default function App() {
  const [dbLines, setDbLines] = useState<Line[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [me, setMe] = useState<UserProfile | null>(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [reelsReady, setReelsReady] = useState(false);

  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);

  const [view, setView] = useState<NavTab>("me");
  const [profTab, setProfTab] = useState<"cards" | "notebook" | "saved">("cards");
  const [focusReel, setFocusReel] = useState("");

  const [openedUser, setOpenedUser] = useState<string | null>(null);
  const [pubProfile, setPubProfile] = useState<UserProfile | null>(null);
  const [pubLines, setPubLines] = useState<Line[]>([]);

  const [sheetLine, setSheetLine] = useState<Line | null>(null);
const [readerOpen, setReaderOpen] = useState(false);
  const [readerMine, setReaderMine] = useState(false);
  const [myPages, setMyPages] = useState<NotebookPage[]>([]);
  const [pubPages, setPubPages] = useState<NotebookPage[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [notice, setNotice] = useState("");

  const visitedRef = useRef<string | null>(null);

  const flash = useCallback((m: string) => {
    setNotice(m);
    wait(2200).then(() => setNotice(""));
  }, []);

  // ---------- التحميل الأول ----------
  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchLines();
        setDbLines(rows);
        setDemo(false);
        try {
          setReels(await reelsFeed(80));
        } catch {
          setReels(demoReels(rows));
        }
      } catch {
        const sample = sampleLines.map((l) => ({
          id: l.id,
          text: l.text,
          book: l.book,
          author: l.author,
          category: l.category,
          submitter: "تجريبي",
          color: "" as Line["color"],
          likes: 0,
          shares: 0,
          visits: 0,
          stars: 0,
          featured_date: null,
          created_at: "",
          user_id: null,
        }));
        setDbLines(sample);
        setReels(demoReels(sample));
        setDemo(true);
      }
      setReelsReady(true);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const prof = await myProfile();
      setMe(prof);
      if (!prof) setOnboardingOpen(true);
      setIdentityReady(true);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const [l, s, sv, f] = await Promise.all([
        fetchMyLikedIds(),
        myStarredLineIds(),
        mySavedIds(),
        myFollowingIds(),
      ]);
      setLikedIds(l);
      setStarredIds(s);
      setSavedIds(sv);
      setFollowingIds(f);
    })();
  }, []);

  // ---------- الروابط العميقة ----------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const card = params.get("card");
    const user = params.get("user");
    const nb = params.get("notebook");
    if (card) {
      setView("reels");
      setFocusReel(card);
      window.history.replaceState(null, "", window.location.pathname);
    } else if (user) {
      if (reelsReady && identityReady && me && me.id === user) {
        setView("me");
      } else {
        void openUser(user);
      }
      if (nb === "1") openPublicNotebook(user);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reelsReady, identityReady]);

  // ---------- الوصول لبروفايل مستخدم ----------
  const openUser = useCallback(async (id: string) => {
    setOpenedUser(id);
    const [p, l] = await Promise.all([publicProfile(id), linesByUser(id)]);
    setPubProfile(p);
    setPubLines(l);
  }, []);

  const closeUser = () => {
    setOpenedUser(null);
    setPubProfile(null);
    setPubLines([]);
  };

  // ---------- تعديل السطر محلياً (حتى يجي الجواب من السيرفر) ----------
  const patchLine = (id: string, patch: Partial<Line>) => {
    setDbLines((prev) =>
      prev ? prev.map((l) => (l.id === id ? { ...l, ...patch } : l)) : prev
    );
    setReels((prev) =>
      prev
        ? prev.map((r) =>
            r.line_id === id ? { ...r, ...patch } : (r as ReelRow)
          )
        : prev
    );
  };

  const findLine = (id: string): { likes: number; stars: number; userId: string | null } => {
    const l = dbLines?.find((x) => x.id === id);
    if (l) return { likes: l.likes, stars: l.stars, userId: l.user_id };
    const r = reels.find((x) => x.line_id === id);
    if (r) return { likes: r.likes, stars: r.stars, userId: r.user_id };
    return { likes: 0, stars: 0, userId: null };
  };

  const handleToggleLike = async (id: string) => {
    const liked = likedIds.includes(id);
    const { likes } = findLine(id);
    const delta = liked ? -1 : 1;
    setLikedIds((s) => (liked ? s.filter((x) => x !== id) : [...s, id]));
    patchLine(id, { likes: Math.max(0, likes + delta) });
    if (me) setMe({ ...me, likes_total: Math.max(0, me.likes_total + delta) });
    try {
      const n = await toggleLike(id);
      patchLine(id, { likes: n });
    } catch {
      setLikedIds((s) => (liked ? [...s, id] : s.filter((x) => x !== id)));
      if (me) setMe({ ...me, likes_total: Math.max(0, me.likes_total - delta) });
      flash("تعذّر تسجيل القلب");
    }
  };

  const handleToggleStar = async (id: string) => {
    const starred = starredIds.includes(id);
    const { stars, userId } = findLine(id);
    const delta = starred ? -1 : 1;
    setStarredIds((s) => (starred ? s.filter((x) => x !== id) : [...s, id]));
    patchLine(id, { stars: Math.max(0, stars + delta) });
    const isOwn = me && userId === me.id;
    if (isOwn)
      setMe({ ...me, stars_earned: Math.max(0, me.stars_earned + delta) });
    try {
      const n = await toggleLineStar(id);
      patchLine(id, { stars: n });
    } catch {
      setStarredIds((s) => (starred ? [...s, id] : s.filter((x) => x !== id)));
      if (isOwn)
        setMe({ ...me, stars_earned: Math.max(0, me.stars_earned - delta) });
      flash("تعذّر تسجيل النجمة");
    }
  };

  const handleToggleSave = async (id: string) => {
    const saved = savedIds.includes(id);
    setSavedIds((s) => (saved ? s.filter((x) => x !== id) : [...s, id]));
    try {
      const ok = await toggleSave(id);
      setSavedIds((s) =>
        ok ? (s.includes(id) ? s : [...s, id]) : s.filter((x) => x !== id)
      );
    } catch {
      setSavedIds((s) => (saved ? [...s, id] : s.filter((x) => x !== id)));
      flash("تعذّر حفظ البطاقة");
    }
  };

  const handleToggleFollow = async (id: string) => {
    const fl = followingIds.includes(id);
    setFollowingIds((s) => (fl ? s.filter((x) => x !== id) : [...s, id]));
    try {
      const ok = await toggleFollow(id);
      if (ok === fl) {
        setFollowingIds((s) =>
          ok ? [...s, id] : s.filter((x) => x !== id)
        );
      }
    } catch {
      setFollowingIds((s) => (fl ? [...s, id] : s.filter((x) => x !== id)));
      flash("تعذّر تحديث المتابعة — سجّل اسمك أولاً");
    }
  };

  // ---------- المشاركة ----------
  const shareText = (l: Line) =>
    `"${l.text}" — ${l.book} (${l.author})\n\nبين السطور · مدارك جو\nاسمي: ${l.submitter}`;

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
  };

  const onWhatsApp = async (l: Line) => {
    const ok = openWhatsAppText(shareText(l));
    if (ok) await markShare(l, "whatsapp");
  };

  const onShareImage = async (l: Line, platform: "instagram" | "snapchat") => {
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

  const onCopy = async (l: Line) => {
    try {
      await navigator.clipboard.writeText(shareText(l));
    } catch {
      flash("انسخ يدوياً من البطاقة");
    }
  };

  // ---------- الدفتر ----------
  const openMyNotebook = async () => {
    if (!me) {
      flash("سجّل اسمك أولاً من البروفايل");
      return;
    }
    setReaderMine(true);
    try {
      setMyPages(await myNotebook());
    } catch {
      setMyPages([]);
    }
    setReaderOpen(true);
  };

  const openPublicNotebook = useCallback(async (userId: string) => {
    setReaderMine(false);
    try {
      setPubPages(await publicNotebook(userId));
    } catch {
      setPubPages([]);
    }
    setReaderOpen(true);
  }, []);

  const closeReader = () => {
    setReaderOpen(false);
  };

  const reloadMyPages = async () => {
    try {
      setMyPages(await myNotebook());
    } catch {
      /* ignore */
    }
  };

  const createPage = async (content: string, isPublic: boolean) => {
    if (!ensureUserCanWrite()) return;
    await addNotebookPage(content, isPublic);
    await reloadMyPages();
  };

  const updatePage = async (
    pageId: number,
    content: string,
    isPublic: boolean
  ) => {
    await updateNotebookPage(pageId, content, isPublic);
    await reloadMyPages();
  };

  const removePage = async (page: NotebookPage) => {
    await deleteNotebookPage(page.id);
    await reloadMyPages();
  };

  const ensureUserCanWrite = () => {
    if (me) return true;
    flash("سجّل اسمك أولاً من البروفايل");
    return false;
  };

  // ---------- الحسابات ----------
  const myLines = useMemo(
    () => (me ? (dbLines ?? []).filter((l) => l.user_id === me.id) : []),
    [dbLines, me]
  );
  const savedLines = useMemo(
    () => (dbLines ?? []).filter((l) => savedIds.includes(l.id)),
    [dbLines, savedIds]
  );

  const shareSheetLike = (l: Line) => void handleToggleLike(l.id);
  const shareSheetStar = (l: Line) => void handleToggleStar(l.id);

  // ---------- الواجهة ----------
  if (!identityReady || !reelsReady || !dbLines) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 text-center">
        <p className="font-serif text-3xl font-bold text-gold-deep">بين السطور</p>
        <p className="mt-2 text-sm text-ink-soft">جارٍ فتح منصة القرّاء...</p>
      </div>
    );
  }

  const navActive: NavTab = openedUser ? "me" : view;

  return (
    <div className="app-shell mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 pb-6">
      <header className="pt-6 pb-4 text-center">
        <h1 className="font-serif text-3xl font-bold text-ink">بين السطور</h1>
        <p className="mt-1 flex items-center justify-center gap-1 text-xs text-ink-soft">
          <GraduationCap size={13} className="text-gold-deep" />
          منصة القرّاء والكتّاب · مدارك جو
        </p>
      </header>

      {demo && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
          ⚠️ وضع المعاينة — اربط قاعدة Supabase (نفّذ الـ migrations) ليعمل
          التسجيل والبث
        </div>
      )}

      {notice && (
        <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-ink px-5 py-2 text-sm text-paper shadow-lg">
          {notice}
        </div>
      )}

      {openedUser ? (
        <Profile
          isMine={false}
          profile={pubProfile}
          lines={pubLines}
          savedLines={[]}
          likedIds={likedIds}
          starredIds={starredIds}
          following={followingIds.includes(openedUser)}
          busyAction={busyAction}
          onOpenCard={setSheetLine}
          onOpenNotebook={() => openPublicNotebook(openedUser)}
          onAddCard={() => void 0}
          onToggleFollow={() => void handleToggleFollow(openedUser)}
          onEditBio={async () => void 0}
          onBack={closeUser}
          tab={profTab}
          onTabChange={setProfTab}
        />
      ) : (
        <Profile
          isMine
          profile={me}
          lines={myLines}
          savedLines={savedLines}
          likedIds={likedIds}
          starredIds={starredIds}
          following={false}
          busyAction={busyAction}
          onOpenCard={setSheetLine}
          onOpenNotebook={() => openMyNotebook()}
          onAddCard={() => {
            if (ensureUserCanWrite()) setAddOpen(true);
          }}
          onToggleFollow={() => void 0}
          onEditBio={async (bio) => {
            await setBio(bio);
            const prof = await myProfile();
            setMe(prof);
          }}
          onBack={() => setView("me")}
          tab={profTab}
          onTabChange={setProfTab}
        />
      )}

      <footer className="mt-10 pt-6 text-center text-[11px] leading-5 text-ink-soft">
        <p>بطاقات، دفتر وأفكار — شارك سطرك وخلي غيرك يعيشه</p>
      </footer>

      <BottomNav
        active={navActive}
        onChange={(t) => {
          if (openedUser) closeUser();
          if (t === "me") setProfTab("cards");
          if (t === "daf") setProfTab("notebook");
          setView(t);
        }}
      />

      {view === "reels" && !openedUser && (
        <Reels
          rows={reels}
          likedIds={likedIds}
          starredIds={starredIds}
          savedIds={savedIds}
          busyAction={busyAction}
          focusId={focusReel}
          onToggleLike={(id) => void handleToggleLike(id)}
          onToggleStar={(id) => void handleToggleStar(id)}
          onToggleSave={(id) => void handleToggleSave(id)}
          onOpenOwner={(r) => {
            if (r.user_id) void openUser(r.user_id);
          }}
          onShare={(r) => {
            setSheetLine(reelToLine(r));
          }}
          onClose={() => setView("me")}
          onView={(r) => {
            const id = r.line_id;
            if (demo || visitedRef.current === id) return;
            visitedRef.current = id;
            void recordVisit(id);
          }}
        />
      )}

      <ShareSheet
        line={sheetLine}
        liked={sheetLine ? likedIds.includes(sheetLine.id) : false}
        starred={sheetLine ? starredIds.includes(sheetLine.id) : false}
        busyAction={busyAction}
        onClose={() => setSheetLine(null)}
        onLike={shareSheetLike}
        onStar={shareSheetStar}
        onWhatsApp={(l) => void onWhatsApp(l)}
        onInstagram={(l) => void onShareImage(l, "instagram")}
        onSnap={(l) => void onShareImage(l, "snapchat")}
        onDownload={(l) => void onDownload(l)}
        onCopy={(l) => void onCopy(l)}
      />

      <NotebookReader
        open={readerOpen}
        isMine={readerMine}
        ownerName={readerMine ? (me?.username ?? "دفترك") : (pubProfile?.username ?? "القارئ")}
        pages={readerMine ? myPages : pubPages}
        onClose={closeReader}
        onCreate={createPage}
        onUpdate={updatePage}
        onDelete={removePage}
      />

      <AddLineModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          setAddOpen(false);
          void (async () => {
            try {
              const rows = await fetchLines();
              setDbLines(rows);
              try {
                setReels(await reelsFeed(80));
              } catch {
                /* preview */
              }
            } catch {
              /* keep */
            }
            const prof = await myProfile();
            if (prof) setMe(prof);
          })();
        }}
        defaultName={me?.username ?? ""}
      />

      {onboardingOpen && (
        <Onboarding
          onDone={(id, username) => {
            setOnboardingOpen(false);
            setMe((m) =>
              m ? { ...m, id, username } : { id, username, bio: "", avatar_url: "", card_count: 0, likes_total: 0, shares_total: 0, stars_earned: 0, stars_avg: 0, stars_count: 0, followers_count: 0, following_count: 0 }
            );
            void (async () => {
              const prof = await myProfile();
              if (prof) setMe(prof);
              try {
                const rows = await fetchLines();
                setDbLines(rows);
                setReels(await reelsFeed(80));
              } catch {
                /* ignore */
              }
            })();
          }}
          onSkip={() => setOnboardingOpen(false)}
        />
      )}
    </div>
  );
}