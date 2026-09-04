import { addDays, format, isSaturday, isSunday, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { api } from "@/integrations/api/client";

export type Guardia = {
  id: string;
  operador_nombre: string;
  desde: string;
  hasta: string;
  notas: string | null;
};

export type OperarioRow = {
  id: string;
  nombre: string;
  code: string;
  activo: boolean;
  orden: number;
};

export type Operario = { id?: string; nombre: string; code: string; color: string };

export const COLOR_PALETTE = [
  "bg-teal-600 text-white border-teal-400",
  "bg-sky-600 text-white border-sky-400",
  "bg-violet-600 text-white border-violet-400",
  "bg-indigo-600 text-white border-indigo-400",
  "bg-amber-600 text-white border-amber-400",
  "bg-rose-600 text-white border-rose-400",
  "bg-cyan-600 text-white border-cyan-400",
  "bg-fuchsia-600 text-white border-fuchsia-400",
];

export const SEED_OPERARIOS = [
  { nombre: "CELIZ AGUSTIN", code: "A", orden: 1 },
  { nombre: "CORDOBA SANTINO", code: "S", orden: 2 },
  { nombre: "SANTILLAN KEVIN", code: "K", orden: 3 },
  { nombre: "SILETTO JOSE", code: "J", orden: 4 },
];

const FERIADOS_FIJOS = [
  "01-01",
  "03-24",
  "04-02",
  "05-01",
  "05-25",
  "06-20",
  "07-09",
  "12-08",
  "12-25",
];

const FERIADOS_EXTRA = new Set([
  "2025-03-03",
  "2025-03-04",
  "2025-04-17",
  "2025-04-18",
  "2025-06-16",
  "2025-08-15",
  "2025-11-17",
  "2025-11-21",
  "2025-12-24",
  "2025-12-26",
  "2026-03-23",
  "2026-03-24",
  "2026-04-02",
  "2026-04-03",
  "2026-06-15",
  "2026-08-17",
  "2026-10-12",
  "2026-11-20",
  "2026-11-23",
  "2027-03-29",
  "2027-03-30",
]);

export function normalizeName(s: unknown) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function colorForIndex(i: number) {
  return COLOR_PALETTE[i % COLOR_PALETTE.length];
}

export function suggestCode(nombre: unknown, used: Set<string>) {
  const parts = normalizeName(nombre).split(" ").filter(Boolean);
  const candidates = [
    parts[0]?.[0],
    parts[parts.length - 1]?.[0],
    parts.map((p) => p[0]).join("").slice(0, 2),
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    const code = c.slice(0, 2).toUpperCase();
    if (!used.has(code)) return code;
  }
  return "X";
}

export function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function isFeriado(d: Date) {
  if (isSaturday(d) || isSunday(d)) return true;
  if (FERIADOS_EXTRA.has(ymd(d))) return true;
  return FERIADOS_FIJOS.includes(format(d, "MM-dd"));
}

export function getPeriodContaining(ref: Date) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const day = ref.getDate();
  let startY = y;
  let startM = m;
  if (day < 21) {
    startM = m - 1;
    if (startM < 0) {
      startM = 11;
      startY = y - 1;
    }
  }
  const desde = new Date(startY, startM, 21);
  let endM = startM + 1;
  let endY = startY;
  if (endM > 11) {
    endM = 0;
    endY += 1;
  }
  const hasta = new Date(endY, endM, 20);
  return { desde, hasta, key: `${ymd(desde)}_${ymd(hasta)}` };
}

export function shiftPeriod(period: { desde: Date; hasta: Date }, delta: number) {
  const d = new Date(period.desde.getFullYear(), period.desde.getMonth() + delta, 21);
  return getPeriodContaining(d);
}

export function periodLabel(desde: Date, hasta: Date) {
  const a = format(desde, "MMMM", { locale: es });
  const b = format(hasta, "MMMM", { locale: es });
  const year = format(hasta, "yyyy");
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (a === b) return `${cap(a)} ${year}`;
  return `${cap(a)}/${cap(b).slice(0, 4)} ${year}`;
}

export function weekdayLetter(d: Date) {
  return (["D", "L", "M", "X", "J", "V", "S"] as const)[d.getDay()];
}

/** Fecha/hora local sin convertir a UTC (evita desfasaje AR). */
function localDT(day: Date, hours: number, minutes = 0) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
}

/** Parsea timestamps de DB (con o sin Z) siempre como reloj local. */
export function parseLocal(iso: string): Date | null {
  const s = String(iso ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      m[6] ? Number(m[6]) : 0,
      0,
    );
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Serializa noche sin sufijo Z para que Postgres y el cliente usen el mismo reloj. */
export function nightStartIso(day: Date) {
  const d = localDT(day, 20, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm:ss");
}

export function nightEndIso(day: Date) {
  const d = localDT(addDays(day, 1), 8, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm:ss");
}

/** True si el tramo cubre la noche de `day` (20:00 → 08:00 local). */
export function coversNight(g: Guardia, day: Date) {
  const gs = parseLocal(g.desde);
  const ge = parseLocal(g.hasta);
  if (!gs || !ge) return false;
  const ns = localDT(day, 20, 0);
  const ne = localDT(addDays(day, 1), 8, 0);
  return gs.getTime() < ne.getTime() && ge.getTime() > ns.getTime();
}

export function isVacacion(g: Guardia) {
  return String(g.notas ?? "").toLowerCase().includes("vacacion");
}

export async function removeNightFromGuardia(g: Guardia, day: Date) {
  const nightStart = localDT(day, 20, 0).getTime();
  const nightEnd = localDT(addDays(day, 1), 8, 0).getTime();
  const gStart = parseLocal(g.desde)?.getTime() ?? 0;
  const gEnd = parseLocal(g.hasta)?.getTime() ?? 0;

  if (gStart >= nightStart - 60_000 && gEnd <= nightEnd + 60_000) {
    const { error } = await api.from("guardias").delete().eq("id", g.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error: delErr } = await api.from("guardias").delete().eq("id", g.id);
  if (delErr) throw new Error(delErr.message);

  const inserts: { operador_nombre: string; desde: string; hasta: string; notas: string | null }[] =
    [];
  if (gStart < nightStart) {
    inserts.push({
      operador_nombre: String(g.operador_nombre ?? ""),
      desde: g.desde,
      hasta: nightStartIso(day),
      notas: g.notas,
    });
  }
  if (gEnd > nightEnd) {
    inserts.push({
      operador_nombre: String(g.operador_nombre ?? ""),
      desde: nightEndIso(day),
      hasta: g.hasta,
      notas: g.notas,
    });
  }
  if (inserts.length) {
    const { error } = await api.from("guardias").insert(inserts);
    if (error) throw new Error(error.message);
  }
}
