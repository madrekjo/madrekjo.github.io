import { BrowserRouter, Route, Routes, Link } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { useTeacherFilesFlag } from "@/hooks/use-teacher-files-flag";
import PublicHome from "@/pages/PublicHome.tsx";
import TeacherProfile from "@/pages/TeacherProfile.tsx";
import TeacherWebsite from "@/pages/TeacherWebsite.tsx";
import Login from "@/pages/Login.tsx";
import Admin from "@/pages/Admin.tsx";
import { NotFound } from "@/pages/NotFound.tsx";

function Hidden() {
  return <NotFound />;
}

function PublicGate({ children }: { children: React.ReactNode }) {
  const { enabled, loading } = useTeacherFilesFlag();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }
  return enabled ? <>{children}</> : <Hidden />;
}

const App = () => (
  <>
    <BrowserRouter basename="/teacher-files">
      <Routes>
        <Route
          path="/"
          element={
            <PublicGate>
              <PublicHome />
            </PublicGate>
          }
        />
        <Route
          path="/t/:slug"
          element={
            <PublicGate>
              <TeacherProfile />
            </PublicGate>
          }
        />
        <Route
          path="/t/:slug/website"
          element={
            <PublicGate>
              <TeacherWebsite />
            </PublicGate>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Hidden />} />
      </Routes>
    </BrowserRouter>
    <Toaster />
  </>
);

export default App;
