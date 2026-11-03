// Respaldo diario de la base (pg_dump comprimido) y datos de salud del servidor.
// Lo usa scripts/serve.mjs: arranca solo y expone /api/system/respaldos y /api/system/salud (solo administradores).
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, statfsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { createGzip } from "node:zlib";

export const DIR_RESPALDOS = resolve(process.env.BACKUP_DIR_APP || "backups");
const CONSERVAR = Math.max(3, Number(process.env.BACKUP_KEEP || 14));
const NOMBRE = /^nodara-\d{8}-\d{6}\.sql\.gz$/;
let enCurso = null;
let ultimoError = null;

export function listarRespaldos() {
  if (!existsSync(DIR_RESPALDOS)) return [];
  return readdirSync(DIR_RESPALDOS)
    .filter((f) => NOMBRE.test(f))
    .map((f) => {
      const st = statSync(join(DIR_RESPALDOS, f));
      return { nombre: f, bytes: st.size, fecha: st.mtime.toISOString() };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function marca() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Hace un respaldo ahora. Devuelve el nombre del archivo. Si ya hay uno en curso, espera ese. */
export function hacerRespaldo() {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    mkdirSync(DIR_RESPALDOS, { recursive: true, mode: 0o700 });
    const nombre = `nodara-${marca()}.sql.gz`;
    const destino = join(DIR_RESPALDOS, nombre);
    const dump = spawn("pg_dump", ["--no-owner", "--no-privileges", process.env.DATABASE_URL || ""], { stdio: ["ignore", "pipe", "pipe"] });
    let errores = "";
    dump.stderr.on("data", (d) => (errores += d.toString()));
    const salida = createWriteStream(destino, { mode: 0o600 });
    dump.stdout.pipe(createGzip()).pipe(salida);
    const borrar = () => {
      try {
        unlinkSync(destino);
      } catch {
        /* nada */
      }
    };
    try {
      const [codigo] = await Promise.all([
        new Promise((ok, falla) => {
          dump.on("close", ok);
          dump.on("error", falla);
        }),
        new Promise((ok, falla) => {
          salida.on("close", ok);
          salida.on("error", falla);
        }),
      ]);
      if (codigo !== 0) throw new Error(`pg_dump terminó con error: ${errores.split(String.fromCharCode(10))[0] || codigo}`);
    } catch (e) {
      borrar();
      throw new Error(e.code === "ENOENT" ? "pg_dump no está instalado en el servidor (apt install postgresql-client)" : e.message);
    }
    // Quedan los últimos N respaldos.
    for (const viejo of listarRespaldos().slice(CONSERVAR)) {
      try {
        unlinkSync(join(DIR_RESPALDOS, viejo.nombre));
      } catch {
        /* nada */
      }
    }
    return nombre;
  })()
    .then((n) => {
      ultimoError = null;
      return n;
    })
    .catch((e) => {
      ultimoError = { mensaje: e.message, fecha: new Date().toISOString() };
      throw e;
    })
    .finally(() => {
      enCurso = null;
    });
  return enCurso;
}

/** Cada hora revisa si pasaron 24 h desde el último respaldo y, si es así, hace uno. */
export function iniciarRespaldoDiario() {
  if (process.env.BACKUP_DIARIO === "false") return;
  const revisar = () => {
    const ultimo = listarRespaldos()[0];
    if (!ultimo || Date.now() - new Date(ultimo.fecha).getTime() > 24 * 3600_000) {
      hacerRespaldo().catch((e) => console.error("[respaldo]", e.message));
    }
  };
  setTimeout(revisar, 60_000).unref();
  setInterval(revisar, 3600_000).unref();
}

export function streamRespaldo(nombre) {
  if (!NOMBRE.test(nombre)) return null;
  const ruta = join(DIR_RESPALDOS, nombre);
  if (!existsSync(ruta)) return null;
  return { stream: createReadStream(ruta), bytes: statSync(ruta).size };
}

export function estadoRespaldos() {
  return { dir: DIR_RESPALDOS, enCurso: !!enCurso, ultimoError, respaldos: listarRespaldos() };
}

/** Espacio libre del disco donde está la app. */
export function disco() {
  try {
    const s = statfsSync(resolve("."));
    return { libre: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    return null;
  }
}
