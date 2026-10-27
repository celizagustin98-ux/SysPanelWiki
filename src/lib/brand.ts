/** Identidad del sistema: fija, igual en todas las instalaciones. */
export const APP_NAME = "Nodara";
export const APP_TAGLINE = "Centro de operaciones IT";
export const APP_AREA = "Área de Sistemas";
export const APP_COLOR = "#1f7a9c";

export type Marca = {
  nombre: string;
  area: string;
  tagline: string;
  /** Color de acento de los documentos (#RRGGBB). */
  color: string;
  /** Siempre false: cada documento conserva su color original. */
  colorPropio: boolean;
  /** Pie de los documentos impresos. */
  pie: string;
  /** Siempre null: se usa el isotipo de Nodara. */
  logo: string | null;
  personalizada: boolean;
};

const MARCA: Marca = {
  nombre: APP_NAME,
  area: APP_AREA,
  tagline: APP_TAGLINE,
  color: APP_COLOR,
  colorPropio: false,
  pie: `${APP_NAME} · ${APP_AREA}`,
  logo: null,
  personalizada: false,
};

/** Marca vigente, para código fuera de React (PDFs, títulos). */
export function getMarca() {
  return MARCA;
}

export function useMarca() {
  return MARCA;
}

/** Títulos de página: con la marca fija quedan tal cual. */
export function tituloConMarca(titulo: string, _marca = MARCA) {
  return titulo;
}
