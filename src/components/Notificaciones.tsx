import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, BellRing, BookOpen, Boxes, CheckCheck, MessageSquare, Printer, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Notif = { id: string; tipo: string; titulo: string; cuerpo: string | null; link: string | null; leida: boolean; actor_nombre: string | null; created_at: string };
type Alerta = { id: string; tipo: string; tono: "crit" | "warn" | "info"; titulo: string; cuerpo: string; link: string };
type Respuesta = { items: Notif[]; no_leidas: number; alertas: Alerta[] };

const ICONO: Record<string, typeof Bell> = {
  ticket: Ticket,
  comentario: MessageSquare,
  toner: Printer,
  activo: Boxes,
  doc: BookOpen,
};

function hace(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export function Notificaciones({ className }: { className?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"mias" | "area">("mias");
  const [sonando, setSonando] = useState(false);
  const vistos = useRef<Set<string> | null>(null);
  const [permiso, setPermiso] = useState<NotificationPermission | "no">(() =>
    typeof Notification === "undefined" ? "no" : Notification.permission,
  );

  const { data } = useQuery({
    queryKey: ["notificaciones"],
    queryFn: async () => {
      const { data, error } = (await api.rpc("notificaciones")) as { data: Respuesta | null; error: Error | null };
      if (error) throw error;
      return data ?? { items: [], no_leidas: 0, alertas: [] };
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const items = data?.items ?? [];
  const alertas = data?.alertas ?? [];
  const noLeidas = data?.no_leidas ?? 0;
  const urgentes = alertas.filter((a) => a.tono === "crit").length;

  // Avisos nuevos: campana animada y, si se habilitó, notificación del escritorio.
  useEffect(() => {
    if (!data) return;
    if (!vistos.current) {
      vistos.current = new Set(items.map((n) => n.id));
      return;
    }
    const nuevas = items.filter((n) => !n.leida && !vistos.current!.has(n.id));
    nuevas.forEach((n) => vistos.current!.add(n.id));
    if (!nuevas.length) return;
    setSonando(true);
    if (permiso === "granted" && document.visibilityState !== "visible") {
      for (const n of nuevas.slice(0, 3)) {
        try {
          new Notification(n.titulo, { body: n.cuerpo ?? undefined, tag: n.id, icon: "/favicon.svg" });
        } catch {
          /* el navegador no lo permite */
        }
      }
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const marcar = async (ids?: string[]) => {
    await api.rpc("marcar_notificaciones", ids ? { _ids: ids } : {});
    await qc.invalidateQueries({ queryKey: ["notificaciones"] });
  };

  const abrir = async (link: string | null, id?: string) => {
    setOpen(false);
    if (id) void marcar([id]);
    if (link) await navigate({ to: link });
  };

  const total = noLeidas;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setTab(noLeidas || !alertas.length ? "mias" : "area");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notificaciones${total ? `: ${total} sin leer` : ""}`}
          onAnimationEnd={() => setSonando(false)}
          className={cn(
            "relative grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            className,
          )}
        >
          {total ? <BellRing className={cn("size-[18px]", sonando && "bell-ring")} /> : <Bell className="size-[18px]" />}
          {total > 0 ? (
            <span className="num absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-crit px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-background pop-in">
              {total > 9 ? "9+" : total}
            </span>
          ) : urgentes > 0 ? (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-warn ring-2 ring-background" />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notificaciones</p>
          {noLeidas > 0 && (
            <button type="button" onClick={() => void marcar()} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <CheckCheck className="size-3.5" /> Marcar todo leído
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1 border-b border-border p-1.5">
          {(
            [
              ["mias", `Para vos${noLeidas ? ` · ${noLeidas}` : ""}`],
              ["area", `Área${alertas.length ? ` · ${alertas.length}` : ""}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn("rounded-md py-1.5 text-xs font-medium transition-colors", tab === k ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto">
          {tab === "mias" ? (
            items.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">Sin notificaciones. Te avisamos cuando te asignen un ticket o te comenten.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {items.map((n) => {
                  const Icono = ICONO[n.tipo] ?? Bell;
                  return (
                    <li key={n.id}>
                      <button type="button" onClick={() => void abrir(n.link, n.id)} className={cn("flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40", !n.leida && "bg-primary/[0.04]")}>
                        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", n.leida ? "bg-muted text-muted-foreground" : "bg-primary/12 text-primary")}>
                          <Icono className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={cn("truncate text-[13px]", !n.leida && "font-semibold")}>{n.titulo}</span>
                            {!n.leida && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                          </span>
                          {n.cuerpo && <span className="line-clamp-2 text-xs text-muted-foreground">{n.cuerpo}</span>}
                          <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                            {hace(n.created_at)}
                            {n.actor_nombre ? ` · ${n.actor_nombre}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : alertas.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">Todo en orden en el área.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {alertas.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => void abrir(a.link)} className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40">
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg",
                        a.tono === "crit" ? "bg-crit/12 text-crit" : a.tono === "warn" ? "bg-warn/14 text-[color-mix(in_oklab,var(--warn),var(--foreground)_25%)]" : "bg-info/12 text-info",
                      )}
                    >
                      <AlertTriangle className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{a.titulo}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{a.cuerpo}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {permiso === "default" && (
          <div className="border-t border-border p-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={async () => {
                const r = await Notification.requestPermission();
                setPermiso(r);
              }}
            >
              <BellRing /> Activar avisos de escritorio
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
