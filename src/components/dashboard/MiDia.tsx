import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  BookOpen,
  Boxes,
  CalendarClock,
  ClipboardPlus,
  Download,
  GitBranch,
  KeyRound,
  Moon,
  Phone,
  Printer,
  ScanLine,
  Settings2,
  ShoppingCart,
  Ticket,
  Timer,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api/client";
import { useAuth, type Modulo } from "@/lib/auth";
import { usePreferencias } from "@/lib/preferencias";
import { useInstalarApp } from "@/lib/pwa";
import { cn } from "@/lib/utils";

type MiDiaData = {
  tickets?: { abiertos: number; vencen_hoy: number; vencidos: number; urgentes: number } | null;
  guardia_hoy?: string | null;
  mi_proxima?: string | null;
  pedidos?: number;
  versiones_pendientes?: number;
};

const dia = (f: string) => {
  const d = new Date(`${f}T00:00:00`);
  const hoy = new Date();
  const man = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
  if (d.toDateString() === hoy.toDateString()) return "hoy";
  if (d.toDateString() === man.toDateString()) return "mañana";
  return d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "numeric" });
};

/** Lo de cada uno en una franja: mis tickets, la guardia, mis pedidos y lo que está esperando. */
export function MiDia() {
  const { profile } = useAuth();
  const { puede, instalar } = useInstalarApp();
  const { data } = useQuery({
    queryKey: ["mi_dia"],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => ((await api.rpc("mi_dia")).data ?? {}) as MiDiaData,
  });
  if (!data) return null;
  const yo = (profile?.full_name ?? "").trim().toLowerCase();
  const deGuardiaHoy = !!data.guardia_hoy && data.guardia_hoy.trim().toLowerCase() === yo;
  const items: { to: string; search?: Record<string, string>; icon: LucideIcon; texto: string; tono?: "crit" | "warn" | "ok" }[] = [];
  if (data.tickets) {
    const t = data.tickets;
    items.push({
      to: "/tareas",
      icon: Ticket,
      texto: t.abiertos ? `${t.abiertos} ticket${t.abiertos === 1 ? "" : "s"} tuyo${t.abiertos === 1 ? "" : "s"}${t.vencidos ? ` · ${t.vencidos} vencido${t.vencidos === 1 ? "" : "s"}` : t.vencen_hoy ? ` · ${t.vencen_hoy} vence${t.vencen_hoy === 1 ? "" : "n"} hoy` : ""}` : "Sin tickets asignados",
      tono: t.vencidos ? "crit" : t.vencen_hoy || t.urgentes ? "warn" : "ok",
    });
  }
  if (deGuardiaHoy) items.push({ to: "/guardias", icon: Moon, texto: "Esta noche estás de guardia", tono: "warn" });
  else if (data.guardia_hoy) items.push({ to: "/guardias", icon: Moon, texto: `Guardia de hoy: ${data.guardia_hoy}` });
  if (data.mi_proxima && !deGuardiaHoy) items.push({ to: "/guardias", icon: CalendarClock, texto: `Tu próxima guardia: ${dia(data.mi_proxima)}` });
  if (data.pedidos) items.push({ to: "/oficina", search: { tab: "insumos" }, icon: ShoppingCart, texto: `${data.pedidos} pedido${data.pedidos === 1 ? "" : "s"} tuyo${data.pedidos === 1 ? "" : "s"} en curso` });
  if (data.versiones_pendientes)
    items.push({ to: "/oficina", search: { tab: "actualizaciones" }, icon: GitBranch, texto: `${data.versiones_pendientes} versión${data.versiones_pendientes === 1 ? "" : "es"} para subir`, tono: "warn" });
  if (!items.length && !puede) return null;

  return (
    <div className="panel flex flex-wrap items-center gap-2 px-3 py-2.5">
      <p className="eyebrow mr-1">Mi día</p>
      {items.map((it) => (
        <Link
          key={it.texto}
          to={it.to}
          search={it.search as never}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors hover:border-primary/50 hover:bg-primary/8",
            it.tono === "crit" ? "border-crit/40 text-crit" : it.tono === "warn" ? "border-warn/45 text-[color-mix(in_oklab,var(--warn),var(--foreground)_25%)]" : "border-border text-foreground",
          )}
        >
          <it.icon className="size-3.5" />
          {it.texto}
        </Link>
      ))}
      {puede && (
        <Button size="sm" variant="outline" className="ml-auto h-7 rounded-full text-xs" onClick={() => void instalar()}>
          <Download className="size-3.5" /> Instalar app
        </Button>
      )}
    </div>
  );
}

type Acceso = { id: string; label: string; to: string; search?: Record<string, string>; icon: LucideIcon; modulo: Modulo | null; admin?: boolean };

/** Todo lo que se puede poner como acceso rápido: módulos y acciones directas. */
export const ACCESOS: Acceso[] = [
  { id: "nuevo-ticket", label: "Nuevo ticket", to: "/tareas", search: { nuevo: "1" }, icon: ClipboardPlus, modulo: "tareas" },
  { id: "tickets", label: "Bandeja de tickets", to: "/tareas", icon: Ticket, modulo: "tareas" },
  { id: "rafaga", label: "Escaneo en ráfaga", to: "/inventario", search: { rafaga: "1" }, icon: ScanLine, modulo: "inventario" },
  { id: "activos", label: "Activos IT", to: "/inventario", icon: Boxes, modulo: "inventario" },
  { id: "toners", label: "Tóners", to: "/toners", icon: Printer, modulo: "toners" },
  { id: "consumo", label: "Consumo de tóners", to: "/toners", search: { tab: "consumo" }, icon: TrendingDown, modulo: "toners" },
  { id: "pedido", label: "Pedido de compra", to: "/oficina", search: { tab: "insumos" }, icon: ShoppingCart, modulo: "oficina" },
  { id: "version", label: "Registrar versión", to: "/oficina", search: { tab: "actualizaciones", nueva: "1" }, icon: GitBranch, modulo: "oficina" },
  { id: "telefonos", label: "Teléfonos internos", to: "/oficina", icon: Phone, modulo: "oficina" },
  { id: "guardias", label: "Guardias", to: "/guardias", icon: CalendarClock, modulo: "guardias" },
  { id: "extras", label: "Horas extras", to: "/guardias", search: { tab: "horarios" }, icon: Timer, modulo: "guardias" },
  { id: "instructivos", label: "Instructivos", to: "/instructivos", icon: BookOpen, modulo: "instructivos" },
  { id: "credenciales", label: "Credenciales", to: "/credenciales", icon: KeyRound, modulo: "credenciales" },
  { id: "configuracion", label: "Configuración", to: "/configuracion", icon: Settings2, modulo: null, admin: true },
];
const POR_DEFECTO = ["nuevo-ticket", "tickets", "pedido", "toners", "instructivos", "activos"];

/** Accesos rápidos del inicio, elegidos por cada usuario. */
export function AccesosRapidos() {
  const { can, isAdmin } = useAuth();
  const { prefs, guardar, isLoading } = usePreferencias();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<string[]>([]);
  const disponibles = ACCESOS.filter((a) => (a.admin ? isAdmin : !a.modulo || can(a.modulo, "view")));
  const elegidos = (prefs.accesos ?? POR_DEFECTO).map((id) => disponibles.find((a) => a.id === id)).filter((a): a is Acceso => !!a);
  if (isLoading) return null;

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <p className="eyebrow">Accesos rápidos</p>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => {
            setBorrador(elegidos.map((a) => a.id));
            setEditando(true);
          }}
        >
          Personalizar
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {elegidos.map((a) => (
          <Link key={a.id} to={a.to} search={a.search as never} className="panel panel-hover group flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary transition-transform group-hover:scale-110">
              <a.icon className="size-3.5" />
            </span>
            <span className="min-w-0 truncate">{a.label}</span>
          </Link>
        ))}
      </div>
      <Dialog open={editando} onOpenChange={setEditando}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tus accesos rápidos</DialogTitle>
            <DialogDescription>Elegí hasta 12. Aparecen en el orden en que los marcás.</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-1 sm:grid-cols-2">
            {disponibles.map((a) => {
              const pos = borrador.indexOf(a.id);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setBorrador((b) => (pos >= 0 ? b.filter((x) => x !== a.id) : b.length >= 12 ? b : [...b, a.id]))}
                    className={cn("fila-clic flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px]", pos >= 0 ? "border-primary/50 bg-primary/8" : "border-border")}
                  >
                    <a.icon className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{a.label}</span>
                    {pos >= 0 && <span className="num grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{pos + 1}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBorrador(POR_DEFECTO)}>
              Restablecer
            </Button>
            <Button
              onClick={async () => {
                const { error } = await guardar({ accesos: borrador });
                if (error) return toast.error(error.message);
                toast.success("Accesos guardados");
                setEditando(false);
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
