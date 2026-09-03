import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { LoginScreen } from "@/components/LoginScreen";
import { TopBar } from "@/components/TopBar";
import { Sidebar, SectionId } from "@/components/Sidebar";
import { EventTicker } from "@/components/EventTicker";
import { Dashboard } from "@/pages/Dashboard";
import { ChatSection } from "@/pages/ChatSection";
import { AnonSection } from "@/pages/AnonSection";
import { AchievementSection } from "@/pages/AchievementSection";
import { ComingSoon } from "@/pages/ComingSoon";
import { usePlatformStats } from "@/hooks/usePlatformStats";
import { chatClient, anonClient, achievementClient } from "@/lib/supabase-clients";
import { OpsEvent, eventFromPost, nowTime, truncate } from "@/lib/events";

function MainRouter({ token, onLogout }: { token: string | null; onLogout: () => void }) {
  const [section, setSection] = useState<SectionId>("dashboard");
  const { stats, workerStatus } = usePlatformStats(true);
  const [events, setEvents] = useState<OpsEvent[]>([]);

  useEffect(() => {
    let alive = true;

    async function collect() {
      // لا تُسحب الأحداث إلا على نظرة عامة (dashboard) لتخفيف الطلبات.
      if (section !== "dashboard") return;
      try {
        const [chat, anon, rounds, achUsers] = await Promise.allSettled([
          chatClient.from("posts").select("content, created_at, channel").order("created_at", { ascending: false }).limit(4),
          anonClient.from("posts").select("content, created_at, anon_number").order("created_at", { ascending: false }).limit(4),
          chatClient.from("study_rounds").select("title, created_at, status").order("created_at", { ascending: false }).limit(3),
          achievementClient.from("profiles").select("display_name, created_at").order("created_at", { ascending: false }).limit(3),
        ]);
        if (!alive) return;

        const next: OpsEvent[] = [];
        if (chat.status === "fulfilled" && chat.value.data?.length) {
          chat.value.data.forEach((p: any) => {
            next.push(eventFromPost(p, "CHAT POST", "info"));
          });
        }
        if (anon.status === "fulfilled" && anon.value.data?.length) {
          anon.value.data.forEach((p: any) => {
            next.push({
              time: nowTime(),
              label: "ANONYMOUS POST",
              detail: `#${p.anon_number ?? "؟"} ${truncate(p.content ?? "")}`,
              tone: "warn",
            });
          });
        }
        if (rounds.status === "fulfilled" && rounds.value.data?.length) {
          rounds.value.data.forEach((r: any) => {
            next.push({
              time: nowTime(),
              label: "STUDY ROUND",
              detail: truncate(r.title ?? ""),
              tone: "ok",
            });
          });
        }
        if (achUsers.status === "fulfilled" && achUsers.value.data?.length) {
          achUsers.value.data.forEach((u: any) => {
            next.push({
              time: nowTime(),
              label: "USER JOINED",
              detail: truncate(u.display_name ?? ""),
              tone: "info",
            });
          });
        }
        if (next.length) setEvents((prev) => [...next, ...prev].slice(0, 12));
      } catch {
        /* ignore */
      }
    }

    collect();
    // تلميح: تحديث النشرة الحية كل 10 دقائق فقط بدل كل 12 ثانية لتخفيف الطلبات.
    const t = setInterval(collect, 10 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [section]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar active={section} onNavigate={setSection} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar workerStatus={workerStatus} onLogout={onLogout} stats={stats} />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1600px] p-4 md:p-6">
              {!token && (
                <div className="mb-4 flex items-start gap-3 rounded-md border border-ops-amber/40 bg-ops-amber/10 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-ops-amber">وضع القراءة فقط</p>
                    <p className="text-xs text-ops-dim">
                      لم يتم نشر خادم الإدارة (madarik-ops worker) بعد. يمكنك تصفّح البيانات،
                      لكن أزرار الحظر/الحذف والإدارة لن تعمل حتى يتم نشره.
                    </p>
                  </div>
                </div>
              )}
              {section === "dashboard" && <Dashboard />}
              {section === "chat" && <ChatSection token={token} />}
              {section === "rounds" && <ChatSection token={token} />}
              {section === "anon" && <AnonSection token={token} />}
              {section === "reports" && <AnonSection token={token} />}
              {section === "achievement" && <AchievementSection token={token} />}
              {section === "tasks" && <AchievementSection token={token} />}
              {section === "questions" && <ComingSoon name="بنك الأسئلة" />}
              {section === "talaawat" && <ComingSoon name="التلاوات" />}
              {section === "ajr" && <ComingSoon name="الأجر والثواب" />}
              {section === "logs" && <ComingSoon name="سجل التدقيق" />}
              {section === "system" && <ComingSoon name="النظام" />}
            </div>
          </main>
          <EventTicker events={events} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { authed, token, login, logout, failed } = useAuth();

  if (!authed) {
    return <LoginScreen onLogin={login} failed={failed} />;
  }

  return <MainRouter token={token} onLogout={logout} />;
}