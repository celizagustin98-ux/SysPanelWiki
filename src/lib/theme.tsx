import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

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

  // Cambio instantáneo: la clase se aplica ya mismo y se apagan las transiciones de color
  // por un cuadro, así toda la pantalla cambia junta (sin fundidos ni pantallazos a medias).
  const toggle = () => {
    const raiz = document.documentElement;
    const siguiente: Theme = raiz.classList.contains("dark") ? "light" : "dark";
    const sinTransiciones = document.createElement("style");
    sinTransiciones.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.appendChild(sinTransiciones);
    raiz.classList.toggle("dark", siguiente === "dark");
    void window.getComputedStyle(document.body).backgroundColor;
    window.setTimeout(() => sinTransiciones.remove(), 30);
    setTheme(siguiente);
  };

  return (
    <Ctx.Provider value={{ theme, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);
