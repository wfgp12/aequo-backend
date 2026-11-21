/** Las fechas de calendario se guardan a medianoche UTC del día indicado. */
export const aFecha = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

/** `[primer día del mes, primer día del mes siguiente)` de un `YYYY-MM`, para filtrar por la fecha de un movimiento. */
export function rangoDelMes(mes: string) {
  const [anio, numero] = mes.split('-').map(Number);
  return { $gte: new Date(Date.UTC(anio, numero - 1, 1)), $lt: new Date(Date.UTC(anio, numero, 1)) };
}
