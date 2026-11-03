import { useEffect, useState } from "react";
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
import { cn } from "@/lib/utils";

type Pedido = {
  titulo: string;
  detalle?: string;
  accion?: string;
  peligro?: boolean;
  resolver: (ok: boolean) => void;
};

let abrir: ((p: Pedido) => void) | null = null;

/**
 * Reemplazo de window.confirm con el diálogo del sistema (se ve igual en celular y en modo oscuro).
 *   if (!(await confirmar("¿Eliminar el ticket?", { peligro: true }))) return;
 */
export function confirmar(titulo: string, opciones: { detalle?: string; accion?: string; peligro?: boolean } = {}) {
  return new Promise<boolean>((resolver) => {
    if (!abrir) return resolver(window.confirm(titulo));
    abrir({ titulo, ...opciones, resolver });
  });
}

/** Se monta una vez (en el layout de la app). */
export function ConfirmarHost() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  useEffect(() => {
    abrir = setPedido;
    return () => {
      abrir = null;
    };
  }, []);
  const cerrar = (ok: boolean) => {
    pedido?.resolver(ok);
    setPedido(null);
  };
  return (
    <AlertDialog open={!!pedido} onOpenChange={(o) => !o && cerrar(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pedido?.titulo}</AlertDialogTitle>
          {pedido?.detalle && <AlertDialogDescription>{pedido.detalle}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => cerrar(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={cn(pedido?.peligro && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            onClick={() => cerrar(true)}
          >
            {pedido?.accion ?? (pedido?.peligro ? "Eliminar" : "Confirmar")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
