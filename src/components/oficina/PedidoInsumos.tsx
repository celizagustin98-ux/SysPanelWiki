import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ChevronRight, ExternalLink, FileText, Flame, ListPlus, Loader2, PackageCheck, Pencil, Plus, Send, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { pesos } from "@/lib/imprimir";
import { imprimirPedidoInsumos, numeroPedidoInsumos } from "@/lib/insumos-pdf";
import { cn } from "@/lib/utils";
import { PedidosHistorico, PendientesCompra, usePedidos } from "./PedidosSeguimiento";

type Item = {
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
};

type Pedido = {
  id: string;
  numero: number;
  estado: string;
  destinatario: string;
  solicitante_nombre: string | null;
  notas: string | null;
  total_estimado: number | string;
  created_at: string;
};

const subtotal = (i: Item) => (Number(i.precio_estimado) || 0) * (Number(i.cantidad) || 0);

function dominio(link: string | null) {
  if (!link) return null;
  try {
    return new URL(link.startsWith("http") ? link : `https://${link}`).hostname.replace(/^www\./, "");
  } catch {
    return link.slice(0, 30);
  }
}

export function PedidoInsumos() {
  const [vista, setVista] = useState<"lista" | "historico" | "pendientes">("lista");
  const { data: lista = [] } = useListaActual();
  const { data } = usePedidos();
  const pedidos = data?.pedidos ?? [];
  const items = data?.items ?? [];
  const enCurso = pedidos.filter((p) => ["enviado", "aprobado", "en_compra", "comprado"].includes(p.estado)).length;
  const vivos = new Set(pedidos.filter((p) => p.estado !== "rechazado").map((p) => p.id));
  const faltan = items.filter((i) => vivos.has(i.pedido_id ?? "") && !i.cancelado && Number(i.cantidad_recibida ?? 0) < Number(i.cantidad)).length;

  const pasos = [
    { k: "lista", n: 1, titulo: "Armar la lista", detalle: lista.length ? `${lista.length} ítem(s) esperando` : "Cargá lo que haga falta", cant: lista.length, icono: ListPlus },
    { k: "historico", n: 2, titulo: "Pedidos enviados", detalle: enCurso ? `${enCurso} en curso` : "Seguí cada pedido", cant: enCurso, icono: Send },
    { k: "pendientes", n: 3, titulo: "Lo que falta", detalle: faltan ? `${faltan} ítem(s) por comprar o recibir` : "Todo al día", cant: faltan, icono: PackageCheck },
  ] as const;

  return (
    <div className="space-y-3">
      <ol className="grid gap-2 sm:grid-cols-3" aria-label="Pasos del pedido de compra">
        {pasos.map((p, i) => {
          const activo = vista === p.k;
          return (
            <li key={p.k} className="relative">
              <button
                type="button"
                onClick={() => setVista(p.k)}
                aria-current={activo ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
                  activo ? "border-primary bg-primary/8 ring-1 ring-primary/30" : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold", activo ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  {p.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <p.icono className="size-4 text-primary" /> {p.titulo}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{p.detalle}</span>
                </span>
                {p.cant > 0 && <span className="num rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold text-primary">{p.cant}</span>}
              </button>
              {i < pasos.length - 1 && (
                <ChevronRight aria-hidden className="absolute -right-2.5 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-muted-foreground sm:block" />
              )}
            </li>
          );
        })}
      </ol>
      {vista === "lista" ? (
        <ListaActual onGenerado={() => setVista("historico")} />
      ) : vista === "historico" ? (
        <PedidosHistorico />
      ) : (
        <PendientesCompra />
      )}
    </div>
  );
}

function useListaActual() {
  return useQuery({
    queryKey: ["insumos", "lista"],
    queryFn: async () => {
      const { data, error } = await api.from("insumos_items").select("*").order("created_at");
      if (error) throw error;
      return ((data ?? []) as Item[]).filter((i) => !i.pedido_id);
    },
  });
}

/* ───────────── Paso 1: lista actual ───────────── */

function ListaActual({ onGenerado }: { onGenerado: () => void }) {
  const { profile, puedeEscribir } = useAuth();
  const canWrite = puedeEscribir("oficina");
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Item | null>(null);
  const [generar, setGenerar] = useState(false);
  // Ítems que NO van en el próximo pedido (por defecto van todos).
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());

  const { data: items = [], isLoading } = useListaActual();
  const elegidos = items.filter((i) => !excluidos.has(i.id));
  const total = elegidos.reduce((s, i) => s + subtotal(i), 0);
  const refrescar = () => qc.invalidateQueries({ queryKey: ["insumos"] });

  const alternar = (id: string) =>
    setExcluidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todos = elegidos.length === items.length;

  const quitar = async (i: Item) => {
    const { error } = await api.from("insumos_items").delete().eq("id", i.id);
    if (error) return toast.error(error.message);
    toast.success("Quitado de la lista");
    void refrescar();
  };

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        {canWrite && (
          <ItemForm
            key={editando?.id ?? "nuevo"}
            item={editando}
            autor={profile?.full_name ?? null}
            onDone={() => {
              setEditando(null);
              void refrescar();
            }}
            onCancel={() => setEditando(null)}
          />
        )}

        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingCart className="size-4 text-primary" /> Lista para el próximo pedido
              <span className="num rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{items.length}</span>
            </p>
            {items.length > 1 && canWrite && (
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setExcluidos(todos ? new Set(items.map((i) => i.id)) : new Set())}>
                {todos ? "Destildar todos" : "Tildar todos"}
              </button>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-10" />)}</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <ShoppingCart className="mx-auto mb-2 size-6 text-muted-foreground" />
              <p className="text-sm font-medium">La lista está vacía</p>
              <p className="mt-1 text-[13px] text-muted-foreground">Agregá arriba lo que haga falta comprar. Cuando esté lista, generá el pedido.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {items.map((i) => {
                const va = !excluidos.has(i.id);
                return (
                  <li key={i.id} className={cn("flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/30", !va && "opacity-55", editando?.id === i.id && "bg-primary/5")}>
                    {canWrite && (
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-[var(--primary)]"
                        checked={va}
                        onChange={() => alternar(i.id)}
                        aria-label={va ? "Sacar del próximo pedido" : "Incluir en el próximo pedido"}
                        title={va ? "Va en el próximo pedido" : "Queda para después"}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium">
                        <span className="truncate">{i.descripcion}</span>
                        {i.prioridad === "urgente" && <Badge variant="crit">Urgente</Badge>}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{i.sector || "Sin destino"}</span>
                        {i.link && (
                          <a href={i.link.startsWith("http") ? i.link : `https://${i.link}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                            <ExternalLink className="size-3" /> {dominio(i.link)}
                          </a>
                        )}
                        {i.notas && <span className="truncate">· {i.notas}</span>}
                      </p>
                    </div>
                    <div className="num shrink-0 text-right text-[13px]">
                      <p className="font-medium">
                        {Number(i.cantidad)} {i.unidad}
                      </p>
                      <p className="text-xs text-muted-foreground">{subtotal(i) ? pesos(subtotal(i)) : "sin precio"}</p>
                    </div>
                    {canWrite && (
                      <div className="flex shrink-0 gap-0.5">
                        <Button size="icon" variant="ghost" className="size-7" aria-label="Editar" onClick={() => setEditando(i)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-7" aria-label="Quitar" onClick={() => void quitar(i)}>
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <aside className="panel h-fit space-y-3 p-4 xl:sticky xl:top-20">
        <p className="eyebrow">Próximo pedido</p>
        <dl className="space-y-2 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Ítems que van</dt>
            <dd className="num font-medium">
              {elegidos.length}
              {elegidos.length !== items.length && <span className="text-muted-foreground"> de {items.length}</span>}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Urgentes</dt>
            <dd className="num font-medium">{elegidos.filter((i) => i.prioridad === "urgente").length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Sin precio</dt>
            <dd className="num font-medium">{elegidos.filter((i) => !i.precio_estimado).length}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <dt className="font-medium">Total estimado</dt>
            <dd className="num text-base font-semibold">{pesos(total)}</dd>
          </div>
        </dl>
        {canWrite && (
          <Button className="h-11 w-full" disabled={!elegidos.length} onClick={() => setGenerar(true)}>
            <Send /> Generar pedido{elegidos.length ? ` (${elegidos.length})` : ""}
          </Button>
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Se numera la solicitud y se abre el PDF. Los ítems destildados quedan en la lista para un pedido posterior. Después seguís la compra en el paso 2.
        </p>
      </aside>

      {generar && (
        <GenerarDialog
          items={elegidos}
          total={total}
          parcial={elegidos.length !== items.length}
          onClose={() => setGenerar(false)}
          onDone={() => {
            setGenerar(false);
            setExcluidos(new Set());
            void refrescar();
            onGenerado();
          }}
        />
      )}
    </div>
  );
}

function ItemForm({ item, autor, onDone, onCancel }: { item: Item | null; autor: string | null; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState(() => ({
    descripcion: item?.descripcion ?? "",
    cantidad: item ? String(Number(item.cantidad)) : "1",
    unidad: item?.unidad ?? "u.",
    precio: item?.precio_estimado != null ? String(item.precio_estimado) : "",
    sector: item?.sector ?? "",
    link: item?.link ?? "",
    notas: item?.notas ?? "",
    urgente: item?.prioridad === "urgente",
  }));
  const [mas, setMas] = useState(!!(item?.link || item?.notas));
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const cant = Math.max(0, Number(f.cantidad.replace(",", ".")) || 0);
  const precio = Number(f.precio.replace(/\./g, "").replace(",", ".")) || 0;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const descripcion = f.descripcion.trim();
    if (!descripcion) return toast.error("Indicá qué hace falta comprar");
    const payload = {
      descripcion,
      cantidad: Math.max(0.01, cant || 1),
      unidad: f.unidad.trim() || "u.",
      link: f.link.trim() || null,
      precio_estimado: f.precio.trim() ? precio : null,
      sector: f.sector.trim() || null,
      prioridad: f.urgente ? "urgente" : "normal",
      notas: f.notas.trim() || null,
    };
    setSaving(true);
    const { error } = item
      ? await api.from("insumos_items").update(payload).eq("id", item.id)
      : await api.from("insumos_items").insert({ ...payload, created_by_nombre: autor });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(item ? "Ítem actualizado" : `«${descripcion}» agregado a la lista`);
    if (!item) setF((x) => ({ ...x, descripcion: "", cantidad: "1", precio: "", link: "", notas: "", urgente: false }));
    onDone();
  };

  const paso = (d: number) => setF((x) => ({ ...x, cantidad: String(Math.max(1, (Number(x.cantidad.replace(",", ".")) || 0) + d)) }));

  return (
    <form onSubmit={submit} className={cn("panel space-y-3 p-4", item && "ring-2 ring-primary/40")}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        {item ? <Pencil className="size-4 text-primary" /> : <Plus className="size-4 text-primary" />}
        {item ? "Editar ítem" : "Agregar a la lista"}
      </p>
      <div className="grid gap-3 sm:grid-cols-12">
        <div className="space-y-1 sm:col-span-6">
          <Label className="text-xs">¿Qué hace falta? *</Label>
          <Input value={f.descripcion} onChange={set("descripcion")} placeholder="Ej.: Cable UTP Cat6 caja 305 m" className="h-9" autoFocus={!!item} />
        </div>
        <div className="space-y-1 sm:col-span-3">
          <Label className="text-xs">Cantidad</Label>
          <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-input">
            <button type="button" className="px-2.5 text-muted-foreground hover:bg-muted" onClick={() => paso(-1)} aria-label="Menos">
              −
            </button>
            <input value={f.cantidad} onChange={set("cantidad")} inputMode="decimal" className="num w-full min-w-0 bg-transparent text-center text-sm outline-none" aria-label="Cantidad" />
            <button type="button" className="px-2.5 text-muted-foreground hover:bg-muted" onClick={() => paso(1)} aria-label="Más">
              +
            </button>
          </div>
        </div>
        <div className="space-y-1 sm:col-span-3">
          <Label className="text-xs">Unidad</Label>
          <Input value={f.unidad} onChange={set("unidad")} list="unidades-insumo" className="h-9" />
          <datalist id="unidades-insumo">
            {["u.", "caja", "bolsa", "pack", "metro", "rollo", "resma", "litro"].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1 sm:col-span-4">
          <Label className="text-xs">Para qué sector</Label>
          <Input value={f.sector} onChange={set("sector")} placeholder="Sistemas, Guardia…" className="h-9" />
        </div>
        <div className="space-y-1 sm:col-span-4">
          <Label className="text-xs">Precio estimado c/u</Label>
          <Input value={f.precio} onChange={set("precio")} placeholder="$ 0" className="num h-9" inputMode="decimal" />
        </div>
        <div className="flex items-end sm:col-span-4">
          <button
            type="button"
            onClick={() => setF((x) => ({ ...x, urgente: !x.urgente }))}
            aria-pressed={f.urgente}
            className={cn(
              "flex h-9 w-full items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors",
              f.urgente ? "border-rose-500/50 bg-rose-500/12 text-rose-600 dark:text-rose-300" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Flame className="size-4" /> {f.urgente ? "Urgente" : "Marcar urgente"}
          </button>
        </div>
        {mas ? (
          <>
            <div className="space-y-1 sm:col-span-7">
              <Label className="text-xs">Link de compra</Label>
              <Input value={f.link} onChange={set("link")} placeholder="https://…" className="h-9" />
            </div>
            <div className="space-y-1 sm:col-span-5">
              <Label className="text-xs">Notas</Label>
              <Input value={f.notas} onChange={set("notas")} placeholder="Marca, alternativa…" className="h-9" />
            </div>
          </>
        ) : (
          <button type="button" className="text-left text-xs text-primary hover:underline sm:col-span-12" onClick={() => setMas(true)}>
            + Agregar link de compra o notas
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
        <p className="num text-xs text-muted-foreground">{cant && precio ? `Subtotal estimado ${pesos(cant * precio)}` : "Tip: Enter agrega el ítem"}</p>
        <div className="flex gap-2">
          {item && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : item ? <Pencil /> : <Plus />} {item ? "Guardar cambios" : "Agregar a la lista"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function GenerarDialog({
  items,
  total,
  parcial,
  onClose,
  onDone,
}: {
  items: Item[];
  total: number;
  parcial: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { data: correos = [] } = useQuery({
    queryKey: ["oficina_contactos", "destinos"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await api.from("oficina_contactos").select("nombre, email").eq("tipo", "empresa").eq("activo", true).order("nombre");
      return (data ?? []) as { nombre: string; email: string | null }[];
    },
  });
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { data, error } = (await api.rpc("generar_pedido_insumos", {
      _destinatario: String(fd.get("destinatario") ?? "Compras"),
      _notas: String(fd.get("notas") ?? ""),
      _ids: items.map((i) => i.id),
    })) as { data: Pedido | null; error: Error | null };
    setBusy(false);
    if (error || !data) return toast.error(error?.message ?? "No se pudo generar el pedido");
    toast.success(`${numeroPedidoInsumos(data.numero)} enviado a ${data.destinatario}`);
    imprimirPedidoInsumos({ numero: data.numero, fecha: data.created_at, destinatario: data.destinatario, solicitante: data.solicitante_nombre, notas: data.notas, items });
    onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generar pedido</DialogTitle>
          <DialogDescription>
            {items.length} ítem(s) · total estimado {pesos(total)}
            {parcial ? " · los destildados quedan en la lista" : ""}. Se abre el PDF de la solicitud para imprimir o guardar.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/70 bg-muted/20 p-2 text-xs">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-2">
              <span className="truncate">{i.descripcion}</span>
              <span className="num shrink-0 text-muted-foreground">
                {Number(i.cantidad)} {i.unidad}
              </span>
            </li>
          ))}
        </ul>
        <form onSubmit={submit} className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Para</Label>
            <Input name="destinatario" defaultValue="Compras" list="destinos-pedido" />
            <datalist id="destinos-pedido">
              {correos.map((c) => (
                <option key={c.nombre} value={c.nombre}>
                  {c.email ?? ""}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea name="notas" rows={3} placeholder="Motivo, urgencia, centro de costo…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <FileText />} Generar y abrir PDF
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Editar un pedido ya generado ───────────── */

type Fila = {
  key: string;
  id: string | null;
  descripcion: string;
  cantidad: string;
  unidad: string;
  precio_estimado: string;
  link: string;
  sector: string;
  prioridad: string;
  notas: string;
};

function aFila(i: Item): Fila {
  return {
    key: i.id,
    id: i.id,
    descripcion: i.descripcion,
    cantidad: String(Number(i.cantidad)),
    unidad: i.unidad || "u.",
    precio_estimado: i.precio_estimado != null ? String(Number(i.precio_estimado)) : "",
    link: i.link ?? "",
    sector: i.sector ?? "",
    prioridad: i.prioridad || "normal",
    notas: i.notas ?? "",
  };
}

/** Número escrito al estilo argentino o no: "1.500,50", "1.500", "1500.5" o "12". */
function aNumero(v: string) {
  const t = String(v ?? "").trim().replace(/\s|\$/g, "");
  if (!t) return 0;
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", ".")) || 0;
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, "")) || 0;
  return Number(t) || 0;
}

/** Corrige datos, ítems y observaciones de un pedido y vuelve a generar el mismo SOL-xxxx. */
export function EditarPedido({ pedido, items, onClose, onGuardado }: { pedido: Pedido; items: Item[]; onClose: () => void; onGuardado: () => void }) {
  const [filas, setFilas] = useState<Fila[]>(() => items.map(aFila));
  const [destinatario, setDestinatario] = useState(pedido.destinatario);
  const [notas, setNotas] = useState(pedido.notas ?? "");
  const [guardando, setGuardando] = useState(false);

  const cambiar = (key: string, campo: keyof Fila, valor: string) => setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, [campo]: valor } : f)));
  const agregar = () =>
    setFilas((fs) => [
      ...fs,
      { key: `nuevo-${Date.now()}`, id: null, descripcion: "", cantidad: "1", unidad: "u.", precio_estimado: "", link: "", sector: "", prioridad: "normal", notas: "" },
    ]);
  const quitar = (key: string) => setFilas((fs) => fs.filter((f) => f.key !== key));
  const total = filas.reduce((s, f) => s + aNumero(f.cantidad) * aNumero(f.precio_estimado), 0);

  const guardar = async (generar: boolean) => {
    if (!filas.length) return toast.error("El pedido tiene que tener al menos un ítem");
    if (filas.some((f) => !f.descripcion.trim())) return toast.error("Hay un ítem sin descripción");
    setGuardando(true);
    const payload = filas.map((f) => ({
      id: f.id,
      descripcion: f.descripcion,
      cantidad: aNumero(f.cantidad),
      unidad: f.unidad,
      precio_estimado: f.precio_estimado.trim() ? aNumero(f.precio_estimado) : null,
      link: f.link,
      sector: f.sector,
      prioridad: f.prioridad,
      notas: f.notas,
    }));
    const { error } = await api.rpc("editar_pedido_insumos", { _id: pedido.id, _destinatario: destinatario, _notas: notas, _items: payload });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(`${numeroPedidoInsumos(pedido.numero)} actualizado`);
    onGuardado();
    if (generar) {
      imprimirPedidoInsumos({
        numero: pedido.numero,
        fecha: pedido.created_at,
        destinatario,
        solicitante: pedido.solicitante_nombre,
        notas: notas || null,
        items: payload.map((p) => ({ ...p, link: p.link || null, sector: p.sector || null, notas: p.notas || null })),
      });
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(var(--av)*0.92)] flex-col gap-3 overflow-hidden sm:max-w-[min(1100px,96vw)]">
        <DialogHeader>
          <DialogTitle>Editar {numeroPedidoInsumos(pedido.numero)}</DialogTitle>
          <DialogDescription>
            Corregí lo que haga falta y volvé a generar el PDF: se mantiene el mismo número y la fecha original.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label htmlFor="ed-dest">Para</Label>
            <Input id="ed-dest" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-notas">Observaciones</Label>
            <Input id="ed-notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Descripción</th>
                <th className="w-20 px-2 py-2 font-medium">Cant.</th>
                <th className="w-20 px-2 py-2 font-medium">Unidad</th>
                <th className="w-28 px-2 py-2 font-medium">Precio est.</th>
                <th className="px-2 py-2 font-medium">Link de compra</th>
                <th className="w-32 px-2 py-2 font-medium">Destino</th>
                <th className="w-28 px-2 py-2 font-medium">Prioridad</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.key} className="border-t border-border/60 align-top">
                  <td className="p-1.5">
                    <Input value={f.descripcion} onChange={(e) => cambiar(f.key, "descripcion", e.target.value)} className="h-8" aria-label="Descripción" />
                    <Input value={f.notas} onChange={(e) => cambiar(f.key, "notas", e.target.value)} className="mt-1 h-7 text-xs" placeholder="Notas" aria-label="Notas" />
                  </td>
                  <td className="p-1.5"><Input value={f.cantidad} onChange={(e) => cambiar(f.key, "cantidad", e.target.value)} className="num h-8" inputMode="decimal" aria-label="Cantidad" /></td>
                  <td className="p-1.5"><Input value={f.unidad} onChange={(e) => cambiar(f.key, "unidad", e.target.value)} className="h-8" aria-label="Unidad" /></td>
                  <td className="p-1.5"><Input value={f.precio_estimado} onChange={(e) => cambiar(f.key, "precio_estimado", e.target.value)} className="num h-8" inputMode="decimal" aria-label="Precio" /></td>
                  <td className="p-1.5"><Input value={f.link} onChange={(e) => cambiar(f.key, "link", e.target.value)} className="h-8 text-xs" placeholder="https://…" aria-label="Link" /></td>
                  <td className="p-1.5"><Input value={f.sector} onChange={(e) => cambiar(f.key, "sector", e.target.value)} className="h-8" aria-label="Destino" /></td>
                  <td className="p-1.5">
                    <Select value={f.prioridad} onValueChange={(v) => cambiar(f.key, "prioridad", v)}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="urgente">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-1.5">
                    <Button size="icon" variant="ghost" className="size-8" aria-label="Quitar ítem" onClick={() => quitar(f.key)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={agregar}>
            <Plus /> Agregar ítem
          </Button>
          <p className="text-sm">
            {filas.length} ítems · Total estimado <span className="num font-semibold">{pesos(total)}</span>
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="secondary" disabled={guardando} onClick={() => void guardar(false)}>
            {guardando ? <Loader2 className="animate-spin" /> : <Pencil />} Guardar
          </Button>
          <Button disabled={guardando} onClick={() => void guardar(true)}>
            {guardando ? <Loader2 className="animate-spin" /> : <FileText />} Guardar y generar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
