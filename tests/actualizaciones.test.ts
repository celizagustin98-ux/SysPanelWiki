import { describe, expect, it } from "vitest";
import { leerMensajeDesarrollador, moverMes, nombreMes } from "@/components/oficina/actualizaciones-dominio";

const MENSAJE = `Hola buen día! Les dejo la versión 2.4.1 para subir.
Cambios:
Backend:
- Usuarios: se agregó el bloqueo por intentos fallidos
- Se corrigió el error al facturar internaciones
Frontend:
- Nueva pantalla de turnos con filtro por profesional
- Se quitó el botón de exportar viejo
Base de datos: se agrega la columna bloqueado en la tabla usuarios
Saludos`;

describe("mensaje del desarrollador", () => {
  const r = leerMensajeDesarrollador(MENSAJE);
  it("encuentra la versión y las capas", () => {
    expect(r.version).toBe("2.4.1");
    expect(r.capas).toEqual(["frontend", "backend", "base_datos"]);
  });
  it("arma un cambio por renglón con módulo y tipo", () => {
    expect(r.cambios.map((c) => [c.modulo, c.tipo])).toEqual([
      ["Usuarios", "nuevo"],
      ["Facturación", "correccion"],
      ["Turnos", "nuevo"],
      ["General", "quitado"],
      ["Base de datos", "nuevo"],
    ]);
    expect(r.cambios[0].detalle).toBe("Se agregó el bloqueo por intentos fallidos");
  });
  it("no toma saludos como cambios", () => {
    expect(r.cambios.some((c) => /hola|saludos/i.test(c.detalle))).toBe(false);
  });
});

describe("meses", () => {
  it("navega y nombra meses", () => {
    expect(moverMes("2026-01", -1)).toBe("2025-12");
    expect(moverMes("2026-12", 1)).toBe("2027-01");
    expect(nombreMes("2026-11")).toBe("Noviembre de 2026");
  });
});
