import { codificarCursor, decodificarCursor } from './cursor.js';

const ID = '66a0b3c4d5e6f70012ab34cd';

describe('cursor de la carga progresiva', () => {
  it('codifica y decodifica la misma posición', () => {
    const fecha = new Date('2026-10-20T00:00:00.000Z');

    expect(decodificarCursor(codificarCursor(fecha, ID))).toEqual({ fecha, id: ID });
  });

  it('es un texto opaco, apto para una URL', () => {
    const cursor = codificarCursor(new Date('2026-10-20T00:00:00.000Z'), ID);

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cursor).not.toContain(ID);
  });

  it('acepta fechas anteriores a 1970', () => {
    const fecha = new Date('1960-03-01T00:00:00.000Z');

    expect(decodificarCursor(codificarCursor(fecha, ID))?.fecha).toEqual(fecha);
  });

  it.each([
    ['vacío', ''],
    ['basura', 'esto-no-es-un-cursor'],
    ['base64 de otra cosa', Buffer.from('hola mundo').toString('base64url')],
    ['id que no tiene 24 caracteres hexadecimales', Buffer.from('1761344400000_abc').toString('base64url')],
    ['sin la fecha', Buffer.from(`_${ID}`).toString('base64url')],
    ['fecha que no es válida', Buffer.from(`99999999999999999_${ID}`).toString('base64url')],
  ])('devuelve null si el texto no es un cursor válido: %s', (_caso, texto) => {
    expect(decodificarCursor(texto)).toBeNull();
  });
});
