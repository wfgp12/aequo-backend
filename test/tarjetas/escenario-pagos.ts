import type { EntornoCompras } from './arnes-compras.js';
import {
  COMPRAS,
  sembrarCargoDe,
  sembrarCompraDe,
  sembrarEscenarioBase,
} from './escenario-proyeccion.js';

/**
 * Datos y valores de referencia del paquete 5.3.2 (registro del pago de una tarjeta), tal como están en
 * `criterios/05-tarjetas.md` («Valores de referencia» y «Datos de las pruebas»). Vive en test/ (no es producción).
 *
 * Los valores se calcularon aparte del código del repo (aritmética decimal de 50 dígitos): el total estimado del
 * escenario base de 5.3.1 y su diferencia con cada pago (`diferencia = pagado − estimado`). Se verifican con 6 decimales
 * (`toBeCloseTo(x, 6)`); aquí van con más decimales para que la comparación no quede al borde del redondeo.
 */

/** Total estimado de «Visa» (escenario base) en cada mes, sin redondear. */
export const ESTIMADO = {
  /** A + B + C + 55.000. */
  dic2026: 346270.0501646855,
  /** Solo los cargos activos (nada vence todavía). */
  nov2026: 55000,
  /** A + B + 55.000. */
  ene2027: 264543.2182339475,
  /** A + 55.000. */
  jun2027: 174802.1331718775,
  /** Solo los cargos activos (todo terminó o no empieza). */
  dic2099: 55000,
  /** Cuota de la tarjeta «Cero» ($120.000 a 12 cuotas con tasa 0). */
  cero: 10000,
};

/** Los campos de un pago (sin `comparacion`), ordenados. */
export const CLAVES_DE_UN_PAGO = [
  'creadaEn',
  'descripcion',
  'fecha',
  'id',
  'metodoPago',
  'tarjetaId',
  'valor',
];

/** Los campos del pago que devuelve el POST, ordenados. */
export const CLAVES_DEL_POST = [...CLAVES_DE_UN_PAGO, 'comparacion'].sort();

/** Los campos de `comparacion`, ordenados. */
export const CLAVES_DE_LA_COMPARACION = [
  'diferencia',
  'estimado',
  'mes',
  'pagado',
];

/** Lo que nunca debe salir en un pago. */
export const CLAVES_PROHIBIDAS_DEL_PAGO = [
  'usuarioId',
  '_id',
  '__v',
  'tipo',
  'monto',
  'clasificacionFlujo',
];

/** Los campos del nivel superior de la proyección con `pagado` y `diferencia` (CA-RF32-34), ordenados. */
export const CLAVES_NIVEL_SUPERIOR_CON_PAGOS = [
  'cargosFijos',
  'cuotas',
  'diferencia',
  'mes',
  'pagado',
  'proyeccion',
  'saldoPendiente',
  'tarjetaId',
  'total',
];

/** Todo lo guardado en una colección, con marcas de tiempo: para comprobar que nada cambió (ni siquiera `actualizadaEn`). */
export const fotografiaDe = (...colecciones: Array<{ docs: unknown[] }>) =>
  JSON.stringify(colecciones.map((coleccion) => coleccion.docs));

/** Todas las colecciones de la aplicación de pruebas, en una sola foto. */
export const fotografiaTotal = (e: EntornoCompras) =>
  fotografiaDe(
    e.tarjetas,
    e.cargos,
    e.compras,
    e.transacciones,
    e.categorias,
    e.claves,
  );

/** Las transacciones guardadas que son pagos de tarjeta. */
export const pagosGuardados = (e: EntornoCompras) =>
  e.transacciones.docs.filter(
    (doc) => doc.clasificacionFlujo === 'PAGO_TARJETA',
  );

/** «Cero» (tasa 0) con la compra G ($120.000 a 12 cuotas, 2026-12): estimado de 2026-12 = 10.000. */
export const sembrarTarjetaCero = async (
  e: EntornoCompras,
  usuarioId?: string,
) => {
  const cero = await e.sembrarTarjeta({ nombre: 'Cero', tasaEA: 0 }, usuarioId);
  await sembrarCompraDe(e, cero, COMPRAS.G, usuarioId);
  return cero;
};

/**
 * «Visa» con el escenario base de 5.3.1, pero con el avance B registrado por la API (`POST …/avances`): así tiene su
 * transacción de dinero recibido con el `tarjetaId` de la tarjeta. El total estimado es el mismo que el del escenario base.
 */
export const sembrarEscenarioConAvanceReal = async (e: EntornoCompras) => {
  const visa = await e.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });
  const compras = {
    A: await sembrarCompraDe(e, visa, COMPRAS.A),
    C: await sembrarCompraDe(e, visa, COMPRAS.C),
  };
  const cargos = {
    netflix: await sembrarCargoDe(e, visa, {
      descripcion: 'Netflix',
      valor: 40000,
      activo: true,
    }),
    seguro: await sembrarCargoDe(e, visa, {
      descripcion: 'Seguro',
      valor: 15000,
      activo: true,
    }),
    gimnasio: await sembrarCargoDe(e, visa, {
      descripcion: 'Gimnasio',
      valor: 60000,
      activo: false,
    }),
  };
  const avance = await e.crearAvance(visa, e.avanceBase());
  expect(avance.status).toBe(201);
  return { visa, compras, cargos, avanceId: avance.body.id as string };
};

export { sembrarEscenarioBase };
