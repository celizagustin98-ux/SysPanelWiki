import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export type Rol = {
  clave: string;
  nombre: string;
  descripcion: string | null;
  color: string;
  sistema: boolean;
  orden: number;
};

/** Roles base: se usan si la migración v4 todavía no se aplicó. */
const ROLES_BASE: Rol[] = [
  {
    clave: "administrador",
    nombre: "Administrador",
    descripcion: "Control total del sistema.",
    color: "rose",
    sistema: true,
    orden: 1,
  },
  {
    clave: "tecnico",
    nombre: "Técnico",
    descripcion: "Operación diaria del área.",
    color: "sky",
    sistema: true,
    orden: 2,
  },
  {
    clave: "consulta",
    nombre: "Consulta",
    descripcion: "Solo lectura y consulta.",
    color: "slate",
    sistema: true,
    orden: 3,
  },
];

export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await api
        .from("roles")
        .select("clave, nombre, descripcion, color, sistema, orden")
        .order("orden")
        .order("nombre");
      if (error || !data?.length) return ROLES_BASE;
      return data as Rol[];
    },
  });
}

/** Colores disponibles para identificar cada rol. */
export const COLORES_ROL: Record<string, { punto: string; chip: string; label: string }> = {
  rose: {
    punto: "bg-rose-500",
    chip: "bg-rose-500/12 text-rose-600 dark:text-rose-300 ring-rose-500/25",
    label: "Rojo",
  },
  amber: {
    punto: "bg-amber-500",
    chip: "bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/25",
    label: "Ámbar",
  },
  emerald: {
    punto: "bg-emerald-500",
    chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25",
    label: "Verde",
  },
  sky: {
    punto: "bg-sky-500",
    chip: "bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25",
    label: "Celeste",
  },
  violet: {
    punto: "bg-violet-500",
    chip: "bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/25",
    label: "Violeta",
  },
  slate: {
    punto: "bg-slate-400",
    chip: "bg-slate-500/12 text-slate-700 dark:text-slate-300 ring-slate-500/25",
    label: "Gris",
  },
};

export function colorRol(color?: string | null) {
  return COLORES_ROL[color ?? ""] ?? COLORES_ROL.slate;
}
