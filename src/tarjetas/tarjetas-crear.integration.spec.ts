import { randomUUID } from 'node:crypto';
import {
  CLAVES_DE_UNA_TARJETA,
  MENSAJES,
  OTRO_USUARIO_ID,
  USUARIO_ID,
  mensajeDeCampo,
  mensajeMencionaCampo,
  tarjetaEsperada,
  usarEntorno,
} from '../../test/tarjetas/arnes-tarjetas.js';

const valida = (cambios: Record<string, unknown> = {}) => ({ nombre: 'Visa', tasaEA: 0.2921, ...cambios });

describe('POST /tarjetas (integración: guard de sesión real y MongoDB simulado)', () => {
  const entorno = usarEntorno();

  describe('crear una tarjeta', () => {
    it('CA-RF24-17 crea una tarjeta y devuelve 201 con la forma del contrato', async () => {
      const { status, body } = await entorno.crearTarjeta({
        nombre: 'Visa Bancolombia',
        tasaEA: 0.2921,
        cuotaUnicaSinInteres: true,
      });

      expect(status).toBe(201);
      expect(body).toEqual(tarjetaEsperada({ nombre: 'Visa Bancolombia', tasaEA: 0.2921, cuotaUnicaSinInteres: true }));
      expect(Object.keys(body).sort()).toEqual(CLAVES_DE_UNA_TARJETA);
      expect(entorno.tarjetas.docs).toHaveLength(1);
      expect(String(entorno.tarjetas.docs[0].usuarioId)).toBe(USUARIO_ID);
    });

    it('CA-RF24-18 sin cuotaUnicaSinInteres vale false y se aceptan la tasa 0, la tasa 1 y un nombre de 50 caracteres', async () => {
      const nombre50 = 'x'.repeat(50);
      const casos: Array<[Record<string, unknown>, Record<string, unknown>]> = [
        [{ nombre: 'Sin bandera' }, { cuotaUnicaSinInteres: false, tasaEA: 0.2921 }],
        [{ nombre: 'Sin interés', tasaEA: 0 }, { tasaEA: 0 }],
        [{ nombre: 'Tasa máxima', tasaEA: 1 }, { tasaEA: 1 }],
        [{ nombre: nombre50 }, { nombre: nombre50 }],
      ];

      for (const [cambios, esperado] of casos) {
        const { status, body } = await entorno.crearTarjeta(valida(cambios));
        expect(status, JSON.stringify(cambios)).toBe(201);
        expect(body, JSON.stringify(cambios)).toMatchObject(esperado);
      }
    });

    it('CA-RF24-19 el nombre se guarda sin espacios sobrantes', async () => {
      const { status, body } = await entorno.crearTarjeta(valida({ nombre: '  Visa Bancolombia  ' }));

      expect(status).toBe(201);
      expect(body.nombre).toBe('Visa Bancolombia');
      expect(entorno.tarjetas.docs[0].nombre).toBe('Visa Bancolombia');
    });
  });

  describe('validación del cuerpo', () => {
    it.each([
      ['sin nombre', { tasaEA: 0.2921 }, ['nombre']],
      ['sin tasaEA', { nombre: 'Visa' }, ['tasaEA']],
      ['con el cuerpo vacío', {}, ['nombre', 'tasaEA']],
      ['con nombre null', { nombre: null, tasaEA: 0.2921 }, ['nombre']],
      ['con tasaEA null', { nombre: 'Visa', tasaEA: null }, ['tasaEA']],
    ])(
      'CA-RF24-20 faltan campos obligatorios: %s responde 400 con un texto por campo',
      async (_caso, cuerpo, campos) => {
        const { status, body } = await entorno.crearTarjeta(cuerpo);

        expect(status).toBe(400);
        for (const campo of campos) expect(mensajeDeCampo(body, campo), campo).toBe(true);
        expect(entorno.tarjetas.docs).toHaveLength(0);
      },
    );

    it.each([
      ['vacío', ''],
      ['solo espacios', '   '],
      ['de 51 caracteres', 'x'.repeat(51)],
      ['un número', 123],
      ['un booleano', true],
    ])('CA-RF24-21 un nombre %s responde 400 y no guarda nada', async (_caso, nombre) => {
      const { status, body } = await entorno.crearTarjeta(valida({ nombre }));

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'nombre')).toBe(true);
      expect(entorno.tarjetas.docs).toHaveLength(0);
    });

    it.each([
      ['negativa', -0.01],
      ['mayor que 100 % E.A.', 1.0001],
      ['un porcentaje en lugar de una fracción', 29.21],
      ['un texto', 'alta'],
      ['un texto numérico', '0.2921'],
    ])('CA-RF24-22 una tasa %s responde 400 y no guarda nada', async (_caso, tasaEA) => {
      const { status, body } = await entorno.crearTarjeta(valida({ tasaEA }));

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'tasaEA')).toBe(true);
      expect(entorno.tarjetas.docs).toHaveLength(0);
    });

    it.each([
      ['el texto "true"', 'true'],
      ['el número 1', 1],
      ['un texto cualquiera', 'quizás'],
      ['null', null],
    ])('CA-RF24-23 cuotaUnicaSinInteres con %s responde 400 y no guarda nada', async (_caso, cuotaUnicaSinInteres) => {
      const { status, body } = await entorno.crearTarjeta(valida({ cuotaUnicaSinInteres }));

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'cuotaUnicaSinInteres')).toBe(true);
      expect(entorno.tarjetas.docs).toHaveLength(0);
    });

    it.each([
      ['usuarioId', OTRO_USUARIO_ID],
      ['id', '665f1c2e9b1d4a0012ab34aa'],
      ['createdAt', '2026-11-01T00:00:00.000Z'],
      ['creadaEn', '2026-11-01T00:00:00.000Z'],
      ['cupo', 5000000],
    ])('CA-RF24-24 el campo no declarado %s se rechaza con 400 y no guarda nada', async (campo, valor) => {
      const { status, body } = await entorno.crearTarjeta(valida({ [campo]: valor }));

      expect(status).toBe(400);
      expect(mensajeMencionaCampo(body, campo)).toBe(true);
      expect(entorno.tarjetas.docs).toHaveLength(0);
    });
  });

  describe('nombre repetido', () => {
    it.each(['Visa', 'visa', 'VISA', '  Visa  '])(
      'CA-RF24-25 crear una tarjeta llamada "%s" cuando ya existe "Visa" responde 409 y deja la original intacta',
      async (nombre) => {
        await entorno.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });

        const { status, body } = await entorno.crearTarjeta(valida({ nombre, tasaEA: 0.5 }));

        expect(status).toBe(409);
        expect(body).toEqual({ statusCode: 409, message: MENSAJES.nombreDuplicado, error: 'Conflict' });
        expect(entorno.tarjetas.docs).toHaveLength(1);
        expect(entorno.tarjetas.docs[0]).toMatchObject({ nombre: 'Visa', tasaEA: 0.2921 });
      },
    );

    it('CA-RF24-26 la unicidad del nombre es por usuario: otro usuario puede tener «Visa» y el mismo usuario otra tarjeta', async () => {
      await entorno.sembrarTarjeta({ nombre: 'Visa' });

      const deB = await entorno.crearTarjeta(valida({ nombre: 'Visa' }), { token: entorno.tokenOtro });
      const otraDeA = await entorno.crearTarjeta(valida({ nombre: 'Mastercard' }));

      expect(deB.status).toBe(201);
      expect(otraDeA.status).toBe(201);
    });

    it('CA-RF24-27 dos peticiones simultáneas con el mismo nombre: una responde 201, la otra 409, nunca 500', async () => {
      const [a, b] = await Promise.all([
        entorno.crearTarjeta(valida({ tasaEA: 0.2 }), { clave: randomUUID() }),
        entorno.crearTarjeta(valida({ tasaEA: 0.3 }), { clave: randomUUID() }),
      ]);

      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(entorno.tarjetas.docs).toHaveLength(1);
      const perdedora = a.status === 409 ? a : b;
      expect(perdedora.body).toEqual({ statusCode: 409, message: MENSAJES.nombreDuplicado, error: 'Conflict' });
    });
  });

  describe('idempotencia del POST (Idempotency-Key)', () => {
    it('CA-RF24-28 repetir la petición con la misma clave devuelve la misma respuesta marcada como repetida', async () => {
      const clave = randomUUID();

      const primera = await entorno.crearTarjeta(valida(), { clave });
      const segunda = await entorno.crearTarjeta(valida(), { clave });

      expect(primera.status).toBe(201);
      expect(segunda.status).toBe(201);
      expect(segunda.body).toEqual(primera.body);
      expect(segunda.body.id).toBe(primera.body.id);
      expect(primera.headers['idempotent-replayed']).toBeUndefined();
      expect(segunda.headers['idempotent-replayed']).toBe('true');
      expect(entorno.tarjetas.docs).toHaveLength(1);
    });

    it('CA-RF24-29 la misma clave con una petición distinta responde 422 y la tarjeta no cambia', async () => {
      const clave = randomUUID();
      await entorno.crearTarjeta(valida({ tasaEA: 0.2921 }), { clave });

      const { status, body } = await entorno.crearTarjeta(valida({ tasaEA: 0.3 }), { clave });

      expect(status).toBe(422);
      expect(body).toEqual({
        statusCode: 422,
        message: 'La clave Idempotency-Key ya se usó con otra petición: genera una clave nueva para una acción nueva',
        error: 'Unprocessable Entity',
      });
      expect(entorno.tarjetas.docs).toHaveLength(1);
      expect(entorno.tarjetas.docs[0].tasaEA).toBe(0.2921);
    });
  });

  describe('sin tope de tarjetas', () => {
    it('CA-RF24-30 un usuario con 100 tarjetas puede crear otra', async () => {
      for (let i = 0; i < 100; i++) await entorno.sembrarTarjeta({ nombre: `Tarjeta ${i}` });

      const { status } = await entorno.crearTarjeta(valida({ nombre: 'Tarjeta 100' }));

      expect(status).toBe(201);
      expect(entorno.tarjetas.docs).toHaveLength(101);
    });
  });
});
