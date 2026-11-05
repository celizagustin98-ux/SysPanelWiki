/* Tickets recurrentes: cuándo toca crear el próximo. Lo usan el navegador y el servidor. */

export type Frecuencia = "diaria" | "semanal" | "quincenal" | "mensual" | "trimestral" | "anual";

export const FRECUENCIAS: { value: Frecuencia; label: string }[] = [
  { value: "diaria", label: "Todos los días hábiles" },
  { value: "semanal", label: "Cada semana" },
  { value: "quincenal", label: "Cada 15 días" },
  { value: "mensual", label: "Cada mes" },
  { value: "trimestral", label: "Cada 3 meses" },
  { value: "anual", label: "Cada año" },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function sumarMeses(d: Date, meses: number, dia: number) {
  const r = new Date(d.getFullYear(), d.getMonth() + meses, 1);
  const ultimo = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(dia, ultimo));
  return r;
}

/**
 * Próxima fecha después de `desde` ("AAAA-MM-DD"). Los mensuales conservan el día (el 31 cae
 * en el último día de los meses cortos) y los diarios saltan sábados y domingos.
 * Si quedó atrasada (nadie entró varios días), avanza hasta pasar `hoy`.
 */
export function proximaFecha(desde: string, frecuencia: Frecuencia, hoy?: string): string {
  const [a, m, d] = desde.slice(0, 10).split("-").map(Number);
  const dia = d;
  let f = new Date(a, m - 1, d);
  const siguiente = () => {
    if (frecuencia === "diaria") {
      do f = new Date(f.getFullYear(), f.getMonth(), f.getDate() + 1);
      while (f.getDay() === 0 || f.getDay() === 6);
    } else if (frecuencia === "semanal") f = new Date(f.getFullYear(), f.getMonth(), f.getDate() + 7);
    else if (frecuencia === "quincenal") f = new Date(f.getFullYear(), f.getMonth(), f.getDate() + 15);
    else f = sumarMeses(f, frecuencia === "mensual" ? 1 : frecuencia === "trimestral" ? 3 : 12, dia);
  };
  siguiente();
  if (hoy) {
    let vueltas = 0;
    while (iso(f) <= hoy && vueltas++ < 1000) siguiente();
  }
  return iso(f);
}
