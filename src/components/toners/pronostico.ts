/** Pronóstico de tóners a partir del consumo de los últimos días. */

export type Pronostico = {
  porDia: number;
  /** Días que alcanza el stock actual al ritmo de consumo (null = no se usó en el período). */
  diasRestantes: number | null;
  /** Unidades a pedir para cubrir `cobertura` días y quedar en el mínimo (descontando lo que ya está pedido). */
  sugerido: number;
};

export function pronosticar({
  stock,
  minimo,
  usados,
  dias,
  enCamino = 0,
  cobertura = 30,
}: {
  stock: number;
  minimo: number;
  usados: number;
  dias: number;
  enCamino?: number;
  cobertura?: number;
}): Pronostico {
  const porDia = dias > 0 ? usados / dias : 0;
  const diasRestantes = porDia > 0 ? Math.floor(Math.max(0, stock) / porDia) : null;
  // Lo que se va a usar en el período de cobertura, más el mínimo de reserva.
  const necesario = Math.ceil(porDia * cobertura) + minimo;
  const sugerido = Math.max(0, necesario - Math.max(0, stock) - Math.max(0, enCamino));
  return { porDia, diasRestantes, sugerido };
}
