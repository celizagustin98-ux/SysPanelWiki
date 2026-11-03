import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DatabaseBackup, Download, HardDrive, Loader2, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { StatTile } from "@/components/StatTile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Salud = {
  disco: { libre: number; total: number } | null;
  baseBytes: number;
  memoria: number;
  uptime: number;
  node: string;
  respaldos: { dir: string; enCurso: boolean; ultimoError: { mensaje: string; fecha: string } | null; respaldos: { nombre: string; bytes: number; fecha: string }[] };
  sesiones: { user_id: string; full_name: string | null; username: string | null; cantidad: number; ultima: string }[];
  yo: string;
};

function bytes(n?: number | null) {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString("es-AR", { maximumFractionDigits: i >= 3 ? 1 : 0 })} ${u[i]}`;
}

function duracion(seg: number) {
  const d = Math.floor(seg / 86400);
  const h = Math.floor((seg % 86400) / 3600);
  return d ? `${d} d ${h} h` : `${h} h ${Math.floor((seg % 3600) / 60)} min`;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const p = await r.json().catch(() => null);
  if (!r.ok) throw new Error(p?.error || "No se pudo completar");
  return p as T;
}

/** Disco, base, respaldos diarios (con descarga) y sesiones abiertas. */
export function SaludSistema() {
  const [haciendo, setHaciendo] = useState(false);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["salud-sistema"],
    queryFn: () => pedir<Salud>("/api/system/salud"),
    refetchInterval: 60_000,
  });

  const respaldar = async () => {
    setHaciendo(true);
    try {
      const r = await pedir<{ nombre: string }>("/api/system/respaldos", { method: "POST", body: "{}" });
      toast.success(`Respaldo creado: ${r.nombre}`);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo hacer el respaldo");
    } finally {
      setHaciendo(false);
    }
  };

  const cerrarSesiones = async (userId: string, nombre: string) => {
    try {
      const r = await pedir<{ cerradas: number }>("/api/system/sesiones/cerrar", { method: "POST", body: JSON.stringify({ userId }) });
      toast.success(`${r.cerradas} ${r.cerradas === 1 ? "sesión cerrada" : "sesiones cerradas"} de ${nombre}`);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cerrar");
    }
  };

  if (isLoading) return <div className="skeleton h-40" />;
  if (!data) return <p className="text-sm text-muted-foreground">No se pudo leer el estado del servidor.</p>;

  const usoDisco = data.disco ? 1 - data.disco.libre / data.disco.total : null;
  const ultimo = data.respaldos.respaldos[0];
  const horasDesdeRespaldo = ultimo ? (Date.now() - new Date(ultimo.fecha).getTime()) / 3600_000 : null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={cn("size-4", isFetching && "animate-spin")} /> Actualizar
        </Button>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Disco libre"
          value={data.disco ? bytes(data.disco.libre) : "—"}
          hint={data.disco ? `de ${bytes(data.disco.total)} (${Math.round((usoDisco ?? 0) * 100)}% usado)` : "no disponible"}
          tone={usoDisco != null && usoDisco > 0.9 ? "crit" : usoDisco != null && usoDisco > 0.8 ? "warn" : "ok"}
        />
        <StatTile label="Base de datos" value={bytes(data.baseBytes)} hint="tamaño actual" />
        <StatTile
          label="Último respaldo"
          value={ultimo ? new Date(ultimo.fecha).toLocaleDateString("es-AR") : "Nunca"}
          hint={ultimo ? `${new Date(ultimo.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} · ${bytes(ultimo.bytes)}` : "hacé uno ahora"}
          tone={horasDesdeRespaldo == null || horasDesdeRespaldo > 48 ? "crit" : horasDesdeRespaldo > 26 ? "warn" : "ok"}
        />
        <StatTile label="Servidor encendido" value={duracion(data.uptime)} hint={`Node ${data.node} · ${bytes(data.memoria)} de memoria`} />
      </div>

      <Card className="panel">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <DatabaseBackup className="size-4 text-primary" /> Respaldos de la base
            </CardTitle>
            <Button size="sm" onClick={() => void respaldar()} disabled={haciendo || data.respaldos.enCurso}>
              {haciendo || data.respaldos.enCurso ? <Loader2 className="animate-spin" /> : <DatabaseBackup />} Hacer respaldo ahora
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Se hace uno automático cada 24 h y quedan los últimos 14 en <code className="font-mono">{data.respaldos.dir}</code>. Descargá uno de vez en cuando y
            guardalo fuera del servidor (junto con la clave de cifrado).
          </p>
          {data.respaldos.ultimoError && (
            <p className="rounded-lg border border-crit/35 bg-crit/8 px-3 py-2 text-sm text-crit">
              El último intento falló ({new Date(data.respaldos.ultimoError.fecha).toLocaleString("es-AR")}): {data.respaldos.ultimoError.mensaje}
            </p>
          )}
          {data.respaldos.respaldos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay respaldos.</p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border">
              {data.respaldos.respaldos.map((r) => (
                <li key={r.nombre} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <HardDrive className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs">{r.nombre}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(r.fecha).toLocaleString("es-AR")} · {bytes(r.bytes)}
                    </span>
                  </span>
                  <Button asChild size="sm" variant="outline" className="h-7">
                    <a href={`/api/system/respaldos/${encodeURIComponent(r.nombre)}`} download>
                      <Download className="size-3.5" /> Descargar
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sesiones abiertas</CardTitle>
        </CardHeader>
        <CardContent>
          {data.sesiones.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay sesiones abiertas.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.sesiones.map((s) => {
                const nombre = s.full_name || s.username || "Usuario";
                const soyYo = s.user_id === data.yo;
                return (
                  <li key={s.user_id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{nombre}</span>
                      {soyYo && <span className="ml-1 text-xs text-muted-foreground">(vos)</span>}
                      <span className="block text-[11px] text-muted-foreground">
                        {s.cantidad} {s.cantidad === 1 ? "sesión" : "sesiones"} · última entrada {new Date(s.ultima).toLocaleString("es-AR")}
                      </span>
                    </span>
                    {(!soyYo || s.cantidad > 1) && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void cerrarSesiones(s.user_id, nombre)}>
                        <LogOut className="size-3.5" /> {soyYo ? "Cerrar las otras" : "Cerrar sesiones"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
