import { describe, expect, it } from "vitest";
import { initials, isArchivedClosed, isClosed, sortTickets, ticketLabel } from "@/components/tickets/constants";

type T = Parameters<typeof sortTickets>[0][number];
const t = (over: Partial<T>): T => ({ id: "00000000-aaaa", numero: null, prioridad: "media", updated_at: "2026-11-01T10:00:00Z", ...over }) as T;

describe("tickets", () => {
  it("ordena por prioridad y después por el más reciente", () => {
    const lista = sortTickets([
      t({ id: "baja", prioridad: "baja" }),
      t({ id: "media-vieja", prioridad: "media", updated_at: "2026-10-01T10:00:00Z" }),
      t({ id: "critica", prioridad: "critica" }),
      t({ id: "media-nueva", prioridad: "media", updated_at: "2026-11-02T10:00:00Z" }),
    ]);
    expect(lista.map((x) => x.id)).toEqual(["critica", "media-nueva", "media-vieja", "baja"]);
  });

  it("muestra el número TK o el comienzo del id", () => {
    expect(ticketLabel(t({ numero: 42 }))).toBe("TK-42");
    expect(ticketLabel(t({ numero: null }))).toBe("00000000");
  });

  it("distingue cerrados de resueltos", () => {
    expect(isClosed("resuelto")).toBe(true);
    expect(isArchivedClosed("resuelto")).toBe(false);
    expect(isArchivedClosed("cerrado")).toBe(true);
  });

  it("arma las iniciales", () => {
    expect(initials("Agustin Celiz")).toBe("AC");
    expect(initials("")).toBe("—");
  });
});
