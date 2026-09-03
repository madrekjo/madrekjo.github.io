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

function MainRouter({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [section, setSection] = useState<SectionId>("dashboard");
  const { workerStatus } = usePlatformStats(true);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={section} onNavigate={setSection} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar workerStatus={workerStatus} onLogout={onLogout} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1600px] p-4 md:p-6">
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

  if (!authed || !token) {
    return <LoginScreen onLogin={login} failed={failed} />;
  }

  return <MainRouter token={token} onLogout={logout} />;
}
