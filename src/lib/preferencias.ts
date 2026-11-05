import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

/** Lo que cada usuario personaliza (se guarda en su perfil, sirve en cualquier equipo). */
export type Preferencias = {
  /** Internos marcados con estrella en Oficina → Teléfonos. */
  telefonos_favoritos?: string[];
  /** Accesos rápidos elegidos para el Dashboard. */
  accesos?: string[];
};

export function usePreferencias() {
  const qc = useQueryClient();
  const { data = {}, isLoading } = useQuery({
    queryKey: ["mis_preferencias"],
    staleTime: 5 * 60_000,
    queryFn: async () => ((await api.rpc("mis_preferencias")).data ?? {}) as Preferencias,
  });
  const guardar = async (cambios: Partial<Preferencias>) => {
    // Se actualiza al instante en pantalla y después se confirma con el servidor.
    qc.setQueryData<Preferencias>(["mis_preferencias"], (p) => ({ ...(p ?? {}), ...cambios }));
    const r = await api.rpc("guardar_preferencias", { _preferencias: cambios });
    if (r.error) void qc.invalidateQueries({ queryKey: ["mis_preferencias"] });
    return r;
  };
  return { prefs: data, isLoading, guardar };
}
