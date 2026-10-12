import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const SECTION_CLOSED = true;

const ClosedNotice = () => (
  <div
    dir="rtl"
    style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "16px",
      textAlign: "center",
      padding: "24px",
      background: "#0a0a0f",
      color: "#f0f0f5",
      fontFamily: "Cairo, sans-serif",
    }}
  >
    <div style={{ fontSize: "3rem" }}>🌙</div>
    <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#FFD700" }}>
      القسم مغلق مؤقتًا
    </div>
    <p style={{ color: "#888899", maxWidth: "380px", lineHeight: 1.9, margin: 0 }}>
      نعتذر، تم إغلاق قسم «أجر وثواب» مؤقتًا. سنعيده قريبًا بإذن الله.
    </p>
    <a
      href="/"
      style={{
        marginTop: "8px",
        padding: "10px 22px",
        borderRadius: "12px",
        background: "rgba(255,215,0,0.1)",
        border: "1px solid rgba(255,215,0,0.3)",
        color: "#FFD700",
        textDecoration: "none",
        fontWeight: 700,
      }}
    >
      العودة للرئيسية
    </a>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {SECTION_CLOSED ? (
        <ClosedNotice />
      ) : (
        <BrowserRouter basename="/ajr">
          <Routes>
            <Route path="/" element={<Index />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      )}
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
