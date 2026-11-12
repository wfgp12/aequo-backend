/**
 * Constantes y ayudas comunes a los arneses de las pruebas de integración (ahorro, tarjetas…). Vive en test/ (no es producción).
 */

export const USUARIO_ID = '665f1c2e9b1d4a0012ab34cd';
export const OTRO_USUARIO_ID = '665f1c2e9b1d4a0012ab34ff';
export const SECRETO_JWT = 'secreto-solo-para-pruebas';

/** `true` si algún texto de `message` (arreglo de problemas de validación) empieza por el campo. */
export const mensajeDeCampo = (body: { message?: unknown }, campo: string): boolean =>
  Array.isArray(body.message) &&
  body.message.some((mensaje) => typeof mensaje === 'string' && mensaje.startsWith(campo));

/** `true` si algún texto de `message` menciona el campo (para los campos que el ValidationPipe rechaza por sobrantes). */
export const mensajeMencionaCampo = (body: { message?: unknown }, campo: string): boolean =>
  Array.isArray(body.message) && body.message.some((mensaje) => typeof mensaje === 'string' && mensaje.includes(campo));
