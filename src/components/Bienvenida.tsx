import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { useAuth } from "@/lib/auth";
import { useMarca } from "@/lib/brand";

const KEY = "syswiki.bienvenida";

/** Se marca al iniciar sesión: la animación se muestra una sola vez por ingreso. */
export function marcarBienvenida(mostrar = true) {
  try {
    if (mostrar) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento */
  }
}

function saludo() {
  const h = new Date().getHours();
  return h < 6 ? "Buenas noches" : h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

/** Animación de bienvenida al entrar al sistema. */
export function Bienvenida() {
  const { profile } = useAuth();
  const marca = useMarca();
  const [visible, setVisible] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const [saliendo, setSaliendo] = useState(false);
  const nombre = (profile?.full_name ?? "").split(/\s+/)[0] || "equipo";

  useEffect(() => {
    if (!visible) return;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* sin almacenamiento */
    }
    const rapido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t1 = setTimeout(() => setSaliendo(true), rapido ? 700 : 2300);
    const t2 = setTimeout(() => setVisible(false), rapido ? 900 : 2800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => {
        setSaliendo(true);
        setTimeout(() => setVisible(false), 400);
      }}
      className={`fixed inset-0 z-[100] grid cursor-pointer place-items-center overflow-hidden bg-sidebar text-sidebar-foreground transition-opacity duration-500 ${saliendo ? "opacity-0" : "opacity-100"}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-grid [--grid-line:oklch(1_0_0/5%)] [animation:bienvenida-grid_2.6s_ease-out_both]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.78_0.12_205/0.28),transparent_65%)] blur-2xl [animation:bienvenida-glow_2.6s_ease-out_both]" />

      <div className="relative flex flex-col items-center text-center">
        <div className="relative [animation:bienvenida-logo_0.9s_cubic-bezier(0.16,1,0.3,1)_both]">
          <span className="absolute inset-0 rounded-[22px] ring-2 ring-sidebar-primary/60 [animation:bienvenida-ring_1.6s_ease-out_0.3s_both]" />
          <BrandMark className="size-20" />
        </div>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.3em] text-sidebar-primary [animation:bienvenida-up_0.7s_ease-out_0.35s_both]">
          {marca.nombre} · {marca.personalizada ? marca.area : marca.tagline}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl [animation:bienvenida-up_0.7s_ease-out_0.55s_both]">
          {saludo()}, {nombre}
        </h1>
        <p className="mt-2 text-sm text-sidebar-foreground/60 first-letter:uppercase [animation:bienvenida-up_0.7s_ease-out_0.75s_both]">
          {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })} · preparando tu panel
        </p>
        <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-white/10 [animation:bienvenida-up_0.5s_ease-out_0.9s_both]">
          <div className="h-full rounded-full bg-sidebar-primary [animation:bienvenida-bar_1.4s_cubic-bezier(0.65,0,0.35,1)_0.9s_both]" />
        </div>
      </div>
    </div>
  );
}
