import { createServerFn } from "@tanstack/react-start";

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existente } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", data.username)
      .maybeSingle();
    if (existente) throw new Error("Ese nombre de usuario ya está en uso");

    const { data: correoUsado } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();
    if (correoUsado) throw new Error("Ese correo ya está registrado");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, username: data.username },
    });
    if (error || !created.user) {
      const m = (error?.message ?? "").toLowerCase();
      if (m.includes("already") || m.includes("registered"))
        throw new Error("Ese correo ya está registrado");
      if (m.includes("weak") || m.includes("pwned"))
        throw new Error("Esa contraseña es demasiado común. Elegí una más segura.");
      throw new Error(error?.message ?? "No se pudo crear la cuenta");
    }

    await supabaseAdmin
      .from("profiles")
      .update({ username: data.username, full_name: data.fullName })
      .eq("id", created.user.id);

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: perfil } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("username", data.username)
      .maybeSingle();

    const email = perfil?.email ?? "";
    if (!email) throw new Error("Usuario o contraseña incorrectos");

    const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]!;
    const apikey =
      process.env["SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ email, password: data.password }),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      const msg = String(json?.error_description ?? json?.msg ?? "").toLowerCase();
      if (msg.includes("rate") || res.status === 429)
        throw new Error("Demasiados intentos. Esperá unos minutos.");
      throw new Error("Usuario o contraseña incorrectos");
    }
    return { access_token: json.access_token as string, refresh_token: json.refresh_token as string };
  });
