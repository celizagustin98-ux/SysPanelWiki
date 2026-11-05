import { describe, expect, it } from "vitest";
import { proximaFecha } from "@/components/tickets/recurrencia";

describe("tickets recurrentes", () => {
  it("mensual conserva el día y ajusta meses cortos", () => {
    expect(proximaFecha("2026-01-31", "mensual")).toBe("2026-02-28");
    expect(proximaFecha("2026-11-05", "mensual")).toBe("2026-12-05");
    expect(proximaFecha("2026-11-05", "trimestral")).toBe("2027-02-05");
    expect(proximaFecha("2026-11-05", "anual")).toBe("2027-11-05");
  });
  it("diaria salta el fin de semana", () => {
    expect(proximaFecha("2026-11-06", "diaria")).toBe("2026-11-09");
  });
  it("si quedó atrasada avanza hasta después de hoy", () => {
    expect(proximaFecha("2026-08-01", "mensual", "2026-11-05")).toBe("2026-12-01");
    expect(proximaFecha("2026-10-01", "semanal", "2026-10-20")).toBe("2026-10-22");
  });
});
