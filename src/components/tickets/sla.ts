/**
 * SLA por prioridad: horas corridas desde que se creó el ticket.
 * - respuesta: hasta que alguien lo toma (tiene responsable).
 * - resolución: hasta que se marca resuelto.
 * Mientras está "en espera" el reloj no corre en la pantalla (depende de otra persona).
 */
export const SLA_HORAS: Record<string, { respuesta: number; resolucion: number }> = {
  critica: { respuesta: 1, resolucion: 4 },
  alta: { respuesta: 4, resolucion: 24 },
  media: { respuesta: 8, resolucion: 72 },
  baja: { respuesta: 24, resolucion: 168 },
};

export type EstadoSla = {
  fase: "respuesta" | "resolucion";
  vence: Date;
  restanteMs: number;
  tono: "ok" | "warn" | "crit";
  texto: string;
};

type TicketSla = {
  prioridad: string;
  estado: string;
  asignado_a?: string | null;
  created_at?: string | null;
};

const H = 60 * 60 * 1000;

/** "45 min", "5 h", "3 d". */
export function duracionCorta(ms: number) {
  const min = Math.max(1, Math.round(Math.abs(ms) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

export function calcularSla(t: TicketSla, ahora: Date = new Date()): EstadoSla | null {
  if (["resuelto", "cerrado", "cancelado", "esperando"].includes(t.estado)) return null;
  const creado = t.created_at ? new Date(t.created_at) : null;
  if (!creado || Number.isNaN(creado.getTime())) return null;
  const sla = SLA_HORAS[t.prioridad] ?? SLA_HORAS.media;
  const fase = t.asignado_a ? "resolucion" : "respuesta";
  const horas = fase === "respuesta" ? sla.respuesta : sla.resolucion;
  const vence = new Date(creado.getTime() + horas * H);
  const restanteMs = vence.getTime() - ahora.getTime();
  // Amarillo en el último cuarto del plazo.
  const tono = restanteMs < 0 ? "crit" : restanteMs < horas * H * 0.25 ? "warn" : "ok";
  const que = fase === "respuesta" ? "tomarlo" : "resolverlo";
  const texto = restanteMs < 0 ? `Vencido hace ${duracionCorta(restanteMs)} (${que})` : `${duracionCorta(restanteMs)} para ${que}`;
  return { fase, vence, restanteMs, tono, texto };
}
