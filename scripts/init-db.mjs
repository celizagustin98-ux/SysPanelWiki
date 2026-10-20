import { existsSync, readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

// Toma las variables de .env si no vienen del entorno (systemd, Docker o shell).
function cargarEnv(archivo) {
  if (!existsSync(archivo)) return;
  for (const linea of readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
cargarEnv(resolve(".env"));

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Falta DATABASE_URL. Ejemplo: postgresql://usuario:clave@127.0.0.1:5432/syswiki");
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

// Espera a la base (útil en Docker, donde la app puede arrancar antes que PostgreSQL).
async function conectar(intentos = 30) {
  for (let i = 1; ; i++) {
    try {
      await client.connect();
      return;
    } catch (error) {
      if (i >= intentos) throw error;
      console.log(`Esperando a PostgreSQL (${i}/${intentos})…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

try {
  await conectar(Number(process.env.DB_WAIT_RETRIES || 30));
  const schema = await readFile(resolve("db/schema.sql"), "utf8");
  await client.query(schema);

  // Todas las migraciones son idempotentes: se aplican siempre en orden y se registran.
  const migrationsDir = resolve("db/migrations");
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  let nuevas = 0;
  for (const file of files) {
    const previa = await client
      .query(`select 1 from schema_migrations where archivo = $1`, [file])
      .then((r) => r.rowCount > 0)
      .catch(() => false);
    const sql = await readFile(resolve(migrationsDir, file), "utf8");
    await client.query(sql);
    await client
      .query(`insert into schema_migrations (archivo) values ($1) on conflict do nothing`, [file])
      .catch(() => {});
    if (!previa) nuevas++;
    console.log(`${previa ? "  ok " : "NUEVA"}  ${file}`);
  }

  console.log(`Base PostgreSQL lista (${files.length} migraciones, ${nuevas} nuevas).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
