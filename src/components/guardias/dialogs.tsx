import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/integrations/api/client";
import { cn } from "@/lib/utils";
import {
  type OperarioRow,
  normalizeName,
  suggestCode,
} from "@/components/guardias/domain";

export function OperariosDialog({ rows, onDone }: { rows: OperarioRow[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  const usedCodes = useMemo(() => new Set(rows.map((r) => r.code.toUpperCase())), [rows]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = normalizeName(nombre);
    if (!n) return toast.error("Ingresá el nombre");
    const c = (code.trim() || suggestCode(n, usedCodes)).toUpperCase().slice(0, 2);
    if (usedCodes.has(c) && rows.some((r) => r.code.toUpperCase() === c && r.activo)) {
      return toast.error(`El código ${c} ya está en uso`);
    }
    setSaving(true);
    const orden = (rows.reduce((m, r) => Math.max(m, r.orden), 0) || 0) + 1;
    const { error } = await api.from("guardia_operarios").insert({
      nombre: n,
      code: c,
      activo: true,
      orden,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Empleado agregado");
    setNombre("");
    setCode("");
    onDone();
  };

  const toggle = async (row: OperarioRow) => {
    if (row.id.startsWith("seed-")) {
      return toast.error("Ejecutá la migración de operarios en el servidor");
    }
    const { error } = await api
      .from("guardia_operarios")
      .update({ activo: !row.activo })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(row.activo ? "Desactivado" : "Reactivado");
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <UserPlus className="size-4" /> Cargar Empleado
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-4" /> Cargar empleado
          </DialogTitle>
        </DialogHeader>

        <form className="grid gap-3 rounded-lg border border-border p-3" onSubmit={submit}>
          <p className="text-xs text-muted-foreground">Agregar compañero al plantel de guardia</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_5rem_auto]">
            <div className="space-y-1">
              <Label>Nombre completo</Label>
              <Input
                value={nombre}
                onChange={(e) => {
                  setNombre(e.target.value);
                  if (!code) setCode(suggestCode(e.target.value, usedCodes));
                }}
                placeholder="APELLIDO NOMBRE"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Código</Label>
              <Input
                value={code}
                maxLength={2}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="A"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={saving}>
                {saving ? "…" : "Agregar"}
              </Button>
            </div>
          </div>
        </form>

        <div className="max-h-64 space-y-1 overflow-y-auto">
          {rows
            .slice()
            .sort((a, b) => a.orden - b.orden)
            .map((r) => (
              <div
                key={r.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm",
                  !r.activo && "opacity-50",
                )}
              >
                <span className="inline-flex size-6 items-center justify-center rounded border bg-muted text-[11px] font-bold">
                  {r.code}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{r.nombre}</span>
                {!r.activo && (
                  <Badge variant="secondary" className="text-[10px]">
                    Inactivo
                  </Badge>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => void toggle(r)}
                >
                  {r.activo ? "Desactivar" : "Activar"}
                </Button>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
