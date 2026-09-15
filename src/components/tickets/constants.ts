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
  created_at?: string;
  updated_at?: string;
};

export const ESTADOS = [
  { key: "nuevo", label: "Nuevo" },
  { key: "asignado", label: "Asignado" },
  { key: "en_curso", label: "En curso" },
  { key: "esperando", label: "Esperando" },
  { key: "resuelto", label: "Resuelto" },
  { key: "cerrado", label: "Cerrado" },
  { key: "cancelado", label: "Cancelado" },
] as const;

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
  alta: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  critica: "bg-destructive/15 text-destructive",
};

export const PRIORIDAD_BAR: Record<string, string> = {
  baja: "bg-muted-foreground/40",
  media: "bg-primary",
  alta: "bg-amber-500",
  critica: "bg-destructive",
};

export const ESTADO_STYLE: Record<string, string> = {
  nuevo: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  asignado: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  en_curso: "bg-primary/15 text-primary",
  esperando: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  resuelto: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cerrado: "bg-muted text-muted-foreground",
  cancelado: "bg-muted text-muted-foreground line-through",
};

export const BOARD_COLS = [
  { key: "nuevo", label: "Backlog", dot: "bg-slate-400" },
  { key: "asignado", label: "Asignado", dot: "bg-violet-500" },
  { key: "en_curso", label: "En curso", dot: "bg-teal-500" },
  { key: "esperando", label: "Esperando", dot: "bg-amber-500" },
  { key: "resuelto", label: "Resuelto", dot: "bg-emerald-500" },
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
