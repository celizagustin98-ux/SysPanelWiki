import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Falta DATABASE_URL. Ejemplo: postgresql://usuario:clave@127.0.0.1:5432/syswiki");
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  const schema = await readFile(resolve("db/schema.sql"), "utf8");
  await client.query(schema);

  const migrationsDir = resolve("db/migrations");
  try {
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const sql = await readFile(resolve(migrationsDir, file), "utf8");
      await client.query(sql);
      console.log(`Migración aplicada: ${file}`);
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") {
      throw error;
    }
  }

  console.log("Base PostgreSQL inicializada correctamente.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
