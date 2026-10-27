import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Camera, KeyRound, Loader2, Moon, Save, Sun, Trash2, UserRound, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { InputClave } from "@/components/InputClave";
import { UserAvatar } from "@/components/UserAvatar";
import { RolChip } from "@/components/configuracion/RolesPermisos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { perfilGuardar, perfilObtener, type MiPerfil } from "@/backend/api/perfil.functions";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { useRoles } from "@/lib/roles";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/perfil")({
  head: () => ({
    meta: [
      { title: "Mi perfil · Nodara" },
      { name: "description", content: "Tu foto, tus datos de contacto, tu contraseña y tus preferencias." },
    ],
  }),
  component: PerfilPage,
});

/** Lado de la foto guardada, en píxeles. */
const LADO_FOTO = 256;
/** Lado del recuadro de recorte en pantalla. */
const LADO_RECORTE = 240;

function fechaLarga(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

function PerfilPage() {
  const { role, retry } = useAuth();
  const { data: roles = [] } = useRoles();
  const obtener = useServerFn(perfilObtener);
  const guardar = useServerFn(perfilGuardar);

  const [perfil, setPerfil] = useState<MiPerfil | null>(null);
  const [form, setForm] = useState({ full_name: "", cargo: "", telefono: "", interno: "", sobre_mi: "" });
  const [foto, setFoto] = useState<string | null>(null);
  const [fotoCambiada, setFotoCambiada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [imagenARecortar, setImagenARecortar] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    obtener()
      .then((p) => {
        setPerfil(p);
        setForm({
          full_name: p.full_name ?? "",
          cargo: p.cargo ?? "",
          telefono: p.telefono ?? "",
          interno: p.interno ?? "",
          sobre_mi: p.sobre_mi ?? "",
        });
        setFoto(p.avatar_url);
      })
      .catch(() => toast.error("No se pudo cargar tu perfil"));
  }, [obtener]);

  const cambios =
    !!perfil &&
    (fotoCambiada ||
      form.full_name !== (perfil.full_name ?? "") ||
      form.cargo !== (perfil.cargo ?? "") ||
      form.telefono !== (perfil.telefono ?? "") ||
      form.interno !== (perfil.interno ?? "") ||
      form.sobre_mi !== (perfil.sobre_mi ?? ""));

  const elegirArchivo = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Elegí una imagen (JPG, PNG o WEBP)");
    if (file.size > 15 * 1024 * 1024) return toast.error("La imagen es muy pesada (máximo 15 MB)");
    const lector = new FileReader();
    lector.onload = () => setImagenARecortar(String(lector.result));
    lector.readAsDataURL(file);
  };

  const onGuardar = async () => {
    setGuardando(true);
    try {
      await guardar({ data: { ...form, ...(fotoCambiada ? { avatar_url: foto } : {}) } });
      setPerfil((p) => (p ? { ...p, ...form, avatar_url: foto } : p));
      setFotoCambiada(false);
      await retry();
      toast.success("Perfil actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const set = (campo: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  if (!perfil) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando tu perfil…
      </div>
    );
  }

  const nombreVisible = form.full_name || perfil.email;
  const rol = roles.find((r) => r.clave === role);

  return (
    <div className="space-y-6">
      <PageHeader title="Mi perfil" description="Tu foto y tus datos los ven tus compañeros en el sistema." />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Tarjeta de presentación */}
        <Card className="panel overflow-hidden">
          <div className="h-20 bg-gradient-to-br from-primary/30 via-primary/10 to-transparent" />
          <CardContent className="-mt-12 flex flex-col items-center gap-3 pb-6 text-center">
            <div className="group relative">
              <UserAvatar nombre={nombreVisible} foto={foto} className="size-28 text-3xl ring-4 ring-card" />
              <button
                type="button"
                onClick={() => archivoRef.current?.click()}
                className="absolute inset-0 grid place-items-center rounded-full bg-black/50 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="Cambiar foto"
              >
                <Camera className="size-6" />
              </button>
            </div>
            <input
              ref={archivoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                elegirArchivo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold tracking-tight">{nombreVisible}</p>
              <p className="truncate text-sm text-muted-foreground">{form.cargo || "Sin puesto cargado"}</p>
            </div>
            <RolChip rol={rol} />
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="outline" onClick={() => archivoRef.current?.click()}>
                <Camera className="size-4" /> {foto ? "Cambiar foto" : "Subir foto"}
              </Button>
              {foto && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setFoto(null);
                    setFotoCambiada(true);
                  }}
                >
                  <Trash2 className="size-4" /> Quitar
                </Button>
              )}
            </div>
            <dl className="mt-2 w-full space-y-1.5 border-t border-border pt-4 text-left text-[13px]">
              <Dato etiqueta="Usuario" valor={perfil.username ?? "—"} mono />
              <Dato etiqueta="Email" valor={perfil.email} />
              {form.interno && <Dato etiqueta="Interno" valor={form.interno} mono />}
              {form.telefono && <Dato etiqueta="Teléfono" valor={form.telefono} />}
              <Dato etiqueta="Miembro desde" valor={fechaLarga(perfil.created_at)} />
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="size-4 text-primary" /> Datos personales
              </CardTitle>
              <CardDescription>El usuario, el email y el rol los cambia un administrador.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo label="Nombre y apellido">
                  <Input value={form.full_name} onChange={set("full_name")} maxLength={80} />
                </Campo>
                <Campo label="Puesto">
                  <Input value={form.cargo} onChange={set("cargo")} maxLength={80} placeholder="Técnico de soporte, Jefe de Sistemas…" />
                </Campo>
                <Campo label="Teléfono / celular">
                  <Input value={form.telefono} onChange={set("telefono")} maxLength={40} inputMode="tel" placeholder="351 555-1234" />
                </Campo>
                <Campo label="Interno">
                  <Input value={form.interno} onChange={set("interno")} maxLength={20} placeholder="214" />
                </Campo>
              </div>
              <Campo label="Sobre mí">
                <Textarea
                  value={form.sobre_mi}
                  onChange={set("sobre_mi")}
                  maxLength={300}
                  rows={3}
                  placeholder="En qué te especializás, horario, cómo contactarte…"
                />
                <p className="text-right text-[11px] text-muted-foreground">{form.sobre_mi.length}/300</p>
              </Campo>
              <div className="flex justify-end">
                <Button onClick={onGuardar} disabled={!cambios || guardando}>
                  {guardando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Guardar cambios
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <CambiarClave usuario={perfil.username} />
            <Preferencias />
          </div>
        </div>
      </div>

      <RecortarFoto
        imagen={imagenARecortar}
        onCerrar={() => setImagenARecortar(null)}
        onListo={(dataUrl) => {
          setFoto(dataUrl);
          setFotoCambiada(true);
          setImagenARecortar(null);
          toast.info("Foto lista: tocá «Guardar cambios» para conservarla");
        }}
      />
    </div>
  );
}

function Dato({ etiqueta, valor, mono }: { etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{etiqueta}</dt>
      <dd className={cn("truncate text-right", mono && "font-mono text-xs")}>{valor}</dd>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function CambiarClave({ usuario }: { usuario: string | null }) {
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [busy, setBusy] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nueva !== repetir) return toast.error("Las contraseñas no coinciden");
    setBusy(true);
    const { error } = await api.auth.updateUser({ password: nueva });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNueva("");
    setRepetir("");
    toast.success("Contraseña cambiada. Se cerraron tus otras sesiones abiertas.");
  };

  return (
    <Card className="panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-primary" /> Contraseña
        </CardTitle>
        <CardDescription>Mínimo 10 caracteres, con letras y números.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="space-y-3">
          {/* Ayuda a los gestores de contraseñas a asociar la clave con el usuario. */}
          <input type="text" name="username" autoComplete="username" value={usuario ?? ""} readOnly hidden />
          <Campo label="Nueva contraseña">
            <InputClave value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" />
          </Campo>
          <Campo label="Repetir contraseña">
            <InputClave value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" />
          </Campo>
          <Button type="submit" variant="outline" disabled={busy || !nueva || !repetir}>
            {busy && <Loader2 className="size-4 animate-spin" />} Cambiar contraseña
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Preferencias() {
  const { theme, toggle } = useTheme();
  const opciones = [
    { valor: "light", label: "Claro", icono: Sun },
    { valor: "dark", label: "Oscuro", icono: Moon },
  ] as const;
  return (
    <Card className="panel">
      <CardHeader>
        <CardTitle className="text-base">Preferencias</CardTitle>
        <CardDescription>Se guardan en este navegador.</CardDescription>
      </CardHeader>
      <CardContent>
        <Label>Tema</Label>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {opciones.map((o) => (
            <button
              key={o.valor}
              type="button"
              onClick={() => theme !== o.valor && toggle()}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors",
                theme === o.valor
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <o.icono className="size-4" /> {o.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Recorte cuadrado: se arrastra la imagen y se ajusta el zoom; se guarda en JPEG de 256 px. */
function RecortarFoto({
  imagen,
  onCerrar,
  onListo,
}: {
  imagen: string | null;
  onCerrar: () => void;
  onListo: (dataUrl: string) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const arrastre = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    setImg(null);
    setZoom(1);
    setPos({ x: 0, y: 0 });
    if (!imagen) return;
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => {
      toast.error("No se pudo leer la imagen");
      onCerrar();
    };
    i.src = imagen;
  }, [imagen, onCerrar]);

  // Escala base: la imagen cubre todo el recuadro.
  const base = img ? LADO_RECORTE / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const escala = base * zoom;
  const ancho = img ? img.naturalWidth * escala : 0;
  const alto = img ? img.naturalHeight * escala : 0;

  const limitar = (x: number, y: number) => ({
    x: Math.min(0, Math.max(LADO_RECORTE - ancho, x)),
    y: Math.min(0, Math.max(LADO_RECORTE - alto, y)),
  });

  // Al cargar o cambiar el zoom se mantiene centrada.
  useEffect(() => {
    if (!img) return;
    setPos((p) => {
      const cx = ancho / 2 - LADO_RECORTE / 2;
      const cy = alto / 2 - LADO_RECORTE / 2;
      return p.x === 0 && p.y === 0 && zoom === 1 ? { x: -cx, y: -cy } : limitar(p.x, p.y);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, zoom]);

  const bajar = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a) return;
    setPos(limitar(a.px + e.clientX - a.x, a.py + e.clientY - a.y));
  };

  const confirmar = () => {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = LADO_FOTO;
    canvas.height = LADO_FOTO;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, LADO_FOTO, LADO_FOTO);
    ctx.imageSmoothingQuality = "high";
    const lado = LADO_RECORTE / escala;
    ctx.drawImage(img, -pos.x / escala, -pos.y / escala, lado, lado, 0, 0, LADO_FOTO, LADO_FOTO);
    onListo(canvas.toDataURL("image/jpeg", 0.86));
  };

  return (
    <Dialog open={!!imagen} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajustar foto</DialogTitle>
          <DialogDescription>Arrastrá la imagen para encuadrarla y usá el zoom.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div
            className="relative touch-none cursor-grab overflow-hidden rounded-xl bg-muted active:cursor-grabbing"
            style={{ width: LADO_RECORTE, height: LADO_RECORTE }}
            onPointerDown={bajar}
            onPointerMove={mover}
            onPointerUp={() => (arrastre.current = null)}
            onPointerCancel={() => (arrastre.current = null)}
          >
            {img ? (
              <img
                src={img.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                style={{ width: ancho, height: alto, left: pos.x, top: pos.y }}
              />
            ) : (
              <Loader2 className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {/* Máscara circular: así se va a ver en el sistema */}
            <div
              className="pointer-events-none absolute inset-0 bg-black/45"
              style={{
                maskImage: "radial-gradient(circle closest-side, transparent 99%, black 100%)",
                WebkitMaskImage: "radial-gradient(circle closest-side, transparent 99%, black 100%)",
              }}
            />
            <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/80" />
          </div>
          <label className="flex w-full items-center gap-3 text-sm text-muted-foreground">
            <ZoomIn className="size-4 shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
              aria-label="Zoom"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!img}>
            Usar esta foto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
