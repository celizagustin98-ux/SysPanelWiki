import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ExternalLink, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { FiltroChips, PieTabla, THEAD_CLASE, ThOrden, useOrden } from "@/components/tabla/Tabla";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { SecretoOculto, rpcRevelar, useClaveVer } from "@/components/ClaveVer";

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
};

function CredencialesPage() {
  const { user, can } = useAuth();
  const puedeVer = can("credenciales", "view");
  const puedeCrear = can("credenciales", "create");
  const puedeEditar = can("credenciales", "edit");
  const puedeEliminar = can("credenciales", "delete");
  const qc = useQueryClient();
  const claves = useClaveVer();
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("todas");

  const { data = [], isError, isLoading } = useQuery({
    queryKey: ["credenciales"],
    enabled: puedeVer,
    queryFn: async () => {
      const { data, error } = await api.from("credenciales").select("*").order("servicio");
      if (error) throw error;
      return data as Cred[];
    },
  });

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
        (!term ||
          [c.servicio, c.categoria, c.usuario, c.ip, c.url, c.notas]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(term))),
    );
  }, [data, q, categoria]);

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
    if (!window.confirm(`¿Eliminar la credencial de "${c.servicio}"?`)) return;
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
      {claves.dialogo}
      <PageHeader
        eyebrow="Accesos cifrados"
        title="Credenciales"
        description="Secretos cifrados en reposo. Ver o copiar pide la clave de visualización, queda registrado en auditoría y se oculta al minuto."
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
                    <p className="font-medium">{c.servicio}</p>
                    {c.notas && <p className="max-w-[260px] truncate text-[11px] text-muted-foreground" title={c.notas}>{c.notas}</p>}
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
                      <Button size="icon" variant="ghost" className="size-8" aria-label="Eliminar" onClick={() => void eliminar(c)}>
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
    </div>
  );
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
  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
              <Label>Secreto{isEdit ? " (vacío = no cambiar)" : ""}</Label>
              <InputClave name="secreto" required={!isEdit} autoComplete="new-password" />
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
          <DialogFooter>
            <Button type="submit">{isEdit ? "Guardar cambios" : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
