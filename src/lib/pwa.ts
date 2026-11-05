import { useEffect, useState } from "react";

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let pendiente: EventoInstalar | null = null;
const avisos = new Set<() => void>();

/** Registra el service worker (solo en HTTPS o localhost, como exige el navegador) y guarda el aviso de instalación. */
export function registrarPwa() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) return;
  void navigator.serviceWorker.register("/sw.js").catch(() => {
    /* sin service worker la app funciona igual, solo no se puede instalar */
  });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    pendiente = e as EventoInstalar;
    avisos.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    pendiente = null;
    avisos.forEach((f) => f());
  });
}

/** Botón "Instalar app": disponible cuando el navegador ofrece instalar Nodara. */
export function useInstalarApp() {
  const [puede, setPuede] = useState(() => !!pendiente);
  useEffect(() => {
    const f = () => setPuede(!!pendiente);
    avisos.add(f);
    return () => {
      avisos.delete(f);
    };
  }, []);
  const instalar = async () => {
    if (!pendiente) return;
    await pendiente.prompt();
    await pendiente.userChoice.catch(() => null);
    pendiente = null;
    setPuede(false);
  };
  return { puede, instalar };
}
