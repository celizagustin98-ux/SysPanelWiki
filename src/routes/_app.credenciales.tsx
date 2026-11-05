import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { ExternalLink, Lock, Pencil, Plus, Search, ShieldCheck, Trash2, Wand2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InputClave } from "@/components/InputClave";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FiltroChips, PieTabla, THEAD_CLASE, ThOrden, useOrden } from "@/components/tabla/Tabla";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { SecretoOculto, rpcRevelar, useSecretos } from "@/components/SecretoOculto";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { generarClave } from "@/lib/generar-clave";
import { useRoles } from "@/lib/roles";
import { cn } from "@/lib/utils";

/** Días sin cambiar la clave a partir de los cuales se avisa. */
const DIAS_CLAVE_VIEJA = 365;

type Salud = { id: string; repetida: number; dias: number; debil: boolean };

export const Route = createFileRoute("/_app/credenciales")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Credenciales · Nodara" },
      { name: "description", content: "Bóveda protegida de accesos, IPs y servicios de infraestructura." },
      { property: "og:title", content: "Credenciales | Bóveda segura" },
      { property: "og:description", content: "Accesos de infraestructura organizados y restringidos por rol." },
    ],
  }),
  component: CredencialesPage,
});

type Cred = {
  id: string;
  servicio: string;
  categoria: string;
  usuario: string | null;
  secreto: string | null;
  has_secreto?: boolean;
  ip: string | null;
  url: string | null;
  notas: string | null;
  updated_at?: string | null;
  roles_permitidos?: string[] | null;
  responsable_id?: string | null;
  rotar_cada_dias?: number | null;
};

const ROTACION = [
  ["90", "Cada 3 meses"],
  ["180", "Cada 6 meses"],
  ["365", "Cada año"],
] as const;

function usePerfiles() {
  return useQuery({
    queryKey: ["directorio_usuarios"],
    staleTime: 5 * 60_000,
    queryFn: async () => ((await api.rpc("directorio_usuarios")).data ?? []) as { id: string; full_name: string }[],
  });
}

/**
 * Copia el usuario y deja a mano la clave: el aviso tiene un botón para copiarla después de pegar
 * el usuario. El portapapeles se limpia solo a los 45 segundos.
 */
async function copiarAcceso(c: Cred) {
  const limpiar = (valor: string) =>
    window.setTimeout(async () => {
      try {
        if ((await navigator.clipboard.readText()) === valor) await navigator.clipboard.writeText("");
      } catch {
        /* sin permiso para leer el portapapeles: se deja como está */
      }
    }, 45_000);
  const copiarClave = async () => {
    try {
      const clave = await rpcRevelar("revelar_credencial", { _id: c.id, _via: "copiar" })();
      await navigator.clipboard.writeText(clave);
      limpiar(clave);
      toast.success("Clave copiada (se borra del portapapeles en 45 s)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo copiar la clave");
    }
  };
  if (!c.usuario) return copiarClave();
  await navigator.clipboard.writeText(c.usuario);
  toast.success(`Usuario copiado: pegalo y después copiá la clave`, {
    duration: 20_000,
    action: { label: "Copiar clave", onClick: () => void copiarClave() },
  });
}

function CredencialesPage() {
  const { user, can } = useAuth();
  const puedeVer = can("credenciales", "view");
  const puedeCrear = can("credenciales", "create");
  const puedeEditar = can("credenciales", "edit");
  const puedeEliminar = can("credenciales", "delete");
  const qc = useQueryClient();
  const claves = useSecretos();
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [problema, setProblema] = useState<"todos" | "repetidas" | "debiles" | "viejas">("todos");
  const [aEliminar, setAEliminar] = useState<Cred | null>(null);
  const { data: roles = [] } = useRoles();
  const nombreRol = (clave: string) => roles.find((r) => r.clave === clave)?.nombre ?? clave;

  const { data = [], isError, isLoading } = useQuery({
    queryKey: ["credenciales"],
    enabled: puedeVer,
    queryFn: async () => {
      const { data, error } = await api.from("credenciales").select("*").order("servicio");
      if (error) throw error;
      return data as Cred[];
    },
  });

  const { data: salud = [] } = useQuery({
    queryKey: ["credenciales", "salud"],
    enabled: puedeVer,
    queryFn: async () => {
      const { data, error } = await api.rpc("salud_credenciales");
      if (error) throw error;
      return (data ?? []) as Salud[];
    },
  });
  const saludDe = useMemo(() => new Map(salud.map((x) => [x.id, x])), [salud]);
  const conteo = {
    repetidas: salud.filter((x) => x.repetida > 0).length,
    debiles: salud.filter((x) => x.debil).length,
    viejas: salud.filter((x) => x.dias >= DIAS_CLAVE_VIEJA).length,
  };

  const categorias = useMemo(() => {
    const m = new Map<string, number>();
    data.forEach((c) => m.set(c.categoria, (m.get(c.categoria) ?? 0) + 1));
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [data]);

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.filter(
      (c) =>
        (categoria === "todas" || c.categoria === categoria) &&
        (problema === "todos" ||
          (problema === "repetidas" && (saludDe.get(c.id)?.repetida ?? 0) > 0) ||
          (problema === "debiles" && !!saludDe.get(c.id)?.debil) ||
          (problema === "viejas" && (saludDe.get(c.id)?.dias ?? 0) >= DIAS_CLAVE_VIEJA)) &&
        (!term ||
          [c.servicio, c.categoria, c.usuario, c.ip, c.url, c.notas]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(term))),
    );
  }, [data, q, categoria, problema, saludDe]);

  const { ordenadas, orden, alternar } = useOrden(filtradas, {
    servicio: (c) => c.servicio,
    categoria: (c) => c.categoria,
    usuario: (c) => c.usuario,
    acceso: (c) => c.ip || c.url,
    actualizado: (c) => c.updated_at,
  });

  const copiar = async (texto: string, aviso: string) => {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
  };

  const eliminar = async (c: Cred) => {
    setAEliminar(null);
    const { error } = await api.from("credenciales").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Credencial eliminada");
    void qc.invalidateQueries({ queryKey: ["credenciales"] });
  };

  const refrescar = () => qc.invalidateQueries({ queryKey: ["credenciales"] });

  if (!puedeVer) {
    return (
      <div>
        <PageHeader title="Credenciales" description="Bóveda segura de infraestructura." />
        <Card className="panel">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ShieldCheck className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Tu rol no tiene acceso a la bóveda de credenciales.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Accesos cifrados"
        title="Credenciales"
        description="Secretos cifrados en reposo. Ver o copiar queda registrado en auditoría."
        action={
          puedeCrear ? (
            <CredDialog userId={user?.id} categorias={categorias.map(([c]) => c)} onDone={refrescar} />
          ) : undefined
        }
      />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar servicio, IP, usuario, notas…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <FiltroChips
          valor={categoria}
          onChange={setCategoria}
          opciones={[{ valor: "todas", label: "Todas", n: data.length }, ...categorias.map(([c, n]) => ({ valor: c, label: c, n }))]}
        />
      </div>

      {(conteo.repetidas > 0 || conteo.debiles > 0 || conteo.viejas > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warn/35 bg-warn/8 px-3 py-2 text-sm">
          <ShieldCheck className="size-4 text-warn" />
          <span className="font-medium">Revisá estas claves:</span>
          {(
            [
              ["repetidas", `${conteo.repetidas} repetida${conteo.repetidas === 1 ? "" : "s"}`, conteo.repetidas],
              ["debiles", `${conteo.debiles} débil${conteo.debiles === 1 ? "" : "es"}`, conteo.debiles],
              ["viejas", `${conteo.viejas} sin cambiar hace más de un año`, conteo.viejas],
            ] as const
          )
            .filter(([, , n]) => n > 0)
            .map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setProblema(problema === k ? "todos" : k)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  problema === k ? "border-warn bg-warn/20" : "border-warn/40 hover:bg-warn/15",
                )}
              >
                {label}
              </button>
            ))}
          {problema !== "todos" && (
            <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setProblema("todos")}>
              Ver todas
            </button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={THEAD_CLASE}>
                <ThOrden campo="servicio" orden={orden} onOrden={alternar} className="pl-4">Servicio</ThOrden>
                <ThOrden campo="categoria" orden={orden} onOrden={alternar} className="hidden md:table-cell">Categoría</ThOrden>
                <ThOrden campo="usuario" orden={orden} onOrden={alternar}>Usuario</ThOrden>
                <th className="px-3 py-2.5 font-medium">Secreto</th>
                <ThOrden campo="acceso" orden={orden} onOrden={alternar} className="hidden lg:table-cell">IP / URL</ThOrden>
                <ThOrden campo="actualizado" orden={orden} onOrden={alternar} className="hidden xl:table-cell">Actualizada</ThOrden>
                <th className="px-3 py-2.5 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 4 }, (_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td colSpan={7} className="px-4 py-3"><div className="skeleton h-5" /></td>
                  </tr>
                ))}
              {ordenadas.map((c) => (
                <tr key={c.id} className="group border-b border-border/60 last:border-0 hover:bg-muted/20">
                  <td className="py-2.5 pl-4 pr-3">
                    <p className="flex items-center gap-1.5 font-medium">
                      {c.servicio}
                      {!!c.roles_permitidos?.length && (
                        <span title={`Solo la ven: ${c.roles_permitidos.map(nombreRol).join(", ")} (y administradores)`}>
                          <Lock className="size-3.5 text-muted-foreground" />
                        </span>
                      )}
                    </p>
                    {c.notas && <p className="max-w-[260px] truncate text-[11px] text-muted-foreground" title={c.notas}>{c.notas}</p>}
                    <AvisosClave s={saludDe.get(c.id)} rotar={c.rotar_cada_dias} />
                  </td>
                  <td className="hidden px-3 py-2.5 md:table-cell">
                    <Badge variant="secondary" className="capitalize">{c.categoria}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    {c.usuario ? (
                      <button type="button" className="font-mono text-xs hover:text-primary" title="Copiar usuario" onClick={() => void copiar(c.usuario!, "Usuario copiado")}>
                        {c.usuario}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    <SecretoOculto
                      id={c.id}
                      tiene={!!(c.has_secreto || c.secreto)}
                      ctl={claves}
                      compacto
                      fetcher={rpcRevelar("revelar_credencial", { _id: c.id, _via: "ver" })}
                    />
                    {(c.has_secreto || c.secreto) && (
                      <button
                        type="button"
                        onClick={() => void copiarAcceso(c)}
                        className="ml-1 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 align-middle font-sans text-[10.5px] text-muted-foreground hover:border-primary/50 hover:text-primary"
                        title="Copia el usuario y después la clave"
                      >
                        <KeyRound className="size-3" /> Acceso
                      </button>
                    )}
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs lg:table-cell">
                    {c.ip && <span className="font-mono">{c.ip}</span>}
                    {c.ip && c.url && <span className="text-muted-foreground"> · </span>}
                    {c.url &&
                      (/^https?:\/\//i.test(c.url) ? (
                        <a href={c.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                          {c.url.replace(/^https?:\/\//i, "").slice(0, 40)}
                          <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <span>{c.url}</span>
                      ))}
                    {!c.ip && !c.url && <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-muted-foreground xl:table-cell">
                    {c.updated_at ? new Date(c.updated_at).toLocaleDateString("es-AR") : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    {puedeEditar && <CredDialog userId={user?.id} existing={c} categorias={categorias.map(([x]) => x)} onDone={refrescar} />}
                    {puedeEliminar && (
                      <Button size="icon" variant="ghost" className="size-8" aria-label="Eliminar" onClick={() => setAEliminar(c)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && (ordenadas.length === 0 || isError) && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    {data.length ? "Ninguna credencial coincide con el filtro." : "Sin credenciales cargadas."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PieTabla mostrando={ordenadas.length} total={data.length} />
      </div>

      <AlertDialog open={!!aEliminar} onOpenChange={(o) => !o && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar la credencial de "{aEliminar?.servicio}"</AlertDialogTitle>
            <AlertDialogDescription>La clave se borra de la bóveda y no se puede recuperar. Queda registrado en Auditoría.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => aEliminar && void eliminar(aEliminar)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Repetida, débil o sin cambiar hace mucho: avisos debajo del nombre del servicio. */
function AvisosClave({ s, rotar }: { s?: Salud; rotar?: number | null }) {
  if (!s) return null;
  const avisos: string[] = [];
  if (rotar && s.dias >= rotar) avisos.push("Toca cambiarla");
  if (s.repetida > 0) avisos.push(`Repetida en ${s.repetida} más`);
  if (s.debil) avisos.push("Débil");
  if (s.dias >= DIAS_CLAVE_VIEJA) avisos.push(`Sin cambiar hace ${s.dias >= 730 ? `${Math.floor(s.dias / 365)} años` : `${Math.floor(s.dias / 30)} meses`}`);
  if (!avisos.length) return null;
  return <p className="mt-0.5 text-[10.5px] font-medium text-warn">{avisos.join(" · ")}</p>;
}

function CredDialog({
  userId,
  onDone,
  existing,
  categorias = [],
}: {
  userId?: string;
  onDone: () => void;
  existing?: Cred;
  categorias?: string[];
}) {
  const [open, setOpen] = useState(false);
  const isEdit = !!existing;
  const claveRef = useRef<HTMLInputElement>(null);
  const { data: roles = [] } = useRoles();
  const [permitidos, setPermitidos] = useState<string[]>(existing?.roles_permitidos ?? []);
  const { data: perfiles = [] } = usePerfiles();
  const [responsable, setResponsable] = useState(existing?.responsable_id ?? "none");
  const [rotar, setRotar] = useState(existing?.rotar_cada_dias ? String(existing.rotar_cada_dias) : "none");
  const generar = async () => {
    const c = generarClave();
    if (claveRef.current) claveRef.current.value = c;
    try {
      await navigator.clipboard.writeText(c);
      toast.success("Clave generada y copiada: pegala también en el equipo o servicio");
    } catch {
      toast.success("Clave generada");
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setPermitidos(existing?.roles_permitidos ?? []);
          setResponsable(existing?.responsable_id ?? "none");
          setRotar(existing?.rotar_cada_dias ? String(existing.rotar_cada_dias) : "none");
        }
      }}
    >
      <DialogTrigger asChild>
        {isEdit ? (
          <Button size="icon" variant="ghost" className="size-8" aria-label="Editar">
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" /> Nueva credencial
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar credencial" : "Nueva credencial"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const payload = {
              servicio: String(fd.get("servicio")),
              categoria: String(fd.get("categoria") || "infraestructura"),
              usuario: String(fd.get("usuario") || ""),
              secreto: String(fd.get("secreto") || ""),
              ip: String(fd.get("ip") || ""),
              url: String(fd.get("url") || ""),
              notas: String(fd.get("notas") || ""),
              roles_permitidos: permitidos.length ? permitidos : null,
              responsable_id: responsable === "none" ? null : responsable,
              rotar_cada_dias: rotar === "none" ? null : Number(rotar),
              created_by: userId ?? null,
            };
            if (isEdit) {
              if (!payload.secreto) delete (payload as { secreto?: string }).secreto;
              const { error } = await api.from("credenciales").update(payload).eq("id", existing!.id);
              if (error) return toast.error(error.message);
              toast.success("Credencial actualizada");
            } else {
              const { error } = await api.from("credenciales").insert(payload);
              if (error) return toast.error(error.message);
              toast.success("Credencial guardada (cifrada)");
            }
            setOpen(false);
            onDone();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Servicio</Label>
              <Input name="servicio" required defaultValue={existing?.servicio} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Input name="categoria" list="cred-categorias" defaultValue={existing?.categoria || "infraestructura"} />
              <datalist id="cred-categorias">
                {[...new Set(["infraestructura", "servidores", "redes", "web", "correo", "licencias", ...categorias])].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Usuario</Label>
              <Input name="usuario" defaultValue={existing?.usuario ?? ""} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Secreto{isEdit ? " (vacío = no cambiar)" : ""}</Label>
                <button type="button" onClick={() => void generar()} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Wand2 className="size-3" /> Generar
                </button>
              </div>
              <InputClave ref={claveRef} name="secreto" required={!isEdit} autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label>IP</Label>
              <Input name="ip" defaultValue={existing?.ip ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input name="url" defaultValue={existing?.url ?? ""} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea name="notas" defaultValue={existing?.notas ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label>Quién la ve</Label>
            <div className="flex flex-wrap gap-1.5">
              {roles
                .filter((r) => r.clave !== "administrador")
                .map((r) => {
                  const sel = permitidos.includes(r.clave);
                  return (
                    <button
                      key={r.clave}
                      type="button"
                      onClick={() => setPermitidos((p) => (sel ? p.filter((x) => x !== r.clave) : [...p, r.clave]))}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                        sel ? "border-primary/50 bg-primary/12 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {r.nombre}
                    </button>
                  );
                })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {permitidos.length ? "Solo estos roles (y los administradores) la ven, la revelan o la editan." : "Sin elegir: la ven todos los roles con acceso a Credenciales."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Select value={responsable} onValueChange={setResponsable}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin responsable</SelectItem>
                  {perfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cambiar la clave</Label>
              <Select value={rotar} onValueChange={setRotar}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin recordatorio</SelectItem>
                  {ROTACION.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="col-span-2 text-[11px] text-muted-foreground">Cuando toque cambiarla, el responsable recibe el aviso en sus notificaciones.</p>
          </div>
          <DialogFooter>
            <Button type="submit">{isEdit ? "Guardar cambios" : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
