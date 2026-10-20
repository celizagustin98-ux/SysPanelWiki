/** Catálogo de Activos IT: estados, categorías y campos técnicos por categoría (al estilo Snipe-IT). */

export type Tono = "ok" | "warn" | "crit" | "info" | "neutral";

export const ESTADOS_ACTIVO = [
  { value: "operativo", label: "En uso", tono: "ok", ayuda: "Funcionando y en uso" },
  { value: "deposito", label: "En depósito", tono: "info", ayuda: "Disponible para asignar" },
  { value: "reparacion", label: "En reparación", tono: "warn", ayuda: "En servicio técnico" },
  { value: "observado", label: "Observado", tono: "warn", ayuda: "Funciona con falla o pendiente de revisión" },
  { value: "fuera_servicio", label: "Fuera de servicio", tono: "crit", ayuda: "No funciona, sin reparación en curso" },
  { value: "baja", label: "Baja", tono: "neutral", ayuda: "Retirado del inventario activo" },
] as const satisfies readonly { value: string; label: string; tono: Tono; ayuda: string }[];

export type EstadoActivo = (typeof ESTADOS_ACTIVO)[number]["value"];

const ALIAS_ESTADO: Record<string, EstadoActivo> = {
  en_uso: "operativo",
  asignado: "operativo",
  nuevo: "deposito",
  stock: "deposito",
  "en reparación": "reparacion",
  "en reparacion": "reparacion",
};

export function estadoInfo(value?: string | null) {
  const v = (value ?? "").toLowerCase();
  const key = (ALIAS_ESTADO[v] ?? v) as EstadoActivo;
  return ESTADOS_ACTIVO.find((e) => e.value === key) ?? { value: v || "operativo", label: value || "En uso", tono: "neutral" as Tono, ayuda: "" };
}

export type CampoTecnico = { key: string; label: string; placeholder?: string };

type Categoria = { value: string; red: boolean; campos: CampoTecnico[] };

const CAMPOS_PC: CampoTecnico[] = [
  { key: "cpu", label: "Procesador", placeholder: "Intel Core i5-10500" },
  { key: "ram", label: "Memoria RAM", placeholder: "16 GB" },
  { key: "disco", label: "Almacenamiento", placeholder: "SSD 480 GB" },
  { key: "usuario", label: "Usuario / dominio", placeholder: "DOMINIO\\usuario" },
  { key: "licencias", label: "Licencias", placeholder: "Windows 11 Pro, Office 2021" },
];

const CAMPOS_RED: CampoTecnico[] = [
  { key: "puertos", label: "Puertos", placeholder: "24 GbE + 4 SFP" },
  { key: "firmware", label: "Firmware", placeholder: "v2.5.8" },
  { key: "rack", label: "Rack / posición", placeholder: "Rack 1 · U12" },
  { key: "poe", label: "PoE", placeholder: "Sí, 370 W" },
];

export const CATEGORIAS: Categoria[] = [
  { value: "PC", red: true, campos: CAMPOS_PC },
  { value: "Notebook", red: true, campos: CAMPOS_PC },
  { value: "Servidor", red: true, campos: [...CAMPOS_PC, { key: "rack", label: "Rack / posición", placeholder: "Rack 1 · U20" }, { key: "rol", label: "Rol", placeholder: "Archivos, AD, base de datos" }] },
  { value: "Monitor", red: false, campos: [{ key: "pulgadas", label: "Pulgadas", placeholder: "24\"" }, { key: "conexiones", label: "Conexiones", placeholder: "HDMI, VGA" }] },
  { value: "Impresora", red: true, campos: [{ key: "toner", label: "Modelo de tóner", placeholder: "HP 58A" }, { key: "contador", label: "Contador de páginas", placeholder: "12.540" }, { key: "conexion", label: "Conexión", placeholder: "Red / USB" }] },
  { value: "Escáner", red: true, campos: [{ key: "conexion", label: "Conexión", placeholder: "Red / USB" }] },
  { value: "Switch", red: true, campos: CAMPOS_RED },
  { value: "Router", red: true, campos: CAMPOS_RED },
  { value: "Access Point", red: true, campos: [{ key: "ssid", label: "SSID", placeholder: "Red-Personal" }, { key: "firmware", label: "Firmware" }, { key: "ubicacion_fisica", label: "Montaje", placeholder: "Techo pasillo 2° piso" }] },
  { value: "Firewall", red: true, campos: CAMPOS_RED },
  { value: "UPS", red: true, campos: [{ key: "potencia", label: "Potencia", placeholder: "1500 VA" }, { key: "baterias", label: "Último cambio de baterías", placeholder: "03/2025" }, { key: "autonomia", label: "Autonomía", placeholder: "15 min" }] },
  { value: "Teléfono IP", red: true, campos: [{ key: "interno", label: "Interno", placeholder: "2715" }] },
  { value: "Tablet", red: true, campos: [{ key: "imei", label: "IMEI" }, { key: "linea", label: "Línea" }] },
  { value: "Celular", red: true, campos: [{ key: "imei", label: "IMEI" }, { key: "linea", label: "Línea", placeholder: "351-..." }] },
  { value: "Proyector", red: false, campos: [{ key: "lampara", label: "Horas de lámpara" }] },
  { value: "Otro", red: true, campos: [] },
];

export function categoriaInfo(value?: string | null): Categoria {
  const v = (value ?? "").trim().toLowerCase();
  return (
    CATEGORIAS.find((c) => c.value.toLowerCase() === v) ??
    CATEGORIAS.find((c) => v && v.includes(c.value.toLowerCase())) ?? { value: value || "Otro", red: true, campos: [] }
  );
}

export const TIPOS_REPARACION = [
  { value: "reparacion", label: "Reparación" },
  { value: "mantenimiento", label: "Mantenimiento preventivo" },
  { value: "actualizacion", label: "Actualización / mejora" },
  { value: "garantia", label: "Garantía" },
] as const;

export function tipoReparacionLabel(v?: string | null) {
  return TIPOS_REPARACION.find((t) => t.value === v)?.label ?? "Reparación";
}

/** Días hasta una fecha "YYYY-MM-DD" (negativo si ya pasó). */
export function diasHasta(fecha?: string | null) {
  if (!fecha) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoy = new Date();
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((d.getTime() - base.getTime()) / 86_400_000);
}

export function garantiaInfo(fecha?: string | null): { texto: string; tono: Tono } {
  const d = diasHasta(fecha);
  if (d == null) return { texto: "Sin datos", tono: "neutral" };
  if (d < 0) return { texto: "Vencida", tono: "crit" };
  if (d <= 90) return { texto: `Vence en ${d} días`, tono: "warn" };
  return { texto: "Vigente", tono: "ok" };
}

/** Próximo código de activo según los existentes (ej. INV-00042 → INV-00043). */
export function siguienteCodigo(codigos: (string | null | undefined)[]) {
  const conteo = new Map<string, { n: number; max: number; ancho: number }>();
  for (const c of codigos) {
    const m = /^([A-Za-z]+-?)(\d+)$/.exec((c ?? "").trim());
    if (!m) continue;
    const prev = conteo.get(m[1]) ?? { n: 0, max: 0, ancho: m[2].length };
    conteo.set(m[1], { n: prev.n + 1, max: Math.max(prev.max, Number(m[2])), ancho: Math.max(prev.ancho, m[2].length) });
  }
  const [prefijo, info] = [...conteo.entries()].sort((a, b) => b[1].n - a[1].n)[0] ?? ["INV-", { max: 0, ancho: 5 }];
  return `${prefijo}${String(info.max + 1).padStart(info.ancho, "0")}`;
}
