import { useQuery } from "@tanstack/react-query";
import { setFeriados } from "@/components/guardias/domain";
import { api } from "@/lib/api/client";

export type Feriado = { fecha: string; nombre: string };

/** Carga los feriados de la base y los aplica al cálculo de guardias. */
export function useFeriados() {
  return useQuery({
    queryKey: ["feriados"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await api.from("feriados").select("fecha, nombre").order("fecha");
      if (error) throw error;
      const lista = ((data ?? []) as Feriado[]).map((f) => ({ ...f, fecha: String(f.fecha).slice(0, 10) }));
      setFeriados(lista.map((f) => f.fecha));
      return lista;
    },
  });
}
