const ACTUALIZA_LA_LISTA = 'Actualiza la lista: puede que ya se haya eliminado';

/**
 * Catálogo único de errores: cada `code` con la `action` que se le sugiere al usuario (`undefined` si no hay). El `code`
 * es estable: el cliente decide por él, no por el texto.
 */
export const ACCIONES = {
  VALIDACION: 'Revisa los datos marcados',
  SESION_INVALIDA: 'Vuelve a iniciar sesión',
  TOKEN_GOOGLE_INVALIDO: 'Intenta iniciar sesión de nuevo',
  RUTA_NO_ENCONTRADA: undefined,
  ERROR_HTTP: undefined,
  ERROR_INTERNO: 'Inténtalo de nuevo en unos minutos',
  CATEGORIA_NO_ENCONTRADA: ACTUALIZA_LA_LISTA,
  TRANSACCION_NO_ENCONTRADA: ACTUALIZA_LA_LISTA,
  META_NO_ENCONTRADA: ACTUALIZA_LA_LISTA,
  TARJETA_NO_ENCONTRADA: ACTUALIZA_LA_LISTA,
  CARGO_NO_ENCONTRADO: ACTUALIZA_LA_LISTA,
  COMPRA_NO_ENCONTRADA: ACTUALIZA_LA_LISTA,
  PAGO_NO_ENCONTRADO: ACTUALIZA_LA_LISTA,
  DEUDA_NO_ENCONTRADA: ACTUALIZA_LA_LISTA,
  PRESTAMO_NO_ENCONTRADO: ACTUALIZA_LA_LISTA,
  CATEGORIA_PREDETERMINADA: 'Crea una categoría propia si necesitas otra',
  CATEGORIA_DUPLICADA: 'Usa otro nombre o la categoría que ya existe',
  META_DUPLICADA: 'Edita la meta de ese mes',
  META_CON_AHORRO: 'Deja el ahorro del mes en 0 antes de eliminarla',
  TARJETA_DUPLICADA: 'Usa otro nombre',
  TARJETA_CON_COMPRAS: undefined,
  TARJETA_CON_PAGOS: 'Elimina primero sus pagos',
  TRANSACCION_DE_OTRO_MODULO: 'Gestiónalo desde la tarjeta o la deuda',
  DEUDA_INTERES_DISTINTO: 'Deja el interés en blanco para conservar el que ya tiene la deuda',
  DEUDA_REGISTRO_SIMULTANEO: 'Vuelve a intentarlo',
  // Sin `action` hasta 6.2: aún no hay endpoint de abonos.
  DEUDA_CON_ABONOS: undefined,
  IDEMPOTENCIA_EN_PROCESO: 'Espera un momento antes de reintentar',
  IDEMPOTENCIA_CLAVE_REUTILIZADA: undefined,
} satisfies Record<string, string | undefined>;

export type CodigoError = keyof typeof ACCIONES;

/**
 * El código va aparte de la excepción, que no cambia: solo `ErroresModule` lo publica. Por eso no se usa `errorCode`
 * de Nest, que sí la modifica.
 */
const codigos = new WeakMap<object, CodigoError>();

/** Asocia el código a la excepción y la devuelve: `throw conCodigo('X', new NotFoundException(...))`. */
export function conCodigo<E extends object>(codigo: CodigoError, excepcion: E): E {
  codigos.set(excepcion, codigo);
  return excepcion;
}

export const codigoDeExcepcion = (excepcion: unknown) => codigos.get(excepcion as object);
