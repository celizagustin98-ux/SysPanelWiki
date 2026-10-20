import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken } from "@/lib/api/client";
import { olvidarQrDesbloqueo } from "@/lib/qr";

/** Clave del rol: administrador, tecnico, consulta o uno creado en Configuración. */
export type AppRole = string;

export type Modulo =
  | "instructivos"
  | "guardias"
  | "inventario"
  | "toners"
  | "tareas"
  | "credenciales"
  | "oficina"
  | "usuarios"
  | "auditoria"
  | "reportes";

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
  error: string | null;
  retry: () => Promise<void>;
  isAdmin: boolean;
  canWrite: boolean;
  /** Puede crear o editar en el módulo (para mostrar botones de alta/edición). */
  puedeEscribir: (modulo: Modulo) => boolean;
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
  if (
    m.includes("password authentication failed") ||
    m.includes("authentification par mot de passe") ||
    (m.includes("authentication failed") && m.includes("syswiki"))
  ) {
    return "La aplicacion no puede conectar a PostgreSQL (usuario syswiki). Revisá DATABASE_URL en el servidor: la clave del usuario de base no coincide.";
  }
  if (
    m.includes("econnrefused") ||
    m.includes("connection refused") ||
    m.includes("could not connect") ||
    m.includes("connect econnrefused")
  ) {
    return "No hay conexion con PostgreSQL. Verificá que el servicio este activo y que DATABASE_URL apunte al host/puerto correctos.";
  }
  if (m.includes("does not exist") && (m.includes("database") || m.includes("relation") || m.includes("role"))) {
    return "Falta la base o las tablas. En el servidor ejecuta: npm run db:init";
  }
  if (m.includes("invalid login credentials") || m.includes("usuario o contrasena incorrectos"))
    return "Usuario o contraseña incorrectos.";
  if (m.includes("email not confirmed"))
    return "Tu correo todavía no fue confirmado. Revisá tu bandeja de entrada.";
  if (m.includes("known to be weak") || m.includes("pwned"))
    return "Esa contraseña es demasiado común e insegura. Elegí una más fuerte (mayúsculas, números y símbolos).";
  if (m.includes("password should be at least") || m.includes("at least 6") || m.includes("al menos 8"))
    return "La contraseña debe tener al menos 8 caracteres.";
  if (
    m.includes("user already registered") ||
    m.includes("already been registered") ||
    m.includes("ya está registrado") ||
    m.includes("ya esta registrado")
  )
    return "Ese usuario o correo ya está registrado. Ingresá con tu contraseña.";
  if (m.includes("registro público") || m.includes("registro publico") || m.includes("allow_public_signup"))
    return "El registro público está deshabilitado. Pedile a un administrador que cree tu usuario.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Demasiados intentos. Esperá unos minutos y volvé a intentar.";
  if (m.includes("database error") || m.includes("error: 28p01"))
    return "Error de base de datos al crear la cuenta. Revisá DATABASE_URL y que PostgreSQL acepte al usuario syswiki.";
  return msg;
}

const SESSION_CACHE_KEY = "syswiki.session.cache";
const PERMS_CACHE_KEY = "syswiki.perms.cache";

function readCache<T>(key: string): T | null {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Si hay una sesión guardada se pinta al instante y se valida en segundo plano.
  const [session, setSessionState] = useState<Session | null>(() =>
    getToken() ? readCache<Session>(SESSION_CACHE_KEY) : null,
  );
  const [perms, setPerms] = useState<PermRow[]>(() => readCache<PermRow[]>(PERMS_CACHE_KEY) ?? []);
  const [loading, setLoading] = useState(() => !session);
  const [error, setError] = useState<string | null>(null);

  const setSession = useCallback((next: Session | null) => {
    setSessionState(next);
    writeCache(SESSION_CACHE_KEY, next);
    if (!next) {
      setPerms([]);
      writeCache(PERMS_CACHE_KEY, null);
    }
  }, []);

  const loadPerms = useCallback(async () => {
    const { data, error: permsError } = await api
      .from("role_permissions")
      .select("id, role, modulo, can_view, can_create, can_edit, can_delete");
    if (permsError) return;
    setPerms((data ?? []) as PermRow[]);
    writeCache(PERMS_CACHE_KEY, data ?? []);
  }, []);

  const validate = useCallback(async () => {
    setError(null);
    if (!getToken()) {
      setSession(null);
      setLoading(false);
      return;
    }
    const [{ data, error: sessionError }] = await Promise.all([api.auth.getSession(), loadPerms()]);
    if (sessionError) {
      // Falla de red o de base: se mantiene la sesión guardada si existe; si no, se muestra el error.
      if (!readCache<Session>(SESSION_CACHE_KEY)) setError(traducirError(sessionError.message));
    } else {
      setSession((data?.session as Session | null) ?? null);
    }
    setLoading(false);
  }, [loadPerms, setSession]);

  useEffect(() => {
    void validate();
  }, [validate]);

  const profile = session?.profile ?? null;
  const role = session?.role ?? null;

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
    error,
    retry: validate,
    isAdmin,
    canWrite: role === "administrador" || role === "tecnico",
    puedeEscribir: (modulo: Modulo) => can(modulo, "create") || can(modulo, "edit"),
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
        void loadPerms();
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
        if (data.session?.token) {
          setSession(data.session);
          void loadPerms();
        }
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
      olvidarQrDesbloqueo();
      try {
        await api.auth.signOut();
      } finally {
        setSession(null);
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
