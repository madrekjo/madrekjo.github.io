import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type Theme = "light" | "dark" | "blue" | "pink" | "sleep";

export const THEMES: Theme[] = ["light", "dark", "blue", "pink", "sleep"];

/** وضع النوم يُجبر يومياً من الساعة 10 مساءً حتى 7 صباحاً. */
export const SLEEP_START_HOUR = 22;
export const SLEEP_END_HOUR = 7;

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** 1 = وضع النوم مفروض الآن (قبل أن يتدخل المستخدم يدوياً). */
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

  // «إجبار النوم» یُفرض تلقائياً عند الدخول ليلاً، ويتلاشى فور اختيار المستخدم يدوياً.
  const [sleepForced, setSleepForced] = useState<boolean>(() => isSleepWindow());
  // اختيار يدوي خلال الليل يبطل الإجبار لنفس الجلسة (حتى نهاية نافذة النوم).
  const overrideRef = useRef(false);

  // تنسيق الساعة الخارجية — يُفحص كل دقيقة + عند عودة التبويب / التركيز.
  useEffect(() => {
    const tick = () => {
      const inWindow = isSleepWindow();
      if (inWindow && overrideRef.current) {
        setSleepForced(false); // المستخدم اختار يدوياً — نتركه حتى الصباح
      } else {
        setSleepForced(inWindow);
        if (!inWindow) overrideRef.current = false; // يوم جديد — يعود الإجبار الليلي
      }
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

  // الثيم الفعلي: وضع النوم يُفضل تلقائياً لكن أي ضغطة يدوية تترك اختيار المستخدم.
  const theme: Theme = sleepForced ? "sleep" : preferred;

  useEffect(() => {
    applyThemeClass(theme);
    if (!sleepForced) localStorage.setItem("theme", preferred);
  }, [theme, sleepForced, preferred]);

  // مزامنة الثيم المحفوظ في البروفايل (فقط خارج نافذة النوم حتى لا يتعارض).
  // لا نعتمد على preferred هنا — تحديث وظيفي حتى لا يرتدّ الثيم فوراً عند أي
  // تبديل يدوي (كان الـ dep سبب وميض: الثيم الجديد ظهر لحظة ثم رجع للقديم).
  useEffect(() => {
    if (sleepForced) return;
    const t = profile?.theme as Theme | null | undefined;
    if (!isValidTheme(t)) return;
    setPreferred((cur) => (cur === t ? cur : t));
  }, [profile?.theme, sleepForced]);

  const setTheme = (newTheme: Theme) => {
    // اختيار يدوي (غير النوم) يبطل الإجبار الليلي لهذه الجلسة ويعمل فوراً.
    if (sleepForced && newTheme !== "sleep") {
      overrideRef.current = true;
      setSleepForced(false);
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