/** Contraseña aleatoria fuerte (sin caracteres que se confunden: 0/O, 1/l/I). */
export function generarClave(largo = 20) {
  const grupos = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%*-_=+?"];
  const todos = grupos.join("");
  const azar = (n: number) => {
    const buf = new Uint32Array(1);
    // Descarta valores sesgados para que cada carácter tenga la misma probabilidad.
    const limite = Math.floor(0x100000000 / n) * n;
    do crypto.getRandomValues(buf);
    while (buf[0] >= limite);
    return buf[0] % n;
  };
  // Al menos uno de cada grupo, el resto de cualquiera, y después se mezcla.
  const chars = grupos.map((g) => g[azar(g.length)]);
  while (chars.length < largo) chars.push(todos[azar(todos.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = azar(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Clave débil: corta o con poca variedad de caracteres. */
export function claveDebil(clave: string) {
  if (clave.length < 10) return true;
  const tipos = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(clave)).length;
  return tipos < 3 || /^(.)\1+$/.test(clave);
}
