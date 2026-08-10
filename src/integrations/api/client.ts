import {
  apiMutate,
  apiRpc,
  apiSelect,
  authGetSession,
  authResetPassword,
  authSignIn,
  authSignOut,
  authSignUp,
  authUpdatePassword,
  storageSignedUrl,
  storageUpload,
} from "@/lib/server/data";

const TOKEN_KEY = "syswiki.session";

type Filter = { column: string; op: "eq" | "neq" | "gte" | "lte"; value: unknown };
type Order = { column: string; ascending?: boolean };

function token() {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(value: string | null) {
  if (typeof localStorage === "undefined") return;
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

function responseError(error: unknown) {
  return { data: null, error: error instanceof Error ? error : new Error("Error de servidor") };
}

class QueryBuilder {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitValue: number | undefined;
  private single = false;
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
    this.single = true;
    return this.execute();
  }

  single() {
    this.single = true;
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
            maybeSingle: this.single,
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
    onAuthStateChange(callback: (_event: string, session: any) => void) {
      void api.auth.getSession().then(({ data }) => callback("INITIAL_SESSION", data.session));
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async getSession() {
      const data = await authGetSession({ data: { token: token() } });
      return { data, error: null };
    },
    async setSession(tokens: { access_token: string }) {
      setToken(tokens.access_token);
      return { data: await authGetSession({ data: { token: tokens.access_token } }), error: null };
    },
    async signInWithPassword(input: { username: string; password: string }) {
      const data = await authSignIn({ data: input });
      setToken(data.session?.token ?? null);
      return { data, error: null };
    },
    async signUp(input: { fullName: string; username: string; email: string; password: string }) {
      return { data: await authSignUp({ data: input }), error: null };
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
        return { data: await authUpdatePassword({ data: { token: token(), password: input.password } }), error: null };
      } catch (error) {
        return responseError(error);
      }
    },
    async signOut() {
      await authSignOut({ data: { token: token() } });
      setToken(null);
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
      };
    },
  },
};
