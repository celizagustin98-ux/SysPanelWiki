import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isEncryptedSecret, maskCredentialRow } from "@/backend/core/crypto-secrets";
import { mensajeErrorBase, validarClave, validarNombreArchivo, validarPin } from "@/backend/core/seguridad";

describe("contraseñas", () => {
  it("acepta una contraseña larga con letras y números", () => {
    expect(() => validarClave("Mesa-de-ayuda-2026", "agustin")).not.toThrow();
  });

  it.each([
    ["corta1", "al menos 10"],
    ["solamenteletras", "letras y números"],
    ["1111111111", "letras y números"],
    ["agustin12345", "nombre de usuario"],
  ])("rechaza %s", (clave, motivo) => {
    expect(() => validarClave(clave, "agustin")).toThrow(motivo);
  });
});

describe("PIN de escaneo", () => {
  it("acepta un PIN no trivial", () => {
    expect(() => validarPin("2580")).not.toThrow();
  });

  it.each(["123", "1111", "1234", "4321", "12a4"])("rechaza %s", (pin) => {
    expect(() => validarPin(pin)).toThrow();
  });
});

describe("adjuntos", () => {
  it("rechaza archivos que pueden ejecutar código", () => {
    expect(() => validarNombreArchivo("ticket/x/factura.html")).toThrow(".html");
    expect(() => validarNombreArchivo("script.PS1")).toThrow(".ps1");
  });

  it("acepta documentos e imágenes", () => {
    expect(() => validarNombreArchivo("ticket/x/factura.pdf")).not.toThrow();
    expect(() => validarNombreArchivo("foto.jpg")).not.toThrow();
  });
});

describe("errores de base", () => {
  it("no muestra detalles internos", () => {
    expect(mensajeErrorBase({ code: "23505", message: "duplicate key value violates unique constraint credenciales_pkey" })).toBe(
      "Ya existe un registro con esos datos",
    );
    expect(mensajeErrorBase(new Error("otra cosa"))).toBeNull();
  });
});

describe("cifrado de credenciales", () => {
  const original = process.env.SECRETS_ENCRYPTION_KEY;
  afterEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = original;
  });

  it("cifra y descifra con la clave propia", () => {
    process.env.SECRETS_ENCRYPTION_KEY = "k".repeat(48);
    const cifrado = encryptSecret("clave-del-router")!;
    expect(isEncryptedSecret(cifrado)).toBe(true);
    expect(cifrado).not.toContain("clave-del-router");
    expect(decryptSecret(cifrado)).toBe("clave-del-router");
  });

  it("cada cifrado es distinto aunque la clave sea la misma", () => {
    process.env.SECRETS_ENCRYPTION_KEY = "k".repeat(48);
    expect(encryptSecret("igual")).not.toBe(encryptSecret("igual"));
  });

  it("lee secretos guardados con la clave provisoria después de configurar la propia", () => {
    delete process.env.SECRETS_ENCRYPTION_KEY;
    const viejo = encryptSecret("guardado-antes")!;
    process.env.SECRETS_ENCRYPTION_KEY = "k".repeat(48);
    expect(decryptSecret(viejo)).toBe("guardado-antes");
  });

  it("con otra clave no se puede leer", () => {
    process.env.SECRETS_ENCRYPTION_KEY = "a".repeat(48);
    const cifrado = encryptSecret("secreto")!;
    process.env.SECRETS_ENCRYPTION_KEY = "b".repeat(48);
    expect(() => decryptSecret(cifrado)).toThrow();
  });

  it("las filas de credenciales viajan sin la clave", () => {
    const fila = maskCredentialRow({ id: "1", servicio: "Router", secreto: "enc:v1:x:y:z" });
    expect(fila.secreto).toBeNull();
    expect((fila as { has_secreto?: boolean }).has_secreto).toBe(true);
  });
});
