import { describe, expect, it } from "vitest";
import { leerLineaInsumo } from "@/components/oficina/insumos-texto";

describe("carga rápida de insumos", () => {
  it("lee la cantidad adelante o atrás", () => {
    expect(leerLineaInsumo("3 x Mouse USB")).toEqual({ descripcion: "Mouse USB", cantidad: 3, unidad: "u." });
    expect(leerLineaInsumo("3x mouse USB")).toEqual({ descripcion: "Mouse USB", cantidad: 3, unidad: "u." });
    expect(leerLineaInsumo("Teclado USB x2")).toEqual({ descripcion: "Teclado USB", cantidad: 2, unidad: "u." });
    expect(leerLineaInsumo("Toner 85A")).toEqual({ descripcion: "Toner 85A", cantidad: 1, unidad: "u." });
  });
  it("reconoce la unidad y las viñetas", () => {
    expect(leerLineaInsumo("2 cajas de Cable UTP Cat6")).toEqual({ descripcion: "Cable UTP Cat6", cantidad: 2, unidad: "caja" });
    expect(leerLineaInsumo("- 1 resma A4")).toEqual({ descripcion: "A4", cantidad: 1, unidad: "resma" });
    expect(leerLineaInsumo("1. Pilas AA x4")).toEqual({ descripcion: "Pilas AA", cantidad: 4, unidad: "u." });
  });
  it("no confunde un número del nombre con la cantidad", () => {
    expect(leerLineaInsumo("3D filamento PLA")?.cantidad).toBe(1);
    expect(leerLineaInsumo("   ")).toBeNull();
  });
});
