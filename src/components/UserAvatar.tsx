import { cn } from "@/lib/utils";

export function iniciales(texto: string) {
  return texto
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Foto de perfil, o las iniciales si la persona no cargó ninguna. */
export function UserAvatar({
  nombre,
  foto,
  className,
}: {
  nombre: string;
  foto?: string | null;
  className?: string;
}) {
  if (foto) {
    return <img src={foto} alt={nombre} className={cn("size-8 shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary",
        className,
      )}
    >
      {iniciales(nombre) || "?"}
    </span>
  );
}
