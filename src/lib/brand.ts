import { useSyncExternalStore } from "react";
import { marcaObtener, type MarcaConfig } from "@/backend/api/marca.functions";

/** Identidad por defecto: se usa mientras la instalación no configure su propia marca (Configuración → General). */
export const APP_NAME = "Nodara";
export const APP_TAGLINE = "Centro de operaciones IT";
export const APP_AREA = "Área de Sistemas";
export const APP_COLOR = "#1f7a9c";

export type Marca = {
  nombre: string;
  area: string;
  tagline: string;
  /** Color de acento de los documentos (#RRGGBB). */
  color: string;
  /** true si la instalación eligió color; si no, cada documento conserva su color original. */
  colorPropio: boolean;
  /** Pie de los documentos impresos; vacío = "<nombre> · <área>". */
  pie: string;
  /** Logo subido como data URL, o null para el isotipo por defecto. */
  logo: string | null;
  personalizada: boolean;
};

const CACHE_KEY = "nodara.marca";

function armar(cfg: Partial<MarcaConfig> | null): Marca {
  const nombre = cfg?.nombre || APP_NAME;
  const area = cfg?.area || APP_AREA;
  return {
    nombre,
    area,
    tagline: APP_TAGLINE,
    color: cfg?.color || APP_COLOR,
    colorPropio: !!cfg?.color,
    pie: cfg?.pie || `${nombre} · ${area}`,
    logo: cfg?.logo || null,
    personalizada: !!(cfg?.nombre || cfg?.area || cfg?.color || cfg?.pie || cfg?.logo),
  };
}

const PREDETERMINADA = armar(null);
let actual: Marca = PREDETERMINADA;
const oyentes = new Set<() => void>();

function publicar(cfg: Partial<MarcaConfig> | null) {
  actual = armar(cfg);
  oyentes.forEach((fn) => fn());
}

if (typeof window !== "undefined") {
  // Última marca conocida: evita mostrar "Nodara" un instante antes de que responda el servidor.
  try {
    const guardada = localStorage.getItem(CACHE_KEY);
    if (guardada) actual = armar(JSON.parse(guardada));
  } catch {
    /* sin almacenamiento */
  }
}

let pedido: Promise<void> | null = null;

/** Trae la marca del servidor (una vez por carga, o de nuevo con `forzar`). */
export function cargarMarca(forzar = false) {
  if (typeof window === "undefined") return Promise.resolve();
  if (pedido && !forzar) return pedido;
  pedido = marcaObtener()
    .then((cfg) => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cfg));
      } catch {
        /* sin almacenamiento o logo muy grande */
      }
      publicar(cfg);
    })
    .catch(() => {
      pedido = null;
    });
  return pedido;
}

/** Marca vigente, para código fuera de React (PDFs, títulos). */
export function getMarca() {
  return actual;
}

export function useMarca() {
  return useSyncExternalStore(
    (fn) => {
      oyentes.add(fn);
      void cargarMarca();
      return () => oyentes.delete(fn);
    },
    () => actual,
    () => PREDETERMINADA,
  );
}

/** Reemplaza el nombre por defecto en un título ("Tickets · Nodara" → "Tickets · Mi Empresa"). */
export function tituloConMarca(titulo: string, marca = actual) {
  return marca.nombre === APP_NAME ? titulo : titulo.split(APP_NAME).join(marca.nombre);
}
