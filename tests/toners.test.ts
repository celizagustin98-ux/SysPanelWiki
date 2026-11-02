import { describe, expect, it } from "vitest";
import { pronosticar } from "@/components/toners/pronostico";

describe("pronóstico de tóners", () => {
  it("calcula cuántos días alcanza el stock", () => {
    // 6 usados en 30 días = 0,2 por día; 4 en stock alcanzan 20 días.
    const p = pronosticar({ stock: 4, minimo: 2, usados: 6, dias: 30 });
    expect(p.diasRestantes).toBe(20);
  });

  it("sugiere cubrir el próximo mes y quedar en el mínimo", () => {
    // Se usan 6 por mes + 2 de reserva = 8; hay 4 → pedir 4.
    expect(pronosticar({ stock: 4, minimo: 2, usados: 6, dias: 30 }).sugerido).toBe(4);
  });

  it("descuenta lo que ya está pedido", () => {
    expect(pronosticar({ stock: 4, minimo: 2, usados: 6, dias: 30, enCamino: 3 }).sugerido).toBe(1);
  });

  it("sin consumo no hay pronóstico, pero se repone hasta el mínimo", () => {
    const p = pronosticar({ stock: 0, minimo: 2, usados: 0, dias: 90 });
    expect(p.diasRestantes).toBeNull();
    expect(p.sugerido).toBe(2);
  });

  it("con stock de sobra no sugiere pedir", () => {
    expect(pronosticar({ stock: 20, minimo: 2, usados: 3, dias: 30 }).sugerido).toBe(0);
  });
});
