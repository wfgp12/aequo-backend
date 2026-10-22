// Enumeraciones cerradas de la transacción: se validan en el esquema de Mongoose, no son texto libre.

/** Lo fija el botón con el que el usuario inicia el registro ("Registrar ingreso" / "Registrar egreso"). */
export const TipoTransaccion = {
  INGRESO: 'INGRESO',
  EGRESO: 'EGRESO',
} as const;
export type TipoTransaccion = (typeof TipoTransaccion)[keyof typeof TipoTransaccion];

/** Métodos de pago disponibles para el usuario (RF-07). */
export const MetodoPago = {
  EFECTIVO: 'EFECTIVO',
  DEBITO: 'DEBITO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  TARJETA_CREDITO: 'TARJETA_CREDITO',
} as const;
export type MetodoPago = (typeof MetodoPago)[keyof typeof MetodoPago];

/**
 * Métodos que puede tener una Transacción. Una compra con tarjeta de crédito NO se guarda como transacción:
 * se registra en `comprascredito` (ADR-014), y el dinero sale del bolsillo cuando se paga la tarjeta
 * (una transacción PAGO_TARJETA con el método con que se pagó).
 */
export const METODOS_DE_PAGO_DE_TRANSACCION: MetodoPago[] = [
  MetodoPago.EFECTIVO,
  MetodoPago.DEBITO,
  MetodoPago.TRANSFERENCIA,
];

/** Cómo cuenta la transacción en el balance y los reportes (regla de flujo de caja, ADR-014). */
export const ClasificacionFlujo = {
  /** Ingreso o egreso propio del mes. */
  ORDINARIO: 'ORDINARIO',
  /** Préstamo recibido o avance en efectivo: suma al dinero disponible pero no es ingreso propio. */
  DINERO_RECIBIDO: 'DINERO_RECIBIDO',
  /** Abono a una deuda: sale del bolsillo pero no es consumo. */
  ABONO_DEUDA: 'ABONO_DEUDA',
  /** Pago de una tarjeta: sale del bolsillo y no cuenta por categoría para no contar dos veces la compra. */
  PAGO_TARJETA: 'PAGO_TARJETA',
} as const;
export type ClasificacionFlujo = (typeof ClasificacionFlujo)[keyof typeof ClasificacionFlujo];
