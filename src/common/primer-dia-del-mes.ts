/**
 * Lleva la fecha al día 1 de su mes a las 00:00 UTC. Lo que no sea una fecha válida se devuelve intacto
 * para que Mongoose falle la conversión solo en el campo que lo use (setter de esquemas).
 */
export function primerDiaDelMes(valor: unknown): unknown {
  if (valor === null || valor === undefined) return valor;
  const fecha = new Date(valor as string | number | Date);
  if (Number.isNaN(fecha.getTime())) return valor;
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1));
}
