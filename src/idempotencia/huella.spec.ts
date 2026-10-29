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
