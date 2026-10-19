import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatTone = "ok" | "warn" | "crit" | "info" | "neutral";

/** Indicador numérico del sistema: etiqueta técnica, valor monoespaciado y LED de estado. */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  return (
    <div className={cn("kpi-cell", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="kpi-label flex min-w-0 items-center gap-2">
          {tone !== "neutral" && <span className="led" data-tone={tone} data-pulse={tone === "crit"} />}
          <span className="truncate">{label}</span>
        </p>
        {icon ? <span className="text-muted-foreground [&_svg]:size-4">{icon}</span> : null}
      </div>
      <p
        className={cn(
          "kpi-value",
          tone === "crit" && "text-crit",
          tone === "warn" && "text-[color-mix(in_oklab,var(--warn),var(--foreground)_25%)]",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
