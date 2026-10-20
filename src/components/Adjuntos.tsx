import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";
import { Download, Eye, File, FileImage, FileSpreadsheet, FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, getToken } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Adjunto = {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime: string | null;
  created_by_nombre: string | null;
  created_at: string;
};

const MAX_MB = 10;

function peso(n?: number | null) {
  if (!n) return "";
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function icono(mime?: string | null, nombre = "") {
  if (mime?.startsWith("image/")) return FileImage;
  if (mime === "application/pdf" || /\.pdf$/i.test(nombre)) return FileText;
  if (/sheet|excel|csv/.test(mime ?? "") || /\.(xlsx?|csv)$/i.test(nombre)) return FileSpreadsheet;
  return File;
}

async function abrir(a: Adjunto, descargar = false) {
  // Se pide con la sesión (no es un link público) y se abre como blob.
  const ventana = descargar ? null : window.open("", "_blank");
  const r = await fetch(`/api/adjuntos/${encodeURIComponent(a.id)}${descargar ? "?descargar=1" : ""}`, {
    headers: { authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!r.ok) {
    ventana?.close();
    const p = await r.json().catch(() => null);
    return toast.error(p?.error ?? "No se pudo abrir el archivo");
  }
  const url = URL.createObjectURL(await r.blob());
  if (descargar || !ventana) {
    const link = document.createElement("a");
    link.href = url;
    link.download = a.file_name;
    link.click();
  } else {
    ventana.location.href = url;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Archivos adjuntos de un activo o un ticket (facturas, garantías, fotos, remitos…). */
export function Adjuntos({ entidad, entidadId, canEdit, compacto }: { entidad: "activo" | "ticket"; entidadId: string; canEdit: boolean; compacto?: boolean }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const key = ["adjuntos", entidad, entidadId];

  const { data: adjuntos = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await api
        .from("adjuntos")
        .select("id, file_name, file_path, file_size, mime, created_by_nombre, created_at")
        .eq("entidad", entidad)
        .eq("entidad_id", entidadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Adjunto[];
    },
  });

  const subir = async (files: FileList | File[] | null) => {
    const lista = Array.from(files ?? []);
    if (!lista.length) return;
    const grandes = lista.filter((f) => f.size > MAX_MB * 1024 * 1024);
    if (grandes.length) toast.error(`Superan ${MAX_MB} MB: ${grandes.map((f) => f.name).join(", ")}`);
    const ok = lista.filter((f) => f.size <= MAX_MB * 1024 * 1024);
    setSubiendo(ok.length);
    let subidos = 0;
    for (const f of ok) {
      const path = `${entidad}/${entidadId}/${Date.now()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
      const up = await api.storage.from("adjuntos").upload(path, f);
      if (up.error) {
        toast.error(`${f.name}: ${up.error.message}`);
        continue;
      }
      const { error } = await api.from("adjuntos").insert({
        entidad,
        entidad_id: entidadId,
        file_name: f.name,
        file_path: path,
        file_size: f.size,
        mime: f.type || null,
        created_by_nombre: profile?.full_name ?? null,
      });
      if (error) toast.error(`${f.name}: ${error.message}`);
      else subidos++;
      setSubiendo((n) => n - 1);
    }
    setSubiendo(0);
    if (subidos) toast.success(`${subidos} archivo(s) adjuntado(s)`);
    void qc.invalidateQueries({ queryKey: key });
  };

  const eliminar = async (a: Adjunto) => {
    await api.storage.from("adjuntos").remove(a.file_path);
    const { error } = await api.from("adjuntos").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Adjunto eliminado");
    void qc.invalidateQueries({ queryKey: key });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    if (canEdit) void subir(e.dataTransfer.files);
  };

  return (
    <div
      className="space-y-2"
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={onDrop}
    >
      {canEdit && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 text-[13px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground",
            compacto ? "py-2.5" : "py-4",
            arrastrando ? "border-primary bg-primary/8 text-primary" : "border-border",
          )}
        >
          {subiendo ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {subiendo ? `Subiendo ${subiendo}…` : "Arrastrá archivos o tocá para adjuntar (factura, foto, garantía…)"}
        </button>
      )}
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => { void subir(e.target.files); e.target.value = ""; }} />

      {isLoading ? (
        <div className="skeleton h-10" />
      ) : adjuntos.length === 0 ? (
        !canEdit && <p className="py-4 text-center text-xs text-muted-foreground">Sin archivos adjuntos.</p>
      ) : (
        <ul className="divide-y divide-border/70 rounded-xl border border-border">
          {adjuntos.map((a) => {
            const Icono = icono(a.mime, a.file_name);
            return (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                <Icono className="size-4 shrink-0 text-primary" />
                <button type="button" onClick={() => void abrir(a)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px] font-medium hover:underline">{a.file_name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {[peso(a.file_size), a.created_by_nombre, new Date(a.created_at).toLocaleDateString("es-AR")].filter(Boolean).join(" · ")}
                  </span>
                </button>
                <Button size="icon" variant="ghost" className="size-7" aria-label="Ver" onClick={() => void abrir(a)}><Eye className="size-3.5" /></Button>
                <Button size="icon" variant="ghost" className="size-7" aria-label="Descargar" onClick={() => void abrir(a, true)}><Download className="size-3.5" /></Button>
                {canEdit && (
                  <Button size="icon" variant="ghost" className="size-7" aria-label="Eliminar" onClick={() => void eliminar(a)}><Trash2 className="size-3.5 text-destructive" /></Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ContadorAdjuntos({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] opacity-70">
      <Paperclip className="size-3" />
      {n}
    </span>
  );
}
