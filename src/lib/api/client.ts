import {
  apiMutate,
  apiRpc,
  apiSelect,
  authResetPassword,
  authUpdatePassword,
  storageRemove,
  storageSignedUrl,
  storageUpload,
} from "@/backend/api/data.functions";

const TOKEN_KEY = "syswiki.session";

type Filter = { column: string; op: "eq" | "neq" | "gte" | "lte"; value: unknown };
type Order = { column: string; ascending?: boolean };

function token() {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export const getToken = token;

function setToken(value: string | null) {
  if (typeof localStorage === "undefined") return;
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

function responseError(error: unknown) {
  return { data: null, error: error instanceof Error ? error : new Error("Error de servidor") };
}

async function postAuth<T>(
  path: string,
  body: unknown,
): Promise<{ data: T; error: null } | { data: null; error: Error }> {
  try {
    const response = await fetch(`/api/auth/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return { data: null, error: new Error(payload?.error || "Error de servidor") };
    }
    return { data: payload as T, error: null };
  } catch (error) {
    return responseError(error);
  }
}

async function postApp<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token() ?? ""}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Error de servidor");
  }
  return payload as T;
}

async function getApp<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token() ?? ""}`,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Error de servidor");
  }
  return payload as T;
}

class QueryBuilder {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitValue: number | undefined;
  private singleRow = false;
  private pending:
    | { action: "select"; columns?: string; opts?: { count?: "exact"; head?: boolean } }
    | { action: "insert" | "update" | "delete"; values?: any };

  constructor(private table: string) {}

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    this.pending = { action: "select", columns, opts };
    return this;
  }

  insert(values: any) {
    this.pending = { action: "insert", values };
    return this.execute();
  }

  update(values: any) {
    this.pending = { action: "update", values };
    return this;
  }

  delete() {
    this.pending = { action: "delete" };
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: "eq", value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ column, op: "neq", value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ column, op: "gte", value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ column, op: "lte", value });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: opts?.ascending });
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  maybeSingle() {
    this.singleRow = true;
    return this.execute();
  }

  single() {
    this.singleRow = true;
    return this.execute();
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    try {
      if (!this.pending) throw new Error("Consulta incompleta");
      if (this.pending.action === "select") {
        return await apiSelect({
          data: {
            token: token(),
            table: this.table,
            columns: this.pending.columns,
            filters: this.filters,
            order: this.orders,
            limit: this.limitValue,
            maybeSingle: this.singleRow,
            count: this.pending.opts?.count,
            head: this.pending.opts?.head,
          },
        });
      }
      return await apiMutate({
        data: {
          token: token(),
          table: this.table,
          action: this.pending.action,
          values: this.pending.values,
          filters: this.filters,
        },
      });
    } catch (error) {
      return responseError(error);
    }
  }
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export const api = {
  auth: {
    async getSession() {
      if (!token()) return { data: { session: null }, error: null };
      return postAuth<{ session: any }>("session", { token: token() });
    },
    async setSession(tokens: { access_token: string }) {
      setToken(tokens.access_token);
      return postAuth<{ session: any }>("session", { token: tokens.access_token });
    },
    async signInWithPassword(input: { username: string; password: string }) {
      const result = await postAuth<{ session: any }>("signin", input);
      if (!result.error) setToken(result.data.session?.token ?? null);
      return result;
    },
    async signUp(input: { fullName: string; username: string; email: string; password: string }) {
      const result = await postAuth<{ session: any }>("signup", input);
      if (!result.error) setToken(result.data.session?.token ?? null);
      return result;
    },
    async resetPasswordForEmail(email: string) {
      try {
        return { data: await authResetPassword({ data: { email } }), error: null };
      } catch (error) {
        return responseError(error);
      }
    },
    async exchangeCodeForSession() {
      return responseError(new Error("El restablecimiento por correo requiere configurar SMTP."));
    },
    async verifyOtp() {
      return responseError(new Error("El restablecimiento por correo requiere configurar SMTP."));
    },
    async updateUser(input: { password: string }) {
      try {
        return {
          data: await authUpdatePassword({ data: { token: token(), password: input.password } }),
          error: null,
        };
      } catch (error) {
        return responseError(error);
      }
    },
    async signOut() {
      const currentToken = token();
      setToken(null);
      if (!currentToken) return { data: { ok: true }, error: null };

      const result = await postAuth("signout", { token: currentToken });
      if (result.error) {
        console.warn("No se pudo cerrar la sesion en el servidor", result.error);
      }
      return result;
    },
  },
  from(table: string) {
    return new QueryBuilder(table);
  },
  async rpc(name: string, args?: Record<string, any>) {
    try {
      return await apiRpc({ data: { token: token(), name, args } });
    } catch (error) {
      return responseError(error);
    }
  },
  updates: {
    check<T>() {
      return postApp<T>("/api/updates/check", {});
    },
    apply<T>(version: string) {
      return postApp<T>("/api/updates/apply", { version });
    },
  },
  system: {
    async health() {
      const response = await fetch("/api/system/health", { cache: "no-store" });
      if (!response.ok) throw new Error("Servidor sin respuesta");
      return (await response.json()) as {
        ok: boolean;
        maintenance: boolean;
        version?: string;
        database?: boolean;
        setupRequired?: boolean;
        signupEnabled?: boolean;
      };
    },
    info<T>() {
      return getApp<T>("/api/system/info");
    },
  },
  instructivos: {
    pdfUrl(attachmentId: string) {
      return `/api/instructivos/pdf/${encodeURIComponent(attachmentId)}`;
    },
    async pdfBlobUrl(attachmentId: string) {
      const response = await fetch(api.instructivos.pdfUrl(attachmentId), {
        headers: { authorization: `Bearer ${token() ?? ""}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "No se pudo abrir el PDF");
      }
      return URL.createObjectURL(await response.blob());
    },
  },
  storage: {
    from(bucket: string) {
      return {
        async upload(path: string, file: File) {
          try {
            return await storageUpload({
              data: { token: token(), bucket, path, base64: await fileToBase64(file) },
            });
          } catch (error) {
            return responseError(error);
          }
        },
        async createSignedUrl(path: string) {
          try {
            return await storageSignedUrl({ data: { token: token(), bucket, path } });
          } catch (error) {
            return responseError(error);
          }
        },
        async remove(paths: string | string[]) {
          try {
            const items = Array.isArray(paths) ? paths : [paths];
            for (const path of items) {
              const { error } = await storageRemove({ data: { token: token(), bucket, path } });
              if (error) return { data: null, error };
            }
            return { data: null, error: null };
          } catch (error) {
            return responseError(error);
          }
        },
      };
    },
  },
};
