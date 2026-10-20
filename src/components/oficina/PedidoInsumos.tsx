import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Loader2, Pencil, Plus, Send, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { StatTile } from "@/components/StatTile";
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

const ESTADOS_PEDIDO = [
  { value: "enviado", label: "Enviado", tono: "info" },
  { value: "aprobado", label: "Aprobado", tono: "info" },
  { value: "comprado", label: "Comprado", tono: "ok" },
  { value: "recibido", label: "Recibido", tono: "ok" },
  { value: "rechazado", label: "Rechazado", tono: "crit" },
] as const;

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

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
  const [vista, setVista] = useState<"lista" | "historico">("lista");
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-xs">
        {(
          [
            ["lista", "Lista actual"],
            ["historico", "Histórico de pedidos"],
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
      {vista === "lista" ? <ListaActual onGenerado={() => setVista("historico")} /> : <Historico />}
    </div>
  );
}

/* ───────────── Lista actual ───────────── */

function ListaActual({ onGenerado }: { onGenerado: () => void }) {
  const { canWrite, profile } = useAuth();
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

/* ───────────── Histórico mes a mes ───────────── */

function Historico() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [abierto, setAbierto] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["insumos", "historico"],
    queryFn: async () => {
      const [p, i] = await Promise.all([
        api.from("insumos_pedidos").select("*").order("created_at", { ascending: false }),
        api.from("insumos_items").select("*").order("created_at"),
      ]);
      if (p.error) throw p.error;
      return { pedidos: (p.data ?? []) as Pedido[], items: ((i.data ?? []) as Item[]).filter((x) => x.pedido_id) };
    },
  });
  const pedidos = data?.pedidos ?? [];
  const items = data?.items ?? [];

  const delMes = pedidos.filter((p) => {
    const d = new Date(p.created_at);
    return d.getFullYear() === mes.getFullYear() && d.getMonth() === mes.getMonth();
  });
  const itemsDe = (id: string) => items.filter((i) => i.pedido_id === id);

  // Últimos 6 meses: total pedido vs. comprado
  const ultimos = useMemo(() => {
    return Array.from({ length: 6 }).map((_, k) => {
      const m = new Date(mes.getFullYear(), mes.getMonth() - 5 + k, 1);
      const ps = pedidos.filter((p) => {
        const d = new Date(p.created_at);
        return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth() && p.estado !== "rechazado";
      });
      const pedido = ps.reduce((s, p) => s + Number(p.total_estimado || 0), 0);
      const comprado = ps.reduce((s, p) => s + itemsDe(p.id).filter((i) => i.comprado).reduce((a, i) => a + subtotal(i), 0), 0);
      return { m, pedido, comprado };
    });
  }, [pedidos, items, mes]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxMes = Math.max(1, ...ultimos.map((u) => u.pedido));

  const totalMes = delMes.filter((p) => p.estado !== "rechazado").reduce((s, p) => s + Number(p.total_estimado || 0), 0);
  const compradoMes = delMes.reduce((s, p) => s + itemsDe(p.id).filter((i) => i.comprado).reduce((a, i) => a + subtotal(i), 0), 0);
  const itemsMes = delMes.reduce((s, p) => s + itemsDe(p.id).length, 0);
  const itemsComprados = delMes.reduce((s, p) => s + itemsDe(p.id).filter((i) => i.comprado).length, 0);

  const cambiarEstado = async (p: Pedido, estado: string) => {
    const extra: Record<string, string> = {};
    if (estado === "aprobado") extra.aprobado_at = new Date().toISOString();
    if (estado === "comprado") extra.comprado_at = new Date().toISOString();
    if (estado === "recibido") extra.recibido_at = new Date().toISOString();
    const { error } = await api.from("insumos_pedidos").update({ estado, ...extra }).eq("id", p.id);
    if (error) return toast.error(error.message);
    // Marcar todo como comprado al pasar a comprado/recibido
    if (estado === "comprado" || estado === "recibido") await api.from("insumos_items").update({ comprado: true }).eq("pedido_id", p.id);
    toast.success(`${numeroPedidoInsumos(p.numero)} → ${ESTADOS_PEDIDO.find((e) => e.value === estado)?.label}`);
    void qc.invalidateQueries({ queryKey: ["insumos", "historico"] });
  };

  const toggleComprado = async (i: Item) => {
    const { error } = await api.from("insumos_items").update({ comprado: !i.comprado }).eq("id", i.id);
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["insumos", "historico"] });
  };

  const hoy = new Date();
  const esActual = mes.getFullYear() === hoy.getFullYear() && mes.getMonth() === hoy.getMonth();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-border bg-card p-1 shadow-xs">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} aria-label="Mes anterior"><ChevronLeft className="size-4" /></Button>
          <p className="min-w-36 text-center text-sm font-semibold">{MESES[mes.getMonth()]} {mes.getFullYear()}</p>
          <Button variant="ghost" size="icon" className="size-8" disabled={esActual} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} aria-label="Mes siguiente"><ChevronRight className="size-4" /></Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 stagger">
          <StatTile label="Pedidos" value={delMes.length} hint="solicitudes del mes" />
          <StatTile label="Total pedido" value={pesos(totalMes)} hint="estimado" />
          <StatTile label="Comprado" value={pesos(compradoMes)} hint={`${itemsComprados}/${itemsMes} ítems`} tone={itemsMes && itemsComprados === itemsMes ? "ok" : "neutral"} />
          <StatTile label="Pendiente" value={itemsMes - itemsComprados} hint="ítems sin comprar" tone={itemsMes - itemsComprados ? "warn" : "ok"} />
        </div>
        <div className="panel p-3">
          <p className="eyebrow mb-2">Últimos 6 meses</p>
          <div className="flex h-20 items-end gap-2">
            {ultimos.map((u) => (
              <button key={u.m.toISOString()} type="button" onClick={() => setMes(u.m)} className="group flex flex-1 flex-col items-center gap-1" title={`${MESES[u.m.getMonth()]}: pedido ${pesos(u.pedido)} · comprado ${pesos(u.comprado)}`}>
                <div className="relative flex w-full flex-1 items-end">
                  <div className="w-full rounded-t bg-info/25 transition-all" style={{ height: `${(u.pedido / maxMes) * 100}%` }} />
                  <div className="absolute bottom-0 w-full rounded-t bg-ok" style={{ height: `${(u.comprado / maxMes) * 100}%` }} />
                </div>
                <span className={cn("text-[10px]", u.m.getMonth() === mes.getMonth() && u.m.getFullYear() === mes.getFullYear() ? "font-semibold text-primary" : "text-muted-foreground")}>{MESES[u.m.getMonth()].slice(0, 3)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {delMes.length === 0 ? (
        <div className="empty-state panel bg-grid">
          <p className="text-sm font-semibold">Sin pedidos en {MESES[mes.getMonth()].toLowerCase()}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Usá las flechas o tocá un mes del gráfico.</p>
        </div>
      ) : (
        <div className="panel divide-y divide-border/70 overflow-hidden">
          {delMes.map((p) => {
            const its = itemsDe(p.id);
            const est = ESTADOS_PEDIDO.find((e) => e.value === p.estado) ?? ESTADOS_PEDIDO[0];
            const comprados = its.filter((i) => i.comprado).length;
            return (
              <div key={p.id}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => setAbierto(abierto === p.id ? null : p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abierto === p.id && "rotate-90")} />
                    <span className="num text-sm font-semibold text-primary">{numeroPedidoInsumos(p.numero)}</span>
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("es-AR")} · {its.length} ítems · {p.solicitante_nombre || "—"} → {p.destinatario}
                    </span>
                  </button>
                  <span className="num text-xs text-muted-foreground">{comprados}/{its.length} comprados</span>
                  <span className="num w-28 text-right text-sm font-medium">{pesos(p.total_estimado)}</span>
                  {canWrite ? (
                    <Select value={p.estado} onValueChange={(v) => void cambiarEstado(p, v)}>
                      <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{ESTADOS_PEDIDO.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={est.tono}>{est.label}</Badge>
                  )}
                  <Button size="icon" variant="ghost" className="size-8" title="Abrir PDF" aria-label="Abrir PDF" onClick={() => imprimirPedidoInsumos({ numero: p.numero, fecha: p.created_at, destinatario: p.destinatario, solicitante: p.solicitante_nombre, notas: p.notas, items: its })}>
                    <FileText className="size-4" />
                  </Button>
                </div>
                {abierto === p.id && (
                  <div className="border-t border-border/60 bg-muted/20 px-4 py-2 rise-in">
                    {its.map((i) => (
                      <label key={i.id} className="flex items-center gap-3 py-1.5 text-[13px]">
                        <input type="checkbox" className="size-4 accent-[var(--ok)]" checked={i.comprado} disabled={!canWrite} onChange={() => void toggleComprado(i)} />
                        <span className={cn("min-w-0 flex-1 truncate", i.comprado && "text-muted-foreground line-through")}>{i.descripcion}</span>
                        <span className="num text-xs text-muted-foreground">{Number(i.cantidad)} {i.unidad}</span>
                        {i.link && (
                          <a href={i.link.startsWith("http") ? i.link : `https://${i.link}`} target="_blank" rel="noopener noreferrer" className="text-primary" aria-label="Abrir link"><ExternalLink className="size-3.5" /></a>
                        )}
                        <span className="num w-24 text-right text-xs">{subtotal(i) ? pesos(subtotal(i)) : "—"}</span>
                      </label>
                    ))}
                    {p.notas && <p className="pt-1 text-xs text-muted-foreground">Observaciones: {p.notas}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
