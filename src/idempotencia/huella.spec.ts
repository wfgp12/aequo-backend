import { createHash } from 'node:crypto';
import { calcularHuella } from './huella.js';

const cuerpo = { tipo: 'EGRESO', monto: 45000, fecha: '2026-10-20', categoriaId: 'abc', metodoPago: 'EFECTIVO' };

describe('calcularHuella', () => {
  it('es la misma para la misma petición', () => {
    expect(calcularHuella('POST', '/transacciones', cuerpo)).toBe(calcularHuella('POST', '/transacciones', { ...cuerpo }));
  });

  it('no depende del orden de los campos del cuerpo, tampoco en objetos anidados', () => {
    const reordenado = { metodoPago: 'EFECTIVO', categoriaId: 'abc', fecha: '2026-10-20', monto: 45000, tipo: 'EGRESO' };

    expect(calcularHuella('POST', '/x', reordenado)).toBe(calcularHuella('POST', '/x', cuerpo));
    expect(calcularHuella('POST', '/x', { a: { b: 1, c: 2 } })).toBe(calcularHuella('POST', '/x', { a: { c: 2, b: 1 } }));
  });

  it('ignora los campos undefined, que JSON tampoco envía', () => {
    expect(calcularHuella('POST', '/x', { ...cuerpo, descripcion: undefined })).toBe(calcularHuella('POST', '/x', cuerpo));
  });

  it('no distingue mayúsculas en el método', () => {
    expect(calcularHuella('post', '/x', cuerpo)).toBe(calcularHuella('POST', '/x', cuerpo));
  });

  it.each([
    ['otro monto', 'POST', '/transacciones', { ...cuerpo, monto: 45001 }],
    ['otro campo', 'POST', '/transacciones', { ...cuerpo, descripcion: 'x' }],
    ['otra ruta', 'POST', '/categorias', cuerpo],
    ['otro método', 'PATCH', '/transacciones', cuerpo],
  ])('cambia con %s', (_caso, metodo, ruta, otroCuerpo) => {
    expect(calcularHuella(metodo, ruta, otroCuerpo)).not.toBe(calcularHuella('POST', '/transacciones', cuerpo));
  });

  it('distingue el orden de los elementos de una lista y los tipos (1 no es "1")', () => {
    expect(calcularHuella('POST', '/x', { l: [1, 2] })).not.toBe(calcularHuella('POST', '/x', { l: [2, 1] }));
    expect(calcularHuella('POST', '/x', { n: 1 })).not.toBe(calcularHuella('POST', '/x', { n: '1' }));
  });

  it('un cuerpo ausente equivale a un objeto vacío', () => {
    expect(calcularHuella('POST', '/x', undefined)).toBe(calcularHuella('POST', '/x', {}));
  });

  it('es un hash hexadecimal de 64 caracteres', () => {
    expect(calcularHuella('POST', '/x', cuerpo)).toMatch(/^[0-9a-f]{64}$/);
  });
});

const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');

const permutaciones = <T>(elementos: T[]): T[][] =>
  elementos.length <= 1
    ? [elementos]
    : elementos.flatMap((elemento, i) =>
        permutaciones([...elementos.slice(0, i), ...elementos.slice(i + 1)]).map((resto) => [elemento, ...resto]),
      );

// Las huellas ya guardadas se comparan con las que se calculen tras un despliegue: el formato no puede cambiar en silencio.
describe('formato de la huella', () => {
  it('CA-RF06-27 es el SHA-256 de "METODO RUTA", un salto de línea y el cuerpo en JSON canónico', () => {
    expect(calcularHuella('POST', '/transacciones', undefined)).toBe(sha256('POST /transacciones\n{}'));
    expect(calcularHuella('post', '/transacciones', { tipo: 'EGRESO', monto: 45000 })).toBe(
      sha256('POST /transacciones\n{"monto":45000,"tipo":"EGRESO"}'),
    );
  });

  it('CA-RF06-28 ordena las claves por código de carácter, con el mismo resultado para cualquier orden de llegada', () => {
    const campos: [string, number][] = [
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ];

    for (const orden of permutaciones(campos)) {
      expect(calcularHuella('POST', '/x', Object.fromEntries(orden))).toBe(
        sha256('POST /x\n{"a":1,"b":2,"c":3,"d":4}'),
      );
    }
    expect(calcularHuella('POST', '/x', { a: 1, B: 2 })).toBe(sha256('POST /x\n{"B":2,"a":1}'));
  });

  it('CA-RF06-29 serializa nulos, primitivos y listas como JSON, y un undefined dentro de una lista como null', () => {
    expect(
      calcularHuella('POST', '/x', { a: null, b: 'x', c: true, l: [1, { z: 1, y: 2 }, 'x'] }),
    ).toBe(sha256('POST /x\n{"a":null,"b":"x","c":true,"l":[1,{"y":2,"z":1},"x"]}'));
    expect(calcularHuella('POST', '/x', { l: [1, undefined] })).toBe(sha256('POST /x\n{"l":[1,null]}'));
  });
});
