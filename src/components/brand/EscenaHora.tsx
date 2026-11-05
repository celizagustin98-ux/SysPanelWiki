import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type Momento = "madrugada" | "amanecer" | "dia" | "atardecer" | "noche";

export function momentoDelDia(h: number): Momento {
  if (h < 6) return "madrugada";
  if (h < 9) return "amanecer";
  if (h < 18) return "dia";
  if (h < 20) return "atardecer";
  return "noche";
}

/** Cielo de cada momento: arriba → abajo. Suaves para que el texto se lea en tema claro y oscuro. */
const CIELO: Record<Momento, [string, string, string]> = {
  madrugada: ["#070b1a", "#0e1631", "#1a2346"],
  amanecer: ["#3b3f78", "#c76b7e", "#f6b26b"],
  dia: ["#5fb3e8", "#9fd3f2", "#e3f3fb"],
  atardecer: ["#3a2a5e", "#b4527a", "#f39a5b"],
  noche: ["#0a1024", "#142044", "#26315c"],
};

// Estrellas fijas (posiciones pseudoaleatorias estables entre renders).
function estrellas(n: number) {
  let s = 7;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, () => ({ x: r() * 100, y: r() * 62, t: 0.6 + r() * 1.6, d: r() * 4, o: 0.35 + r() * 0.65 }));
}

/** Momento del día actual (se revisa cada minuto). Con ?escena=noche se puede ver cada uno sin esperar la hora. */
export function useMomento(): Momento | null {
  const [hora, setHora] = useState<number | null>(null);
  useEffect(() => {
    const f = () => setHora(new Date().getHours());
    f();
    const id = window.setInterval(f, 60_000);
    return () => window.clearInterval(id);
  }, []);
  if (hora === null) return null;
  const forzado = new URLSearchParams(window.location.search).get("escena") as Momento | null;
  return forzado && forzado in CIELO ? forzado : momentoDelDia(hora);
}

/** Con cielo oscuro (noche, madrugada, atardecer) el ingreso se ve en tema oscuro para que todo se lea. */
export const cieloOscuro = (m: Momento | null) => m === "noche" || m === "madrugada" || m === "atardecer";

/** Escena animada de fondo según la hora: sol que sale o se pone, nubes de día, luna y estrellas de noche. */
export function EscenaHora({ momento: m, className }: { momento: Momento | null; className?: string }) {
  const lista = useMemo(() => estrellas(70), []);
  if (!m) return null;
  const [a, b, c] = CIELO[m];
  const nocturno = m === "noche" || m === "madrugada";

  return (
    <div aria-hidden className={cn("escena pointer-events-none absolute inset-0 overflow-hidden", className)} data-momento={m}>
      <div className="absolute inset-0 transition-colors duration-1000" style={{ background: `linear-gradient(180deg, ${a} 0%, ${b} 55%, ${c} 100%)` }} />

      {nocturno && (
        <>
          {lista.map((e, i) => (
            <span
              key={i}
              className="escena-estrella absolute rounded-full bg-white"
              style={{ left: `${e.x}%`, top: `${e.y}%`, width: e.t, height: e.t, opacity: e.o, animationDelay: `${e.d}s`, animationDuration: `${2.5 + e.d}s` }}
            />
          ))}
          <span className="escena-fugaz absolute h-px w-28 bg-gradient-to-r from-white to-transparent" style={{ top: "14%", left: "70%" }} />
          <span className="escena-fugaz absolute h-px w-20 bg-gradient-to-r from-white to-transparent" style={{ top: "28%", left: "40%", animationDelay: "7s" }} />
          {/* Luna con su cuarto en sombra y un halo que respira */}
          <div className="escena-luna absolute right-[12%] top-[12%] size-20 sm:size-28">
            <div className="absolute -inset-6 rounded-full bg-[radial-gradient(circle,rgba(255,250,220,0.28),transparent_65%)] escena-halo" />
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fffbe8,#e9e2c3_60%,#cfc6a0)] shadow-[0_0_40px_rgba(255,248,214,0.35)]" />
            <div className="absolute left-[22%] top-[30%] size-[18%] rounded-full bg-black/10" />
            <div className="absolute left-[55%] top-[55%] size-[12%] rounded-full bg-black/10" />
            <div className="absolute left-[48%] top-[22%] size-[9%] rounded-full bg-black/10" />
          </div>
        </>
      )}

      {m === "dia" && (
        <div className="absolute right-[10%] top-[8%] size-24 sm:size-32">
          <div className="escena-rayos absolute -inset-10 rounded-full bg-[repeating-conic-gradient(rgba(255,236,150,0.32)_0deg_8deg,transparent_8deg_24deg)] [mask-image:radial-gradient(circle,black_30%,transparent_70%)]" />
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_40%_40%,#fffbe0,#ffd65a_55%,#ffb534)] shadow-[0_0_80px_rgba(255,210,90,0.7)] escena-halo" />
        </div>
      )}

      {(m === "amanecer" || m === "atardecer") && (
        <div className={cn("absolute left-1/2 size-40 -translate-x-1/2 sm:size-56", m === "amanecer" ? "escena-sale" : "escena-pone")} style={{ bottom: "-4rem" }}>
          <div className="absolute -inset-16 rounded-full bg-[radial-gradient(circle,rgba(255,190,110,0.45),transparent_65%)] escena-halo" />
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_40%,#fff1c9,#ffb36b_55%,#f2785a)]" />
        </div>
      )}

      {!nocturno && (
        <>
          <Nube className="escena-nube top-[18%] w-56 opacity-80" style={{ animationDuration: "75s" }} />
          <Nube className="escena-nube top-[34%] w-40 opacity-60" style={{ animationDuration: "95s", animationDelay: "-40s" }} />
          <Nube className="escena-nube top-[10%] w-32 opacity-50" style={{ animationDuration: "120s", animationDelay: "-80s" }} />
        </>
      )}

      {(m === "amanecer" || m === "dia") && (
        <svg className="escena-pajaros absolute left-0 top-[24%] w-16 text-slate-700/50" viewBox="0 0 60 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M2 10 q5 -6 10 0 q5 -6 10 0" />
          <path d="M30 4 q4 -5 8 0 q4 -5 8 0" />
        </svg>
      )}

      {/* Horizonte: colinas suaves que unen la escena con el resto de la pantalla */}
      <svg className="absolute inset-x-0 bottom-0 h-32 w-full sm:h-44" viewBox="0 0 1440 200" preserveAspectRatio="none">
        <path d="M0 140 C 240 90 420 170 720 120 C 1000 75 1200 150 1440 110 L1440 200 L0 200 Z" fill={nocturno ? "#0b1226" : "rgba(30,60,80,0.18)"} />
        <path d="M0 170 C 300 130 600 190 900 150 C 1150 120 1300 170 1440 150 L1440 200 L0 200 Z" fill={nocturno ? "#070c1c" : "rgba(30,60,80,0.26)"} />
      </svg>

      {/* Velo del tema para que el formulario se lea igual en claro y oscuro */}
      <div className={cn("absolute inset-0", nocturno ? "bg-background/15" : "bg-background/35 dark:bg-background/50")} />
    </div>
  );
}

function Nube({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={cn("absolute -left-64", className)} style={style} viewBox="0 0 200 70" fill="white">
      <ellipse cx="60" cy="45" rx="45" ry="22" />
      <ellipse cx="100" cy="32" rx="38" ry="28" />
      <ellipse cx="140" cy="46" rx="42" ry="20" />
    </svg>
  );
}
