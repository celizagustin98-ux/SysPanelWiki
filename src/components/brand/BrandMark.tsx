import { cn } from "@/lib/utils";

/** Isotipo de Nodara: prompt de terminal sobre un nodo de red. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9 shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id="si-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.82 0.12 200)" />
          <stop offset="1" stopColor="oklch(0.6 0.13 230)" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="10" fill="url(#si-mark)" />
      <rect x="1.5" y="1.5" width="37" height="37" rx="9.5" fill="none" stroke="white" strokeOpacity=".25" />
      <path
        d="M11 14.5l6 5.5-6 5.5"
        fill="none"
        stroke="oklch(0.17 0.03 220)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="20" y="24" width="9.5" height="3" rx="1.5" fill="oklch(0.17 0.03 220)">
        <animate attributeName="opacity" values="1;1;0.15;0.15;1" dur="1.6s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

export function BrandLockup({
  collapsed,
  tone = "sidebar",
  subtitle = "Área de Sistemas",
}: {
  collapsed?: boolean;
  tone?: "sidebar" | "default";
  subtitle?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandMark />
      <div className={cn("min-w-0 leading-tight", collapsed && "hidden")}>
        <p
          className={cn(
            "truncate text-[14px] font-semibold tracking-tight",
            tone === "sidebar" ? "text-sidebar-foreground" : "text-foreground",
          )}
        >
          Nodara
        </p>
        <p
          className={cn(
            "truncate font-mono text-[10.5px] uppercase tracking-[0.12em]",
            tone === "sidebar" ? "text-sidebar-foreground/45" : "text-muted-foreground",
          )}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
