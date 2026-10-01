import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * بث تنبيهات من قاعدة Supabase (جدول broadcasts).
 * يفحص كل دقيقة + عند عودة التبويب — فيصل التنبيه للتطبيق المفتوح
 * حتى لو لم يحدث المستخدم الصفحة، ويُعرض مرة واحدة فقط للبث الواحد.
 */

type Block =
  | { t: "salam" | "hadith" | "p" | "tipsHeader" | "closing"; text: string }
  | { t: "li"; text: string };

interface Broadcast {
  id: string;
  title: string;
  content: Block[];
}

const SEEN_PREFIX = "mdk_bcast_seen_";

export default function MorningGreeting() {
  const [bcast, setBcast] = useState<Broadcast | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const lastCheckRef = { current: 0 };

    const check = async (force = false) => {
      // رجوع التبويب كان يضرب السيرفر كل مرة — نخليه مرة كل دقيقة
      if (!force && Date.now() - lastCheckRef.current < 60_000) return;
      lastCheckRef.current = Date.now();
      try {
        const { data, error } = await supabase
          .from("broadcasts")
          .select("id, title, content")
          .eq("kind", "morning")
          .eq("visible", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (!alive) return;
        if (!data) {
          setBcast(null);
          return;
        }
        setBcast(data as unknown as Broadcast);
        if (localStorage.getItem(SEEN_PREFIX + data.id) === "1") setDone(true);
        // لقينا البثّ: منستناش أكثر
        if (timer) window.clearTimeout(timer);
      } catch {
        // الجدول غير موجود أو خطأ شبكة — بلا إزعاج.
      }
    };

    /* كان بيستطلع كل 10 دقايق للأبد (~144 طلب/يوم لكل مستخدم).
       الحين: مرة كل 30 دقيقة كشبكة أمان بس، وRealtime بيوصّل البثّ فوراً. */
    const schedule = () => {
      if (!alive) return;
      timer = window.setTimeout(async () => {
        await check(true);
        schedule();
      }, 30 * 60_000);
    };

    void check(true).then(schedule);

    const chan = supabase
      .channel("broadcasts-morning")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "broadcasts", filter: "kind=eq.morning" },
        () => void check(true)
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
      supabase.removeChannel(chan);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  if (!bcast || done) return null;

  const dismiss = () => {
    localStorage.setItem(SEEN_PREFIX + bcast.id, "1");
    setDone(true);
  };

  const renderBlock = (block: Block, i: number) => {
    switch (block.t) {
      case "salam":
        return (
          <p key={i} className="font-semibold text-base text-center">
            {block.text}
          </p>
        );
      case "hadith": {
        const [label, ...rest] = block.text.split("\n");
        return (
          <div key={i} className="rounded-xl bg-muted p-3 space-y-1">
            {label && <p className="text-xs text-muted-foreground">{label}</p>}
            <p className="font-medium whitespace-pre-wrap">{rest.join("\n")}</p>
          </div>
        );
      }
      case "tipsHeader":
        return (
          <p key={i} className="font-semibold flex items-center gap-1.5 text-primary">
            <Sparkles className="w-3.5 h-3.5 shrink-0" /> {block.text}
          </p>
        );
      case "li":
        return (
          <li key={i} className="text-foreground/90">
            {block.text}
          </li>
        );
      case "closing":
        return (
          <p key={i} className="text-center font-medium text-primary">
            {block.text}
          </p>
        );
      default:
        return (
          <p key={i} className="leading-relaxed whitespace-pre-wrap">
            {block.text}
          </p>
        );
    }
  };

  return (
    <div className="fixed top-16 inset-x-0 z-40 px-3 pointer-events-none">
      <div className="mx-auto max-w-lg pointer-events-auto">
        <div className="rounded-2xl relative border bg-card shadow-xl overflow-hidden animate-in slide-in-from-top fade-in duration-500">
          <div className="h-1.5 bg-gradient-to-l from-emerald-500 via-teal-500 to-emerald-500" />
          <button
            onClick={dismiss}
            className="absolute top-2 left-2 rounded-full p-1 text-muted-foreground hover:bg-muted transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="p-4 text-sm space-y-3 text-foreground">
            <div className="text-center">
              <p className="font-bold text-lg">{bcast.title}</p>
            </div>

            <div className="space-y-3">
              {(() => {
                const els: React.ReactNode[] = [];
                const liBlocks = bcast.content.filter((b) => b.t === "li");
                let liRendered = false;
                bcast.content.forEach((block, i) => {
                  if (block.t === "li") {
                    if (!liRendered) {
                      liRendered = true;
                      els.push(
                        <ul key={i} className="list-disc pr-5 space-y-1.5">
                          {liBlocks.map((li, j) => (
                            <li key={j} className="text-foreground/90">
                              {li.text}
                            </li>
                          ))}
                        </ul>
                      );
                    }
                    return;
                  }
                  els.push(renderBlock(block, i));
                });
                return els;
              })()}
            </div>

            <button
              onClick={dismiss}
              className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 font-semibold hover:opacity-90 transition-opacity"
            >
              تمام، جزاكم الله خيرًا
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}