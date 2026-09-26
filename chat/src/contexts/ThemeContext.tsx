import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type Theme = "light" | "dark" | "blue" | "pink" | "sleep";

export const THEMES: Theme[] = ["light", "dark", "blue", "pink", "sleep"];

/** وضع النوم مُجبر يومياً من الساعة 10 مساءً حتى 7 صباحاً. */
export const SLEEP_START_HOUR = 22;
export const SLEEP_END_HOUR = 7;

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** 1 = وضع النوم مُجبر الآن (الساعة 10 مساءً فصاعداً). */
  sleepForced: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function isValidTheme(t: string | null | undefined): t is Theme {
  return !!t && THEMES.includes(t as Theme);
}

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "blue", "pink", "sleep");
  if (theme !== "light") root.classList.add(theme);
}

function isSleepWindow(now = new Date()): boolean {
  const h = now.getHours();
  return h >= SLEEP_START_HOUR || h < SLEEP_END_HOUR;
}

const sleepWindowCache: {
  last: number;
  value: boolean;
} = { last: 0, value: false };

export function useIsSleepWindow() {
  return useMemo(() => {
    const now = Date.now();
    if (now - sleepWindowCache.last > 60_000) {
      sleepWindowCache.last = now;
      sleepWindowCache.value = isSleepWindow(new Date());
    }
    return sleepWindowCache.value;
  }, []);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { profile, user } = useAuth();

  const [preferred, setPreferred] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");
    if (isValidTheme(saved)) return saved;
    return "light";
  });

  const [sleepForced, setSleepForced] = useState<boolean>(() => isSleepWindow());

  // تنسيق الساعة الخارجية — يُفحص كل دقيقة + عند عودة التبويب.
  useEffect(() => {
    const tick = () => setSleepForced(isSleepWindow());
    tick();
    const id = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, []);

  // الثيم الفعلي: خلال وضع النوم يُجبر «sleep» على الجميع مهما اختاروا.
  const theme: Theme = sleepForced ? "sleep" : preferred;

  useEffect(() => {
    applyThemeClass(theme);
    if (!sleepForced) localStorage.setItem("theme", preferred);
  }, [theme, sleepForced, preferred]);

  // مزامنة الثيم المحفوظ في البروفايل (فقط خارج نافذة النوم حتى لا يتعارض).
  useEffect(() => {
    if (sleepForced) return;
    const t = profile?.theme as Theme | null | undefined;
    if (isValidTheme(t) && t !== preferred) {
      setPreferred(t);
    }
  }, [profile?.theme, sleepForced, preferred]);

  const setTheme = (newTheme: Theme) => {
    // أثناء الوضع الإجباري الليلي: ممنوع تبديل أي ثيم آخر.
    if (sleepForced && newTheme !== "sleep") return;
    setPreferred(newTheme);
    localStorage.setItem("theme", newTheme);
    if (user) {
      supabase
        .from("profiles")
        .update({ theme: newTheme } as any)
        .eq("user_id", user.id)
        .then(() => {})
        .catch(() => {});
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, sleepForced }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}