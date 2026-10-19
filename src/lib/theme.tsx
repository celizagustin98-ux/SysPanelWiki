import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

type Theme = "dark" | "light";
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // El script de arranque en __root ya aplicó la clase: se toma de ahí para no parpadear.
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== "undefined" && !document.documentElement.classList.contains("dark") ? "light" : "dark",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("intranet-theme", theme);
    } catch {
      /* almacenamiento no disponible */
    }
  }, [theme]);

  // Cambio de tema con fundido suave cuando el navegador soporta View Transitions.
  const toggle = () => {
    const next = () => flushSync(() => setTheme((t) => (t === "dark" ? "light" : "dark")));
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      doc.startViewTransition(next);
    } else next();
  };

  return (
    <Ctx.Provider value={{ theme, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);
