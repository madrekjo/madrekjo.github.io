import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { LoginScreen } from "@/components/LoginScreen";
import { TopBar } from "@/components/TopBar";
import { Sidebar, SectionId } from "@/components/Sidebar";
import { Dashboard } from "@/pages/Dashboard";
import { ChatSection } from "@/pages/ChatSection";
import { AnonSection } from "@/pages/AnonSection";
import { AchievementSection } from "@/pages/AchievementSection";
import { ComingSoon } from "@/pages/ComingSoon";
import { usePlatformStats } from "@/hooks/usePlatformStats";

function MainRouter({ token, onLogout }: { token: string | null; onLogout: () => void }) {
  const [section, setSection] = useState<SectionId>("dashboard");
  const { workerStatus } = usePlatformStats(true);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={section} onNavigate={setSection} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar workerStatus={workerStatus} onLogout={onLogout} />
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
            {section === "anon" && <AnonSection token={token} />}
            {section === "achievement" && <AchievementSection token={token} />}
            {section === "questions" && <ComingSoon name="بنك الأسئلة" />}
            {section === "talaawat" && <ComingSoon name="التلاوات" />}
            {section === "ajr" && <ComingSoon name="الأجر والثواب" />}
            {section === "system" && <ComingSoon name="النظام" />}
          </div>
        </main>
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
