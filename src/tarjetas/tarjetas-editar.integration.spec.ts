import mongoose from 'mongoose';
import {
  MENSAJES,
  OTRO_USUARIO_ID,
  mensajeDeCampo,
  mensajeMencionaCampo,
  tarjetaEsperada,
  usarEntorno,
} from '../../test/tarjetas/arnes-tarjetas.js';

const idAjeno = () => new mongoose.Types.ObjectId().toString();
const NOMBRE_DUPLICADO = { statusCode: 409, message: MENSAJES.nombreDuplicado, error: 'Conflict' };

describe('PATCH /tarjetas/:id: editar una tarjeta (integración: guard de sesión real y MongoDB simulado)', () => {
  const entorno = usarEntorno();

  it('CA-RF33-01 renombrar la tarjeta devuelve el nombre sin espacios sobrantes y el resto igual', async () => {
    const id = await entorno.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });

    const { status, body } = await entorno.editarTarjeta(id, { nombre: '  Visa Oro  ' });

    expect(status).toBe(200);
    expect(body).toEqual(tarjetaEsperada({ id, nombre: 'Visa Oro', tasaEA: 0.2921, cuotaUnicaSinInteres: false }));
    expect(entorno.tarjetaGuardada(id)?.nombre).toBe('Visa Oro');
  });

  it('CA-RF33-02 se pueden editar los tres campos a la vez', async () => {
    const id = await entorno.sembrarTarjeta({ nombre: 'Visa', cuotaUnicaSinInteres: false });

    const { status, body } = await entorno.editarTarjeta(id, {
      nombre: 'Visa Oro',
      tasaEA: 0.31,
      cuotaUnicaSinInteres: true,
    });

    expect(status).toBe(200);
    expect(body).toEqual(tarjetaEsperada({ id, nombre: 'Visa Oro', tasaEA: 0.31, cuotaUnicaSinInteres: true }));
    expect(entorno.tarjetaGuardada(id)).toMatchObject({ nombre: 'Visa Oro', tasaEA: 0.31, cuotaUnicaSinInteres: true });
  });

  it('CA-RF33-03 un cuerpo vacío responde 400 y la tarjeta no cambia', async () => {
    const id = await entorno.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });

    const { status } = await entorno.editarTarjeta(id, {});

    expect(status).toBe(400);
    expect(entorno.tarjetaGuardada(id)).toMatchObject({ nombre: 'Visa', tasaEA: 0.2921 });
  });

  it.each([
    ['nombre vacío', { nombre: '' }, 'nombre'],
    ['nombre de solo espacios', { nombre: '   ' }, 'nombre'],
    ['nombre de 51 caracteres', { nombre: 'x'.repeat(51) }, 'nombre'],
    ['nombre null', { nombre: null }, 'nombre'],
    ['cuotaUnicaSinInteres con un texto', { cuotaUnicaSinInteres: 'sí' }, 'cuotaUnicaSinInteres'],
    ['cuotaUnicaSinInteres null', { cuotaUnicaSinInteres: null }, 'cuotaUnicaSinInteres'],
  ])('CA-RF33-04 %s responde 400 y la tarjeta no cambia', async (_caso, cuerpo, campo) => {
    const id = await entorno.sembrarTarjeta({ nombre: 'Visa', cuotaUnicaSinInteres: false });

    const { status, body } = await entorno.editarTarjeta(id, cuerpo);

    expect(status).toBe(400);
    expect(mensajeDeCampo(body, campo)).toBe(true);
    expect(entorno.tarjetaGuardada(id)).toMatchObject({ nombre: 'Visa', cuotaUnicaSinInteres: false });
  });

  it.each(['usuarioId', 'id', 'createdAt', 'creadaEn'])(
    'CA-RF33-05 el campo no editable %s se rechaza con 400, solo o junto a un campo válido, y la tarjeta no cambia',
    async (campo) => {
      const id = await entorno.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });
      const valor = campo === 'usuarioId' ? OTRO_USUARIO_ID : '2026-11-01T00:00:00.000Z';

      const solo = await entorno.editarTarjeta(id, { [campo]: valor });
      const junto = await entorno.editarTarjeta(id, { [campo]: valor, tasaEA: 0.5 });

      for (const { status, body } of [solo, junto]) {
        expect(status).toBe(400);
        expect(mensajeMencionaCampo(body, campo)).toBe(true);
      }
      expect(entorno.tarjetaGuardada(id)).toMatchObject({ nombre: 'Visa', tasaEA: 0.2921 });
      expect(String(entorno.tarjetaGuardada(id)?.usuarioId)).not.toBe(OTRO_USUARIO_ID);
    },
  );

  describe('nombres repetidos', () => {
    it.each(['visa', 'Visa '])(
      'CA-RF33-06 renombrar «Mastercard» a "%s" cuando ya existe «Visa» responde 409, solo o junto a otro cambio, y nada cambia',
      async (nombre) => {
        const visa = await entorno.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });
        const mastercard = await entorno.sembrarTarjeta({ nombre: 'Mastercard', tasaEA: 0.3 });

        const solo = await entorno.editarTarjeta(mastercard, { nombre });
        const junto = await entorno.editarTarjeta(mastercard, { nombre, tasaEA: 0.4 });

        for (const { status, body } of [solo, junto]) {
          expect(status).toBe(409);
          expect(body).toEqual(NOMBRE_DUPLICADO);
        }
        expect(entorno.tarjetaGuardada(visa)).toMatchObject({ nombre: 'Visa', tasaEA: 0.2921 });
        expect(entorno.tarjetaGuardada(mastercard)).toMatchObject({ nombre: 'Mastercard', tasaEA: 0.3 });
      },
    );

    it('CA-RF33-07 cambiar solo las mayúsculas del propio nombre no es conflicto', async () => {
      const id = await entorno.sembrarTarjeta({ nombre: 'Visa' });

      const minuscula = await entorno.editarTarjeta(id, { nombre: 'visa' });
      const original = await entorno.editarTarjeta(id, { nombre: 'Visa' });

      expect(minuscula.status).toBe(200);
      expect(minuscula.body.nombre).toBe('visa');
      expect(original.status).toBe(200);
      expect(original.body.nombre).toBe('Visa');
    });

    it('CA-RF33-08 el nombre que usa otro usuario no estorba', async () => {
      const mastercard = await entorno.sembrarTarjeta({ nombre: 'Mastercard' });
      const deB = await entorno.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.25 }, OTRO_USUARIO_ID);

      const { status, body } = await entorno.editarTarjeta(mastercard, { nombre: 'Visa' });

      expect(status).toBe(200);
      expect(body.nombre).toBe('Visa');
      expect(entorno.tarjetaGuardada(deB)).toMatchObject({ nombre: 'Visa', tasaEA: 0.25 });
    });

    it('CA-RF33-09 dos renombres simultáneos al mismo nombre: uno responde 200, el otro 409, nunca 500', async () => {
      const visa = await entorno.sembrarTarjeta({ nombre: 'Visa' });
      const mastercard = await entorno.sembrarTarjeta({ nombre: 'Mastercard' });

      const [a, b] = await Promise.all([
        entorno.editarTarjeta(visa, { nombre: 'Amex' }),
        entorno.editarTarjeta(mastercard, { nombre: 'Amex' }),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect((a.status === 409 ? a : b).body).toEqual(NOMBRE_DUPLICADO);
      expect(entorno.tarjetas.docs.filter((doc) => doc.nombre === 'Amex')).toHaveLength(1);
      expect(entorno.tarjetas.docs).toHaveLength(2);
    });
  });

  it('CA-RF33-10 editar la tarjeta de otro usuario o inexistente responde 404 y la de B no cambia', async () => {
    const deB = await entorno.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.25 }, OTRO_USUARIO_ID);

    const ajena = await entorno.editarTarjeta(deB, { nombre: 'Nueva' });
    const inexistente = await entorno.editarTarjeta(idAjeno(), { nombre: 'Nueva' });

    for (const respuesta of [ajena, inexistente]) {
      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toEqual({ statusCode: 404, message: MENSAJES.tarjetaNoEncontrada, error: 'Not Found' });
    }
    expect(entorno.tarjetaGuardada(deB)).toMatchObject({ nombre: 'Visa', tasaEA: 0.25 });
  });

  it('CA-RF33-11 repetir la misma edición es inofensivo', async () => {
    const id = await entorno.sembrarTarjeta({ nombre: 'Visa' });

    const primera = await entorno.editarTarjeta(id, { nombre: 'Visa Oro' });
    const segunda = await entorno.editarTarjeta(id, { nombre: 'Visa Oro' });

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(segunda.body).toEqual({ ...primera.body, actualizadaEn: expect.any(String) });
    expect(entorno.tarjetas.docs).toHaveLength(1);
  });
});
