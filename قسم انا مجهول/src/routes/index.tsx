import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/header";
import { PostComposer } from "@/components/post-composer";
import { PostCard } from "@/components/post-card";
import { ChatRoom } from "@/components/chat-room";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Wrench, Eye, EyeOff, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

function useCountdown(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!target) return null;
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return { d, h, m, s: sec };
}

function CountdownBox({ target }: { target: string }) {
  const c = useCountdown(target);
  if (!c) return null;
  const box = (n: number, l: string) => (
    <div className="flex flex-col items-center rounded-lg bg-primary/10 px-3 py-2 min-w-[56px]">
      <span className="text-2xl font-bold tabular-nums">{String(n).padStart(2, "0")}</span>
      <span className="text-[10px] text-muted-foreground">{l}</span>
    </div>
  );
  return (
    <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
      {c.d > 0 && box(c.d, "يوم")}
      {box(c.h, "ساعة")}
      {box(c.m, "دقيقة")}
      {box(c.s, "ثانية")}
    </div>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "أنا مجهول — انشر بدون هوية" },
      { name: "description", content: "منصة لنشر ما يخطر في بالك بشكل مجهول تماماً، مع تعليقات وصور وملفات." },
    ],
  }),
  component: Index,
});

function Maintenance({ msg, reopenAt }: { msg: string | null; reopenAt: string | null }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <Wrench className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 text-2xl font-bold">الموقع متوقف مؤقتاً</h1>
        <p className="mt-2 text-muted-foreground">{msg || "نعمل على صيانة الموقع. عُد بعد قليل."}</p>
        {reopenAt && (
          <>
            <p className="mt-6 text-sm text-muted-foreground">يعاد الفتح خلال:</p>
            <CountdownBox target={reopenAt} />
          </>
        )}
      </main>
    </div>
  );
}

function Index() {
  const { settings, loading: settingsLoading } = useSiteSettings();
  const { isAdmin } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    let q = supabase
      .from("posts")
      .select("*")
      .eq("status", "approved")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (!isAdmin) q = q.eq("hidden", false);
    const { data, error } = await q;
    if (error) {
      toast.error("تعذر تحميل المنشورات");
      setLoading(false);
      return;
    }
    setPosts(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (settings.chat_mode_enabled) return;
    load();
    const ch = supabase.channel("posts-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.chat_mode_enabled, isAdmin]);

  const visiblePosts = useMemo(() => posts, [posts]);

  function toggleSel(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function selectAll() {
    setSelected(new Set(visiblePosts.map((p) => p.id)));
  }

  async function hideSelected() {
    if (selected.size === 0) return;
    if (!confirm(`إخفاء ${selected.size} منشور؟`)) return;
    const ids = Array.from(selected);
    const { error } = await (supabase.from("posts") as any).update({ hidden: true }).in("id", ids);
    if (error) toast.error("فشل: " + error.message);
    else {
      toast.success("تم الإخفاء");
      setSelected(new Set());
      setSelectMode(false);
      load();
    }
  }

  async function unhide(id: string) {
    const { error } = await (supabase.from("posts") as any).update({ hidden: false }).eq("id", id);
    if (error) toast.error("فشل: " + error.message); else { toast.success("تم الإظهار"); load(); }
  }

  if (settingsLoading) {
    return <div className="min-h-screen bg-background"><Header /></div>;
  }

  if (!settings.site_enabled && !isAdmin) {
    return <Maintenance msg={settings.maintenance_message} reopenAt={settings.site_reopen_at} />;
  }

  if (settings.chat_mode_enabled) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-2xl px-4 py-6">
          <div className="mb-4 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent p-5">
            <h1 className="text-2xl font-bold">الشات التفاعلي</h1>
            <p className="mt-1 text-sm text-muted-foreground">اختر اسماً وصورة وابدأ الدردشة. بدون تسجيل.</p>
          </div>
          <ChatRoom />
        </main>
      </div>
    );
  }

  const showReopenBanner = !settings.site_enabled && isAdmin && settings.site_reopen_at;
  const scheduledOpen = settings.site_enabled && settings.site_reopen_at && new Date(settings.site_reopen_at).getTime() > Date.now();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-transparent p-5">
          <h1 className="text-2xl font-bold">شارك بدون أن يعرفك أحد</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            بدون اسم. بدون صورة. بدون تسجيل. الكل هنا "مجهول".
          </p>
          {(showReopenBanner || scheduledOpen) && settings.site_reopen_at && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground">
                {showReopenBanner ? "الموقع مقفل. سيُعاد فتحه خلال:" : "موعد مجدول:"}
              </p>
              <CountdownBox target={settings.site_reopen_at} />
            </div>
          )}
        </div>
        <PostComposer onPosted={load} />

        {isAdmin && visiblePosts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 text-xs">
            <Button size="sm" variant={selectMode ? "default" : "outline"} onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}>
              {selectMode ? <CheckSquare className="h-3 w-3 ml-1" /> : <Square className="h-3 w-3 ml-1" />} وضع التحديد
            </Button>
            {selectMode && (
              <>
                <Button size="sm" variant="ghost" onClick={selectAll}>تحديد الكل ({visiblePosts.length})</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>مسح</Button>
                <span className="text-muted-foreground">محدد: {selected.size}</span>
                <Button size="sm" variant="destructive" disabled={selected.size === 0} onClick={hideSelected} className="ml-auto gap-1">
                  <EyeOff className="h-3 w-3" /> إخفاء المحدد
                </Button>
              </>
            )}
          </div>
        )}

        {loading ? (
          <p className="py-10 text-center text-muted-foreground">جاري التحميل...</p>
        ) : visiblePosts.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">لا توجد منشورات بعد. كن أول من ينشر!</p>
        ) : (
          visiblePosts.map((p) => (
            <div key={p.id} className="relative">
              {isAdmin && selectMode && (
                <button
                  onClick={() => toggleSel(p.id)}
                  className={`absolute -top-2 -right-2 z-10 grid h-7 w-7 place-items-center rounded-full border-2 ${selected.has(p.id) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}
                  aria-label="تحديد"
                >
                  {selected.has(p.id) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </button>
              )}
              {isAdmin && p.hidden && (
                <div className="mb-1 flex items-center justify-between rounded-lg bg-yellow-500/10 px-3 py-1.5 text-xs text-yellow-700 dark:text-yellow-400">
                  <span className="flex items-center gap-1"><EyeOff className="h-3 w-3" /> مخفي عن المستخدمين</span>
                  <Button size="sm" variant="ghost" onClick={() => unhide(p.id)} className="h-6 gap-1 text-xs">
                    <Eye className="h-3 w-3" /> إظهار
                  </Button>
                </div>
              )}
              <PostCard post={p} onDeleted={load} onChanged={load} />
            </div>
          ))
        )}
      </main>
    </div>
  );
}
