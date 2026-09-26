import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Theme = "light" | "dark" | "blue" | "pink" | "sleep";

export const THEMES: Theme[] = ["light", "dark", "blue", "pink", "sleep"];

/** وضع النوم يُجبر من الساعة 10 مساءً حتى 7 صباحاً. */
export const SLEEP_START_HOUR = 22;
export const SLEEP_END_HOUR = 7;

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** 1 = وضع النوم مفروض الآن (بعد الساعة 10 — لا تبديل). */
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { profile, user } = useAuth();

  const [preferred, setPreferred] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");
    if (isValidTheme(saved)) return saved;
    return "light";
  });

  const [sleepForced, setSleepForced] = useState<boolean>(() => isSleepWindow());
  const prevForcedRef = useRef<boolean>(isSleepWindow());

  // تنسيق الساعة الخارجية — يُفحص كل دقيقة + عند عودة التبويب / التركيز.
  // عند التحول ليلاً (قبل 10م → بعده) يُشعِر المستخدم فوراً.
  useEffect(() => {
    const tick = () => {
      const inWindow = isSleepWindow();
      const prev = prevForcedRef.current;
      if (!prev && inWindow) {
        toast("🌙 حان وقت النوم… انتبه على النوم 📿 عشان صلاة الفجر");
      }
      prevForcedRef.current = inWindow;
      setSleepForced(inWindow);
    };
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

  // بعد الساعة 10 وضع النوم مفروض مهما كان الثيم المختار.
  const theme: Theme = sleepForced ? "sleep" : preferred;

  useEffect(() => {
    applyThemeClass(theme);
    if (!sleepForced) localStorage.setItem("theme", preferred);
  }, [theme, sleepForced, preferred]);

  // مزامنة الثيم المحفوظ في البروفايل (خارج نافذة النوم فقط حتى لا يتعارض).
  // تحديث وظيفي — دون الاعتماد على preferred — حتى لا يرتدّ الثيم فور الضغط.
  useEffect(() => {
    if (sleepForced) return;
    const t = profile?.theme as Theme | null | undefined;
    if (!isValidTheme(t)) return;
    setPreferred((cur) => (cur === t ? cur : t));
  }, [profile?.theme, sleepForced]);

  const setTheme = (newTheme: Theme) => {
    // بعد الساعة 10: ممنوع تبديل الثيم إطلاقاً.
    if (sleepForced && newTheme !== "sleep") {
      toast("وضع النوم مفروض حتى السابعة صباحاً 🌙");
      return;
    }
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
      {/* خفض سطوع الشاشة عند تفعيل وضع النوم (تلقائي ليلياً أو يدوياً) */}
      <div className={`sleep-dim${theme === "sleep" ? " active" : ""}`} aria-hidden="true" />
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}