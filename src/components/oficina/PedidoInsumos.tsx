import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronRight, ClipboardList, ExternalLink, FileText, Flame, History, ListPlus, Loader2, PackageCheck, Pencil, Plus, Send, ShoppingCart, Trash2, TriangleAlert } from "lucide-react";
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
import { leerLineaInsumo } from "./insumos-texto";
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

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

type Sugerencia = {
  descripcion: string;
  unidad: string;
  precio: number | null;
  link: string | null;
  sector: string | null;
  fecha: string;
  numero: number | null;
  veces: number;
};

/** Lo que ya se pidió alguna vez (para autocompletar), los sectores usados y lo que todavía está en camino. */
function useCatalogoInsumos() {
  const { data } = usePedidos();
  const { data: lista = [] } = useListaActual();
  return useMemo(() => {
    const pedidos = data?.pedidos ?? [];
    const historico = data?.items ?? [];
    const numero = new Map(pedidos.map((p) => [p.id, p.numero]));
    const estado = new Map(pedidos.map((p) => [p.id, p.estado]));
    const porClave = new Map<string, Sugerencia>();
    // Vienen ordenados por fecha: el último pisa al anterior, así queda el precio más reciente.
    for (const i of historico) {
      const k = normalizar(i.descripcion);
      const prev = porClave.get(k);
      porClave.set(k, {
        descripcion: i.descripcion,
        unidad: i.unidad || prev?.unidad || "u.",
        precio: i.precio_real != null ? Number(i.precio_real) : i.precio_estimado != null ? Number(i.precio_estimado) : (prev?.precio ?? null),
        link: i.link || prev?.link || null,
        sector: i.sector || prev?.sector || null,
        fecha: i.created_at ? new Date(i.created_at).toISOString() : (prev?.fecha ?? ""),
        numero: (i.pedido_id ? numero.get(i.pedido_id) : undefined) ?? prev?.numero ?? null,
        veces: (prev?.veces ?? 0) + 1,
      });
    }
    const sectores = [...new Set([...historico, ...lista].map((i) => i.sector?.trim()).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, "es"));
    // Ítems de pedidos abiertos que todavía no llegaron completos.
    const enCamino = historico.filter(
      (i) => i.pedido_id && ["enviado", "aprobado", "en_compra", "comprado"].includes(estado.get(i.pedido_id) ?? "") && !i.cancelado && Number(i.cantidad_recibida ?? 0) < Number(i.cantidad),
    );
    return { sugerencias: [...porClave.values()], sectores, lista, enCamino, numero, pedidos, historico };
  }, [data, lista]);
}

function ItemForm({ item, autor, onDone, onCancel }: { item: Item | null; autor: string | null; onDone: () => void; onCancel: () => void }) {
  const catalogo = useCatalogoInsumos();
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
  const [verSugerencias, setVerSugerencias] = useState(false);
  const [rapida, setRapida] = useState(false);
  const descRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const cant = Math.max(0, aNumero(f.cantidad));
  const precio = aNumero(f.precio);

  const clave = normalizar(f.descripcion);
  const sugerencias = useMemo(() => {
    if (clave.length < 2) return [];
    const palabras = clave.split(" ");
    return catalogo.sugerencias
      .filter((s) => {
        const n = normalizar(s.descripcion);
        return n !== clave && palabras.every((p) => n.includes(p));
      })
      .sort((a, b) => b.veces - a.veces || b.fecha.localeCompare(a.fecha))
      .slice(0, 6);
  }, [clave, catalogo.sugerencias]);
  const conocido = catalogo.sugerencias.find((s) => normalizar(s.descripcion) === clave);
  // Avisos de duplicado: ya está en la lista o ya está pedido y no llegó.
  const yaEnLista = clave && !item ? catalogo.lista.find((i) => normalizar(i.descripcion) === clave) : undefined;
  const yaEnCamino = clave ? catalogo.enCamino.find((i) => normalizar(i.descripcion) === clave) : undefined;

  const usar = (s: Sugerencia) => {
    setF((x) => ({
      ...x,
      descripcion: s.descripcion,
      unidad: s.unidad,
      precio: s.precio != null ? String(s.precio) : x.precio,
      link: s.link ?? x.link,
      sector: x.sector || s.sector || "",
    }));
    if (s.link) setMas(true);
    setVerSugerencias(false);
  };

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
    // El sector queda puesto: lo normal es cargar varias cosas para el mismo lugar.
    if (!item) {
      setF((x) => ({ ...x, descripcion: "", cantidad: "1", unidad: "u.", precio: "", link: "", notas: "", urgente: false }));
      setMas(false);
      descRef.current?.focus();
    }
    onDone();
  };

  const paso = (d: number) => setF((x) => ({ ...x, cantidad: String(Math.max(1, (aNumero(x.cantidad) || 0) + d)) }));

  return (
    <form onSubmit={submit} className={cn("panel space-y-3 p-4", item && "ring-2 ring-primary/40")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {item ? <Pencil className="size-4 text-primary" /> : <Plus className="size-4 text-primary" />}
          {item ? "Editar ítem" : "Agregar a la lista"}
        </p>
        {!item && (
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRapida(true)}>
            <ClipboardList className="size-3.5" /> Carga rápida
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-12">
        <div className="relative space-y-1 sm:col-span-6">
          <Label className="text-xs">¿Qué hace falta? *</Label>
          <Input
            ref={descRef}
            value={f.descripcion}
            onChange={(e) => {
              set("descripcion")(e);
              setVerSugerencias(true);
            }}
            onFocus={() => setVerSugerencias(true)}
            onBlur={() => window.setTimeout(() => setVerSugerencias(false), 150)}
            onKeyDown={(e) => e.key === "Escape" && setVerSugerencias(false)}
            placeholder="Escribí y elegí algo ya pedido, o uno nuevo"
            className="h-9"
            autoComplete="off"
            autoFocus={!!item}
          />
          {verSugerencias && sugerencias.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1">
              <li className="border-b border-border/60 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Ya pedido antes</li>
              {sugerencias.map((s) => (
                <li key={s.descripcion}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => usar(s)}
                    className="fila-clic flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]"
                  >
                    <History className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{s.descripcion}</span>
                    <span className="num shrink-0 text-xs text-muted-foreground">
                      {s.precio ? pesos(s.precio) : "sin precio"} · {s.veces}×
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
            {UNIDADES.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>

        {(conocido || yaEnLista || yaEnCamino) && (
          <div className="space-y-1 text-xs sm:col-span-12">
            {conocido && (
              <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                <History className="size-3.5" />
                Última vez{conocido.numero ? ` en ${numeroPedidoInsumos(conocido.numero)}` : ""}
                {conocido.fecha ? ` (${new Date(conocido.fecha).toLocaleDateString("es-AR")})` : ""}
                {conocido.precio ? `: ${pesos(conocido.precio)} c/u` : ""}
                {conocido.precio != null && String(conocido.precio) !== f.precio && (
                  <button type="button" className="text-primary hover:underline" onClick={() => setF((x) => ({ ...x, precio: String(conocido.precio) }))}>
                    usar ese precio
                  </button>
                )}
              </p>
            )}
            {yaEnLista && (
              <p className="flex items-center gap-1.5 text-warn">
                <TriangleAlert className="size-3.5" /> Ya está en la lista ({Number(yaEnLista.cantidad)} {yaEnLista.unidad}). Si lo agregás queda repetido; mejor editá el que está.
              </p>
            )}
            {yaEnCamino && (
              <p className="flex items-center gap-1.5 text-warn">
                <TriangleAlert className="size-3.5" /> Ya está pedido en {yaEnCamino.pedido_id ? numeroPedidoInsumos(catalogo.numero.get(yaEnCamino.pedido_id) ?? 0) : "otro pedido"} y todavía no llegó.
              </p>
            )}
          </div>
        )}

        <div className="space-y-1 sm:col-span-4">
          <Label className="text-xs">Para qué sector</Label>
          <Input value={f.sector} onChange={set("sector")} placeholder="Sistemas, Guardia…" className="h-9" list="sectores-insumo" />
          <datalist id="sectores-insumo">
            {catalogo.sectores.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
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
        <p className="num text-xs text-muted-foreground">{cant && precio ? `Subtotal estimado ${pesos(cant * precio)}` : "Tip: Enter agrega el ítem y el sector queda puesto para el próximo"}</p>
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
      {rapida && <CargaRapida catalogo={catalogo} autor={autor} sectorInicial={f.sector} onClose={() => setRapida(false)} onDone={onDone} />}
    </form>
  );
}

const UNIDADES = ["u.", "caja", "bolsa", "pack", "metro", "rollo", "resma", "litro"];

/** Pegar varios ítems de una (uno por renglón) o traer los de un pedido anterior. */
function CargaRapida({
  catalogo,
  autor,
  sectorInicial,
  onClose,
  onDone,
}: {
  catalogo: ReturnType<typeof useCatalogoInsumos>;
  autor: string | null;
  sectorInicial: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [sector, setSector] = useState(sectorInicial);
  const [busy, setBusy] = useState(false);
  const [nombrePlantilla, setNombrePlantilla] = useState<string | null>(null);
  const { data: plantillas = [] } = useQuery({
    queryKey: ["insumos_plantillas"],
    queryFn: async () => ((await api.from("insumos_plantillas").select("*").order("nombre")).data ?? []) as { id: string; nombre: string; lineas: string }[],
  });
  const agregarTexto = (nuevas: string) => setTexto((t) => (t.trim() ? `${t.trim()}\n${nuevas}` : nuevas));
  const guardarPlantilla = async () => {
    const nombre = (nombrePlantilla ?? "").trim();
    if (nombre.length < 3) return toast.error("Poné un nombre (por ejemplo «Kit puesto nuevo»)");
    const { error } = await api.from("insumos_plantillas").insert({ nombre, lineas: texto.trim() });
    if (error) return toast.error(error.message.includes("unique") || error.message.includes("duplic") ? "Ya hay una plantilla con ese nombre" : error.message);
    toast.success(`Plantilla «${nombre}» guardada`);
    setNombrePlantilla(null);
    void qc.invalidateQueries({ queryKey: ["insumos_plantillas"] });
  };
  const borrarPlantilla = async (id: string) => {
    const { error } = await api.from("insumos_plantillas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["insumos_plantillas"] });
  };
  const recientes = catalogo.pedidos.filter((p) => p.estado !== "rechazado").slice(0, 15);

  const lineas = texto
    .split(/\r?\n/)
    .map(leerLineaInsumo)
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map((l) => {
      const previo = catalogo.sugerencias.find((s) => normalizar(s.descripcion) === normalizar(l.descripcion));
      return { ...l, unidad: l.unidad === "u." && previo ? previo.unidad : l.unidad, precio: previo?.precio ?? null, link: previo?.link ?? null };
    });

  const traer = (pedidoId: string) => {
    const its = catalogo.historico.filter((i) => i.pedido_id === pedidoId && !i.cancelado);
    agregarTexto(its.map((i) => `${Number(i.cantidad)} ${i.unidad && i.unidad !== "u." ? `${i.unidad} ` : "x "}${i.descripcion}`).join("\n"));
  };

  const agregar = async () => {
    if (!lineas.length) return toast.error("No hay ítems para agregar");
    setBusy(true);
    const { error } = await api.from("insumos_items").insert(
      lineas.map((l) => ({
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        unidad: l.unidad,
        precio_estimado: l.precio,
        link: l.link,
        sector: sector.trim() || null,
        prioridad: "normal",
        created_by_nombre: autor,
      })),
    );
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${lineas.length} ítem(s) agregados a la lista`);
    onDone();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Carga rápida</DialogTitle>
          <DialogDescription>
            Un ítem por renglón, por ejemplo «3 x Mouse USB» o «2 cajas de Cable UTP». Si algo ya se pidió antes, toma la unidad y el último precio.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {plantillas.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Pedidos frecuentes</Label>
              <div className="flex flex-wrap gap-1.5">
                {plantillas.map((p) => (
                  <span key={p.id} className="group inline-flex items-center overflow-hidden rounded-md border border-border">
                    <button type="button" onClick={() => agregarTexto(p.lineas)} className="px-2.5 py-1 text-xs font-medium hover:bg-primary/10 hover:text-primary">
                      {p.nombre}
                    </button>
                    <button type="button" onClick={() => void borrarPlantilla(p.id)} className="hidden border-l border-border px-1.5 py-1 text-muted-foreground hover:text-destructive group-hover:block" aria-label={`Borrar ${p.nombre}`}>
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {recientes.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Repetir un pedido anterior</Label>
              <Select onValueChange={traer}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Elegí un pedido para traer sus ítems…" />
                </SelectTrigger>
                <SelectContent>
                  {recientes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {numeroPedidoInsumos(p.numero)} · {new Date(p.created_at).toLocaleDateString("es-AR")} · {catalogo.historico.filter((i) => i.pedido_id === p.id).length} ítems
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} placeholder={"3 x Mouse USB\nTeclado USB x2\n1 caja de Cable UTP Cat6"} className="font-mono text-[13px]" autoFocus />
          <div className="space-y-1.5">
            <Label className="text-xs">Para qué sector (todos)</Label>
            <Input value={sector} onChange={(e) => setSector(e.target.value)} list="sectores-insumo" placeholder="Opcional" className="h-9" />
          </div>
          {lineas.length > 1 &&
            (nombrePlantilla === null ? (
              <button type="button" className="w-fit text-xs text-primary hover:underline" onClick={() => setNombrePlantilla("")}>
                Guardar esta lista como pedido frecuente
              </button>
            ) : (
              <div className="flex gap-1.5">
                <Input value={nombrePlantilla} onChange={(e) => setNombrePlantilla(e.target.value)} placeholder="Nombre (ej. Kit puesto nuevo)" className="h-8 text-xs" autoFocus />
                <Button type="button" size="sm" className="h-8" onClick={() => void guardarPlantilla()}>
                  Guardar
                </Button>
              </div>
            ))}
          {lineas.length > 0 && (
            <ul className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border/70 bg-muted/20 p-2 text-xs">
              {lineas.map((l, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate">{l.descripcion}</span>
                  <span className="num shrink-0 text-muted-foreground">
                    {l.cantidad} {l.unidad}
                    {l.precio ? ` · ${pesos(l.precio)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void agregar()} disabled={busy || !lineas.length}>
            {busy ? <Loader2 className="animate-spin" /> : <ListPlus />} Agregar {lineas.length || ""} a la lista
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
