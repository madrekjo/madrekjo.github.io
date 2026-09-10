import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Heart,
  Pencil,
  Plus,
  Save,
  Star,
  UserPlus,
} from "lucide-react";
import type { Line, UserProfile } from "@/lib/api";
import Avatar from "./Avatar";

const GRADS: Record<string, string> = {
  "رواية": "from-amber-100 to-orange-200",
  "ديني": "from-emerald-100 to-teal-200",
  "تنمية": "from-sky-100 to-indigo-200",
  "شعر": "from-violet-100 to-fuchsia-200",
  "تاريخ": "from-rose-100 to-red-200",
};

function CardThumb({
  line,
  liked,
  starred,
  onClick,
}: {
  line: Line;
  liked: boolean;
  starred: boolean;
  onClick: () => void;
}) {
  const grad = GRADS[line.category] ?? GRADS["رواية"];
  return (
    <button
      onClick={onClick}
      className="group flex w-full flex-col justify-between overflow-hidden rounded-2xl border border-line bg-gradient-to-br p-3 text-right shadow-sm transition hover:border-gold-deep hover:shadow-md"
      style={{ aspectRatio: "3/4" }}
    >
      <span
        className={
          "w-fit rounded-full px-2 py-0.5 text-[10px] font-bold " +
          (grad.includes("amber") || grad.includes("orange")
            ? "bg-white/70 text-orange-700"
            : "bg-white/70 text-ink-soft")
        }
      >
        {line.category}
      </span>
      <p className="line-clamp-4 font-serif text-base leading-snug font-bold text-ink">
        {line.text}
      </p>
      <div>
        <p className="truncate text-xs text-ink-soft">{line.book}</p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] font-medium text-ink-soft">
          <span className={liked ? "flex items-center gap-1 text-rose-500" : "flex items-center gap-1"}>
            <Heart size={13} className={liked ? "fill-rose-500" : ""} />
            {line.likes}
          </span>
          <span className={starred ? "flex items-center gap-1 text-gold-deep" : "flex items-center gap-1"}>
            <Star size={13} className={starred ? "fill-gold" : ""} />
            {line.stars}
          </span>
        </div>
      </div>
    </button>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center py-1">
      <span className="text-lg font-extrabold text-ink">{value}</span>
      <span className="mt-0.5 text-[11px] text-ink-soft">{label}</span>
    </div>
  );
}

export default function Profile({
  isMine,
  profile,
  lines,
  savedLines,
  likedIds,
  starredIds,
  following,
  busyAction,
  onOpenCard,
  onOpenNotebook,
  onAddCard,
  onToggleFollow,
  onEditBio,
  onBack,
  tab,
  onTabChange,
}: {
  isMine: boolean;
  profile: UserProfile | null;
  lines: Line[];
  savedLines: Line[];
  likedIds: string[];
  starredIds: string[];
  following: boolean;
  busyAction: string;
  onOpenCard: (l: Line) => void;
  onOpenNotebook: () => void;
  onAddCard: () => void;
  onToggleFollow: () => void;
  onEditBio: (bio: string) => Promise<void>;
  onBack: () => void;
  tab: "cards" | "notebook" | "saved";
  onTabChange: (t: "cards" | "notebook" | "saved") => void;
}) {
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [bioBusy, setBioBusy] = useState(false);

  const name = profile?.username ?? "...";
  const saveBio = async () => {
    setBioBusy(true);
    try {
      await onEditBio(bioDraft.trim());
      setEditingBio(false);
    } catch {
      /* تبقى النافذة مفتوحة */
    } finally {
      setBioBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {!isMine && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-ink-soft transition hover:text-gold-deep"
        >
          <ArrowRight size={16} />
          رجوع
        </button>
      )}

      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="flex items-start gap-4">
          <Avatar name={name} url={profile?.avatar_url} className="size-16 text-3xl" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-2xl font-bold text-ink">
              {name}
            </h1>
            {editingBio ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  rows={2}
                  maxLength={280}
                  autoFocus
                  placeholder="اكتب جملة عنك..."
                  className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-gold"
                />
                <button
                  onClick={() => void saveBio()}
                  disabled={bioBusy}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-white transition hover:bg-gold-deep disabled:opacity-50"
                >
                  <Save size={14} />
                  {bioBusy ? "جارٍ..." : "احفظ"}
                </button>
              </div>
            ) : (
              <p className="mt-1 text-sm leading-6 text-ink-soft">
                {profile?.bio || "قارئ على جدار بين السطور 📚"}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {isMine ? (
                <>
                  {!editingBio && (
                    <button
                      onClick={() => {
                        setBioDraft(profile?.bio ?? "");
                        setEditingBio(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:border-gold-deep hover:text-gold-deep"
                    >
                      <Pencil size={12} />
                      عدّل النبذة
                    </button>
                  )}
                  <button
                    onClick={onAddCard}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-bold text-white transition hover:bg-gold-deep"
                  >
                    <Plus size={13} />
                    بطاقة جديدة
                  </button>
                </>
              ) : (
                <button
                  onClick={onToggleFollow}
                  disabled={busyAction !== ""}
                  className={
                    "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold transition disabled:opacity-50 " +
                    (following
                      ? "border border-line text-ink-soft hover:border-gold-deep"
                      : "bg-gold text-white hover:bg-gold-deep")
                  }
                >
                  <UserPlus size={15} />
                  {following ? "ألغِ المتابعة" : "تابع"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-5 divide-x divide-x-reverse divide-line rounded-2xl bg-paper py-2 text-center">
          <Stat value={profile?.card_count ?? 0} label="بطاقات" />
          <Stat value={profile?.followers_count ?? 0} label="متابِعون" />
          <Stat value={profile?.following_count ?? 0} label="متابَعين" />
          <Stat value={profile?.stars_earned ?? 0} label="نجوم" />
          <Stat value={profile?.likes_total ?? 0} label="مجموع الإعجابات" />
        </div>
      </section>

      <nav
        className={
          "grid gap-1 rounded-full border border-line bg-card p-1 " +
          (isMine ? "grid-cols-3" : "grid-cols-2")
        }
      >
        {(
          [
            { id: "cards", label: "البطاقات" },
            { id: "notebook", label: "الدفتر" },
            { id: "saved", label: "المحفوظة", mineOnly: true },
          ] as const
        )
          .filter((t) => isMine || !("mineOnly" in t))
          .map((t) => (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={
                "rounded-full px-3 py-2 text-sm font-medium transition " +
                (tab === t.id
                  ? "bg-gold text-white shadow-sm"
                  : "text-ink-soft hover:text-gold-deep")
              }
            >
              {t.label}
            </button>
          ))}
      </nav>

      {tab === "cards" && (
        <>
          {lines.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-card p-8 text-center">
              <p className="text-3xl">🃏</p>
              <p className="mt-2 text-sm text-ink-soft">
                {isMine
                  ? "حط أول بطاقة اقتباس — بيصير غيرك يحبها ويجمّعلك نجوم"
                  : "ما نشر بطاقات بعد"}
              </p>
              {isMine && (
                <button
                  onClick={onAddCard}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-white transition hover:bg-gold-deep"
                >
                  <Plus size={16} />
                  أضف بطاقتك الأولى
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {lines.map((l) => (
                <CardThumb
                  key={l.id}
                  line={l}
                  liked={likedIds.includes(l.id)}
                  starred={starredIds.includes(l.id)}
                  onClick={() => onOpenCard(l)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "notebook" && (
        <div className="rounded-2xl border border-line bg-card p-6 text-center">
          <BookOpen size={40} className="mx-auto text-gold-deep" />
          <h3 className="mt-3 font-serif text-2xl font-bold text-ink">
            دُفتر {isMine ? "" : name}
          </h3>
          <p className="mt-1.5 text-sm leading-6 text-ink-soft">
            صفحات كاملة من أفكارك — قلب صفحات بالأنيميشن، وكل زائر يقدر يقرأه
          </p>
          <button
            onClick={onOpenNotebook}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 font-bold text-white shadow-sm transition hover:bg-gold-deep"
          >
            <BookOpen size={17} />
            افتح الدفتر
          </button>
        </div>
      )}

      {tab === "saved" && isMine && (
        <>
          {savedLines.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-card p-8 text-center">
              <p className="text-3xl">🔖</p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                البطاقات اللي بتحفظها من الريلز بتحصلها هنا
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {savedLines.map((l) => (
                <CardThumb
                  key={l.id}
                  line={l}
                  liked={likedIds.includes(l.id)}
                  starred={starredIds.includes(l.id)}
                  onClick={() => onOpenCard(l)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}