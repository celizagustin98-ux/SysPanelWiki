import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/backend/core/auth-middleware";
import { assertAdmin, hashPassword, invalidateAuthCache, query } from "@/backend/core/db";
import { validarClave } from "@/backend/core/seguridad";

type AppRole = string;

async function rolExiste(role: string) {
  const r = await query(`select 1 from roles where clave = $1`, [role]).catch(() => null);
  return r ? (r.rowCount ?? 0) > 0 : ["administrador", "tecnico", "consulta"].includes(role);
}

async function auditarUsuario(
  actorId: string,
  accion: "crear" | "editar" | "eliminar" | "asignar_rol" | "suspender" | "reactivar" | "cerrar_sesiones",
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
  .validator(
    (data: {
      email: string;
      username: string;
      password: string;
      fullName: string;
      role: AppRole;
    }) => {
      const email = (data?.email ?? "").trim().toLowerCase();
      const username = (data?.username ?? "").trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,32}$/.test(username))
        throw new Error("Usuario inválido: 3 a 32 caracteres (letras, números, . _ -)");
      const password = data?.password ?? "";
      const fullName = (data?.fullName ?? "").trim();
      const role = data?.role;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Correo inválido");
      validarClave(password, username);
      if (fullName.length < 2 || fullName.length > 120) throw new Error("Nombre inválido");
      if (!role) throw new Error("Rol inválido");
      return { email, username, password, fullName, role };
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (!(await rolExiste(data.role))) throw new Error("Rol inválido");
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
  .validator((data: { userId: string }) => {
    if (!data?.userId) throw new Error("Usuario inválido");
    return { userId: data.userId };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("No podés eliminar tu propio usuario");
    await assertQuedaAdmin(data.userId);
    const target = await query<{ full_name: string; email: string; username: string | null }>(
      `select full_name, email, username from profiles where id = $1`,
      [data.userId],
    );
    await query(`delete from app_users where id = $1`, [data.userId]);
    invalidateAuthCache(data.userId);
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
  .validator(
    (data: { userId: string; fullName?: string; password?: string; email?: string; username?: string; cargo?: string | null }) => {
      if (!data?.userId) throw new Error("Usuario inválido");
      const fullName = data.fullName?.trim();
      const password = data.password?.trim();
      const email = data.email?.trim().toLowerCase();
      const username = data.username?.trim().toLowerCase();
      const cargo = data.cargo === undefined ? undefined : (data.cargo ?? "").trim().slice(0, 80) || null;
      if (fullName !== undefined && (fullName.length < 2 || fullName.length > 120))
        throw new Error("Nombre inválido");
      if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Correo inválido");
      if (username !== undefined && !/^[a-z0-9._-]{3,32}$/.test(username))
        throw new Error("Usuario inválido: 3 a 32 caracteres (letras, números, . _ -)");
      if (password) validarClave(password, username);
      return { userId: data.userId, fullName, password, email, username, cargo };
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    if (data.password) {
      await query(`update app_users set password_hash = $1 where id = $2`, [
        await hashPassword(data.password),
        data.userId,
      ]);
      // Contraseña restablecida: se cierran todas sus sesiones abiertas.
      await query(`delete from app_sessions where user_id = $1`, [data.userId]);
      invalidateAuthCache(data.userId);
    }
    if (data.fullName) {
      await query(`update profiles set full_name = $1 where id = $2`, [data.fullName, data.userId]);
    }
    if (data.email) {
      if ((await query(`select 1 from app_users where lower(email) = $1 and id <> $2`, [data.email, data.userId])).rowCount)
        throw new Error("Ese correo ya lo usa otro usuario");
      await query(`update app_users set email = $1, updated_at = now() where id = $2`, [data.email, data.userId]);
      await query(`update profiles set email = $1 where id = $2`, [data.email, data.userId]);
    }
    if (data.username) {
      if ((await query(`select 1 from profiles where lower(username) = $1 and id <> $2`, [data.username, data.userId])).rowCount)
        throw new Error("Ese nombre de usuario ya existe");
      await query(`update profiles set username = $1 where id = $2`, [data.username, data.userId]);
    }
    if (data.cargo !== undefined) {
      await query(`update profiles set cargo = $1 where id = $2`, [data.cargo, data.userId]);
    }
    invalidateAuthCache(data.userId);
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
          ...(data.email ? ["email"] : []),
          ...(data.username ? ["username"] : []),
          ...(data.cargo !== undefined ? ["cargo"] : []),
          ...(data.password ? ["password"] : []),
        ],
      },
    );
    return { ok: true };
  });

/** Debe quedar al menos un administrador activo. */
async function assertQuedaAdmin(userId: string) {
  const r = await query<{ es: boolean; otros: number }>(
    `select exists(select 1 from user_roles where user_id = $1 and role = 'administrador') as es,
            (select count(*)::int from user_roles ur join app_users u on u.id = ur.user_id
              where ur.role = 'administrador' and u.activo and ur.user_id <> $1) as otros`,
    [userId],
  );
  if (r.rows[0]?.es && !r.rows[0].otros) throw new Error("Debe quedar al menos un administrador activo");
}

export type UsuarioAdmin = {
  id: string;
  full_name: string;
  email: string;
  username: string | null;
  avatar_url: string | null;
  cargo: string | null;
  role: string;
  activo: boolean;
  suspendido_at: string | null;
  suspendido_motivo: string | null;
  ultimo_acceso: string | null;
  created_at: string;
  sesiones: number;
};

/** Listado completo para Configuración → Usuarios. */
export const usuariosListar = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }): Promise<UsuarioAdmin[]> => {
    await assertAdmin(context.userId);
    const r = await query<UsuarioAdmin>(
      `select p.id, p.full_name, coalesce(u.email, p.email) as email, p.username, p.avatar_url, p.cargo,
              coalesce(ur.role::text, 'consulta') as role, u.activo, u.suspendido_at, u.suspendido_motivo,
              u.ultimo_acceso, u.created_at,
              (select count(*)::int from app_sessions s where s.user_id = u.id and s.expires_at > now()) as sesiones
         from profiles p
         join app_users u on u.id = p.id
         left join lateral (
           select role from user_roles where user_id = u.id
           order by case role when 'administrador' then 1 when 'tecnico' then 2 else 3 end limit 1
         ) ur on true
        order by p.full_name`,
    );
    return r.rows;
  });

/** Suspende o reactiva una cuenta. Al suspender se cierran todas sus sesiones. */
export const usuarioEstado = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { userId: string; activo: boolean; motivo?: string }) => {
    if (!data?.userId) throw new Error("Usuario inválido");
    return { userId: data.userId, activo: !!data.activo, motivo: (data.motivo ?? "").trim().slice(0, 200) || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (!data.activo) {
      if (data.userId === context.userId) throw new Error("No podés suspender tu propia cuenta");
      await assertQuedaAdmin(data.userId);
    }
    await query(
      `update app_users set activo = $2, suspendido_at = case when $2 then null else now() end,
              suspendido_motivo = case when $2 then null else $3::text end, updated_at = now()
        where id = $1`,
      [data.userId, data.activo, data.motivo],
    );
    if (!data.activo) await query(`delete from app_sessions where user_id = $1`, [data.userId]);
    invalidateAuthCache(data.userId);
    const t = await query<{ full_name: string; email: string }>(`select full_name, email from profiles where id = $1`, [data.userId]);
    await auditarUsuario(
      context.userId,
      data.activo ? "reactivar" : "suspender",
      data.userId,
      t.rows[0]?.full_name || t.rows[0]?.email || data.userId,
      data.motivo ? { motivo: data.motivo } : {},
    );
    return { ok: true };
  });

/** Cierra todas las sesiones abiertas de un usuario (tiene que volver a ingresar). */
export const usuarioCerrarSesiones = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { userId: string }) => {
    if (!data?.userId) throw new Error("Usuario inválido");
    return { userId: data.userId };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("Para cerrar tus sesiones usá Mi perfil");
    const r = await query(`delete from app_sessions where user_id = $1`, [data.userId]);
    invalidateAuthCache(data.userId);
    const t = await query<{ full_name: string; email: string }>(`select full_name, email from profiles where id = $1`, [data.userId]);
    await auditarUsuario(context.userId, "cerrar_sesiones", data.userId, t.rows[0]?.full_name || t.rows[0]?.email || data.userId, {
      sesiones: r.rowCount ?? 0,
    });
    return { cerradas: r.rowCount ?? 0 };
  });

export type ActividadUsuario = {
  id: string;
  modulo: string;
  accion: string;
  entidad_desc: string | null;
  actor_nombre: string | null;
  propia: boolean;
  created_at: string;
};

/** Últimos movimientos de un usuario: lo que hizo y lo que le hicieron a su cuenta. */
export const usuarioActividad = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { userId: string }) => {
    if (!data?.userId) throw new Error("Usuario inválido");
    return { userId: data.userId };
  })
  .handler(async ({ data, context }): Promise<ActividadUsuario[]> => {
    await assertAdmin(context.userId);
    const r = await query<ActividadUsuario>(
      `select id, modulo, accion, entidad_desc, actor_nombre, (actor_id = $1) as propia, created_at
         from audit_log
        where actor_id = $1 or (entidad_id = $1::text and modulo in ('usuarios', 'user_roles'))
        order by created_at desc
        limit 50`,
      [data.userId],
    );
    return r.rows;
  });
