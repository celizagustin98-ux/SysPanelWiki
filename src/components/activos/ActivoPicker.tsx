import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Boxes, ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { EscanerQR, idDesdeQr } from "./EscanerQR";

export type ActivoLite = { id: string; codigo: string; descripcion: string | null; nombre: string; sector: string | null; rubro: string | null };

export function useActivosLite() {
  return useQuery({
    queryKey: ["activos-lite"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await api.from("inventario").select("id, codigo, descripcion, nombre, sector, rubro").order("codigo");
      if (error) throw error;
      return (data ?? []) as ActivoLite[];
    },
  });
}

/** Elegir el equipo relacionado (buscando o escaneando su QR). */
export function ActivoPicker({ value, onChange, className }: { value: string | null; onChange: (id: string | null) => void; className?: string }) {
  const { data: activos = [] } = useActivosLite();
  const [open, setOpen] = useState(false);
  const [escanear, setEscanear] = useState(false);
  const actual = activos.find((a) => a.id === value);

  return (
    <div className={cn("flex gap-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="h-9 min-w-0 flex-1 justify-start font-normal">
            <Boxes className="text-muted-foreground" />
            {actual ? (
              <span className="truncate">
                <span className="num font-medium text-primary">{actual.codigo}</span> · {actual.descripcion || actual.nombre}
              </span>
            ) : (
              <span className="text-muted-foreground">Sin equipo vinculado</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(92vw,380px)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Código, descripción, sector…" />
            <CommandList>
              <CommandEmpty>Sin coincidencias.</CommandEmpty>
              <CommandGroup>
                {activos.slice(0, 2500).map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`${a.codigo} ${a.descripcion ?? a.nombre} ${a.sector ?? ""} ${a.rubro ?? ""}`}
                    onSelect={() => {
                      onChange(a.id);
                      setOpen(false);
                    }}
                  >
                    <span className="num w-20 shrink-0 text-xs text-primary">{a.codigo}</span>
                    <span className="min-w-0 flex-1 truncate">{a.descripcion || a.nombre}</span>
                    <span className="truncate text-xs text-muted-foreground">{a.sector}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button type="button" variant="outline" size="icon" className="size-9" title="Escanear QR del equipo" aria-label="Escanear QR del equipo" onClick={() => setEscanear(true)}>
        <ScanLine className="size-4" />
      </Button>
      {value && (
        <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Quitar equipo" onClick={() => onChange(null)}>
          <X className="size-4" />
        </Button>
      )}
      <EscanerQR
        open={escanear}
        onOpenChange={setEscanear}
        onResult={(texto) => {
          setEscanear(false);
          const id = idDesdeQr(texto);
          const a = activos.find((x) => x.id === id);
          if (!a) return toast.error("Ese QR no corresponde a un activo registrado");
          onChange(a.id);
          toast.success(`${a.codigo} vinculado`);
        }}
      />
    </div>
  );
}
