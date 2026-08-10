import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AppRole = "administrador" | "tecnico" | "consulta";

const ROLES: AppRole[] = ["administrador", "tecnico", "consulta"];

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "administrador",
  });
  if (!isAdmin) throw new Error("Solo un administrador puede gestionar usuarios");
}

export const crearUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, username: data.username },
    });
    if (error || !created.user) throw new Error(error?.message ?? "No se pudo crear el usuario");

    const uid = created.user.id;
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: uid, full_name: data.fullName, email: data.email, username: data.username });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: uid, role: data.role });
    if (rErr) throw new Error(rErr.message);

    return { id: uid, email: data.email, full_name: data.fullName, role: data.role };
  });

export const eliminarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => {
    if (!data?.userId) throw new Error("Usuario inválido");
    return { userId: data.userId };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("No podés eliminar tu propio usuario");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const actualizarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        password: data.password,
      });
      if (error) throw new Error(error.message);
    }
    if (data.fullName) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ full_name: data.fullName })
        .eq("id", data.userId);
      if (error) throw new Error(error.message);
      await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        user_metadata: { full_name: data.fullName },
      });
    }
    return { ok: true };
  });
