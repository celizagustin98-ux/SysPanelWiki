import { describe, expect, it } from "vitest";
import { claveTelefono, parsearTelefonosCsv } from "@/components/oficina/telefonos-csv";

describe("importar internos", () => {
  it("lee el mismo CSV que exporta el sistema", () => {
    const csv = "﻿Sector;Nombre;Interno;Notas\r\nGuardia;Enfermería;201;\r\nFarmacia;Jefa;\"305\";Turno mañana\r\n";
    const r = parsearTelefonosCsv(csv);
    expect(r.error).toBeUndefined();
    expect(r.filas).toEqual([
      { sector: "Guardia", nombre: "Enfermería", interno: "201", notas: null },
      { sector: "Farmacia", nombre: "Jefa", interno: "305", notas: "Turno mañana" },
    ]);
  });

  it("acepta comas y encabezados con otros nombres", () => {
    const r = parsearTelefonosCsv("Área,Contacto,Extensión\nRayos,Técnico,4 10\n");
    expect(r.filas[0]).toEqual({ sector: "Rayos", nombre: "Técnico", interno: "410", notas: null });
  });

  it("respeta comillas con separadores adentro", () => {
    const r = parsearTelefonosCsv('Sector;Nombre;Interno\n"Admisión; planta baja";"Pérez, Ana";100\n');
    expect(r.filas[0].sector).toBe("Admisión; planta baja");
    expect(r.filas[0].nombre).toBe("Pérez, Ana");
  });

  it("cuenta las filas incompletas", () => {
    const r = parsearTelefonosCsv("Sector;Nombre;Interno\nGuardia;;201\nUTI;Médico;300\n");
    expect(r.invalidas).toBe(1);
    expect(r.filas).toHaveLength(1);
  });

  it("avisa si faltan columnas", () => {
    expect(parsearTelefonosCsv("Nombre;Interno\nX;1\n").error).toContain("Sector");
  });

  it("detecta repetidos sin importar acentos ni mayúsculas", () => {
    expect(claveTelefono({ sector: "Admisión", nombre: "JEFA", interno: "100" })).toBe(claveTelefono({ sector: "admision", nombre: "Jefa", interno: "1 00" }));
  });
});
