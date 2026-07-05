import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

// Lightweight theme controller (no next-themes dependency). Toggles the `dark` class on
// <html> and persists to localStorage. Default is dark to preserve the app's original feel;
// light is opt-in. The no-flash-on-load class application happens in index.html's inline
// <head> script (runs before first paint) — this provider keeps React state in sync with it.

export type Theme = "dark" | "light";

const STORAGE_KEY = "igu_theme";

function getInitialTheme(): Theme {
  try {
    // Only an explicit "light" opts out of dark; anything else (null / legacy / bad value) = dark.
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private mode / storage disabled: theme still applies for this session, just not persisted.
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === "dark" ? "light" : "dark")),
    [],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
