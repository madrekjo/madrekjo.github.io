import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Link } from "react-router-dom";
import { type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { useVisitorGate } from "@/hooks/use-visitor-gate";
import { BanScreen } from "@/components/ban-screen";
import Index from "@/pages/Index.tsx";
import Login from "@/pages/Login.tsx";
import Admin from "@/pages/Admin.tsx";
import { useEffect, useState } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">الصفحة غير موجودة</p>
        <Link to="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          الرئيسية
        </Link>
      </div>
    </div>
  );
}

function ErrorBoundary({ children }: { children: ReactNode }) {
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    const onError = (event: ErrorEvent) => { setError(event.error ?? new Error(event.message)); };
    const onRejection = (event: PromiseRejectionEvent) => { setError(event.reason instanceof Error ? event.reason : new Error(String(event.reason))); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-foreground">صار خطأ</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
          <button
            onClick={() => { window.location.reload(); }}
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function HeartbeatRunner() {
  useHeartbeat();
  return null;
}

function VisitorGate({ children }: { children: ReactNode }) {
  const { loading, banned, reason, expires_at, evidence_url } = useVisitorGate();
  if (loading) return <>{children}</>;
  if (banned) return <BanScreen reason={reason} expiresAt={expires_at} evidenceUrl={evidence_url} />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <HeartbeatRunner />
      <VisitorGate>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFoundComponent />} />
          </Routes>
        </BrowserRouter>
      </VisitorGate>
      <Toaster />
    </ErrorBoundary>
  </QueryClientProvider>
);

export default App;