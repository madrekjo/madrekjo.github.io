import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AnswerState, OptionKey, Question, Scope, UserProfile } from "./types";
import HomePicker from "./components/HomePicker";
import QuestionReels from "./components/QuestionReels";
import CreateQuestion from "./components/CreateQuestion";
import PublisherProfile from "./components/PublisherProfile";
import MyProfile from "./components/MyProfile";
import IntroScreen from "./components/IntroScreen";
import Onboarding from "./components/Onboarding";
import {
  dbAvailable,
  fetchCorrectCount,
  insertQuestion,
  listQuestions,
  listSavedIds,
  myProfile as dbMyProfile,
  recordAttempt,
  supabase,
  toggleLike as dbToggleLike,
  toggleSave as dbToggleSave,
  updateMyProfile,
} from "./lib/db";
import { downloadBlob, renderQuestionImage } from "./lib/questionImage";

const STORE_KEY = "ektub-su-alak-questions-v2";
const SAVES_KEY = "ektub-su-alak-saves-v1";
const PROFILE_KEY = "ektub-su-alak-profile-v1";
const CORRECT_KEY = "ektub-su-alak-correct-v1";
const INTRO_KEY = "ektub-su-alak-intro-v1";

function readShareId(): string | null {
  const m = window.location.hash.match(/q=([\w-]+)/);
  return m ? m[1] : null;
}

function shareLinkOf(id: string): string {
  return `${window.location.origin}${window.location.pathname}#q=${id}`;
}

function readStoredProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function loadSaved(): Question[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw) as Question[];
    return saved.filter((s) => s.mine);
  } catch {
    return [];
  }
}

export default function App() {
  const shareId = useMemo(() => readShareId(), []);
  const [profile, setProfile] = useState<UserProfile | null>(() =>
    readStoredProfile()
  );
  const [onboarding, setOnboarding] = useState<"setup" | "edit" | null>(null);
  const [myProfileOpen, setMyProfileOpen] = useState(false);

  const [questions, setQuestions] = useState<Question[]>(() => loadSaved());
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [screen, setScreen] = useState<"home" | "reels">(() =>
    shareId ? "reels" : "home"
  );
  const [scope, setScope] = useState<Scope>("all");
  const [subject, setSubject] = useState("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(SAVES_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const [focusId, setFocusId] = useState<string | null>(shareId);
  const [createOpen, setCreateOpen] = useState(false);
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [savingId, setSavingId] = useState("");
  const [notice, setNotice] = useState("");
  const [correctIds, setCorrectIds] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CORRECT_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const [dbCorrectCount, setDbCorrectCount] = useState(0);

  // حالة القاعدة
  const [dbReady, setDbReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(INTRO_KEY) !== "1";
    } catch {
      return false;
    }
  });

  const flash = (m: string) => {
    setNotice(m);
    window.setTimeout(() => setNotice(""), 2600);
  };

  // ========= ربط قاعدة البيانات عند التشغيل =========
  useEffect(() => {
    if (!dbAvailable()) return;
    let alive = true;
    let guestId: string | null = null;

    (async () => {
      // جلسة الضيف (مجاني وبدون كلمة مرور)
      try {
        const { data } = await supabase!.auth.getSession();
        let session: Session | null = data.session;
        if (!session) {
          const r = await supabase!.auth.signInAnonymously();
          if (r.error) throw r.error;
          session = r.data.session;
        }
        if (!alive || !session) return;
        setUid(session.user.id);
        guestId = session.user.id;
      } catch {
        // وضع الضيف مغلق في لوحة Supabase — العرض فقط يعمل
      }

      // بيانات المستخدم والاسم إن وُجد
      if (alive && guestId) {
        try {
          const p = await dbMyProfile(guestId);
          if (
            profile &&
            (!p?.username || p.username === "طالب" + guestId.slice(0, 6))
          ) {
            await updateMyProfile(guestId, {
              username: profile.name,
              field: profile.field,
              grade: profile.grade,
            });
          }
        } catch {
          /* ignore */
        }
      }

      // الأسئلة من القاعدة
      try {
        const qs = await listQuestions();
        if (alive) {
          setQuestions(qs);
          if (!qs.length && !shareId) flash("القاعدة لأ بس فيها أسئلة — اكتب أول سؤال!");
        }
      } catch {
        // اتصال القاعدة غير متاح الآن — نكمل محلياً بدون أي رسالة خطأ
      }

      // المحفوظات المخزنة بالسحابة
      if (alive && guestId) {
        try {
          const saved = await listSavedIds(guestId);
          if (alive && saved.length) {
            setSavedIds((p) => ({
              ...p,
              ...Object.fromEntries(saved.map((s) => [s, true])),
            }));
          }
        } catch {
          /* ignore */
        }
      }
    })();

    setDbReady(true);

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(questions));
      localStorage.setItem(SAVES_KEY, JSON.stringify(savedIds));
    } catch {
      /* ignore */
    }
  }, [questions, savedIds]);

  useEffect(() => {
    try {
      localStorage.setItem(CORRECT_KEY, JSON.stringify(correctIds));
    } catch {
      /* ignore */
    }
  }, [correctIds]);

  useEffect(() => {
    if (!dbReady || !uid) return;
    fetchCorrectCount(uid)
      .then(setDbCorrectCount)
      .catch(() => {
        /* ignore */
      });
  }, [dbReady, uid]);

  useEffect(() => {
    if (!shareId) return;
    const found = questions.some((q) => q.id === shareId);
    flash(
      found ? "✓ فتحنا السؤال المشترك" : "⚠️ السؤال المشترك غير متوفر بعد"
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProfile = (p: UserProfile) => {
    setProfile(p);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
    if (dbReady && uid) {
      updateMyProfile(uid, {
        username: p.name,
        field: p.field,
        grade: p.grade,
      }).catch(() => {});
    }
    flash("✓ حُفظ ملفك الشخصي");
  };

  const likesOf = (q: Question) => likeCounts[q.id] ?? q.likes;
  const likedOf = (q: Question) => !!likedIds[q.id];

  const myFieldQuestions = useMemo(
    () =>
      profile
        ? questions.filter((q) => q.field === profile.field)
        : questions,
    [questions, profile]
  );

  const availableSubjects = useMemo(() => {
    const list = scope === "all" ? questions : myFieldQuestions;
    return Array.from(new Set(list.map((q) => q.subject)));
  }, [scope, questions, myFieldQuestions]);

  const visibleList = useMemo(() => {
    let list = scope === "all" ? questions : myFieldQuestions;
    if (subject !== "all") list = list.filter((q) => q.subject === subject);
    if (profileFor) list = list.filter((q) => q.author === profileFor);
    if (savedOnly) list = list.filter((q) => savedIds[q.id]);
    return list;
  }, [scope, subject, profileFor, savedOnly, savedIds, questions, myFieldQuestions]);

  const startReels = (nextScope: Scope, nextSubject: string) => {
    setScope(nextScope);
    setSubject(nextSubject);
    setSavedOnly(false);
    setProfileFor(null);
    setFocusId(null);
    setScreen("reels");
  };

  const handleAnswer = (q: Question, key: OptionKey) => {
    if (answers[q.id]) return;
    const correct = key === q.correct;
    setAnswers((p) => ({ ...p, [q.id]: { chosen: key, correct } }));
    if (correct) setCorrectIds((p) => ({ ...p, [q.id]: true }));
    if (dbReady && uid) {
      recordAttempt({
        userId: uid,
        questionId: q.id,
        chosen: key,
        correct,
      }).catch(() => {});
    }
  };

  const handleSaveImage = async (q: Question) => {
    setSavingId(q.id);
    try {
      const blob = await renderQuestionImage(q);
      downloadBlob(blob, `اكتب-سؤالك-${q.field}-${q.subject}.jpg`);
      flash("✓ نُزّلت الصورة — جاهزة للنشر");
    } catch (e) {
      flash(e instanceof Error ? e.message : "تعذّر إنشاء الصورة");
    } finally {
      setSavingId("");
    }
  };

  const handleToggleLike = (q: Question) => {
    const wasLiked = likedOf(q);
    setLikedIds((p) => ({ ...p, [q.id]: !wasLiked }));
    setLikeCounts((p) => ({
      ...p,
      [q.id]: Math.max((p[q.id] ?? q.likes) + (wasLiked ? -1 : 1), 0),
    }));
    if (dbReady && uid) {
      dbToggleLike(uid, q.id).catch(() => {});
    }
  };

  const copyLink = async (url: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return;
    }
    window.prompt("انسخ رابط السؤال:", url);
  };

  const handleShare = async (q: Question) => {
    const url = shareLinkOf(q.id);
    const title = "اكتب سؤالك — مدارك جو 🎓";
    const text = `سؤال من ${q.author} في مدارك جو:\n${q.question}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await copyLink(url);
      flash("✓ نُسخ الرابط — شاركه الآن");
    } catch {
      window.prompt("انسخ رابط السؤال:", url);
      flash("✓ انسخ الرابط وشاركه");
    }
  };

  const handleToggleSave = (q: Question) => {
    const wasSaved = !!savedIds[q.id];
    setSavedIds((p) => ({ ...p, [q.id]: !wasSaved }));
    flash(wasSaved ? "أُزيل من المحفوظات" : "✓ حُفظ السؤال في المحفوظات");
    if (dbReady && uid) {
      dbToggleSave(uid, q.id).catch(() => {});
    }
  };

  const handleResetAnswer = (q: Question) => {
    setAnswers((p) => {
      const next = { ...p };
      delete next[q.id];
      return next;
    });
  };

  const handleToggleSavedView = () => setSavedOnly((s) => !s);

  const openProfileReels = (author: string, qid?: string) => {
    const list = questions.filter((q) => q.author === author);
    setScope("all");
    setSubject("all");
    setSavedOnly(false);
    setProfileFor(author);
    setFocusId(qid ?? list[0]?.id ?? null);
    setScreen("reels");
  };

  const handleCreated = async (q: Question) => {
    let created = q;
    if (dbReady && uid) {
      try {
        created = await insertQuestion({
          author_id: uid,
          question: q.question,
          image_url: q.image,
          options: q.options,
          correct: q.correct,
          field: q.field,
          subject: q.subject,
          grade: q.grade ?? null,
          ayah: q.ayah ?? null,
        });
      } catch {
        flash("⚠️ لم يُنشر للقاعدة — السؤال محفوظ محلياً");
      }
    } else if (dbReady) {
      flash("سؤالكم محفوظ محلياً — يتشارك عند تفعيل حسابات الضيف");
    }
    setQuestions((p) => [created, ...p]);
    if (profile && created.field === profile.field) setScope("mine-field");
    else setScope("all");
    setSubject("all");
    setSavedOnly(false);
    setProfileFor(null);
    setFocusId(created.id);
    setScreen("reels");
    flash("✓ نُشر سؤالك — أول بطاقة بالريلز");
  };

  const scopeLabel =
    profileFor != null
      ? `أسئلة ${profileFor}`
      : scope === "mine-field"
        ? `حقل ${profile?.field ?? ""}`
        : "جميع الحقول";

  // ========= شرح القسم قبل الدخول (مرة واحدة لكل جهاز) =========
  if (introOpen) {
    return (
      <IntroScreen
        onStart={() => {
          setIntroOpen(false);
          try {
            localStorage.setItem(INTRO_KEY, "1");
          } catch {
            /* ignore */
          }
        }}
      />
    );
  }

  // ========= أول مرة: شاشة الإعداد =========
  if (profile === null) {
    return (
      <Onboarding
        mode="setup"
        onDone={(p) => {
          saveProfile(p);
          setOnboarding(null);
        }}
      />
    );
  }

  const me = profile;

  return (
    <div dir="rtl">
      <HomePicker
        userName={me.name}
        userField={me.field}
        userGrade={me.grade}
        scope={scope}
        subject={subject}
        availableSubjects={availableSubjects}
        fieldCount={myFieldQuestions.length}
        allCount={questions.length}
        onPick={startReels}
        onOpenProfile={() => setMyProfileOpen(true)}
        onCreate={() => setCreateOpen(true)}
      />
      {renderApp()}
    </div>
  );

  function renderApp() {
    const myQuestions = questions.filter(
      (q) => q.mine || q.author === me.name
    );
    const totalLikes = myQuestions.reduce((s, q) => s + likesOf(q), 0);
    const correctCount = Math.max(
      dbCorrectCount,
      Object.keys(correctIds).length
    );
    return (
      <>
        {screen === "reels" && (
          <QuestionReels
            questions={visibleList}
            answers={answers}
            likedIds={likedIds}
            likeCounts={likeCounts}
            savedIds={savedIds}
            savedOnly={savedOnly}
            focusId={focusId ?? undefined}
            scopeLabel={scopeLabel}
            onAnswer={handleAnswer}
            onToggleLike={handleToggleLike}
            onToggleSave={handleToggleSave}
            onShare={handleShare}
            onResetAnswer={handleResetAnswer}
            onToggleSavedView={handleToggleSavedView}
            onBack={() => {
              setScreen("home");
              setProfileFor(null);
            }}
            onOpenAuthor={(q) =>
              q.author === me.name
                ? setMyProfileOpen(true)
                : setProfileFor(q.author)
            }
            onSaveImage={handleSaveImage}
            onOpenCreate={() => setCreateOpen(true)}
            savingId={savingId}
          />
        )}

        {createOpen && (
          <CreateQuestion
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            onCreated={handleCreated}
            defaults={me}
          />
        )}

        {profileFor && (
          <PublisherProfile
            questions={questions.filter((q) => q.author === profileFor)}
            likesOf={likesOf}
            likedOf={likedOf}
            currentUserName={me.name}
            onClose={() => setProfileFor(null)}
            onSeeQuestions={() => openProfileReels(profileFor)}
            onOpenQuestion={(q) => openProfileReels(profileFor, q.id)}
          />
        )}

        {myProfileOpen && (
          <MyProfile
            profile={me}
            stats={{
              published: myQuestions.length,
              likes: totalLikes,
              correct: correctCount,
            }}
            onClose={() => setMyProfileOpen(false)}
            onBrowse={() => {
              setMyProfileOpen(false);
              startReels("all", "all");
            }}
            onSaved={() => {
              setMyProfileOpen(false);
              setScope("all");
              setSubject("all");
              setProfileFor(null);
              setSavedOnly(true);
              setFocusId(null);
              setScreen("reels");
            }}
            onEdit={() => setOnboarding("edit")}
          />
        )}

        {onboarding === "edit" && (
          <Onboarding
            mode="edit"
            initial={me}
            onDone={(p) => {
              saveProfile(p);
              setOnboarding(null);
            }}
            onCancel={() => setOnboarding(null)}
          />
        )}

        {notice && (
          <div className="fixed bottom-8 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-ink px-5 py-2 text-sm font-bold text-paper shadow-xl">
            {notice}
          </div>
        )}
      </>
    );
  }
}