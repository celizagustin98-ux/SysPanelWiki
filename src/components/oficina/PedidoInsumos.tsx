import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ExternalLink, FileText, Loader2, Pencil, Plus, Send, ShoppingCart, Trash2 } from "lucide-react";
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
import { PedidosHistorico, PendientesCompra } from "./PedidosSeguimiento";

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
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-xs">
        {(
          [
            ["lista", "Lista actual"],
            ["historico", "Pedidos"],
            ["pendientes", "Pendientes de compra"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setVista(k)}
            className={cn("rounded-md px-3.5 py-1.5 text-[13px] font-medium transition", vista === k ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
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

/* ───────────── Lista actual ───────────── */

function ListaActual({ onGenerado }: { onGenerado: () => void }) {
  const { profile, puedeEscribir } = useAuth();
  const canWrite = puedeEscribir("oficina");
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Item | null>(null);
  const [generar, setGenerar] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["insumos", "lista"],
    queryFn: async () => {
      const { data, error } = await api.from("insumos_items").select("*").order("created_at");
      if (error) throw error;
      return ((data ?? []) as Item[]).filter((i) => !i.pedido_id);
    },
  });

  const total = items.reduce((s, i) => s + subtotal(i), 0);
  const refrescar = () => qc.invalidateQueries({ queryKey: ["insumos"] });

  const quitar = async (i: Item) => {
    const { error } = await api.from("insumos_items").delete().eq("id", i.id);
    if (error) return toast.error(error.message);
    toast.success("Quitado de la lista");
    void refrescar();
  };

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="size-4 text-primary" /> Insumos a pedir
            <span className="num rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{items.length}</span>
          </p>
          {items.length > 0 && <span className="num text-xs text-muted-foreground">Total estimado {pesos(total)}</span>}
        </div>
        {canWrite && <ItemForm key={editando?.id ?? "nuevo"} item={editando} autor={profile?.full_name ?? null} onDone={() => { setEditando(null); void refrescar(); }} onCancel={() => setEditando(null)} />}
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-10" />)}</div>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">La lista está vacía. Agregá lo que haga falta comprar.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/45 text-left text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-3 py-2">Insumo</th>
                  <th className="px-3 py-2">Destino</th>
                  <th className="px-3 py-2 text-right">Cant.</th>
                  <th className="px-3 py-2 text-right">Precio est.</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="stagger">
                {items.map((i) => (
                  <tr key={i.id} className="border-b border-border/60 last:border-0 hover:bg-accent/30">
                    <td className="max-w-[300px] px-3 py-2">
                      <p className="flex items-center gap-1.5 font-medium">
                        <span className="truncate">{i.descripcion}</span>
                        {i.prioridad === "urgente" && <Badge variant="crit">Urgente</Badge>}
                      </p>
                      {i.link ? (
                        <a href={i.link.startsWith("http") ? i.link : `https://${i.link}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <ExternalLink className="size-3" /> {dominio(i.link)}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin link</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{i.sector || "—"}</td>
                    <td className="num px-3 py-2 text-right">{Number(i.cantidad)} {i.unidad}</td>
                    <td className="num px-3 py-2 text-right text-xs">{i.precio_estimado ? pesos(i.precio_estimado) : "—"}</td>
                    <td className="num px-3 py-2 text-right text-xs font-medium">{subtotal(i) ? pesos(subtotal(i)) : "—"}</td>
                    <td className="px-2 py-2 text-right">
                      {canWrite && (
                        <div className="flex justify-end gap-0.5">
                          <Button size="icon" variant="ghost" className="size-7" aria-label="Editar" onClick={() => setEditando(i)}><Pencil className="size-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="size-7" aria-label="Quitar" onClick={() => void quitar(i)}><Trash2 className="size-3.5 text-destructive" /></Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <aside className="panel h-fit space-y-3 p-4">
        <p className="eyebrow">Resumen del pedido</p>
        <dl className="space-y-2 text-[13px]">
          <div className="flex justify-between"><dt className="text-muted-foreground">Ítems</dt><dd className="num font-medium">{items.length}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Urgentes</dt><dd className="num font-medium">{items.filter((i) => i.prioridad === "urgente").length}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Sin precio</dt><dd className="num font-medium">{items.filter((i) => !i.precio_estimado).length}</dd></div>
          <div className="flex justify-between border-t border-border pt-2"><dt className="font-medium">Total estimado</dt><dd className="num text-base font-semibold">{pesos(total)}</dd></div>
        </dl>
        {canWrite && (
          <Button className="h-11 w-full" disabled={!items.length} onClick={() => setGenerar(true)}>
            <Send /> Generar pedido a Compras
          </Button>
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Se numera la solicitud, se abre el PDF para imprimir o guardar y queda en el histórico para controlar qué se compró cada mes.
        </p>
      </aside>

      {generar && (
        <GenerarDialog
          items={items}
          total={total}
          onClose={() => setGenerar(false)}
          onDone={() => {
            setGenerar(false);
            void refrescar();
            onGenerado();
          }}
        />
      )}
    </div>
  );
}

function ItemForm({ item, autor, onDone, onCancel }: { item: Item | null; autor: string | null; onDone: () => void; onCancel: () => void }) {
  const [prioridad, setPrioridad] = useState(item?.prioridad ?? "normal");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const descripcion = String(fd.get("descripcion") ?? "").trim();
    if (!descripcion) return toast.error("Indicá qué insumo hace falta");
    const precio = String(fd.get("precio") ?? "").replace(/\./g, "").replace(",", ".").trim();
    const payload = {
      descripcion,
      cantidad: Math.max(0.01, Number(String(fd.get("cantidad") ?? "1").replace(",", ".")) || 1),
      unidad: String(fd.get("unidad") ?? "").trim() || "u.",
      link: String(fd.get("link") ?? "").trim() || null,
      precio_estimado: precio ? Number(precio) : null,
      sector: String(fd.get("sector") ?? "").trim() || null,
      prioridad,
      notas: String(fd.get("notas") ?? "").trim() || null,
    };
    setSaving(true);
    const { error } = item
      ? await api.from("insumos_items").update(payload).eq("id", item.id)
      : await api.from("insumos_items").insert({ ...payload, created_by_nombre: autor });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(item ? "Insumo actualizado" : "Agregado a la lista");
    (e.target as HTMLFormElement).reset();
    setPrioridad("normal");
    onDone();
  };

  return (
    <form onSubmit={submit} className="grid gap-2 border-b border-border bg-muted/20 p-3 sm:grid-cols-12">
      <Input name="descripcion" defaultValue={item?.descripcion} placeholder="Insumo (ej. Cable UTP Cat6 caja 305 m)" className="h-9 sm:col-span-5" required autoFocus={!!item} />
      <Input name="cantidad" defaultValue={item ? String(item.cantidad) : "1"} placeholder="Cant." className="num h-9 sm:col-span-1" inputMode="decimal" />
      <Input name="unidad" defaultValue={item?.unidad ?? "u."} placeholder="Unidad" className="h-9 sm:col-span-1" />
      <Input name="precio" defaultValue={item?.precio_estimado != null ? String(item.precio_estimado) : ""} placeholder="Precio est." className="num h-9 sm:col-span-2" inputMode="decimal" />
      <Input name="sector" defaultValue={item?.sector ?? ""} placeholder="Destino / sector" className="h-9 sm:col-span-3" />
      <Input name="link" defaultValue={item?.link ?? ""} placeholder="Link de compra (https://…)" className="h-9 sm:col-span-5" />
      <Input name="notas" defaultValue={item?.notas ?? ""} placeholder="Notas (marca, alternativa…)" className="h-9 sm:col-span-3" />
      <Select value={prioridad} onValueChange={setPrioridad}>
        <SelectTrigger className="h-9 sm:col-span-2"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="normal">Normal</SelectItem>
          <SelectItem value="urgente">Urgente</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex gap-1.5 sm:col-span-2">
        <Button type="submit" className="h-9 flex-1" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : item ? <Pencil /> : <Plus />} {item ? "Guardar" : "Agregar"}
        </Button>
        {item && <Button type="button" variant="outline" className="h-9" onClick={onCancel}>✕</Button>}
      </div>
    </form>
  );
}

function GenerarDialog({ items, total, onClose, onDone }: { items: Item[]; total: number; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { data, error } = (await api.rpc("generar_pedido_insumos", {
      _destinatario: String(fd.get("destinatario") ?? "Compras"),
      _notas: String(fd.get("notas") ?? ""),
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
          <DialogTitle>Generar pedido a Compras</DialogTitle>
          <DialogDescription>
            {items.length} ítem(s) · total estimado {pesos(total)}. Se abre el PDF de la solicitud para imprimir o guardar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Para</Label>
            <Input name="destinatario" defaultValue="Compras" />
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea name="notas" rows={3} placeholder="Motivo, urgencia, centro de costo…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <FileText />} Generar y abrir PDF</Button>
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
