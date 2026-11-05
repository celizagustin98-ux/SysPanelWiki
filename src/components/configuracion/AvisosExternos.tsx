import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { InputClave } from "@/components/InputClave";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";

const EVENTOS: { value: string; label: string; detalle: string }[] = [
  { value: "ticket_critico", label: "Ticket crítico", detalle: "Cuando se carga un ticket con prioridad crítica." },
  { value: "version_pendiente", label: "Versión para subir", detalle: "Cuando se registra una versión pendiente de otro sistema." },
  { value: "version_problemas", label: "Versión con problemas", detalle: "Cuando una actualización se marca con problemas." },
];

type Config = { tiene_token: boolean; chat_id: string; eventos: string[] };

/** Avisos urgentes por Telegram: llegan al celular aunque nadie tenga Nodara abierto. */
export function AvisosExternos() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["avisos_externos"],
    queryFn: async () => (await api.rpc("avisos_externos_leer")).data as Config,
  });
  const [token, setToken] = useState("");
  const [chat, setChat] = useState("");
  const [eventos, setEventos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  useEffect(() => {
    if (!data) return;
    setChat(data.chat_id);
    setEventos(data.eventos);
  }, [data]);

  const guardar = async (quitar = false) => {
    setGuardando(true);
    const { error } = await api.rpc("avisos_externos_guardar", { _token: token, _chat_id: chat, _eventos: eventos, _quitar_token: quitar });
    setGuardando(false);
    if (error) return toast.error(error.message);
    setToken("");
    toast.success(quitar ? "Bot quitado: no se envían más avisos" : "Avisos guardados");
    void qc.invalidateQueries({ queryKey: ["avisos_externos"] });
  };
  const probar = async () => {
    setProbando(true);
    const { error } = await api.rpc("avisos_externos_probar");
    setProbando(false);
    if (error) return toast.error(`No llegó: ${error.message}`);
    toast.success("Mensaje de prueba enviado: revisá el chat");
  };

  if (isLoading || !data) return <div className="skeleton h-48" />;
  return (
    <Card className="panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Avisos por Telegram</CardTitle>
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
        <div className="space-y-2">
          <Label>Qué se avisa</Label>
          {EVENTOS.map((e) => (
            <label key={e.value} className="flex items-start gap-2.5">
              <Checkbox
                className="mt-0.5"
                checked={eventos.includes(e.value)}
                onCheckedChange={(v) => setEventos((x) => (v === true ? [...x, e.value] : x.filter((y) => y !== e.value)))}
              />
              <span>
                <span className="font-medium">{e.label}</span>
                <span className="block text-xs text-muted-foreground">{e.detalle}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">El servidor necesita salida a internet hacia api.telegram.org. El token se guarda cifrado y no se vuelve a mostrar.</p>
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
      </CardContent>
    </Card>
  );
}
