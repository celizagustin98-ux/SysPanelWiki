#!/usr/bin/env node
// Vuelve a cifrar con SECRETS_ENCRYPTION_KEY los secretos guardados con la clave provisoria
// (la que se deriva de DATABASE_URL). Es idempotente: lo que ya está con la clave buena no se toca.
//
//   DATABASE_URL=... SECRETS_ENCRYPTION_KEY=... node scripts/recifrar-secretos.mjs
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import pg from "pg";

const PREFIX = "enc:v1";
const raw = process.env.SECRETS_ENCRYPTION_KEY?.trim() ?? "";
if (raw.length < 16) {
  console.error("SECRETS_ENCRYPTION_KEY falta o es demasiado corta: no se recifra nada.");
  process.exit(1);
}
const claveNueva = createHash("sha256").update(raw).digest();
const claveVieja = createHash("sha256").update(`syswiki-secrets:${process.env.DATABASE_URL || "syswiki-dev-insecure-key"}`).digest();

function descifrar(valor, clave) {
  const [, , iv, tag, datos] = valor.split(":");
  const d = createDecipheriv("aes-256-gcm", clave, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(datos, "base64url")), d.final()]).toString("utf8");
}

function cifrar(texto) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", claveNueva, iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `${PREFIX}:${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${datos.toString("base64url")}`;
}

/** Devuelve el valor recifrado, o null si no hace falta tocarlo. */
function recifrar(valor) {
  if (typeof valor !== "string" || !valor) return null;
  if (!valor.startsWith(`${PREFIX}:`)) return cifrar(valor); // texto plano viejo
  try {
    descifrar(valor, claveNueva);
    return null; // ya está con la clave buena
  } catch {
    return cifrar(descifrar(valor, claveVieja));
  }
}

const COLUMNAS = [
  { tabla: "credenciales", columnas: ["secreto"] },
  { tabla: "oficina_contactos", columnas: ["secreto"] },
  { tabla: "oficina_contactos_historial", columnas: ["antes", "despues"], donde: "cifrado" },
];

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

let cambiados = 0;
let fallidos = 0;
try {
  for (const { tabla, columnas, donde } of COLUMNAS) {
    const existe = await pool.query(`select to_regclass($1) as t`, [tabla]);
    if (!existe.rows[0]?.t) continue;
    const { rows } = await pool.query(`select id, ${columnas.join(", ")} from ${tabla}${donde ? ` where ${donde}` : ""}`);
    for (const fila of rows) {
      for (const col of columnas) {
        try {
          const nuevo = recifrar(fila[col]);
          if (nuevo === null) continue;
          await pool.query(`update ${tabla} set ${col} = $1 where id = $2`, [nuevo, fila.id]);
          cambiados += 1;
        } catch {
          fallidos += 1;
        }
      }
    }
  }
  console.log(`Secretos recifrados: ${cambiados}${fallidos ? ` · no se pudieron leer: ${fallidos}` : ""}`);
} finally {
  await pool.end();
}
