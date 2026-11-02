import { describe, expect, it } from "vitest";
import { calcularSla, duracionCorta } from "@/components/tickets/sla";

const ahora = new Date("2026-11-02T12:00:00Z");
const hace = (h: number) => new Date(ahora.getTime() - h * 3600_000).toISOString();

describe("SLA de tickets", () => {
  it("una urgente sin tomar tiene 1 hora para que alguien la tome", () => {
    const s = calcularSla({ prioridad: "critica", estado: "nuevo", asignado_a: null, created_at: hace(0.5) }, ahora)!;
    expect(s.fase).toBe("respuesta");
    expect(s.tono).toBe("ok");
    expect(s.texto).toBe("30 min para tomarlo");
  });

  it("se vence si pasa el plazo", () => {
    const s = calcularSla({ prioridad: "critica", estado: "nuevo", asignado_a: null, created_at: hace(3) }, ahora)!;
    expect(s.tono).toBe("crit");
    expect(s.texto).toBe("Vencido hace 2 h (tomarlo)");
  });

  it("con responsable cuenta el plazo de resolución", () => {
    const s = calcularSla({ prioridad: "alta", estado: "en_curso", asignado_a: "u1", created_at: hace(20) }, ahora)!;
    expect(s.fase).toBe("resolucion");
    expect(s.tono).toBe("warn"); // quedan 4 h de 24: último cuarto
  });

  it("no corre para resueltos, cerrados ni en espera", () => {
    for (const estado of ["resuelto", "cerrado", "cancelado", "esperando"]) {
      expect(calcularSla({ prioridad: "critica", estado, asignado_a: "u1", created_at: hace(100) }, ahora)).toBeNull();
    }
  });

  it("formatea duraciones cortas", () => {
    expect(duracionCorta(30 * 60_000)).toBe("30 min");
    expect(duracionCorta(5 * 3600_000)).toBe("5 h");
    expect(duracionCorta(72 * 3600_000)).toBe("3 d");
  });
});
