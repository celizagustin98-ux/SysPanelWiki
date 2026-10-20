/** Reglas de seguridad compartidas por el backend (contraseñas, PIN, archivos y errores). */

/** Contraseña: 10+ caracteres, con letras y números, y que no contenga el usuario. */
export function validarClave(clave: string, usuario?: string | null) {
  const c = String(clave ?? "");
  if (c.length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres");
  if (c.length > 128) throw new Error("La contraseña es demasiado larga");
  if (!/[a-zA-Z]/.test(c) || !/\d/.test(c)) throw new Error("La contraseña debe combinar letras y números");
  if (/^(.)\1+$/.test(c)) throw new Error("La contraseña no puede repetir un solo carácter");
  const u = String(usuario ?? "").trim().toLowerCase();
  if (u.length >= 3 && c.toLowerCase().includes(u)) throw new Error("La contraseña no puede contener el nombre de usuario");
  const comunes = ["password", "contraseña", "contrasena", "qwerty", "123456", "admin", "nodara", "syswiki"];
  if (comunes.some((x) => c.toLowerCase().includes(x) && c.length < x.length + 6)) throw new Error("La contraseña es demasiado fácil de adivinar");
}

/** PIN de escaneo: 4 a 6 números que no sean triviales (1111, 1234, 4321…). */
export function validarPin(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) throw new Error("El PIN debe tener de 4 a 6 números");
  if (/^(\d)\1+$/.test(pin)) throw new Error("El PIN no puede repetir el mismo número");
  const asc = "01234567890123456789";
  const desc = "98765432109876543210";
  if (asc.includes(pin) || desc.includes(pin)) throw new Error("El PIN no puede ser una secuencia (1234, 4321…)");
}

/** Extensiones que nunca se aceptan como adjunto (pueden ejecutar código en el navegador o en la PC). */
const EXT_BLOQUEADAS = new Set([
  "html", "htm", "xhtml", "shtml", "svg", "svgz", "xml", "xsl", "js", "mjs", "cjs", "jsx", "ts", "tsx", "php", "phtml",
  "jsp", "asp", "aspx", "exe", "msi", "bat", "cmd", "com", "scr", "ps1", "psm1", "vbs", "vbe", "wsf", "hta", "jar",
  "sh", "bash", "dll", "lnk", "reg", "swf", "mht", "mhtml",
]);

export function validarNombreArchivo(path: string) {
  const nombre = String(path ?? "").split(/[\\/]/).pop() ?? "";
  const ext = nombre.includes(".") ? nombre.split(".").pop()!.toLowerCase() : "";
  if (EXT_BLOQUEADAS.has(ext)) throw new Error(`Por seguridad no se aceptan archivos .${ext}`);
  if (/[\0<>:"|?*]/.test(nombre)) throw new Error("Nombre de archivo inválido");
}

/** Traduce errores de PostgreSQL a mensajes sin detalles internos (tablas, columnas, restricciones). */
export function mensajeErrorBase(error: unknown): string | null {
  const code = (error as { code?: string } | null)?.code;
  if (!code || !/^[0-9A-Z]{5}$/.test(code)) return null;
  const mapa: Record<string, string> = {
    "23505": "Ya existe un registro con esos datos",
    "23503": "No se puede completar: está relacionado con otros registros",
    "23502": "Falta un dato obligatorio",
    "23514": "Algún dato no tiene un valor permitido",
    "22P02": "Algún dato tiene un formato inválido",
    "22001": "Algún texto es demasiado largo",
    "22007": "Fecha u hora inválida",
    "22008": "Fecha fuera de rango",
    "42703": "Campo inválido",
    "42P01": "Tabla inválida",
    "40001": "Hubo un conflicto con otro cambio. Volvé a intentar.",
    "57014": "La consulta tardó demasiado",
  };
  return mapa[code] ?? "Error de base de datos";
}
