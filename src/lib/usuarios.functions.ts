import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/api/auth-middleware";
import { assertAdmin, hashPassword, query } from "@/lib/server/postgres";

type AppRole = "administrador" | "tecnico" | "consulta";

const ROLES: AppRole[] = ["administrador", "tecnico", "consulta"];

async function auditarUsuario(
  actorId: string,
  accion: "crear" | "editar" | "eliminar" | "asignar_rol",
  userId: string,
  descripcion: string,
  detalle: Record<string, unknown> = {},
) {
  const actor = await query<{ full_name: string; email: string }>(
    `select full_name, email from profiles where id = $1`,
    [actorId],
  );
  await query(
    `insert into audit_log
      (actor_id, actor_nombre, actor_email, modulo, accion, entidad_id, entidad_desc, detalle)
     values ($1, $2, $3, 'usuarios', $4, $5, $6, $7::jsonb)`,
    [
      actorId,
      actor.rows[0]?.full_name ?? "",
      actor.rows[0]?.email ?? "",
      accion,
      userId,
      descripcion,
      JSON.stringify(detalle),
    ],
  );
}

export const crearUsuario = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator(
    (data: { email: string; username: string; password: string; fullName: string; role: AppRole }) => {
    const email = (data?.email ?? "").trim().toLowerCase();
    const username = (data?.username ?? "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username))
      throw new Error("Usuario inválido: 3 a 32 caracteres (letras, números, . _ -)");
    const password = data?.password ?? "";
    const fullName = (data?.fullName ?? "").trim();
    const role = data?.role;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Correo inválido");
    if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
    if (fullName.length < 2 || fullName.length > 120) throw new Error("Nombre inválido");
    if (!ROLES.includes(role)) throw new Error("Rol inválido");
    return { email, username, password, fullName, role };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const created = await query<{ id: string }>(
      `insert into app_users (email, password_hash) values ($1, $2) returning id`,
      [data.email, await hashPassword(data.password)],
    );
    const uid = created.rows[0].id;
    await query(`insert into profiles (id, full_name, email, username) values ($1, $2, $3, $4)`, [
      uid,
      data.fullName,
      data.email,
      data.username,
    ]);
    await query(`insert into user_roles (user_id, role) values ($1, $2)`, [uid, data.role]);
    await auditarUsuario(context.userId, "crear", uid, data.fullName || data.email, {
      email: data.email,
      username: data.username,
      role: data.role,
    });

    return { id: uid, email: data.email, full_name: data.fullName, role: data.role };
  });

export const eliminarUsuario = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: { userId: string }) => {
    if (!data?.userId) throw new Error("Usuario inválido");
    return { userId: data.userId };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("No podés eliminar tu propio usuario");
    const target = await query<{ full_name: string; email: string; username: string | null }>(
      `select full_name, email, username from profiles where id = $1`,
      [data.userId],
    );
    await query(`delete from app_users where id = $1`, [data.userId]);
    await auditarUsuario(
      context.userId,
      "eliminar",
      data.userId,
      target.rows[0]?.full_name || target.rows[0]?.email || data.userId,
      { email: target.rows[0]?.email, username: target.rows[0]?.username },
    );
    return { ok: true };
  });

export const actualizarUsuario = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: { userId: string; fullName?: string; password?: string }) => {
    if (!data?.userId) throw new Error("Usuario inválido");
    const fullName = data.fullName?.trim();
    const password = data.password?.trim();
    if (fullName !== undefined && (fullName.length < 2 || fullName.length > 120))
      throw new Error("Nombre inválido");
    if (password && password.length < 8)
      throw new Error("La contraseña debe tener al menos 8 caracteres");
    return { userId: data.userId, fullName, password };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    if (data.password) {
      await query(`update app_users set password_hash = $1 where id = $2`, [
        await hashPassword(data.password),
        data.userId,
      ]);
    }
    if (data.fullName) {
      await query(`update profiles set full_name = $1 where id = $2`, [data.fullName, data.userId]);
    }
    const target = await query<{ full_name: string; email: string }>(
      `select full_name, email from profiles where id = $1`,
      [data.userId],
    );
    await auditarUsuario(
      context.userId,
      "editar",
      data.userId,
      target.rows[0]?.full_name || target.rows[0]?.email || data.userId,
      {
        campos: [
          ...(data.fullName ? ["fullName"] : []),
          ...(data.password ? ["password"] : []),
        ],
      },
    );
    return { ok: true };
  });
