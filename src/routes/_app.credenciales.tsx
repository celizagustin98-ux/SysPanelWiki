import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Eye, EyeOff, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";

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
};

function CredencialesPage() {
  const { canWrite, isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [visible, setVisible] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const { data = [], isError } = useQuery({
    queryKey: ["credenciales"],
    queryFn: async () => {
      const { data, error } = await api.from("credenciales").select("*").order("servicio");
      if (error) throw error;
      return data as Cred[];
    },
  });

  const filtered = data.filter((c) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return [c.servicio, c.categoria, c.usuario, c.ip, c.url, c.notas]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(term));
  });

  const revelar = async (id: string, via: "ver" | "copiar") => {
    setLoadingId(id);
    const { data: revealed, error } = await api.rpc("revelar_credencial", { _id: id, _via: via });
    setLoadingId(null);
    if (error) {
      toast.error(error.message);
      return null;
    }
    const secreto = (revealed as { secreto?: string } | null)?.secreto ?? "";
    if (via === "ver") setVisible((v) => ({ ...v, [id]: secreto }));
    return secreto;
  };

  if (!canWrite) {
    return (
      <div>
        <PageHeader title="Credenciales" description="Bóveda segura de infraestructura." />
        <Card className="panel">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ShieldCheck className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Tu rol (Consulta) no tiene acceso a la bóveda de credenciales.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Credenciales"
        description="Secretos cifrados en reposo. Ver o copiar registra auditoría."
        action={
          <CredDialog userId={user?.id} onDone={() => qc.invalidateQueries({ queryKey: ["credenciales"] })} />
        }
      />
      <div className="mb-4">
        <Input
          className="max-w-md"
          placeholder="Buscar servicio, IP, usuario…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <Card className="panel">
        <CardContent className="overflow-x-auto p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Servicio</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Secreto</TableHead>
                <TableHead>IP / URL</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.servicio}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {c.categoria}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.usuario || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {visible[c.id] ?? (c.has_secreto || c.secreto ? "••••••••" : "—")}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.ip || "—"}
                    {c.url ? ` · ${c.url}` : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={loadingId === c.id}
                      onClick={async () => {
                        if (visible[c.id]) {
                          setVisible((v) => {
                            const next = { ...v };
                            delete next[c.id];
                            return next;
                          });
                          return;
                        }
                        await revelar(c.id, "ver");
                      }}
                    >
                      {visible[c.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={loadingId === c.id}
                      onClick={async () => {
                        const secreto = visible[c.id] ?? (await revelar(c.id, "copiar"));
                        if (secreto == null) return;
                        await navigator.clipboard.writeText(secreto);
                        toast.success("Copiado (queda registrado en auditoría)");
                      }}
                    >
                      <Copy className="size-4" />
                    </Button>
                    <CredDialog
                      userId={user?.id}
                      existing={c}
                      onDone={() => qc.invalidateQueries({ queryKey: ["credenciales"] })}
                    />
                    {isAdmin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          const { error } = await api.from("credenciales").delete().eq("id", c.id);
                          if (error) return toast.error(error.message);
                          toast.success("Credencial eliminada");
                          qc.invalidateQueries({ queryKey: ["credenciales"] });
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(filtered.length === 0 || isError) && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    Sin credenciales cargadas.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CredDialog({
  userId,
  onDone,
  existing,
}: {
  userId?: string;
  onDone: () => void;
  existing?: Cred;
}) {
  const [open, setOpen] = useState(false);
  const isEdit = !!existing;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button size="icon" variant="ghost">
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
              <Input name="categoria" defaultValue={existing?.categoria || "infraestructura"} />
            </div>
            <div className="space-y-1.5">
              <Label>Usuario</Label>
              <Input name="usuario" defaultValue={existing?.usuario ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Secreto{isEdit ? " (vacío = no cambiar)" : ""}</Label>
              <Input name="secreto" type="password" required={!isEdit} autoComplete="new-password" />
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
