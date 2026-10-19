import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatFecha } from "@/lib/utils";
import {
  ESTADOS,
  PRIORIDAD_STYLE,
  type Ticket,
  initials,
  isArchivedClosed,
  prioLabel,
  ticketLabel,
  tiempoRelativo,
} from "./constants";

export function TicketCard({
  ticket,
  assigneeName,
  canWrite,
  active,
  onOpen,
  onEstado,
  onReopen,
}: {
  ticket: Ticket;
  assigneeName: string;
  canWrite: boolean;
  active: boolean;
  onOpen: () => void;
  onEstado: (estado: string) => void;
  onReopen: () => void;
}) {
  const closed = isArchivedClosed(ticket.estado);
  return (
    <div
      className={cn(
        "group rounded-lg border bg-card p-3 shadow-xs transition-all",
        active ? "border-primary/40 ring-1 ring-primary/20" : "border-border/80 hover:border-border hover:shadow-sm",
      )}
    >
      <button type="button" className="w-full text-left" onClick={onOpen}>
        <p className="line-clamp-2 text-[13px] font-medium leading-snug tracking-tight">{ticket.titulo}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
              PRIORIDAD_STYLE[ticket.prioridad] ?? PRIORIDAD_STYLE.media,
            )}
          >
            {prioLabel(ticket.prioridad)}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">{ticketLabel(ticket)}</span>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <span
            className="grid size-6 place-items-center rounded-full border border-border bg-muted/50 text-[10px] font-semibold text-muted-foreground"
            title={assigneeName}
          >
            {initials(assigneeName === "Sin asignar" ? null : assigneeName)}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {ticket.vence_el
              ? formatFecha(ticket.vence_el, { day: "numeric", month: "short" })
              : tiempoRelativo(ticket.updated_at ?? ticket.created_at)}
          </span>
        </div>
      </button>
      {canWrite && (
        <div className="mt-2 border-t border-border/50 pt-2">
          {closed ? (
            <Button size="sm" variant="ghost" className="h-7 w-full text-xs" onClick={onReopen}>
              Reabrir
            </Button>
          ) : (
            <Select value={ticket.estado} onValueChange={onEstado}>
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS.map((e) => (
                  <SelectItem key={e.key} value={e.key}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
}
