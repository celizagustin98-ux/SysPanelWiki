import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1";

let avisado = false;

/** Clave derivada de DATABASE_URL: solo para instalaciones que todavía no configuraron SECRETS_ENCRYPTION_KEY. */
function claveDerivada(): Buffer {
  const fallback = process.env.DATABASE_URL || "syswiki-dev-insecure-key";
  return createHash("sha256").update(`syswiki-secrets:${fallback}`).digest();
}

function resolveKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY?.trim();
  if (raw && raw.length >= 32) {
    return createHash("sha256").update(raw).digest();
  }
  if (!avisado) {
    avisado = true;
    console.warn(
      "[seguridad] SECRETS_ENCRYPTION_KEY no está configurada (o tiene menos de 32 caracteres): las credenciales se cifran con una clave derivada de DATABASE_URL. Generala con: openssl rand -base64 48",
    );
  }
  if (raw && raw.length >= 16) return createHash("sha256").update(raw).digest();
  return claveDerivada();
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined) return null;
  const text = String(plain);
  if (!text) return "";
  if (isEncryptedSecret(text)) return text;
  const key = resolveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return "";
  if (!isEncryptedSecret(stored)) return stored;
  const parts = stored.split(":");
  // enc:v1:iv:tag:ciphertext
  if (parts.length !== 5) throw new Error("Secreto cifrado inválido");
  const [, , ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const descifrar = (key: Buffer) => {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  };
  try {
    return descifrar(resolveKey());
  } catch {
    // Secreto guardado antes de configurar SECRETS_ENCRYPTION_KEY: se lee con la clave anterior.
    return descifrar(claveDerivada());
  }
}

export function maskCredentialRow<T extends Record<string, unknown>>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const secreto = row.secreto;
  const has =
    typeof secreto === "string" ? secreto.length > 0 : secreto !== null && secreto !== undefined;
  const next = { ...row } as T & { has_secreto?: boolean; secreto?: string | null };
  next.has_secreto = has;
  next.secreto = null;
  return next;
}
