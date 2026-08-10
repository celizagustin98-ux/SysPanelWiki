import { createServerFn } from "@tanstack/react-start";
import {
  createSession,
  getSession,
  hashPassword,
  one,
  query,
  verifyPassword,
} from "@/lib/server/postgres";

const USER_RE = /^[a-z0-9._-]{3,32}$/;

function normalizarUsuario(v: string) {
  return (v ?? "").trim().toLowerCase();
}

/** Registro público: nombre y apellido, usuario, correo y contraseña. */
export const registrarCuenta = createServerFn({ method: "POST" })
  .inputValidator((data: { fullName: string; username: string; email: string; password: string }) => {
    const fullName = (data?.fullName ?? "").trim();
    const username = normalizarUsuario(data?.username ?? "");
    const email = (data?.email ?? "").trim().toLowerCase();
    const password = data?.password ?? "";
    if (fullName.length < 2 || fullName.length > 120) throw new Error("Ingresá tu nombre y apellido");
    if (!USER_RE.test(username))
      throw new Error(
        "El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo",
      );
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Correo inválido");
    if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
    return { fullName, username, email, password };
  })
  .handler(async ({ data }) => {
    const existe = await one<{ id: string }>(
      `select id from app_users where email = $1
       union
       select id from profiles where username = $2`,
      [data.email, data.username],
    );
    if (existe) throw new Error("Ese usuario o correo ya está registrado");

    const created = await query<{ id: string }>(
      `insert into app_users (email, password_hash) values ($1, $2) returning id`,
      [data.email, await hashPassword(data.password)],
    );
    const userId = created.rows[0].id;

    await query(`insert into profiles (id, full_name, email, username) values ($1, $2, $3, $4)`, [
      userId,
      data.fullName,
      data.email,
      data.username,
    ]);

    const first = await one<{ count: string }>(`select count(*)::text as count from app_users`);
    await query(`insert into user_roles (user_id, role) values ($1, $2)`, [
      userId,
      Number(first?.count ?? 0) <= 1 ? "administrador" : "consulta",
    ]);

    return { ok: true };
  });

/** Ingreso con nombre de usuario: resuelve el correo en el servidor (nunca se expone al cliente). */
export const ingresarConUsuario = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => {
    const username = normalizarUsuario(data?.username ?? "");
    const password = data?.password ?? "";
    if (!username || !password) throw new Error("Usuario y contraseña son obligatorios");
    return { username, password };
  })
  .handler(async ({ data }) => {
    const user = await one<{ id: string; password_hash: string }>(
      `select u.id, u.password_hash
         from app_users u
         join profiles p on p.id = u.id
        where p.username = $1 or u.email = $1`,
      [data.username],
    );

    if (!user || !(await verifyPassword(data.password, user.password_hash))) {
      throw new Error("Usuario o contraseña incorrectos");
    }

    const token = await createSession(user.id);
    const session = await getSession(token);
    if (!session) throw new Error("No se pudo iniciar sesión");
    return { session };
  });
