import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Eye, EyeOff, Plus, ShieldCheck, Trash2 } from "lucide-react";
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
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/credenciales")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Credenciales | Bóveda segura" },
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
  ip: string | null;
  url: string | null;
  notas: string | null;
};

function CredencialesPage() {
  const { canWrite, isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  const { data = [], isError } = useQuery({
    queryKey: ["credenciales"],
    queryFn: async () => {
      const { data, error } = await api.from("credenciales").select("*").order("servicio");
      if (error) throw error;
      return data as Cred[];
    },
  });

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
        description="Accesos, IPs y servicios de infraestructura. Visible solo para Técnicos y Administradores."
        action={
          <CredDialog userId={user?.id} onDone={() => qc.invalidateQueries({ queryKey: ["credenciales"] })} />
        }
      />
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
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.servicio}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {c.categoria}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.usuario || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {visible[c.id] ? c.secreto : "••••••••"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.ip || "—"}
                    {c.url ? ` · ${c.url}` : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setVisible((v) => ({ ...v, [c.id]: !v[c.id] }))}
                    >
                      {visible[c.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(c.secreto ?? "");
                        toast.success("Copiado al portapapeles");
                      }}
                    >
                      <Copy className="size-4" />
                    </Button>
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
              {(data.length === 0 || isError) && (
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

function CredDialog({ userId, onDone }: { userId?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Nueva credencial
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva credencial</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const { error } = await api.from("credenciales").insert({
              servicio: String(fd.get("servicio")),
              categoria: String(fd.get("categoria") || "infraestructura"),
              usuario: String(fd.get("usuario") || ""),
              secreto: String(fd.get("secreto") || ""),
              ip: String(fd.get("ip") || ""),
              url: String(fd.get("url") || ""),
              notas: String(fd.get("notas") || ""),
              created_by: userId ?? null,
            });
            if (error) return toast.error(error.message);
            toast.success("Credencial guardada");
            setOpen(false);
            onDone();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Servicio</Label>
              <Input name="servicio" required />
            </div>
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Input name="categoria" defaultValue="infraestructura" />
            </div>
            <div className="space-y-1.5">
              <Label>Usuario</Label>
              <Input name="usuario" />
            </div>
            <div className="space-y-1.5">
              <Label>Secreto</Label>
              <Input name="secreto" type="password" />
            </div>
            <div className="space-y-1.5">
              <Label>IP</Label>
              <Input name="ip" />
            </div>
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input name="url" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea name="notas" />
          </div>
          <DialogFooter>
            <Button type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
