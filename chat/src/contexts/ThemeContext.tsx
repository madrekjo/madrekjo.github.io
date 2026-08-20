import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type Theme = "light" | "dark" | "blue" | "pink";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "blue", "pink");
  if (theme === "dark") root.classList.add("dark");
  else if (theme === "blue") root.classList.add("blue");
  else if (theme === "pink") root.classList.add("pink");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { profile, user } = useAuth();

  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme") as Theme;
    if (saved && ["light", "dark", "blue", "pink"].includes(saved)) return saved;
    return "light";
  });

  useEffect(() => {
    applyThemeClass(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (profile?.theme && profile.theme !== theme) {
      const t = profile.theme as Theme;
      if (["light", "dark", "blue", "pink"].includes(t)) {
        setThemeState(t);
      }
    }
  }, [profile?.theme]);

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("theme", newTheme);
    if (user) {
      await supabase.from("profiles").update({ theme: newTheme } as any).eq("user_id", user.id);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
