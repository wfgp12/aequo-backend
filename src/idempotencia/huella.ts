import { createHash } from 'node:crypto';

/** JSON con las claves ordenadas, para que el mismo contenido dé siempre el mismo texto sin importar el orden de los campos. */
function canonico(valor: unknown): string {
  if (Array.isArray(valor)) {
    return `[${valor.map(canonico).join(',')}]`;
  }
  if (valor !== null && typeof valor === 'object') {
    const campos = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${campos.map(([clave, v]) => `${JSON.stringify(clave)}:${canonico(v)}`).join(',')}}`;
  }
  return JSON.stringify(valor) ?? 'null';
}

/**
 * Huella de una petición: método, ruta y cuerpo. Sirve para saber si una clave de idempotencia que se repite
 * corresponde a la MISMA petición (se reenvía el resultado) o a otra distinta (se rechaza).
 */
export function calcularHuella(metodo: string, ruta: string, cuerpo: unknown): string {
  return createHash('sha256').update(`${metodo.toUpperCase()} ${ruta}\n${canonico(cuerpo ?? {})}`).digest('hex');
}
