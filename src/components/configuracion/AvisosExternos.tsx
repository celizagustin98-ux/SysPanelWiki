import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { InputClave } from "@/components/InputClave";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Evento = { value: string; label: string; detalle: string };

/** Avisos agrupados por tema. Los marcados "al momento" salen apenas pasa; el resto los revisa el bot cada minuto. */
const GRUPOS: { titulo: string; eventos: Evento[] }[] = [
  {
    titulo: "Resúmenes",
    eventos: [
      { value: "resumen_diario", label: "Resumen del día", detalle: "Tickets abiertos, sin asignar y vencidos, guardia de hoy, tóners bajos y pendientes (a la hora elegida)." },
      { value: "resumen_semanal", label: "Resumen de la semana", detalle: "Los lunes: tickets creados y resueltos, tóners, compras, versiones y horas extras." },
    ],
  },
  {
    titulo: "Tickets",
    eventos: [
      { value: "ticket_critico", label: "Ticket crítico (al momento)", detalle: "Cuando se carga un ticket con prioridad crítica." },
      { value: "ticket_sin_asignar", label: "Sin tomar", detalle: "Tickets que nadie tomó después de las horas configuradas." },
      { value: "ticket_sla", label: "Fuera de SLA", detalle: "Pasaron el plazo de resolución de su prioridad." },
      { value: "ticket_vencido", label: "Fecha límite vencida", detalle: "Tickets abiertos cuya fecha límite ya pasó." },
    ],
  },
  {
    titulo: "Guardias",
    eventos: [
      { value: "guardia_hoy", label: "Guardia de esta noche", detalle: "Quién está de guardia (o si no hay nadie), a la hora elegida." },
      { value: "intercambio_guardia", label: "Intercambios para aprobar", detalle: "Cuando un compañero pide cambiar una guardia." },
    ],
  },
  {
    titulo: "Stock, compras y equipos",
    eventos: [
      { value: "toner_bajo", label: "Tóner bajo el mínimo", detalle: "Cada vez que un modelo queda en o por debajo del mínimo." },
      { value: "pedido_estado", label: "Pedidos de compra", detalle: "Cuando un pedido se aprueba o se recibe completo." },
      { value: "mantenimiento", label: "Mantenimiento preventivo", detalle: "Equipos a los que les toca el preventivo." },
      { value: "garantia", label: "Garantías por vencer", detalle: "Equipos con garantía que vence en 30 días." },
    ],
  },
  {
    titulo: "Actualizaciones de sistemas",
    eventos: [
      { value: "version_pendiente", label: "Versión para subir (al momento)", detalle: "Cuando se registra una versión pendiente." },
      { value: "version_problemas", label: "Versión con problemas (al momento)", detalle: "Cuando una actualización se marca con problemas." },
      { value: "version_sin_subir", label: "Versión demorada", detalle: "Versiones pendientes hace más de 2 días." },
    ],
  },
  {
    titulo: "Servidor y seguridad",
    eventos: [
      { value: "respaldo", label: "Respaldo de la base", detalle: "Si falló o no hay uno de las últimas 26 h." },
      { value: "disco", label: "Disco casi lleno", detalle: "Cuando el disco supera el porcentaje elegido." },
      { value: "login_fallido", label: "Intentos de ingreso fallidos", detalle: "5 o más intentos fallidos con el mismo usuario en 15 minutos." },
      { value: "clave_rotar", label: "Claves para cambiar", detalle: "Credenciales con recordatorio de cambio vencido (solo el nombre, nunca la clave)." },
    ],
  },
];
const TODOS = GRUPOS.flatMap((g) => g.eventos.map((e) => e.value));

const COMANDOS = [
  ["/estado", "Resumen del área en ese momento"],
  ["/tickets", "Tickets abiertos más urgentes"],
  ["/guardia", "Próximas guardias"],
  ["/toners", "Stock de tóners"],
  ["/pendientes", "Versiones e intercambios esperando"],
  ["/ayuda", "Lista de comandos"],
] as const;

type Opciones = { hora_resumen: string; hora_guardia: string; solo_habiles: boolean; sin_asignar_horas: number; disco_pct: number; silencio_nocturno: boolean; comandos: boolean };
type Envio = { clave: string; evento: string; texto: string | null; ok: boolean | null; error: string | null; enviado_at: string };
type Config = { tiene_token: boolean; chat_id: string; eventos: string[]; opciones: Partial<Opciones>; envios: Envio[] };

const OPCIONES: Opciones = { hora_resumen: "08:00", hora_guardia: "19:30", solo_habiles: true, sin_asignar_horas: 2, disco_pct: 90, silencio_nocturno: true, comandos: true };
const nombreEvento = (v: string) => GRUPOS.flatMap((g) => g.eventos).find((e) => e.value === v)?.label ?? (v === "prueba" ? "Prueba" : v);

/** Bot Sistema: avisos por Telegram al grupo del área y respuesta a comandos. */
export function AvisosExternos() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["avisos_externos"],
    refetchInterval: 30_000,
    queryFn: async () => (await api.rpc("avisos_externos_leer")).data as Config,
  });
  const [token, setToken] = useState("");
  const [chat, setChat] = useState("");
  const [eventos, setEventos] = useState<string[]>([]);
  const [op, setOp] = useState<Opciones>(OPCIONES);
  const [cargado, setCargado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  useEffect(() => {
    if (!data || cargado) return;
    setChat(data.chat_id);
    setEventos(data.eventos);
    setOp({ ...OPCIONES, ...data.opciones });
    setCargado(true);
  }, [data, cargado]);
  const set = <K extends keyof Opciones>(k: K, v: Opciones[K]) => setOp((o) => ({ ...o, [k]: v }));

  const guardar = async (quitar = false) => {
    setGuardando(true);
    const { error } = await api.rpc("avisos_externos_guardar", { _token: token, _chat_id: chat, _eventos: eventos, _opciones: op, _quitar_token: quitar });
    setGuardando(false);
    if (error) return toast.error(error.message);
    setToken("");
    toast.success(quitar ? "Bot quitado: no se envían más avisos" : "Bot Sistema guardado");
    void qc.invalidateQueries({ queryKey: ["avisos_externos"] });
  };
  const probar = async () => {
    setProbando(true);
    const { error } = await api.rpc("avisos_externos_probar");
    setProbando(false);
    if (error) return toast.error(`No llegó: ${error.message}`);
    toast.success("Mensaje de prueba enviado: revisá el chat");
    void qc.invalidateQueries({ queryKey: ["avisos_externos"] });
  };

  if (isLoading || !data) return <div className="skeleton h-48" />;
  const activos = eventos.length;
  return (
    <div className="space-y-4">
      <Card className="panel">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <Bot className="size-4 text-primary" /> Conexión con Telegram
            <span className={cn("ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", data.tiene_token && data.chat_id ? "bg-ok/14 text-ok" : "bg-muted text-muted-foreground")}>
              <span className="led" data-tone={data.tiene_token && data.chat_id ? "ok" : undefined} data-pulse={data.tiene_token && !!data.chat_id} />
              {data.tiene_token && data.chat_id ? "Conectado" : "Sin configurar"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              En Telegram, hablale a <span className="font-medium text-foreground">@BotFather</span>, mandá <code>/newbot</code> y copiá el token que te da.
            </li>
            <li>Creá un grupo del área, agregá el bot y escribí cualquier mensaje.</li>
            <li>
              El número del chat aparece en <code>api.telegram.org/bot&lt;token&gt;/getUpdates</code> (en grupos empieza con <code>-</code>).
            </li>
          </ol>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Token del bot</Label>
              <InputClave value={token} onChange={(e) => setToken(e.target.value)} placeholder={data.tiene_token ? "Cargado · dejalo vacío para conservarlo" : "123456:ABC…"} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>Chat o grupo</Label>
              <Input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="-1001234567890" className="num" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">El servidor necesita salida a internet hacia api.telegram.org. El token se guarda cifrado y no se vuelve a mostrar. El bot solo responde en este chat.</p>
        </CardContent>
      </Card>

      <Card className="panel">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            Qué avisa el bot
            <span className="text-xs font-normal text-muted-foreground">
              {activos} de {TODOS.length} activos
            </span>
            <span className="ml-auto flex gap-2 text-xs font-normal">
              <button type="button" className="text-primary hover:underline" onClick={() => setEventos(TODOS)}>
                Todos
              </button>
              <button type="button" className="text-primary hover:underline" onClick={() => setEventos([])}>
                Ninguno
              </button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {GRUPOS.map((g) => (
            <section key={g.titulo} className="space-y-2 rounded-xl border border-border/70 p-3">
              <p className="eyebrow">{g.titulo}</p>
              {g.eventos.map((e) => (
                <label key={e.value} className="flex cursor-pointer items-start gap-2.5">
                  <Checkbox className="mt-0.5" checked={eventos.includes(e.value)} onCheckedChange={(v) => setEventos((x) => (v === true ? [...x, e.value] : x.filter((y) => y !== e.value)))} />
                  <span className="text-sm">
                    <span className="font-medium">{e.label}</span>
                    <span className="block text-xs text-muted-foreground">{e.detalle}</span>
                  </span>
                </label>
              ))}
            </section>
          ))}
        </CardContent>
      </Card>

      <Card className="panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Horarios y umbrales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Hora del resumen</Label>
            <Input type="time" value={op.hora_resumen} onChange={(e) => set("hora_resumen", e.target.value)} className="[color-scheme:light] dark:[color-scheme:dark]" />
          </div>
          <div className="space-y-1.5">
            <Label>Aviso de guardia</Label>
            <Input type="time" value={op.hora_guardia} onChange={(e) => set("hora_guardia", e.target.value)} className="[color-scheme:light] dark:[color-scheme:dark]" />
          </div>
          <div className="space-y-1.5">
            <Label>"Sin tomar" después de (horas)</Label>
            <Input type="number" min={1} max={72} value={op.sin_asignar_horas} onChange={(e) => set("sin_asignar_horas", Number(e.target.value))} className="num" />
          </div>
          <div className="space-y-1.5">
            <Label>Disco: avisar desde (%)</Label>
            <Input type="number" min={50} max={99} value={op.disco_pct} onChange={(e) => set("disco_pct", Number(e.target.value))} className="num" />
          </div>
          <label className="flex items-start gap-2.5 sm:col-span-2">
            <Checkbox className="mt-0.5" checked={op.solo_habiles} onCheckedChange={(v) => set("solo_habiles", v === true)} />
            <span>
              <span className="font-medium">Resumen solo los días hábiles</span>
              <span className="block text-xs text-muted-foreground">Sábados y domingos no se manda el resumen del día.</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 sm:col-span-2">
            <Checkbox className="mt-0.5" checked={op.silencio_nocturno} onCheckedChange={(v) => set("silencio_nocturno", v === true)} />
            <span>
              <span className="font-medium">Silencio de 22 a 7 h</span>
              <span className="block text-xs text-muted-foreground">De noche solo llegan los urgentes (críticos, respaldo, disco, seguridad, guardia); el resto sale a la mañana.</span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card className="panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Comandos en el grupo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="flex items-start gap-2.5">
            <Checkbox className="mt-0.5" checked={op.comandos} onCheckedChange={(v) => set("comandos", v === true)} />
            <span>
              <span className="font-medium">Responder comandos</span>
              <span className="block text-xs text-muted-foreground">Cualquiera del grupo puede consultar el estado escribiendo un comando. Fuera de ese grupo el bot no responde.</span>
            </span>
          </label>
          <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
            {COMANDOS.map(([c, d]) => (
              <li key={c} className="rounded-lg border border-border/70 px-2.5 py-1.5">
                <code className="text-[13px] font-semibold text-primary">{c}</code>
                <span className="block text-xs text-muted-foreground">{d}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void guardar()} disabled={guardando}>
          {guardando && <Loader2 className="animate-spin" />} Guardar
        </Button>
        <Button variant="outline" onClick={() => void probar()} disabled={probando || !data.tiene_token}>
          {probando ? <Loader2 className="animate-spin" /> : <Send />} Enviar prueba
        </Button>
        {data.tiene_token && (
          <Button variant="ghost" className="text-destructive" onClick={() => void guardar(true)} disabled={guardando}>
            Quitar bot
          </Button>
        )}
      </div>

      <Card className="panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Últimos avisos enviados</CardTitle>
        </CardHeader>
        <CardContent>
          {data.envios.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no se envió ningún aviso.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.envios.map((e) => (
                <li key={e.clave} className="flex items-start gap-2.5 py-2 text-sm">
                  {e.ok === false ? <XCircle className="mt-0.5 size-4 shrink-0 text-crit" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />}
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{nombreEvento(e.evento)}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{new Date(e.enviado_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</span>
                    {e.texto && <span className="block truncate text-xs text-muted-foreground">{e.texto.split("\n")[0]}</span>}
                    {e.error && <span className="block text-xs text-crit">{e.error}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
