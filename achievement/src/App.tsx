import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { useUnloadCleanup } from "@/hooks/useUnloadCleanup";
import SsoSyncDialog from "@/components/SsoSyncDialog";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import AdminMessages from "./pages/AdminMessages";
import Rounds from "./pages/Rounds";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";


const queryClient = new QueryClient();

const UnloadCleanupMount = () => { useUnloadCleanup(); return null; };



const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename="/achievement">
          <UnloadCleanupMount />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin/messages" element={<AdminMessages />} />
            <Route path="/rounds" element={<Rounds />} />
            <Route path="*" element={<NotFound />} />

          </Routes>
          <SsoSyncDialog />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
