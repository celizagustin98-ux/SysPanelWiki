import { useEffect, useRef, useState, type FormEvent } from "react";
import { ImageUp, Loader2, Palette, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { marcaGuardar, marcaObtener, type MarcaConfig as Config } from "@/backend/api/marca.functions";
import { APP_AREA, APP_COLOR, APP_NAME, cargarMarca } from "@/lib/brand";

const EXTENSIONES = ["png", "jpg", "jpeg", "webp", "svg"];

function leerArchivo(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Nombre, logo, color y pie de documentos de la organización (Configuración → General). */
export function MarcaConfig() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [nombre, setNombre] = useState("");
  const [area, setArea] = useState("");
  const [color, setColor] = useState("");
  const [pie, setPie] = useState("");
  const [logoNuevo, setLogoNuevo] = useState<{ dataUrl: string; ext: string } | null>(null);
  const [quitarLogo, setQuitarLogo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const cargar = async () => {
    const c = await marcaObtener();
    setCfg(c);
    setNombre(c.nombre ?? "");
    setArea(c.area ?? "");
    setColor(c.color ?? "");
    setPie(c.pie ?? "");
    setLogoNuevo(null);
    setQuitarLogo(false);
  };

  useEffect(() => {
    cargar().catch(() => toast.error("No se pudo leer la marca"));
  }, []);

  const elegirLogo = async (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!EXTENSIONES.includes(ext)) return toast.error("El logo debe ser PNG, JPG, WEBP o SVG");
    if (file.size > 512 * 1024) return toast.error("El logo no puede superar 512 KB");
    setLogoNuevo({ dataUrl: await leerArchivo(file), ext });
    setQuitarLogo(false);
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await marcaGuardar({
        data: {
          nombre,
          area,
          color,
          pie,
          logo: logoNuevo ? { base64: logoNuevo.dataUrl.split(",")[1] ?? "", ext: logoNuevo.ext } : null,
          quitarLogo,
        },
      });
      await Promise.all([cargar(), cargarMarca(true)]);
      toast.success("Marca actualizada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const logoVista = quitarLogo ? null : (logoNuevo?.dataUrl ?? cfg?.logo ?? null);
  const colorVista = /^#[0-9a-f]{6}$/i.test(color) ? color : APP_COLOR;

  return (
    <Card className="panel">
      <CardContent className="py-5">
        <form onSubmit={guardar} className="space-y-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Palette className="size-4 text-primary" /> Marca de la organización
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Se ve en el menú, el login, la bienvenida, los títulos y los PDFs. Lo que dejes vacío usa los valores de {APP_NAME}.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2">
              <div className="grid size-20 place-items-center rounded-2xl border border-border bg-muted/40">
                {logoVista ? (
                  <img src={logoVista} alt="Logo" className="size-16 rounded-xl object-contain" />
                ) : (
                  <BrandMark className="size-16" sinLogo />
                )}
              </div>
              <input
                ref={input}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.svg"
                className="hidden"
                onChange={(e) => {
                  void elegirLogo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}>
                  <ImageUp /> Logo
                </Button>
                {logoVista && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="Quitar logo"
                    onClick={() => {
                      setLogoNuevo(null);
                      setQuitarLogo(!!cfg?.logo);
                    }}
                  >
                    <X />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="marca-nombre">Nombre</Label>
                <Input id="marca-nombre" value={nombre} maxLength={60} placeholder={APP_NAME} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="marca-area">Área u organización</Label>
                <Input id="marca-area" value={area} maxLength={80} placeholder={APP_AREA} onChange={(e) => setArea(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="marca-color">Color de los documentos</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    aria-label="Elegir color"
                    value={colorVista}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
                  />
                  <Input id="marca-color" value={color} maxLength={7} placeholder={APP_COLOR} onChange={(e) => setColor(e.target.value.trim())} className="font-mono" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="marca-pie">Pie de los documentos</Label>
                <Input
                  id="marca-pie"
                  value={pie}
                  maxLength={200}
                  placeholder={`${nombre || APP_NAME} · ${area || APP_AREA}`}
                  onChange={(e) => setPie(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={guardando}
              onClick={() => {
                setNombre("");
                setArea("");
                setColor("");
                setPie("");
                setLogoNuevo(null);
                setQuitarLogo(!!cfg?.logo);
              }}
            >
              <RotateCcw /> Valores por defecto
            </Button>
            <Button type="submit" disabled={guardando || !cfg}>
              {guardando && <Loader2 className="animate-spin" />} Guardar marca
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

