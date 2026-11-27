import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Copy, Link2, Loader2, Send, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api/client";

type Estado = { vinculado: boolean; telegram_usuario?: string | null; avisos_personales?: boolean; bot_configurado: boolean };

/** Mi perfil → Telegram: vincular la cuenta para recibir los avisos propios por privado y usar los botones del bot. */
export function TelegramVinculo() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["telegram_mi_vinculo"],
    queryFn: async () => (await api.rpc("telegram_mi_vinculo")).data as Estado,
  });
  const [codigo, setCodigo] = useState<{ valor: string; vence: number } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [resta, setResta] = useState(0);

  // Mientras hay un código esperando, se revisa cada pocos segundos si ya se vinculó.
  useEffect(() => {
    if (!codigo) return;
    const id = window.setInterval(() => {
      const s = Math.max(0, Math.round((codigo.vence - Date.now()) / 1000));
      setResta(s);
      if (s === 0) setCodigo(null);
      void qc.invalidateQueries({ queryKey: ["telegram_mi_vinculo"] });
    }, 3000);
    return () => window.clearInterval(id);
  }, [codigo, qc]);
  useEffect(() => {
    if (data?.vinculado && codigo) {
      setCodigo(null);
      toast.success("¡Telegram vinculado!");
    }
  }, [data?.vinculado, codigo]);

  const generar = async () => {
    setCargando(true);
    const { data: r, error } = await api.rpc("telegram_generar_codigo");
    setCargando(false);
    if (error) return toast.error(error.message);
    setCodigo({ valor: (r as { codigo: string }).codigo, vence: Date.now() + 10 * 60_000 });
    setResta(600);
  };
  const desvincular = async () => {
    const { error } = await api.rpc("telegram_desvincular");
    if (error) return toast.error(error.message);
    toast.success("Telegram desvinculado");
    void qc.invalidateQueries({ queryKey: ["telegram_mi_vinculo"] });
  };
  const avisos = async (activo: boolean) => {
    const { error } = await api.rpc("telegram_avisos_personales", { _activo: activo });
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["telegram_mi_vinculo"] });
  };

  if (!data) return null;
  return (
    <Card className="panel">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Send className="size-4 text-primary" /> Telegram
        </CardTitle>
        <CardDescription>Recibí tus avisos por privado (tickets asignados, resueltos, pedidos) y usá los botones "Lo tomo" y "Resuelto" del bot.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!data.bot_configurado ? (
          <p className="text-muted-foreground">Todavía no hay un bot configurado. Un administrador lo activa en Configuración → Bot Sistema.</p>
        ) : data.vinculado ? (
          <>
            <p className="flex items-center gap-2">
              <span className="led" data-tone="ok" data-pulse /> Vinculado{data.telegram_usuario ? <> como <b>@{data.telegram_usuario}</b></> : null}
            </p>
            <label className="flex items-start gap-2.5">
              <Checkbox className="mt-0.5" checked={data.avisos_personales !== false} onCheckedChange={(v) => void avisos(v === true)} />
              <span>
                Recibir mis avisos por privado
                <span className="block text-xs text-muted-foreground">Solo de 9 a 22 h (lo de afuera de ese horario llega al empezar).</span>
              </span>
            </label>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void desvincular()}>
              <Unlink className="size-3.5" /> Desvincular
            </Button>
          </>
        ) : codigo ? (
          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <p>Abrí el chat privado con el bot del área en Telegram y mandale:</p>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 font-mono text-base font-semibold"
              onClick={() => void navigator.clipboard.writeText(`/vincular ${codigo.valor}`).then(() => toast.success("Copiado"))}
              title="Copiar"
            >
              /vincular {codigo.valor}
              <Copy className="size-4 text-muted-foreground" />
            </button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Esperando… el código vence en {Math.floor(resta / 60)}:{String(resta % 60).padStart(2, "0")}
            </p>
          </div>
        ) : (
          <Button size="sm" onClick={() => void generar()} disabled={cargando}>
            {cargando ? <Loader2 className="animate-spin" /> : <Link2 />} Vincular mi Telegram
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
