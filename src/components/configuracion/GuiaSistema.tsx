import { useState } from "react";
import {
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileDown,
  History,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  Printer,
  QrCode,
  Rocket,
  Server,
  Settings2,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMarca } from "@/lib/brand";
import { GUIA } from "@/lib/guia";
import { ESTILO_DOC, escHtml, imprimirHtml } from "@/lib/imprimir";
import { cn } from "@/lib/utils";

const ICONOS: Record<string, LucideIcon> = {
  Rocket,
  LayoutDashboard,
  Ticket,
  Boxes,
  QrCode,
  ClipboardList,
  Printer,
  CalendarClock,
  BookOpen,
  BriefcaseBusiness,
  KeyRound,
  History,
  Settings2,
  Server,
};

/** Genera la guía completa como documento para imprimir o guardar en PDF. */
function descargarGuia() {
  const marca = getMarca();
  const fecha = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
  const indice = GUIA.map((s, i) => `<li><span>${i + 1}.</span> ${escHtml(s.titulo)}</li>`).join("");
  const secciones = GUIA.map(
    (s, i) => `<section class="sec">
      <h2><span>${i + 1}</span>${escHtml(s.titulo)}</h2>
      <p class="resumen">${escHtml(s.resumen)}</p>
      ${
        s.pasos?.length
          ? `<ol class="pasos">${s.pasos.map((p) => `<li><strong>${escHtml(p.titulo)}.</strong> ${escHtml(p.detalle)}</li>`).join("")}</ol>`
          : ""
      }
      ${s.consejos?.length ? `<div class="tips"><b>Consejos</b><ul>${s.consejos.map((c) => `<li>${escHtml(c)}</li>`).join("")}</ul></div>` : ""}
    </section>`,
  ).join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Guía del sistema · ${escHtml(marca.nombre)}</title><style>${ESTILO_DOC}
    .portada { min-height: 240mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
    .portada .marca { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: ${marca.color}; font-weight: 700; }
    .portada h1 { font-size: 34px; margin: 10px 0 6px; }
    .portada p { color: #555; font-size: 13px; margin: 0; }
    .indice { margin-top: 28px; columns: 2; font-size: 12px; padding: 0; list-style: none; }
    .indice li { padding: 3px 0; } .indice span { color: ${marca.color}; font-weight: 700; display: inline-block; width: 22px; }
    .sec { page-break-inside: avoid; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid #e5e5e5; }
    .sec h2 { font-size: 16px; margin: 0 0 6px; display: flex; align-items: center; gap: 8px; }
    .sec h2 span { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: ${marca.color}; color: #fff; font-size: 11px; }
    .resumen { font-size: 12px; color: #333; margin: 0 0 8px; }
    .pasos { font-size: 11.5px; line-height: 1.5; margin: 0; padding-left: 18px; } .pasos li { margin-bottom: 3px; }
    .tips { margin-top: 8px; background: #f5f8fa; border-left: 3px solid ${marca.color}; padding: 6px 10px; font-size: 11px; }
    .tips ul { margin: 4px 0 0; padding-left: 16px; }
  </style></head><body>
    <div class="portada">
      <div class="marca">${escHtml(marca.nombre)} · ${escHtml(marca.area)}</div>
      <h1>Guía del sistema</h1>
      <p>Cómo se usa cada módulo, paso a paso. Actualizada al ${escHtml(fecha)}.</p>
      <ol class="indice">${indice}</ol>
    </div>
    ${secciones}
    <div class="pie">${escHtml(marca.pie)} · Guía del sistema</div>
  </body></html>`;
  imprimirHtml(html, "Guia-del-sistema");
}

/** Configuración → Guía del sistema: manual de uso navegable y descargable. */
export function GuiaSistema() {
  const [actual, setActual] = useState(0);
  const sec = GUIA[actual];
  const Icono = ICONOS[sec.icono] ?? BookOpen;

  return (
    <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
      <aside className="panel p-2 lg:sticky lg:top-20">
        <Button className="mb-2 w-full" onClick={descargarGuia}>
          <FileDown /> Descargar guía en PDF
        </Button>
        <nav className="grid gap-0.5">
          {GUIA.map((s, i) => {
            const I = ICONOS[s.icono] ?? BookOpen;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActual(i)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
                  i === actual ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <I className="size-4 shrink-0" />
                <span className="truncate">{s.titulo}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <article key={sec.id} className="panel p-5 rise-in sm:p-6">
        <header className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icono className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">
              Sección {actual + 1} de {GUIA.length}
            </p>
            <h2 className="text-xl font-semibold tracking-tight">{sec.titulo}</h2>
          </div>
        </header>
        <p className="mt-3 text-sm leading-relaxed text-foreground/85">{sec.resumen}</p>

        {sec.pasos && (
          <ol className="mt-5 grid gap-2.5 md:grid-cols-2">
            {sec.pasos.map((p, i) => (
              <li key={p.titulo} className="flex gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                <span className="num grid size-6 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{p.titulo}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{p.detalle}</p>
                </div>
              </li>
            ))}
          </ol>
        )}

        {sec.consejos && (
          <div className="mt-4 rounded-xl border border-info/30 bg-info/8 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-info">
              <Lightbulb className="size-3.5" /> Consejos
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px]">
              {sec.consejos.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        <footer className="mt-5 flex items-center justify-between border-t border-border/70 pt-3">
          <Button variant="ghost" size="sm" disabled={actual === 0} onClick={() => setActual(actual - 1)}>
            <ChevronLeft /> {actual > 0 ? GUIA[actual - 1].titulo : "Anterior"}
          </Button>
          <Button variant="ghost" size="sm" disabled={actual === GUIA.length - 1} onClick={() => setActual(actual + 1)}>
            {actual < GUIA.length - 1 ? GUIA[actual + 1].titulo : "Siguiente"} <ChevronRight />
          </Button>
        </footer>
      </article>
    </div>
  );
}
