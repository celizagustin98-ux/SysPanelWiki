import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { type Ticket, ticketLabel } from "./constants";

export function ReopenDialog({
  open,
  ticket,
  perfiles,
  onClose,
  onConfirm,
}: {
  open: boolean;
  ticket: Ticket | null | undefined;
  perfiles: { id: string; full_name: string }[];
  onClose: () => void;
  onConfirm: (id: string, mode: "nuevo" | "asignar", asignado?: string) => void;
}) {
  const [mode, setMode] = useState<"nuevo" | "asignar">("nuevo");
  const [asignado, setAsignado] = useState("none");

  useEffect(() => {
    if (open) {
      setMode("nuevo");
      setAsignado("none");
    }
  }, [open, ticket?.id]);

  if (!ticket) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reabrir {ticketLabel(ticket)}</DialogTitle>
          <DialogDescription>
            Volvé el ticket a la cola activa. Podés dejarlo en Backlog o asignarlo a alguien.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setMode("nuevo")}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                mode === "nuevo" ? "border-primary/40 bg-primary/10" : "border-border hover:bg-muted/40",
              )}
            >
              <p className="font-medium">Volver a Backlog</p>
              <p className="text-xs text-muted-foreground">Estado nuevo, sin asignar</p>
            </button>
            <button
              type="button"
              onClick={() => setMode("asignar")}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                mode === "asignar" ? "border-primary/40 bg-primary/10" : "border-border hover:bg-muted/40",
              )}
            >
              <p className="font-medium">Asignar a un operario</p>
              <p className="text-xs text-muted-foreground">Estado asignado</p>
            </button>
          </div>
          {mode === "asignar" && (
            <Select value={asignado} onValueChange={setAsignado}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí operario" />
              </SelectTrigger>
              <SelectContent>
                {perfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (mode === "asignar" && (asignado === "none" || !asignado)) {
                return toast.error("Elegí un operario");
              }
              onConfirm(ticket.id, mode, mode === "asignar" ? asignado : undefined);
            }}
          >
            Reabrir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
