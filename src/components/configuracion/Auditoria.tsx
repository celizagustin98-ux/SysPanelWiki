import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Download,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";


type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_nombre: string;
  actor_email: string;
  modulo: string;
  accion: string;
  entidad_id: string | null;
  entidad_desc: string;
  detalle: unknown;
  created_at: string;
};

type Actor = { actor_id: string; actor_nombre: string; actor_email: string };

const MODULOS = [
  { key: "instructivos", label: "Instructivos" },
  { key: "guardias", label: "Guardias / Horarios" },
  { key: "inventario", label: "Inventario" },
  { key: "toners", label: "Tóners" },
  { key: "tareas", label: "Tareas" },
  { key: "credenciales", label: "Credenciales" },
  { key: "oficina", label: "Oficina" },
  { key: "usuarios", label: "Usuarios" },
  { key: "roles", label: "Roles y permisos" },
  { key: "configuracion", label: "Configuración" },
];

const ACCIONES = [
  { key: "crear", label: "Crear" },
  { key: "editar", label: "Editar" },
  { key: "eliminar", label: "Eliminar" },
  { key: "asignar_rol", label: "Asignar rol" },
  { key: "suspender", label: "Suspender cuenta" },
  { key: "reactivar", label: "Reactivar cuenta" },
  { key: "cerrar_sesiones", label: "Cerrar sesiones" },
];

const TODOS = "__todos__";

function accionVariant(accion: string): "default" | "secondary" | "destructive" | "outline" {
  if (accion === "eliminar" || accion === "quitar_rol" || accion === "suspender") return "destructive";
  if (accion === "editar") return "default";
  return "secondary";
}

function labelModulo(value: string) {
  return MODULOS.find((m) => m.key === value)?.label ?? value;
}

function labelAccion(value: string) {
  return ACCIONES.find((a) => a.key === value)?.label ?? value;
}

function detalleLegible(detalle: unknown) {
  if (!detalle || typeof detalle !== "object") return "";
  const data = detalle as Record<string, unknown>;
  const campos = Array.isArray(data.campos) ? `Campos: ${data.campos.join(", ")}` : "";
  const tabla = data.tabla ? `Tabla: ${String(data.tabla)}` : "";
  const rol = data.rol ? `Rol: ${String(data.rol)}` : "";
  return [campos, rol, tabla].filter(Boolean).join(" · ");
}

/** Registro de auditoría: sección de Configuración (antes era un módulo aparte). */
export function Auditoria() {
  const { can } = useAuth();
  const isAdmin = can("auditoria", "view");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actores, setActores] = useState<Actor[]>([]);
  const [cargando, setCargando] = useState(true);

  const [actor, setActor] = useState(TODOS);
  const [modulo, setModulo] = useState(TODOS);
  const [accion, setAccion] = useState(TODOS);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 25;
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [resumen, setResumen] = useState({ total: 0, criticas: 0, usuarios: 0, modulos: 0 });
  const [exportando, setExportando] = useState(false);

  // La búsqueda se aplica cuando se deja de escribir.
  useEffect(() => {
    const t = window.setTimeout(() => setBusqueda(texto.trim()), 350);
    return () => window.clearTimeout(t);
  }, [texto]);
  useEffect(() => setPagina(1), [actor, modulo, accion, desde, hasta, busqueda]);

  const argumentos = useCallback(
    () => ({
      _actor: actor !== TODOS ? actor : null,
      _modulo: modulo !== TODOS ? modulo : null,
      _accion: accion !== TODOS ? accion : null,
      _desde: desde ? new Date(`${desde}T00:00:00`).toISOString() : null,
      _hasta: hasta ? new Date(`${hasta}T23:59:59`).toISOString() : null,
      _q: busqueda || null,
    }),
    [actor, modulo, accion, desde, hasta, busqueda],
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await api.rpc("auditoria_buscar", { ...argumentos(), _pagina: pagina, _por_pagina: POR_PAGINA });
    setCargando(false);
    if (error) return toast.error(error.message);
    const r = data as { rows: AuditRow[]; total: number; criticas: number; usuarios: number; modulos: number };
    setRows(r.rows ?? []);
    setResumen({ total: r.total ?? 0, criticas: r.criticas ?? 0, usuarios: r.usuarios ?? 0, modulos: r.modulos ?? 0 });
  }, [argumentos, pagina]);

  const exportarTodo = async () => {
    setExportando(true);
    const { data, error } = await api.rpc("auditoria_buscar", { ...argumentos(), _exportar: true });
    setExportando(false);
    if (error) return toast.error(error.message);
    const todas = ((data as { rows: AuditRow[] })?.rows ?? []) as AuditRow[];
    exportCsv(
      "auditoria-nodara.csv",
      ["Fecha", "Usuario", "Correo", "Modulo", "Accion", "Elemento", "Detalle"],
      todas.map((r) => [
        new Date(r.created_at).toLocaleString("es-AR"),
        r.actor_nombre,
        r.actor_email,
        labelModulo(r.modulo),
        labelAccion(r.accion),
        r.entidad_desc,
        detalleLegible(r.detalle),
      ]),
    );
  };

  useEffect(() => {
    if (!isAdmin) return;
    void cargar();
  }, [isAdmin, cargar]);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      const { data } = await api.rpc("audit_actores");
      setActores((data ?? []) as Actor[]);
    })();
  }, [isAdmin]);

  const limpiar = () => {
    setActor(TODOS);
    setModulo(TODOS);
    setAccion(TODOS);
    setDesde("");
    setHasta("");
    setTexto("");
  };

  const hayFiltros = actor !== TODOS || modulo !== TODOS || accion !== TODOS || desde || hasta || texto;

  const paginas = Math.max(1, Math.ceil(resumen.total / POR_PAGINA));
  const paginaSegura = Math.min(pagina, paginas);
  const enPagina = rows;

  if (!isAdmin) {
    return (
      <div>
        <Card className="panel">
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <ShieldCheck className="size-5" />
            No tenés permisos para ver el registro de auditoría.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
          <div className="flex flex-wrap justify-end gap-2">
            <div className="relative mr-auto min-w-[14rem] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar usuario, elemento o detalle…" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </div>
            <Button variant="outline" onClick={() => void exportarTodo()} disabled={resumen.total === 0 || exportando}>
              <Download className="mr-2 size-4" />
              Exportar
            </Button>
            <Button variant="outline" onClick={() => void cargar()} disabled={cargando}>
              {cargando ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Actualizar
            </Button>
          </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="panel">
          <CardContent className="flex items-center gap-3 py-4">
            <Activity className="size-5 text-primary" />
            <div>
              <p className="text-xs uppercase text-muted-foreground">Eventos</p>
              <p className="text-2xl font-semibold">{resumen.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="panel">
          <CardContent className="flex items-center gap-3 py-4">
            <Users className="size-5 text-primary" />
            <div>
              <p className="text-xs uppercase text-muted-foreground">Usuarios</p>
              <p className="text-2xl font-semibold">{resumen.usuarios}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="panel">
          <CardContent className="flex items-center gap-3 py-4">
            <History className="size-5 text-primary" />
            <div>
              <p className="text-xs uppercase text-muted-foreground">Módulos</p>
              <p className="text-2xl font-semibold">{resumen.modulos}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="panel">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="size-5 text-destructive" />
            <div>
              <p className="text-xs uppercase text-muted-foreground">Eliminaciones</p>
              <p className="text-2xl font-semibold">{resumen.criticas}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="panel">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label className="text-xs">Usuario</Label>
            <Select value={actor} onValueChange={setActor}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {actores.map((a) => (
                  <SelectItem key={a.actor_id} value={a.actor_id}>
                    {a.actor_nombre || a.actor_email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Módulo</Label>
            <Select value={modulo} onValueChange={setModulo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {MODULOS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Acción</Label>
            <Select value={accion} onValueChange={setAccion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {ACCIONES.map((a) => (
                  <SelectItem key={a.key} value={a.key}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="desde" className="text-xs">
              Desde
            </Label>
            <Input
              id="desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="hasta" className="text-xs">
              Hasta
            </Label>
            <Input
              id="hasta"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
          {hayFiltros ? (
            <div className="sm:col-span-2 lg:col-span-5">
              <Button size="sm" variant="ghost" onClick={limpiar}>
                <X className="mr-1 size-4" /> Limpiar filtros
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="panel">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Registro
            <Badge variant="secondary">{resumen.total} eventos</Badge>
            {resumen.criticas ? (
              <Badge variant="destructive">{resumen.criticas} eliminaciones</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cargando ? (
            <div className="flex items-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Cargando registro…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No hay eventos registrados con esos filtros.
            </p>
          ) : (
            <div className="rounded-lg border border-border">
              <table className="hidden w-full text-sm md:table">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Fecha y hora</th>
                    <th className="px-3 py-2 font-medium">Usuario</th>
                    <th className="px-3 py-2 font-medium">Módulo</th>
                    <th className="px-3 py-2 font-medium">Acción</th>
                    <th className="px-3 py-2 font-medium">Elemento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {enPagina.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("es-AR")}
                      </td>
                      <td className="px-3 py-1.5">
                        <p className="font-medium" title={r.actor_email ?? undefined}>{r.actor_nombre || "Sistema"}</p>
                      </td>
                      <td className="px-3 py-1.5 capitalize">
                        {labelModulo(r.modulo)}
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge variant={accionVariant(r.accion)}>
                          {labelAccion(r.accion)}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5">
                        <p>{r.entidad_desc || "—"}</p>
                        {detalleLegible(r.detalle) ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {detalleLegible(r.detalle)}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="divide-y divide-border md:hidden">
                {enPagina.map((r) => (
                  <div key={r.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{r.entidad_desc || labelModulo(r.modulo)}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("es-AR")}
                        </p>
                      </div>
                      <Badge variant={accionVariant(r.accion)}>{labelAccion(r.accion)}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{labelModulo(r.modulo)}</Badge>
                      <span>{r.actor_nombre || r.actor_email || "Sistema"}</span>
                    </div>
                    {detalleLegible(r.detalle) ? (
                      <p className="text-xs text-muted-foreground">{detalleLegible(r.detalle)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
              {paginas > 1 && (
                <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                  <span>
                    {(paginaSegura - 1) * POR_PAGINA + 1}–{Math.min(paginaSegura * POR_PAGINA, resumen.total)} de {resumen.total} eventos
                  </span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="h-7" disabled={paginaSegura <= 1} onClick={() => setPagina(paginaSegura - 1)}>
                      Anterior
                    </Button>
                    <span className="num px-2">
                      {paginaSegura} / {paginas}
                    </span>
                    <Button size="sm" variant="outline" className="h-7" disabled={paginaSegura >= paginas} onClick={() => setPagina(paginaSegura + 1)}>
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function exportCsv(fileName: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(";")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
