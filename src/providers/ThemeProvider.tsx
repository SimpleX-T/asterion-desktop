import { createContext, useContext, useEffect, useState } from "react";

export type AppTheme = "midnight" | "obsidian" | "slate" | "parchment";

export const APP_THEMES: { id: AppTheme; label: string }[] = [
  { id: "midnight", label: "Midnight" },
  { id: "obsidian", label: "Obsidian" },
  { id: "slate", label: "Slate" },
  { id: "parchment", label: "Parchment" },
];

const STORAGE_KEY = "asterion:app-theme";
const DEFAULT: AppTheme = "obsidian";

interface ThemeCtx {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
}

const Ctx = createContext<ThemeCtx>({ theme: DEFAULT, setTheme: () => {} });

function applyTheme(theme: AppTheme) {
  const el = document.documentElement;
  // "midnight" is the :root default — no attribute needed.
  if (theme === "midnight") el.removeAttribute("data-app-theme");
  else el.setAttribute("data-app-theme", theme);
  // Hint the native window chrome / form controls.
  el.style.colorScheme = theme === "parchment" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as AppTheme | null;
    return stored ?? DEFAULT;
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = (t: AppTheme) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  };

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppTheme() {
  return useContext(Ctx);
}
