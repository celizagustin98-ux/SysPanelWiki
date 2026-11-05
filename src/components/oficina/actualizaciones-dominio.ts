/* Historial de actualizaciones de otros sistemas: tipos, catálogos y lectura del mensaje del desarrollador. */

export type Cambio = { modulo: string; tipo: TipoCambio; detalle: string };
export type TipoCambio = "nuevo" | "mejora" | "correccion" | "quitado";
export type EstadoActualizacion = "pendiente" | "subido" | "con_problemas" | "revertido";

export type Actualizacion = {
  id: string;
  sistema: string;
  version: string | null;
  titulo: string;
  fecha: string;
  hora: string | null;
  estado: EstadoActualizacion;
  ambiente: "produccion" | "prueba";
  capas: string[];
  cambios: Cambio[];
  desarrollador: string | null;
  aviso_fecha: string | null;
  mensaje_original: string | null;
  requiere_corte: boolean;
  corte_minutos: number | null;
  respaldo_previo: boolean;
  pruebas: string | null;
  incidencias: string | null;
  como_revertir: string | null;
  subido_por_nombre: string | null;
  created_at: string;
  updated_at: string;
};

export const CAPAS: { value: string; label: string; chip: string }[] = [
  { value: "frontend", label: "Frontend", chip: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  { value: "backend", label: "Backend", chip: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  { value: "base_datos", label: "Base de datos", chip: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  { value: "configuracion", label: "Configuración", chip: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300" },
  { value: "infraestructura", label: "Servidor", chip: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300" },
];
export const capa = (v: string) => CAPAS.find((c) => c.value === v) ?? { value: v, label: v, chip: "border-border bg-muted text-muted-foreground" };

export const TIPOS_CAMBIO: { value: TipoCambio; label: string; chip: string }[] = [
  { value: "nuevo", label: "Nuevo", chip: "bg-ok/14 text-ok" },
  { value: "mejora", label: "Mejora", chip: "bg-info/14 text-info" },
  { value: "correccion", label: "Corrección", chip: "bg-warn/16 text-[color-mix(in_oklab,var(--warn),var(--foreground)_25%)]" },
  { value: "quitado", label: "Quitado", chip: "bg-crit/12 text-crit" },
];
export const tipoCambio = (v: string) => TIPOS_CAMBIO.find((t) => t.value === v) ?? TIPOS_CAMBIO[1];

export const ESTADOS_ACTUALIZACION: { value: EstadoActualizacion; label: string; variant: "ok" | "warn" | "crit" | "info" }[] = [
  { value: "pendiente", label: "Pendiente de subir", variant: "info" },
  { value: "subido", label: "Subido", variant: "ok" },
  { value: "con_problemas", label: "Con problemas", variant: "warn" },
  { value: "revertido", label: "Revertido", variant: "crit" },
];
export const estadoActualizacion = (v: string) => ESTADOS_ACTUALIZACION.find((e) => e.value === v) ?? ESTADOS_ACTUALIZACION[1];

/** Áreas típicas de un sistema; se suman las que ya se usaron. */
export const MODULOS_SUGERIDOS = [
  "Usuarios",
  "Permisos",
  "Login",
  "Pacientes",
  "Turnos",
  "Internación",
  "Facturación",
  "Stock / Farmacia",
  "Reportes",
  "Impresión",
  "Interfaces",
  "General",
];

// Palabra clave (sin acentos) → módulo sugerido.
const PISTAS_MODULO: [RegExp, string][] = [
  [/\busuari/, "Usuarios"],
  [/\b(permis|rol(es)?\b|perfil)/, "Permisos"],
  [/\b(login|ingreso al sistema|contrasen|clave)/, "Login"],
  [/\bpacient/, "Pacientes"],
  [/\bturno/, "Turnos"],
  [/\b(factur|liquidac|cobran)/, "Facturación"],
  [/\b(internac|cama)/, "Internación"],
  [/\b(stock|farmaci|insumo)/, "Stock / Farmacia"],
  [/\b(report|listado|estadistic|informe)/, "Reportes"],
  [/\b(imprim|impresi|pdf|ticket de impresion)/, "Impresión"],
  [/\b(interfaz con|integraci|webservice|web service|hl7)/, "Interfaces"],
];

const PISTAS_CAPA: [RegExp, string][] = [
  [/\b(front|frontend|pantalla|vista|interfaz|boton|formulario|diseno|visual|grilla|menu)/, "frontend"],
  [/\b(back|backend|api|endpoint|servicio|servidor|proceso|logica)/, "backend"],
  [/\b(base de datos|bd|tabla|columna|campo nuevo|migracion|sql|procedimiento|indice|script)/, "base_datos"],
  [/\b(configuraci|parametr|variable de entorno)/, "configuracion"],
];

const sinAcentos = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function tipoDeLinea(n: string): TipoCambio {
  if (/\b(corrig|correcc|arregl|fix|solucion|error|bug|falla)/.test(n)) return "correccion";
  if (/\b(quit|elimin|sac[oa]|remov|se saca|deja de)/.test(n)) return "quitado";
  if (/\b(nuev|agreg|anad|incorpor|alta de|se crea|creacion)/.test(n)) return "nuevo";
  return "mejora";
}

// Renglones de saludo o cierre que no son cambios.
const RELLENO = /^(hola|buen(os|as)? (dia|tarde|noche)s?|buenas|saludos|gracias|muchas gracias|slds|abrazo|les (dejo|paso|comento)|te (dejo|paso|comento)|quedo atento|cualquier (cosa|duda)|version|v\d)/;

/**
 * Arma un borrador a partir del mensaje que manda el desarrollador:
 * versión, capas tocadas (front, back, base de datos…) y un cambio por renglón con su módulo y tipo.
 */
export function leerMensajeDesarrollador(texto: string): { version: string | null; capas: string[]; cambios: Cambio[] } {
  const version =
    texto.match(/\bv(?:ersi[oó]n)?\.?\s*:?\s*(\d+(?:\.\d+){1,3}[\w.-]*)/i)?.[1] ?? texto.match(/\b(\d+\.\d+\.\d+(?:[.-]\w+)?)\b/)?.[1] ?? null;
  const capas = new Set<string>();
  const cambios: Cambio[] = [];
  let seccionCapa: string | null = null;

  for (const bruto of texto.split(/\r?\n/)) {
    const linea = bruto.replace(/^\s*(?:[-*•·>]|\d+[.)-])\s*/, "").trim();
    if (!linea) continue;
    const n = sinAcentos(linea);
    // Encabezados del tipo "Backend:" o "FRONT" sin detalle: marcan la capa de los renglones que siguen.
    const encabezado = n.replace(/[:\-–]+$/, "").trim();
    const capaEncabezado = PISTAS_CAPA.find(([re]) => re.test(encabezado))?.[1];
    const esEncabezado = /[:\-–]$/.test(n) ? encabezado.split(/\s+/).length <= 3 : /^(front(end)?|back(end)?|base de datos|bd|configuracion)$/.test(encabezado);
    if (capaEncabezado && esEncabezado) {
      seccionCapa = capaEncabezado;
      capas.add(capaEncabezado);
      continue;
    }
    if (RELLENO.test(n) && linea.length < 80) continue;
    // Otros títulos cortos ("Cambios:", "Novedades:") tampoco son cambios.
    if (/:$/.test(n) && n.split(/\s+/).length <= 3) continue;

    for (const [re, c] of PISTAS_CAPA) if (re.test(n)) capas.add(c);
    if (seccionCapa) capas.add(seccionCapa);

    // "Usuarios: se agregó el filtro…" → módulo explícito antes de los dos puntos.
    let modulo = "";
    let detalle = linea;
    const conPrefijo = linea.match(/^([^:]{2,30}):\s+(.+)$/);
    if (conPrefijo && !/\d{1,2}:\d{2}/.test(conPrefijo[0].slice(0, 8))) {
      modulo = conPrefijo[1].trim();
      detalle = conPrefijo[2].trim();
    } else {
      modulo = PISTAS_MODULO.find(([re]) => re.test(n))?.[1] ?? "General";
    }
    cambios.push({ modulo: modulo.charAt(0).toUpperCase() + modulo.slice(1), tipo: tipoDeLinea(n), detalle: detalle.charAt(0).toUpperCase() + detalle.slice(1) });
  }
  return { version, capas: CAPAS.map((c) => c.value).filter((c) => capas.has(c)), cambios };
}

/** "2026-11" → "Noviembre 2026". */
export function nombreMes(ym: string) {
  const [a, m] = ym.split("-").map(Number);
  const t = new Date(a, m - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function moverMes(ym: string, delta: number) {
  const [a, m] = ym.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
