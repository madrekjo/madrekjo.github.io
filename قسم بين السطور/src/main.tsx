import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AuthCallback from "./pages/AuthCallback";
import LoginGate from "./components/LoginGate";
import { getStoredSsoSession } from "./lib/sso";
import { supabase } from "./integrations/supabase/client";
import "./index.css";

function applySavedTheme() {
  const saved = (() => {
    try {
      return localStorage.getItem("bst-theme");
    } catch {
      return null;
    }
  })();
  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (saved === "dark" || (!saved && prefersDark)) {
    document.documentElement.classList.add("dark");
  }
}
applySavedTheme();

const isCallback = window.location.pathname.includes("/auth/callback");

async function boot() {
  // اربط جلسة الإيميل الموحّدة بعميل القسم قبل الإقلاع، حتى تحمل نداءات
  // الدوال توكن الحساب (author_email) لا مفتاح الزائر.
  if (!isCallback) {
    const s = getStoredSsoSession();
    if (s?.access_token) {
      try {
        await supabase.auth.setSession({
          access_token: s.access_token,
          refresh_token: s.refresh_token ?? "",
        });
      } catch {
        /* تجاهل — الحارس يتكفّل بالدخول */
      }
    }
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      {isCallback ? (
        <AuthCallback />
      ) : getStoredSsoSession() ? (
        <App />
      ) : (
        <LoginGate />
      )}
    </React.StrictMode>
  );
}
void boot();