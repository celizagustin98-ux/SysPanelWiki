import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Ban,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  History,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  PackageCheck,
  Pencil,
  RotateCcw,
  Search,
  ShoppingBag,
  ThumbsUp,
  Truck,
  Undo2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { StatTile } from "@/components/StatTile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { pesos } from "@/lib/imprimir";
import { imprimirPedidoInsumos, numeroPedidoInsumos } from "@/lib/insumos-pdf";
import { cn, formatFecha } from "@/lib/utils";
import { EditarPedido } from "./PedidoInsumos";

export type ItemPedido = {
  id: string;
  pedido_id: string | null;
  descripcion: string;
  cantidad: number | string;
  unidad: string;
  link: string | null;
  precio_estimado: number | string | null;
  sector: string | null;
  prioridad: string;
  notas: string | null;
  comprado: boolean;
  created_by_nombre: string | null;
  cantidad_comprada?: number | string | null;
  cantidad_recibida?: number | string | null;
  cancelado?: boolean | null;
  proveedor?: string | null;
  precio_real?: number | string | null;
  nota_compra?: string | null;
};

export type PedidoCompra = {
  id: string;
  numero: number;
  estado: string;
  destinatario: string;
  solicitante_nombre: string | null;
  notas: string | null;
  total_estimado: number | string;
  created_at: string;
  aprobado_at?: string | null;
  comprado_at?: string | null;
  recibido_at?: string | null;
};

type Evento = {
  id: string;
  pedido_id: string;
  item_id: string | null;
  tipo: string;
  texto: string;
  autor_nombre: string | null;
  created_at: string;
};

/* ───────────── Estados y colores ───────────── */

export const ESTADOS_PEDIDO: { value: string; label: string; chip: string; barra: string }[] = [
  {
    value: "enviado",
    label: "Enviado",
    chip: "bg-slate-500/12 text-slate-600 ring-slate-500/30 dark:text-slate-300",
    barra: "bg-slate-500",
  },
  {
    value: "aprobado",
    label: "Aprobado",
    chip: "bg-violet-500/12 text-violet-600 ring-violet-500/30 dark:text-violet-300",
    barra: "bg-violet-500",
  },
  {
    value: "en_compra",
    label: "Compra parcial",
    chip: "bg-amber-500/15 text-amber-700 ring-amber-500/35 dark:text-amber-300",
    barra: "bg-amber-500",
  },
  {
    value: "comprado",
    label: "Comprado",
    chip: "bg-sky-500/12 text-sky-700 ring-sky-500/30 dark:text-sky-300",
    barra: "bg-sky-500",
  },
  {
    value: "recibido",
    label: "Recibido",
    chip: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
    barra: "bg-emerald-500",
  },
  {
    value: "rechazado",
    label: "Rechazado",
    chip: "bg-rose-500/12 text-rose-600 ring-rose-500/30 dark:text-rose-300",
    barra: "bg-rose-500",
  },
];
const PASOS = ["enviado", "aprobado", "en_compra", "comprado", "recibido"];
export const estadoPedido = (v: string) =>
  ESTADOS_PEDIDO.find((e) => e.value === v) ?? ESTADOS_PEDIDO[0];
const ABIERTOS = ["enviado", "aprobado", "en_compra", "comprado"];

type EstadoItem = "pendiente" | "parcial" | "comprado" | "recibido" | "cancelado";
const ESTADO_ITEM: Record<EstadoItem, { label: string; chip: string; barra: string }> = {
  pendiente: {
    label: "Pendiente",
    chip: "bg-rose-500/12 text-rose-600 ring-rose-500/30 dark:text-rose-300",
    barra: "bg-rose-500",
  },
  parcial: {
    label: "Parcial",
    chip: "bg-amber-500/15 text-amber-700 ring-amber-500/35 dark:text-amber-300",
    barra: "bg-amber-500",
  },
  comprado: {
    label: "Comprado",
    chip: "bg-sky-500/12 text-sky-700 ring-sky-500/30 dark:text-sky-300",
    barra: "bg-sky-500",
  },
  recibido: {
    label: "Recibido",
    chip: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
    barra: "bg-emerald-500",
  },
  cancelado: {
    label: "Cancelado",
    chip: "bg-zinc-500/10 text-zinc-500 ring-zinc-500/25",
    barra: "bg-zinc-400",
  },
};

const n = (v: unknown) => Number(v) || 0;
const fmt = (v: number) =>
  Number.isInteger(v) ? String(v) : v.toLocaleString("es-AR", { maximumFractionDigits: 2 });
export const subtotalItem = (i: ItemPedido) => n(i.precio_estimado) * n(i.cantidad);
const gastoReal = (i: ItemPedido) =>
  (i.precio_real != null ? n(i.precio_real) : n(i.precio_estimado)) * n(i.cantidad_comprada);

export function estadoItem(i: ItemPedido): EstadoItem {
  if (i.cancelado) return "cancelado";
  const total = n(i.cantidad);
  if (n(i.cantidad_recibida) >= total) return "recibido";
  if (n(i.cantidad_comprada) >= total) return "comprado";
  if (n(i.cantidad_comprada) > 0) return "parcial";
  return "pendiente";
}

function resumenItems(its: ItemPedido[]) {
  const r = { pendiente: 0, parcial: 0, comprado: 0, recibido: 0, cancelado: 0 } as Record<
    EstadoItem,
    number
  >;
  for (const i of its) r[estadoItem(i)]++;
  return r;
}

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function linkUrl(link: string) {
  return link.startsWith("http") ? link : `https://${link}`;
}

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Barra apilada por estado de los ítems: se ve de un vistazo cuánto falta. */
function BarraItems({ its, className }: { its: ItemPedido[]; className?: string }) {
  const r = resumenItems(its);
  const total = Math.max(1, its.length);
  const orden: EstadoItem[] = ["recibido", "comprado", "parcial", "pendiente", "cancelado"];
  return (
    <div className={cn("flex h-2 gap-px overflow-hidden rounded-full bg-muted", className)}>
      {orden.map((k) =>
        r[k] ? (
          <span
            key={k}
            title={`${ESTADO_ITEM[k].label}: ${r[k]}`}
            className={ESTADO_ITEM[k].barra}
            style={{ width: `${(r[k] / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

export function usePedidos() {
  return useQuery({
    queryKey: ["insumos", "historico"],
    queryFn: async () => {
      const [p, i] = await Promise.all([
        api.from("insumos_pedidos").select("*").order("created_at", { ascending: false }),
        api.from("insumos_items").select("*").order("created_at"),
      ]);
      if (p.error) throw p.error;
      return {
        pedidos: (p.data ?? []) as PedidoCompra[],
        items: ((i.data ?? []) as ItemPedido[]).filter((x) => x.pedido_id),
      };
    },
  });
}

async function seguimiento(args: Record<string, unknown>) {
  const { error } = await api.rpc("seguimiento_pedido", args);
  if (error) {
    toast.error(error.message);
    return false;
  }
  return true;
}

/* ───────────── Pedidos (mes a mes, con avance) ───────────── */

type Filtro = "mes" | "abiertos" | "completos" | "rechazados";

export function PedidosHistorico() {
  const { puedeEscribir } = useAuth();
  const canWrite = puedeEscribir("oficina");
  const qc = useQueryClient();
  const [mes, setMes] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [filtro, setFiltro] = useState<Filtro>("mes");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [editando, setEditando] = useState<PedidoCompra | null>(null);

  const { data, isLoading } = usePedidos();
  const pedidos = data?.pedidos ?? [];
  const items = data?.items ?? [];
  const itemsDe = (id: string) => items.filter((i) => i.pedido_id === id);
  const refrescar = () => void qc.invalidateQueries({ queryKey: ["insumos"] });

  const enMes = (p: PedidoCompra, m: Date) => {
    const d = new Date(p.created_at);
    return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
  };
  const delMes = pedidos.filter((p) => enMes(p, mes));
  const abiertosTodos = pedidos.filter((p) => ABIERTOS.includes(p.estado));

  const visibles = useMemo(() => {
    const base =
      filtro === "abiertos"
        ? abiertosTodos
        : filtro === "completos"
          ? delMes.filter((p) => p.estado === "recibido")
          : filtro === "rechazados"
            ? delMes.filter((p) => p.estado === "rechazado")
            : delMes;
    const term = q.trim().toLowerCase();
    if (!term) return base;
    return base.filter((p) =>
      [
        numeroPedidoInsumos(p.numero),
        p.solicitante_nombre,
        p.destinatario,
        p.notas,
        ...itemsDe(p.id).map((i) => `${i.descripcion} ${i.proveedor ?? ""}`),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [filtro, q, pedidos, items, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Últimos 6 meses: total pedido vs. gastado
  const ultimos = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, k) => {
        const m = new Date(mes.getFullYear(), mes.getMonth() - 5 + k, 1);
        const ps = pedidos.filter((p) => enMes(p, m) && p.estado !== "rechazado");
        const pedido = ps.reduce((s, p) => s + n(p.total_estimado), 0);
        const comprado = ps.reduce(
          (s, p) => s + itemsDe(p.id).reduce((a, i) => a + gastoReal(i), 0),
          0,
        );
        return { m, pedido, comprado };
      }),
    [pedidos, items, mes], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const maxMes = Math.max(1, ...ultimos.map((u) => Math.max(u.pedido, u.comprado)));

  const validos = delMes.filter((p) => p.estado !== "rechazado");
  const itsMes = validos.flatMap((p) => itemsDe(p.id)).filter((i) => !i.cancelado);
  const totalMes = validos.reduce((s, p) => s + n(p.total_estimado), 0);
  const gastadoMes = itsMes.reduce((s, i) => s + gastoReal(i), 0);
  const faltaComprar = itsMes.filter((i) => n(i.cantidad_comprada) < n(i.cantidad)).length;
  const faltaRecibir = itsMes.filter((i) => n(i.cantidad_recibida) < n(i.cantidad)).length;

  const hoy = new Date();
  const esActual = mes.getFullYear() === hoy.getFullYear() && mes.getMonth() === hoy.getMonth();
  const pedidoAbierto = pedidos.find((p) => p.id === abierto) ?? null;

  const FILTROS: { key: Filtro; label: string; n: number }[] = [
    { key: "mes", label: `Todos de ${MESES[mes.getMonth()].toLowerCase()}`, n: delMes.length },
    { key: "abiertos", label: "En curso (todos los meses)", n: abiertosTodos.length },
    {
      key: "completos",
      label: "Recibidos",
      n: delMes.filter((p) => p.estado === "recibido").length,
    },
    {
      key: "rechazados",
      label: "Rechazados",
      n: delMes.filter((p) => p.estado === "rechazado").length,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-border bg-card p-1 shadow-xs">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
            aria-label="Mes anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-36 text-center text-sm font-semibold">
            {MESES[mes.getMonth()]} {mes.getFullYear()}
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={esActual}
            onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="relative w-full max-w-xs sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Buscar pedido, ítem o proveedor…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 stagger">
          <StatTile
            label="Total pedido"
            value={pesos(totalMes)}
            hint={`${validos.length} pedidos del mes`}
          />
          <StatTile
            label="Gastado"
            value={pesos(gastadoMes)}
            hint="según lo comprado"
            tone={gastadoMes ? "info" : "neutral"}
          />
          <StatTile
            label="Falta comprar"
            value={faltaComprar}
            hint="ítems del mes"
            tone={faltaComprar ? "warn" : "ok"}
          />
          <StatTile
            label="Falta recibir"
            value={faltaRecibir}
            hint="ítems del mes"
            tone={faltaRecibir ? "warn" : "ok"}
          />
        </div>
        <div className="panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="eyebrow">Últimos 6 meses</p>
            <p className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-violet-500/35" />
                Pedido
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-emerald-500" />
                Gastado
              </span>
            </p>
          </div>
          <div className="flex h-20 items-end gap-2">
            {ultimos.map((u) => (
              <button
                key={u.m.toISOString()}
                type="button"
                onClick={() => {
                  setMes(u.m);
                  setFiltro("mes");
                }}
                className="group flex h-full flex-1 flex-col items-center gap-1"
                title={`${MESES[u.m.getMonth()]}: pedido ${pesos(u.pedido)} · gastado ${pesos(u.comprado)}`}
              >
                <div className="relative flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-violet-500/30 transition-all"
                    style={{ height: `${(u.pedido / maxMes) * 100}%` }}
                  />
                  <div
                    className="absolute bottom-0 left-1/4 w-1/2 rounded-t bg-emerald-500"
                    style={{ height: `${(u.comprado / maxMes) * 100}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "text-[10px]",
                    u.m.getMonth() === mes.getMonth() && u.m.getFullYear() === mes.getFullYear()
                      ? "font-semibold text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  {MESES[u.m.getMonth()].slice(0, 3)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFiltro(f.key)}
            className={cn(
              "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
              filtro === f.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label} <span className="num ml-1 opacity-70">{f.n}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <div className="empty-state panel bg-grid">
          <p className="text-sm font-semibold">No hay pedidos para mostrar</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Cambiá el filtro, usá las flechas o tocá un mes del gráfico.
          </p>
        </div>
      ) : (
        <div className="panel divide-y divide-border/70 overflow-hidden">
          {visibles.map((p) => {
            const its = itemsDe(p.id);
            const est = estadoPedido(p.estado);
            const r = resumenItems(its);
            const activos = its.length - r.cancelado;
            const comprados = r.comprado + r.recibido;
            return (
              <div
                key={p.id}
                className="relative grid gap-2 px-4 py-3 transition hover:bg-muted/25 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center"
              >
                <span
                  aria-hidden
                  className={cn("absolute inset-y-2 left-0 w-1 rounded-r-full", est.barra)}
                />
                <button
                  type="button"
                  onClick={() => setAbierto(p.id)}
                  className="min-w-0 text-left"
                >
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="num text-sm font-semibold text-primary">
                      {numeroPedidoInsumos(p.numero)}
                    </span>
                    <Chip className={est.chip}>{est.label}</Chip>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString("es-AR")} ·{" "}
                    {p.solicitante_nombre || "—"} → {p.destinatario} · {its.length} ítems
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setAbierto(p.id)}
                  className="space-y-1 text-left"
                  title="Ver el detalle del pedido"
                >
                  <BarraItems its={its} />
                  <p className="text-[11px] text-muted-foreground">
                    <span className="num font-semibold text-foreground">{comprados}</span> de{" "}
                    {activos} comprados
                    {r.parcial ? ` · ${r.parcial} parcial` : ""}
                    {r.recibido ? ` · ${r.recibido} recibidos` : ""}
                  </p>
                </button>
                <div className="flex items-center justify-end gap-1">
                  <span className="num mr-2 text-sm font-medium">{pesos(p.total_estimado)}</span>
                  {canWrite && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      title="Editar pedido"
                      aria-label="Editar pedido"
                      onClick={() => setEditando(p)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    title="Abrir PDF"
                    aria-label="Abrir PDF"
                    onClick={() =>
                      imprimirPedidoInsumos({
                        numero: p.numero,
                        fecha: p.created_at,
                        destinatario: p.destinatario,
                        solicitante: p.solicitante_nombre,
                        notas: p.notas,
                        items: its,
                      })
                    }
                  >
                    <FileText className="size-4" />
                  </Button>
                  <BotonProximo pedido={p} onAbrir={() => setAbierto(p.id)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pedidoAbierto && (
        <PedidoDetalle
          pedido={pedidoAbierto}
          items={itemsDe(pedidoAbierto.id)}
          canWrite={canWrite}
          onClose={() => setAbierto(null)}
          onCambio={refrescar}
          onEditar={() => setEditando(pedidoAbierto)}
        />
      )}

      {editando && (
        <EditarPedido
          pedido={editando}
          items={itemsDe(editando.id)}
          onClose={() => setEditando(null)}
          onGuardado={refrescar}
        />
      )}
    </div>
  );
}

/** Qué toca hacer con un pedido según su estado. */
const PROXIMO: Record<string, { boton: string; ayuda: string; icono: typeof ThumbsUp }> = {
  enviado: { boton: "Aprobar o rechazar", ayuda: "Compras tiene que aprobarlo o rechazarlo. Si ya compraron algo, marcalo directamente en los ítems.", icono: ThumbsUp },
  aprobado: { boton: "Registrar compra", ayuda: "Marcá en cada ítem lo que se compró (todo o una parte) y a qué proveedor.", icono: ShoppingBag },
  en_compra: { boton: "Seguir comprando", ayuda: "Hay ítems comprados en parte o sin comprar. Completá lo que falta o marcá «No se compra».", icono: ShoppingBag },
  comprado: { boton: "Registrar llegada", ayuda: "Todo está comprado. Cuando llegue, marcá cada ítem como recibido.", icono: Truck },
  recibido: { boton: "Ver detalle", ayuda: "Pedido completo: todo llegó. Queda en el historial.", icono: CheckCircle2 },
  rechazado: { boton: "Ver detalle", ayuda: "Fue rechazado. Si hay que retomarlo, volvelo a «Enviado».", icono: XCircle },
};

function BotonProximo({ pedido, onAbrir }: { pedido: PedidoCompra; onAbrir: () => void }) {
  const p = PROXIMO[pedido.estado] ?? PROXIMO.enviado;
  const terminal = pedido.estado === "recibido" || pedido.estado === "rechazado";
  return (
    <Button size="sm" variant={terminal ? "ghost" : "default"} className="h-8 min-w-36" onClick={onAbrir}>
      <p.icono className="size-4" /> {p.boton}
    </Button>
  );
}

/* ───────────── Detalle y seguimiento de un pedido ───────────── */

function PedidoDetalle({
  pedido,
  items,
  canWrite,
  onClose,
  onCambio,
  onEditar,
}: {
  pedido: PedidoCompra;
  items: ItemPedido[];
  canWrite: boolean;
  onClose: () => void;
  onCambio: () => void;
  onEditar: () => void;
}) {
  const qc = useQueryClient();
  const [editItem, setEditItem] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [rechazar, setRechazar] = useState(false);
  const [motivo, setMotivo] = useState("");

  const { data: eventos = [] } = useQuery({
    queryKey: ["insumos", "eventos", pedido.id],
    queryFn: async () => {
      const { data } = await api
        .from("insumos_pedido_eventos")
        .select("*")
        .eq("pedido_id", pedido.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as Evento[];
    },
  });
  const { data: proveedores = [] } = useProveedores();

  const hecho = async (args: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    const bien = await seguimiento({ _pedido_id: pedido.id, ...args });
    setBusy(false);
    if (!bien) return false;
    if (ok) toast.success(ok);
    onCambio();
    void qc.invalidateQueries({ queryKey: ["insumos", "eventos", pedido.id] });
    return true;
  };

  const est = estadoPedido(pedido.estado);
  const rechazado = pedido.estado === "rechazado";
  const idx = PASOS.indexOf(pedido.estado);
  const r = resumenItems(items);
  const activos = items.filter((i) => !i.cancelado);
  const gastado = items.reduce((s, i) => s + gastoReal(i), 0);

  const todo = (campo: "comprada" | "recibida") =>
    hecho(
      {
        _accion: "items",
        _items: activos.map((i) => ({
          id: i.id,
          [campo]: n(i.cantidad),
          ...(campo === "recibida" ? { comprada: n(i.cantidad) } : {}),
        })),
      },
      campo === "comprada" ? "Todo marcado como comprado" : "Todo marcado como recibido",
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[min(calc(var(--av)*0.92),860px)] max-w-[min(1100px,96vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,96vw)]">
        <div className="shrink-0 border-b border-border px-5 py-4">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2.5">
              <span className="num">{numeroPedidoInsumos(pedido.numero)}</span>
              <Chip className={est.chip}>{est.label}</Chip>
            </DialogTitle>
            <DialogDescription>
              {formatFecha(pedido.created_at, { day: "2-digit", month: "long", year: "numeric" })} ·{" "}
              {pedido.solicitante_nombre || "—"} → {pedido.destinatario} · estimado{" "}
              {pesos(pedido.total_estimado)}
              {gastado ? ` · gastado ${pesos(gastado)}` : ""}
            </DialogDescription>
          </DialogHeader>

          {rechazado ? (
            <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/8 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
              Pedido rechazado. Volvelo a «Enviado» si hay que retomarlo.
            </p>
          ) : (
            <ol className="mt-3 grid grid-cols-5 gap-1.5" aria-label="Avance del pedido">
              {PASOS.map((k, i) => {
                const e = estadoPedido(k);
                const actual = i === idx;
                const pasado = i < idx;
                return (
                  <li key={k} className="min-w-0" aria-current={actual ? "step" : undefined}>
                    <div
                      className={cn(
                        "rounded-full transition-all",
                        actual ? "h-2.5" : "h-2",
                        pasado || actual ? e.barra : "bg-muted",
                        pasado && "opacity-55",
                      )}
                    />
                    <p
                      className={cn(
                        "mt-1 flex items-center gap-1 truncate text-[11px]",
                        actual
                          ? "font-semibold text-foreground"
                          : pasado
                            ? "text-muted-foreground"
                            : "text-muted-foreground/70",
                      )}
                    >
                      {pasado && <CheckCircle2 className="size-3 shrink-0" />}
                      {e.label}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}

          <p className="mt-3 flex items-start gap-2 rounded-lg bg-primary/8 px-3 py-2 text-[13px]">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <span className="font-semibold">Próximo paso: </span>
              {PROXIMO[pedido.estado]?.ayuda ?? "Revisá el pedido."}
            </span>
          </p>

          {canWrite && (
            <div className="mt-3 flex flex-wrap gap-2">
              {pedido.estado === "enviado" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void hecho({ _accion: "estado", _estado: "aprobado" }, "Pedido aprobado")
                  }
                >
                  <ThumbsUp className="size-4" /> Aprobar
                </Button>
              )}
              {!rechazado && pedido.estado !== "recibido" && (
                <>
                  {r.pendiente + r.parcial > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void todo("comprada")}
                    >
                      <ShoppingBag className="size-4" /> Marcar todo comprado
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void todo("recibida")}
                  >
                    <PackageCheck className="size-4" /> Marcar todo recibido
                  </Button>
                </>
              )}
              {["enviado", "aprobado"].includes(pedido.estado) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => setRechazar(true)}
                >
                  <XCircle className="size-4" /> Rechazar
                </Button>
              )}
              {rechazado && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void hecho({ _accion: "estado", _estado: "enviado" }, "Pedido reabierto")
                  }
                >
                  <RotateCcw className="size-4" /> Volver a Enviado
                </Button>
              )}
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={onEditar}>
                  <Pencil className="size-4" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    imprimirPedidoInsumos({
                      numero: pedido.numero,
                      fecha: pedido.created_at,
                      destinatario: pedido.destinatario,
                      solicitante: pedido.solicitante_nombre,
                      notas: pedido.notas,
                      items,
                    })
                  }
                >
                  <FileText className="size-4" /> PDF
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:overflow-hidden">
          <div className="px-5 py-4 lg:min-h-0 lg:overflow-y-auto">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
              {(["pendiente", "parcial", "comprado", "recibido", "cancelado"] as EstadoItem[]).map(
                (k) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <span className={cn("size-2.5 rounded-sm", ESTADO_ITEM[k].barra)} />
                    {ESTADO_ITEM[k].label}{" "}
                    <span className="num font-semibold text-foreground">{r[k]}</span>
                  </span>
                ),
              )}
            </div>
            <BarraItems its={items} className="mb-4 h-2.5" />

            <div className="space-y-2">
              {items.map((i) => {
                const e = estadoItem(i);
                const total = n(i.cantidad);
                const c = n(i.cantidad_comprada);
                const rc = n(i.cantidad_recibida);
                return (
                  <div
                    key={i.id}
                    className={cn(
                      "rounded-xl border border-border/70 bg-card",
                      i.cancelado && "opacity-60",
                    )}
                  >
                    <div className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "flex flex-wrap items-center gap-2 text-sm font-medium",
                            i.cancelado && "line-through",
                          )}
                        >
                          {i.descripcion}
                          {i.prioridad === "urgente" && (
                            <Chip className="bg-rose-500/12 text-rose-600 ring-rose-500/30">
                              Urgente
                            </Chip>
                          )}
                          {i.link && (
                            <a
                              href={linkUrl(i.link)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary"
                              aria-label="Abrir link de compra"
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {fmt(total)} {i.unidad}
                          {i.sector ? ` · ${i.sector}` : ""}
                          {i.precio_estimado != null ? ` · est. ${pesos(subtotalItem(i))}` : ""}
                          {i.proveedor ? ` · ${i.proveedor}` : ""}
                          {i.precio_real != null ? ` · real ${pesos(n(i.precio_real))} c/u` : ""}
                        </p>
                        {i.nota_compra && (
                          <p className="mt-0.5 text-xs italic text-muted-foreground">
                            {i.nota_compra}
                          </p>
                        )}
                      </div>
                      <div className="w-44 shrink-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <Chip className={ESTADO_ITEM[e].chip}>{ESTADO_ITEM[e].label}</Chip>
                          <span className="num text-[11px] text-muted-foreground">
                            {fmt(c)}/{fmt(total)}
                          </span>
                        </div>
                        <div
                          className="relative h-1.5 overflow-hidden rounded-full bg-muted"
                          title={`Comprado ${fmt(c)} · recibido ${fmt(rc)}`}
                        >
                          <span
                            className="absolute inset-y-0 left-0 bg-sky-500"
                            style={{ width: `${Math.min(100, (c / Math.max(1, total)) * 100)}%` }}
                          />
                          <span
                            className="absolute inset-y-0 left-0 bg-emerald-500"
                            style={{ width: `${Math.min(100, (rc / Math.max(1, total)) * 100)}%` }}
                          />
                        </div>
                        <p className="text-[10.5px] text-muted-foreground">
                          Recibido <span className="num">{fmt(rc)}</span> de {fmt(total)}
                        </p>
                      </div>
                    </div>
                    {canWrite && !rechazado && (
                      <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-3 py-2">
                        {i.cancelado ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            disabled={busy}
                            onClick={() =>
                              void hecho({
                                _accion: "items",
                                _items: [{ id: i.id, cancelado: false }],
                              })
                            }
                          >
                            <Undo2 className="size-3.5" /> Volver a pendiente
                          </Button>
                        ) : (
                          <>
                            {c < total && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={busy}
                                onClick={() =>
                                  void hecho({
                                    _accion: "items",
                                    _items: [{ id: i.id, comprada: total }],
                                  })
                                }
                              >
                                <ShoppingBag className="size-3.5" /> Comprado todo
                              </Button>
                            )}
                            {rc < total && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={busy}
                                onClick={() =>
                                  void hecho({
                                    _accion: "items",
                                    _items: [{ id: i.id, recibida: total }],
                                  })
                                }
                              >
                                <Truck className="size-3.5" /> Recibido todo
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => setEditItem(editItem === i.id ? null : i.id)}
                            >
                              <Pencil className="size-3.5" /> Cantidades, proveedor y precio
                            </Button>
                            {c === 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground"
                                disabled={busy}
                                onClick={() =>
                                  void hecho({
                                    _accion: "items",
                                    _items: [{ id: i.id, cancelado: true }],
                                  })
                                }
                              >
                                <Ban className="size-3.5" /> No se compra
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {editItem === i.id && (
                      <EditorItem
                        item={i}
                        proveedores={proveedores}
                        busy={busy}
                        onCancel={() => setEditItem(null)}
                        onGuardar={async (cambios) => {
                          if (
                            await hecho(
                              { _accion: "items", _items: [{ id: i.id, ...cambios }] },
                              "Ítem actualizado",
                            )
                          )
                            setEditItem(null);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {pedido.notas && (
              <p className="mt-3 text-xs text-muted-foreground">
                Observaciones del pedido: {pedido.notas}
              </p>
            )}
          </div>

          <aside className="flex min-h-0 flex-col border-t border-border bg-muted/15 lg:border-l lg:border-t-0">
            <p className="flex items-center gap-2 px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <History className="size-3.5" /> Historial
            </p>
            {canWrite && (
              <form
                className="space-y-2 px-4 pt-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await hecho({ _accion: "nota", _texto: nota })) setNota("");
                }}
              >
                <Textarea
                  rows={2}
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Agregar una nota: «llamé al proveedor, entrega el jueves»…"
                  maxLength={600}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={busy || !nota.trim()}
                >
                  <MessageSquarePlus className="size-4" /> Agregar nota
                </Button>
              </form>
            )}
            <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {eventos.length === 0 && (
                <li className="text-xs text-muted-foreground">Todavía no hay movimientos.</li>
              )}
              {eventos.map((ev) => (
                <li key={ev.id} className="relative pl-4 text-[12.5px]">
                  <span
                    className={cn(
                      "absolute left-0 top-1.5 size-2 rounded-full",
                      ev.tipo === "estado"
                        ? "bg-violet-500"
                        : ev.tipo === "item"
                          ? "bg-sky-500"
                          : "bg-amber-500",
                    )}
                  />
                  <p className="leading-snug">{ev.texto}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {ev.autor_nombre || "—"} ·{" "}
                    {formatFecha(ev.created_at, {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
              <li className="relative pl-4 text-[12.5px]">
                <span className="absolute left-0 top-1.5 size-2 rounded-full bg-slate-500" />
                <p>Pedido generado</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {pedido.solicitante_nombre || "—"} ·{" "}
                  {formatFecha(pedido.created_at, {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </li>
            </ol>
          </aside>
        </div>

        <Dialog open={rechazar} onOpenChange={setRechazar}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Rechazar {numeroPedidoInsumos(pedido.numero)}</DialogTitle>
              <DialogDescription>
                Queda en el historial. Después se puede volver a Enviado.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label>Motivo (opcional)</Label>
              <Textarea
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={300}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRechazar(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={async () => {
                  if (
                    await hecho(
                      { _accion: "estado", _estado: "rechazado", _motivo: motivo },
                      "Pedido rechazado",
                    )
                  ) {
                    setRechazar(false);
                    setMotivo("");
                  }
                }}
              >
                Rechazar pedido
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function useProveedores() {
  return useQuery({
    queryKey: ["oficina_contactos", "proveedores"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await api
        .from("oficina_contactos")
        .select("nombre")
        .eq("tipo", "proveedor")
        .eq("activo", true)
        .order("nombre");
      return ((data ?? []) as { nombre: string }[]).map((c) => c.nombre);
    },
  });
}

function EditorItem({
  item,
  proveedores,
  busy,
  onCancel,
  onGuardar,
}: {
  item: ItemPedido;
  proveedores: string[];
  busy: boolean;
  onCancel: () => void;
  onGuardar: (cambios: Record<string, unknown>) => void;
}) {
  const total = n(item.cantidad);
  const [comprada, setComprada] = useState(String(n(item.cantidad_comprada)));
  const [recibida, setRecibida] = useState(String(n(item.cantidad_recibida)));
  const [proveedor, setProveedor] = useState(item.proveedor ?? "");
  const [precio, setPrecio] = useState(item.precio_real != null ? String(item.precio_real) : "");
  const [nota, setNota] = useState("");
  const listaId = `prov-${item.id}`;

  // Función (no componente) para que el campo no pierda el foco al escribir.
  const cantidad = (label: string, valor: string, set: (v: string) => void) => (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}{" "}
        <span className="text-muted-foreground">
          (de {fmt(total)} {item.unidad})
        </span>
      </Label>
      <div className="flex gap-1">
        <Input
          type="number"
          min={0}
          max={total}
          step="any"
          inputMode="decimal"
          value={valor}
          onChange={(e) => set(e.target.value)}
          className="h-8"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2 text-xs"
          onClick={() => set(String(total))}
        >
          Todo
        </Button>
      </div>
    </div>
  );

  return (
    <form
      className="grid gap-3 border-t border-border/60 bg-muted/20 px-3 py-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({
          comprada: comprada.replace(",", "."),
          recibida: recibida.replace(",", "."),
          proveedor,
          precio_real: precio.trim() ? precio.replace(",", ".") : null,
          nota,
        });
      }}
    >
      {cantidad("Comprado", comprada, setComprada)}
      {cantidad("Recibido", recibida, setRecibida)}
      <div className="space-y-1">
        <Label className="text-xs">Proveedor</Label>
        <Input
          className="h-8"
          list={listaId}
          value={proveedor}
          onChange={(e) => setProveedor(e.target.value)}
          placeholder="Elegí o escribí"
          maxLength={160}
        />
        <datalist id={listaId}>
          {proveedores.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Precio real c/u</Label>
        <Input
          className="h-8"
          inputMode="decimal"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          placeholder={item.precio_estimado != null ? `est. ${n(item.precio_estimado)}` : "$"}
        />
      </div>
      <div className="space-y-1 sm:col-span-2 lg:col-span-3">
        <Label className="text-xs">Nota (queda en el historial)</Label>
        <Input
          className="h-8"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej.: faltan 2, llegan la semana que viene"
          maxLength={300}
        />
      </div>
      <div className="flex items-end justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}{" "}
          Guardar
        </Button>
      </div>
    </form>
  );
}

/* ───────────── Pendientes: lo que falta comprar o recibir, de todos los pedidos ───────────── */

export function PendientesCompra() {
  const { puedeEscribir } = useAuth();
  const canWrite = puedeEscribir("oficina");
  const qc = useQueryClient();
  const [modo, setModo] = useState<"comprar" | "recibir">("comprar");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = usePedidos();
  const pedidos = (data?.pedidos ?? []).filter((p) => p.estado !== "rechazado");
  const items = data?.items ?? [];
  const pedidoDe = (id: string | null) => pedidos.find((p) => p.id === id);

  const activos = items.filter((i) => !i.cancelado && pedidoDe(i.pedido_id));
  const faltaComprar = activos.filter((i) => n(i.cantidad_comprada) < n(i.cantidad));
  const faltaRecibir = activos.filter(
    (i) => n(i.cantidad_comprada) > 0 && n(i.cantidad_recibida) < n(i.cantidad_comprada),
  );
  const lista = modo === "comprar" ? faltaComprar : faltaRecibir;
  const urgentesPrimero = [...lista].sort(
    (a, b) => (a.prioridad === "urgente" ? 0 : 1) - (b.prioridad === "urgente" ? 0 : 1),
  );
  const refrescar = () => void qc.invalidateQueries({ queryKey: ["insumos"] });

  const marcar = async (i: ItemPedido) => {
    setBusy(i.id);
    const ok = await seguimiento({
      _pedido_id: i.pedido_id,
      _accion: "items",
      _items: [
        modo === "comprar"
          ? { id: i.id, comprada: n(i.cantidad) }
          : { id: i.id, recibida: n(i.cantidad_comprada) },
      ],
    });
    setBusy(null);
    if (ok) {
      toast.success(
        modo === "comprar" ? `«${i.descripcion}» comprado` : `«${i.descripcion}» recibido`,
      );
      refrescar();
    }
  };

  const pedidoAbierto = pedidos.find((p) => p.id === abierto) ?? null;

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-xs">
        {(
          [
            ["comprar", "Falta comprar", faltaComprar.length],
            ["recibir", "Falta recibir", faltaRecibir.length],
          ] as const
        ).map(([k, label, cant]) => (
          <button
            key={k}
            type="button"
            onClick={() => setModo(k)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition",
              modo === k
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            <span
              className={cn(
                "num rounded px-1.5 text-[11px] font-semibold",
                modo === k ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {cant}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-12 rounded-xl" />
          ))}
        </div>
      ) : urgentesPrimero.length === 0 ? (
        <div className="empty-state panel bg-grid">
          <CheckCircle2 className="mb-2 size-6 text-emerald-500" />
          <p className="text-sm font-semibold">
            {modo === "comprar" ? "No queda nada por comprar" : "No queda nada por recibir"}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">Todos los pedidos están al día.</p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1fr)_110px_150px_auto] gap-3 border-b border-border/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
            <span>Ítem</span>
            <span>Pedido</span>
            <span>{modo === "comprar" ? "Falta comprar" : "Falta recibir"}</span>
            <span className="text-right">Acción</span>
          </div>
          {urgentesPrimero.map((i, k) => {
            const p = pedidoDe(i.pedido_id)!;
            const total = n(i.cantidad);
            const falta =
              modo === "comprar"
                ? total - n(i.cantidad_comprada)
                : n(i.cantidad_comprada) - n(i.cantidad_recibida);
            const e = estadoItem(i);
            return (
              <div
                key={i.id}
                className={cn(
                  "grid gap-2 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_110px_150px_auto] md:items-center",
                  k > 0 && "border-t border-border/50",
                )}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {i.descripcion}
                    {i.prioridad === "urgente" && (
                      <Chip className="bg-rose-500/12 text-rose-600 ring-rose-500/30">Urgente</Chip>
                    )}
                    <Chip className={ESTADO_ITEM[e].chip}>{ESTADO_ITEM[e].label}</Chip>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {i.sector || "Sin sector"}
                    {i.proveedor ? ` · ${i.proveedor}` : ""}
                    {i.link && (
                      <>
                        {" · "}
                        <a
                          href={linkUrl(i.link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          link de compra
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="num text-left text-sm font-semibold text-primary hover:underline"
                  onClick={() => setAbierto(p.id)}
                >
                  {numeroPedidoInsumos(p.numero)}
                </button>
                <p className="text-sm">
                  <span className="num font-semibold">{fmt(falta)}</span> {i.unidad}
                  <span className="text-xs text-muted-foreground"> de {fmt(total)}</span>
                </p>
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => setAbierto(p.id)}
                  >
                    Parcial…
                  </Button>
                  {canWrite && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={busy === i.id}
                      onClick={() => void marcar(i)}
                    >
                      {busy === i.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : modo === "comprar" ? (
                        <ShoppingBag className="size-3.5" />
                      ) : (
                        <Truck className="size-3.5" />
                      )}
                      {modo === "comprar" ? "Comprado" : "Recibido"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pedidoAbierto && (
        <PedidoDetalle
          pedido={pedidoAbierto}
          items={items.filter((i) => i.pedido_id === pedidoAbierto.id)}
          canWrite={canWrite}
          onClose={() => setAbierto(null)}
          onCambio={refrescar}
          onEditar={() => toast.info("Para editar el pedido entrá desde la solapa Pedidos")}
        />
      )}
    </div>
  );
}
