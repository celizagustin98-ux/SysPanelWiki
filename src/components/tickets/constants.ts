import type { ReactNode } from "react";

export type Ticket = {
  id: string;
  numero: number | null;
  titulo: string;
  descripcion: string | null;
  estado: string;
  prioridad: string;
  tipo: string | null;
  etiquetas: string[];
  asignado_a: string | null;
  solicitante_id: string | null;
  solicitante_nombre: string | null;
  sector: string | null;
  categoria: string | null;
  canal: string | null;
  resolucion: string | null;
  vence_el: string | null;
  resuelto_en: string | null;
  cerrado_en: string | null;
  activo_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export const ESTADOS = [
  { key: "nuevo", label: "Pendiente" },
  { key: "asignado", label: "Asignado" },
  { key: "en_curso", label: "Trabajando" },
  { key: "esperando", label: "En espera" },
  { key: "resuelto", label: "Resuelto" },
  { key: "cerrado", label: "Terminado" },
  { key: "cancelado", label: "Cancelado" },
] as const;

/**
 * Color propio de cada estado, bien distinto uno de otro. Se usa igual en la barra de
 * distribución, los chips de estado, la barra de evolución del detalle y el punto de cada fila.
 */
export const ESTADO_COLOR: Record<string, { punto: string; barra: string; chip: string; texto: string; hex: string }> = {
  nuevo: { punto: "bg-rose-500", barra: "bg-rose-500", chip: "bg-rose-500/12 text-rose-600 ring-rose-500/30 dark:text-rose-300", texto: "text-rose-600 dark:text-rose-300", hex: "#f43f5e" },
  asignado: { punto: "bg-violet-500", barra: "bg-violet-500", chip: "bg-violet-500/12 text-violet-600 ring-violet-500/30 dark:text-violet-300", texto: "text-violet-600 dark:text-violet-300", hex: "#8b5cf6" },
  en_curso: { punto: "bg-sky-500", barra: "bg-sky-500", chip: "bg-sky-500/12 text-sky-700 ring-sky-500/30 dark:text-sky-300", texto: "text-sky-700 dark:text-sky-300", hex: "#0ea5e9" },
  esperando: { punto: "bg-amber-500", barra: "bg-amber-500", chip: "bg-amber-500/15 text-amber-700 ring-amber-500/35 dark:text-amber-300", texto: "text-amber-700 dark:text-amber-300", hex: "#f59e0b" },
  resuelto: { punto: "bg-emerald-500", barra: "bg-emerald-500", chip: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300", texto: "text-emerald-700 dark:text-emerald-300", hex: "#10b981" },
  cerrado: { punto: "bg-slate-500", barra: "bg-slate-500", chip: "bg-slate-500/12 text-slate-600 ring-slate-500/30 dark:text-slate-300", texto: "text-slate-600 dark:text-slate-300", hex: "#64748b" },
  cancelado: { punto: "bg-zinc-400", barra: "bg-zinc-400", chip: "bg-zinc-500/10 text-zinc-500 ring-zinc-500/25 line-through", texto: "text-zinc-500", hex: "#a1a1aa" },
};

export function colorEstado(estado: string) {
  return ESTADO_COLOR[estado] ?? ESTADO_COLOR.cerrado;
}

/** Camino normal de un ticket (En espera es un desvío desde Trabajando). */
export const FLUJO = ["nuevo", "asignado", "en_curso", "resuelto", "cerrado"] as const;

export const TIPOS = [
  { key: "incidente", label: "Incidente" },
  { key: "pedido", label: "Pedido" },
  { key: "cambio", label: "Cambio" },
  { key: "consulta", label: "Consulta" },
  { key: "mantenimiento", label: "Mantenimiento" },
] as const;

export const PRIORIDADES = ["critica", "alta", "media", "baja"] as const;
export const CATEGORIAS = ["Red", "PC", "Impresora", "Accesos", "Correo", "Servidor", "Otro"];

export const PRIORIDAD_STYLE: Record<string, string> = {
  baja: "bg-muted text-muted-foreground",
  media: "bg-primary/15 text-primary",
  alta: "bg-warn/19 text-[color-mix(in_oklab,var(--warn),var(--foreground)_30%)] ",
  critica: "bg-destructive/15 text-destructive",
};

export const PRIORIDAD_BAR: Record<string, string> = {
  baja: "bg-muted-foreground/40",
  media: "bg-primary",
  alta: "bg-warn",
  critica: "bg-destructive",
};

export const ESTADO_STYLE: Record<string, string> = {
  nuevo: "bg-info/19 text-info ",
  asignado: "bg-chart-4/19 text-chart-4 ",
  en_curso: "bg-primary/15 text-primary",
  esperando: "bg-warn/19 text-[color-mix(in_oklab,var(--warn),var(--foreground)_30%)] ",
  resuelto: "bg-ok/19 text-ok ",
  cerrado: "bg-muted text-muted-foreground",
  cancelado: "bg-muted text-muted-foreground line-through",
};

export const BOARD_COLS = [
  { key: "nuevo", label: "Backlog", dot: "bg-muted-foreground/50" },
  { key: "asignado", label: "Asignado", dot: "bg-chart-4" },
  { key: "en_curso", label: "En curso", dot: "bg-primary" },
  { key: "esperando", label: "Esperando", dot: "bg-warn" },
  { key: "resuelto", label: "Resuelto", dot: "bg-ok" },
  { key: "cerrado", label: "Cerrado", dot: "bg-muted-foreground" },
] as const;

export const MS_30D = 30 * 24 * 60 * 60 * 1000;

export function ticketLabel(t: Ticket) {
  return t.numero != null ? `TK-${t.numero}` : t.id.slice(0, 8);
}
export function isClosed(estado: string) {
  return ["cerrado", "cancelado", "resuelto"].includes(estado);
}
export function isArchivedClosed(estado: string) {
  return estado === "cerrado" || estado === "cancelado";
}
export function within30Days(t: Ticket) {
  const raw = t.cerrado_en || t.updated_at || t.created_at;
  if (!raw) return true;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return true;
  return Date.now() - d.getTime() <= MS_30D;
}
export function tiempoRelativo(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "ahora";
  if (sec < 3600) return `hace ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`;
  if (sec < 86400 * 7) return `hace ${Math.floor(sec / 86400)} d`;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}
export function estadoLabel(key: string) {
  return ESTADOS.find((e) => e.key === key)?.label ?? key.replace(/_/g, " ");
}
export function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
export function prioLabel(p: string) {
  if (p === "critica") return "Urgent";
  if (p === "alta") return "High";
  if (p === "media") return "Medium";
  return "Low";
}
export function sortTickets(list: Ticket[]) {
  const prioRank = (p: string) => PRIORIDADES.indexOf(p as (typeof PRIORIDADES)[number]);
  return list.slice().sort((a, b) => {
    const pa = prioRank(a.prioridad);
    const pb = prioRank(b.prioridad);
    if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    return String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
  });
}
