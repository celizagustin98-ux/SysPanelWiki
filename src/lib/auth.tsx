import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/integrations/api/client";

export type AppRole = "administrador" | "tecnico" | "consulta";

export type Modulo =
  | "instructivos"
  | "guardias"
  | "inventario"
  | "toners"
  | "tareas"
  | "credenciales"
  | "usuarios";

export type Accion = "view" | "create" | "edit" | "delete";

export type PermRow = {
  id: string;
  role: AppRole;
  modulo: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

type Profile = { id: string; full_name: string; email: string; username: string | null };
type User = { id: string; email: string };
type Session = { token: string; user: User; profile: Profile; role: AppRole };

type AuthCtx = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  perms: PermRow[];
  loading: boolean;
  isAdmin: boolean;
  canWrite: boolean;
  can: (modulo: Modulo, accion: Accion) => boolean;
  refreshPerms: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    fullName: string,
    username: string,
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;

  signOut: () => Promise<void>;
};


const Ctx = createContext<AuthCtx | null>(null);

function traducirError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Correo o contraseña incorrectos. Si nunca definiste la contraseña, usá «¿Olvidaste tu contraseña?».";
  if (m.includes("email not confirmed"))
    return "Tu correo todavía no fue confirmado. Revisá tu bandeja de entrada.";
  if (m.includes("known to be weak") || m.includes("pwned"))
    return "Esa contraseña es demasiado común e insegura. Elegí una más fuerte (mayúsculas, números y símbolos).";
  if (m.includes("password should be at least") || m.includes("at least 6"))
    return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "Ese correo ya está registrado. Ingresá con tu contraseña o restablecela.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Demasiados intentos. Esperá unos minutos y volvé a intentar.";
  if (m.includes("database error"))
    return "Error del servidor al crear la cuenta. Volvé a intentar en unos segundos.";
  return msg;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [perms, setPerms] = useState<PermRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = api.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setProfile(null);
        setRole(null);
        setPerms([]);
      }
    });
    api.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadPerms = useCallback(async () => {
    const { data } = await api
      .from("role_permissions")
      .select("id, role, modulo, can_view, can_create, can_edit, can_delete");
    setPerms((data ?? []) as PermRow[]);
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    let active = true;
    (async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        api
          .from("profiles")
          .select("id, full_name, email, username")
          .eq("id", uid)
          .maybeSingle(),

        api.from("user_roles").select("role").eq("user_id", uid),
      ]);
      if (!active) return;
      setProfile((p as Profile) ?? null);
      const roles = (r ?? []).map((x) => x.role as AppRole);
      setRole(
        roles.includes("administrador")
          ? "administrador"
          : roles.includes("tecnico")
            ? "tecnico"
            : "consulta",
      );
      await loadPerms();
    })();
    return () => {
      active = false;
    };
  }, [session?.user?.id, loadPerms]);

  const isAdmin = role === "administrador";

  const can = useCallback(
    (modulo: Modulo, accion: Accion) => {
      if (isAdmin) return true;
      if (!role) return false;
      const row = perms.find((p) => p.role === role && p.modulo === modulo);
      if (!row) return false;
      return accion === "view"
        ? row.can_view
        : accion === "create"
          ? row.can_create
          : accion === "edit"
            ? row.can_edit
            : row.can_delete;
    },
    [perms, role, isAdmin],
  );

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    profile,
    role,
    perms,
    loading,
    isAdmin,
    canWrite: role === "administrador" || role === "tecnico",
    can,
    refreshPerms: loadPerms,
    async signIn(username, password) {
      try {
        const { data, error } = await api.auth.signInWithPassword({
          username: username.trim().toLowerCase(),
          password,
        });
        if (error) return { error: traducirError(error.message) };
        if (!data.session?.token) return { error: "Usuario o contraseña incorrectos" };
        setSession(data.session);
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? traducirError(e.message) : "No se pudo ingresar" };
      }
    },
    async signUp(fullName, username, email, password) {
      try {
        const { data, error } = await api.auth.signUp({
          fullName,
          username: username.trim().toLowerCase(),
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) return { error: traducirError(error.message) };
        if (data.session?.token) setSession(data.session);
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? traducirError(e.message) : "No se pudo crear la cuenta" };
      }
    },
    async resetPassword(email) {
      const { error } = await api.auth.resetPasswordForEmail(email.trim().toLowerCase());
      return { error: error ? traducirError(error.message) : null };
    },

    async signOut() {
      try {
        await api.auth.signOut();
      } finally {
        setSession(null);
        setProfile(null);
        setRole(null);
        setPerms([]);
      }
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
