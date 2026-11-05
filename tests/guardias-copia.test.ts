import { describe, expect, it } from "vitest";
import { nightEndIso, nightStartIso, planCopiaGuardias, type Guardia } from "@/components/guardias/domain";

const noche = (y: number, m: number, d: number, nombre: string, notas: string | null = null): Guardia =>
  ({ id: `${nombre}-${d}`, operador_nombre: nombre, desde: nightStartIso(new Date(y, m, d)), hasta: nightEndIso(new Date(y, m, d)), notas }) as Guardia;

describe("copiar planilla de guardias", () => {
  const previas = [noche(2026, 10, 2, "Ana"), noche(2026, 10, 3, "Beto"), noche(2026, 10, 4, "Ana")];
  it("repite el mismo día de la semana de hace una semana", () => {
    const dias = [new Date(2026, 10, 9), new Date(2026, 10, 10), new Date(2026, 10, 11)];
    expect(planCopiaGuardias(dias, previas, 1).map((p) => p.operador)).toEqual(["Ana", "Beto", "Ana"]);
  });
  it("no pisa noches cargadas ni a quien está de vacaciones", () => {
    const dias = [new Date(2026, 10, 9), new Date(2026, 10, 10), new Date(2026, 10, 11)];
    const con = [...previas, noche(2026, 10, 9, "Caro"), noche(2026, 10, 11, "Ana", "vacaciones")];
    expect(planCopiaGuardias(dias, con, 1).map((p) => p.operador)).toEqual(["Beto"]);
  });
});
