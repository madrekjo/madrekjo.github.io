import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Navbar from "@/components/Navbar";
import Onboarding from "@/components/Onboarding";
import GenerationOnboardingDialog from "@/components/GenerationOnboardingDialog";
import GenderOnboardingDialog from "@/components/GenderOnboardingDialog";
import SectionGate from "@/components/SectionGate";
import WarningNotice from "@/components/WarningNotice";
import SsoSyncDialog from "@/components/SsoSyncDialog";

const Landing = lazy(() => import("@/pages/Landing"));
const Auth = lazy(() => import("@/pages/Auth"));
const Chat = lazy(() => import("@/pages/Chat"));
const Profile = lazy(() => import("@/pages/Profile"));
const Suggestions = lazy(() => import("@/pages/Suggestions"));
const Admin = lazy(() => import("@/pages/Admin"));
const AdminReports = lazy(() => import("@/pages/AdminReports"));
const Support = lazy(() => import("@/pages/Support"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const Rounds = lazy(() => import("@/pages/Rounds"));
const Schedules = lazy(() => import("@/pages/Schedules"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const StaffMeeting = lazy(() => import("@/pages/StaffMeeting"));
const Changes = lazy(() => import("@/pages/Changes"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
  </div>
);

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function RestrictedRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (profile?.is_banned) return <Navigate to="/support" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, profile, loading } = useAuth();
  const chatHidden = typeof window !== "undefined" && localStorage.getItem("chat_hidden") === "1";
  const homeRoute = profile?.is_banned ? "/support" : (chatHidden ? "/rounds" : "/");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }



  return (
    <>
      <Navbar />
      {user && <GenerationOnboardingDialog />}
      {user && <GenderOnboardingDialog />}
      {user && <Onboarding />}
      {user && <WarningNotice />}
      <SsoSyncDialog />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={
            user ? (
              chatHidden
                ? <Navigate to={homeRoute} replace />
                : (
                  <RestrictedRoute>
                    <SectionGate section="chat" title="الدردشة">
                      <Chat />
                    </SectionGate>
                  </RestrictedRoute>
                )
            ) : (
              <Landing />
            )
          } />
          <Route path="/auth" element={user ? <Navigate to={homeRoute} replace /> : <Auth />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/suggestions" element={<RestrictedRoute><SectionGate section="suggestions" title="الاقتراحات"><Suggestions /></SectionGate></RestrictedRoute>} />
          <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/rounds" element={<RestrictedRoute><SectionGate section="rounds" title="الجولات"><Rounds /></SectionGate></RestrictedRoute>} />
          <Route path="/schedules" element={<RestrictedRoute><SectionGate section="schedules" title="الجداول"><Schedules /></SectionGate></RestrictedRoute>} />
          <Route path="/staff-meeting" element={<ProtectedRoute><StaffMeeting /></ProtectedRoute>} />
          <Route path="/changes" element={<RestrictedRoute><SectionGate section="changes" title="التغيير"><Changes /></SectionGate></RestrictedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
          <Route path="/admin/reports" element={<ProtectedRoute><AdminReports /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter basename="/chat" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
