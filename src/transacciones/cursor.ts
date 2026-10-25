/** Posición de una transacción en el listado, que ordena por fecha descendente y, a igual fecha, por id descendente. */
export interface PosicionCursor {
  fecha: Date;
  id: string;
}

/**
 * Cursor opaco de la carga progresiva: codifica la posición de la última transacción entregada. Es estable aunque
 * se registren movimientos nuevos mientras el usuario hace scroll (a diferencia de un desplazamiento por número).
 * No está firmado: manipularlo solo cambia desde dónde se lista, siempre dentro de los datos del propio usuario.
 */
export function codificarCursor(fecha: Date, id: string): string {
  return Buffer.from(`${fecha.getTime()}_${id}`).toString('base64url');
}

/** La posición que codifica el cursor, o null si el texto no es un cursor válido. */
export function decodificarCursor(cursor: string): PosicionCursor | null {
  const coincidencia = /^(-?\d+)_([0-9a-f]{24})$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!coincidencia) {
    return null;
  }
  const fecha = new Date(Number(coincidencia[1]));
  return Number.isNaN(fecha.getTime()) ? null : { fecha, id: coincidencia[2] };
}
