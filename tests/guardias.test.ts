import { describe, expect, it, vi } from "vitest";

// El dominio importa el cliente de la API (para quitar guardias); en las pruebas no hace falta.
vi.mock("@/lib/api/client", () => ({ api: {} }));

const {
  coversNight,
  formatHoras,
  getPeriodContaining,
  horasDelDia,
  horasEntre,
  isFeriado,
  parseLocal,
  periodLabel,
  resumirExtras,
  setFeriados,
  shiftPeriod,
  tipoExtraSugerido,
  ymd,
} = await import("@/components/guardias/domain");

describe("período de liquidación 21 → 20", () => {
  it("un día 21 o posterior empieza el período en ese mes", () => {
    const p = getPeriodContaining(new Date(2026, 9, 25));
    expect(ymd(p.desde)).toBe("2026-10-21");
    expect(ymd(p.hasta)).toBe("2026-11-20");
  });

  it("un día anterior al 21 pertenece al período que empezó el mes anterior", () => {
    const p = getPeriodContaining(new Date(2026, 10, 2));
    expect(ymd(p.desde)).toBe("2026-10-21");
    expect(ymd(p.hasta)).toBe("2026-11-20");
  });

  it("cruza el cambio de año", () => {
    const p = getPeriodContaining(new Date(2027, 0, 5));
    expect(ymd(p.desde)).toBe("2026-12-21");
    expect(ymd(p.hasta)).toBe("2027-01-20");
  });

  it("avanza y retrocede de a un período", () => {
    const p = getPeriodContaining(new Date(2026, 10, 2));
    expect(ymd(shiftPeriod(p, 1).desde)).toBe("2026-11-21");
    expect(ymd(shiftPeriod(p, -1).hasta)).toBe("2026-10-20");
  });

  it("nombra el período con los dos meses", () => {
    const p = getPeriodContaining(new Date(2026, 10, 2));
    expect(periodLabel(p.desde, p.hasta)).toBe("Oct – Nov 2026");
  });
});

describe("feriados", () => {
  it("sábado y domingo cuentan siempre como feriado", () => {
    setFeriados([]);
    expect(isFeriado(new Date(2026, 9, 31))).toBe(true); // sábado
    expect(isFeriado(new Date(2026, 10, 1))).toBe(true); // domingo
    expect(isFeriado(new Date(2026, 10, 2))).toBe(false); // lunes
  });

  it("usa los feriados cargados en Configuración", () => {
    setFeriados(["2026-11-23"]);
    expect(isFeriado(new Date(2026, 10, 23))).toBe(true);
    expect(isFeriado(new Date(2026, 10, 24))).toBe(false);
  });
});

describe("noches de guardia", () => {
  const guardia = { id: "g", operador_nombre: "X", desde: "2026-11-02T20:00:00", hasta: "2026-11-03T08:00:00", notas: null };

  it("una guardia de 20 a 8 cubre esa noche y no la siguiente", () => {
    expect(coversNight(guardia, new Date(2026, 10, 2))).toBe(true);
    expect(coversNight(guardia, new Date(2026, 10, 3))).toBe(false);
  });

  it("lee la hora sin zona como hora local (no la corre 3 h)", () => {
    expect(parseLocal("2026-11-02T20:00:00")?.getHours()).toBe(20);
  });
});

describe("horas", () => {
  it("calcula horas entre dos horarios", () => {
    expect(horasEntre("08:00", "16:00")).toBe(8);
    expect(horasEntre("09:00", "13:30")).toBe(4.5);
  });

  it("si termina antes de empezar, cruza la medianoche", () => {
    expect(horasEntre("22:00", "01:00")).toBe(3);
  });

  it("suma el horario cortado", () => {
    expect(horasDelDia({ desde: "08:00", hasta: "12:00", desde2: "16:00", hasta2: "20:00" })).toBe(8);
  });

  it("formatea horas y minutos", () => {
    expect(formatHoras(37.5)).toBe("37:30 h");
    expect(formatHoras(0)).toBe("0:00 h");
  });

  it("las extras de fin de semana o feriado van al 100%", () => {
    setFeriados([]);
    expect(tipoExtraSugerido("2026-10-31")).toBe("100");
    expect(tipoExtraSugerido("2026-10-28")).toBe("50");
  });

  it("resume las horas extras por empleado", () => {
    const ops = [{ id: "1", nombre: "CELIZ AGUSTIN", code: "A", color: "" }];
    const extras = [
      { id: "a", operario_id: "1", operador_nombre: "Celiz Agustin", fecha: "2026-10-28", desde: "22:00", hasta: "01:00", horas: 3, tipo: "50" as const, motivo: null },
      { id: "b", operario_id: "1", operador_nombre: "CELIZ AGUSTIN", fecha: "2026-10-31", desde: "09:00", hasta: "13:30", horas: 4.5, tipo: "100" as const, motivo: null },
      { id: "c", operario_id: null, operador_nombre: "EX EMPLEADO", fecha: "2026-10-30", desde: "18:00", hasta: "19:00", horas: 1, tipo: "50" as const, motivo: null },
    ];
    const r = resumirExtras(extras, ops);
    const agustin = r.find((x) => x.operario.code === "A")!;
    expect(agustin.total).toBe(7.5);
    expect(agustin.cantidad).toBe(2);
    // Alguien que ya no está en el plantel igual aparece con sus horas.
    expect(r.find((x) => x.operario.nombre === "EX EMPLEADO")?.total).toBe(1);
  });
});
