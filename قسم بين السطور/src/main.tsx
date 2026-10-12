import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AuthCallback from "./pages/AuthCallback";
import LoginGate from "./components/LoginGate";
import { getStoredSsoSession } from "./lib/sso";
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