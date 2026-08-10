import { createServerFn } from "@tanstack/react-start";
import { authSignIn, authSignUp } from "@/lib/server/data";

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
    return authSignUp({ data });
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
    const result = await authSignIn({ data });
    if (!result.session?.token) throw new Error("Usuario o contraseña incorrectos");
    return { access_token: result.session.token, refresh_token: result.session.token };
  });
