import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  CLAVES_DE_UN_CARGO,
  MENSAJES,
  OTRO_USUARIO_ID,
  USUARIO_ID,
  cargoEsperado,
  mensajeDeCampo,
  mensajeMencionaCampo,
  usarEntorno,
} from '../../test/tarjetas/arnes-tarjetas.js';

const valido = (cambios: Record<string, unknown> = {}) => ({ descripcion: 'Netflix', valor: 38900, ...cambios });
const idAjeno = () => new mongoose.Types.ObjectId().toString();

describe('POST /tarjetas/:tarjetaId/cargos (integración: guard de sesión real y MongoDB simulado)', () => {
  const entorno = usarEntorno();
  let tarjetaId: string;

  beforeEach(async () => {
    tarjetaId = await entorno.sembrarTarjeta({ nombre: 'Visa' });
  });

  describe('crear un cargo', () => {
    it('CA-RF29-18 crea un cargo y devuelve 201 con la forma del contrato', async () => {
      const { status, body } = await entorno.crearCargo(tarjetaId, valido());

      expect(status).toBe(201);
      expect(body).toEqual(cargoEsperado({ tarjetaId, descripcion: 'Netflix', valor: 38900, activo: true }));
      expect(Object.keys(body).sort()).toEqual(CLAVES_DE_UN_CARGO);
      expect(entorno.cargos.docs).toHaveLength(1);
      expect(String(entorno.cargos.docs[0].usuarioId)).toBe(USUARIO_ID);
      expect(String(entorno.cargos.docs[0].tarjetaId)).toBe(tarjetaId);
    });

    it('CA-RF29-19 acepta valores límite, activo false y una descripción de 100 caracteres, sin redondear', async () => {
      const descripcion100 = 'x'.repeat(100);
      const casos: Array<[Record<string, unknown>, Record<string, unknown>]> = [
        [
          { descripcion: 'Uno', valor: 1 },
          { valor: 1, activo: true },
        ],
        [{ descripcion: 'Decimal', valor: 1500000.5 }, { valor: 1500000.5 }],
        [{ descripcion: 'Grande', valor: 999999999 }, { valor: 999999999 }],
        [{ descripcion: 'Inactivo', activo: false }, { activo: false }],
        [{ descripcion: descripcion100 }, { descripcion: descripcion100 }],
      ];

      for (const [cambios, esperado] of casos) {
        const { status, body } = await entorno.crearCargo(tarjetaId, valido(cambios));
        expect(status, JSON.stringify(cambios)).toBe(201);
        expect(body, JSON.stringify(cambios)).toMatchObject(esperado);
      }
    });

    it('CA-RF29-20 la descripción se guarda sin espacios sobrantes', async () => {
      const { status, body } = await entorno.crearCargo(tarjetaId, valido({ descripcion: '  Netflix  ' }));

      expect(status).toBe(201);
      expect(body.descripcion).toBe('Netflix');
      expect(entorno.cargos.docs[0].descripcion).toBe('Netflix');
    });
  });

  describe('validación del cuerpo', () => {
    it.each([
      ['sin descripcion', { valor: 38900 }, ['descripcion']],
      ['sin valor', { descripcion: 'Netflix' }, ['valor']],
      ['con el cuerpo vacío', {}, ['descripcion', 'valor']],
      ['con descripcion null', { descripcion: null, valor: 38900 }, ['descripcion']],
      ['con valor null', { descripcion: 'Netflix', valor: null }, ['valor']],
    ])(
      'CA-RF29-21 faltan campos obligatorios: %s responde 400 con un texto por campo',
      async (_caso, cuerpo, campos) => {
        const { status, body } = await entorno.crearCargo(tarjetaId, cuerpo);

        expect(status).toBe(400);
        for (const campo of campos) expect(mensajeDeCampo(body, campo), campo).toBe(true);
        expect(entorno.cargos.docs).toHaveLength(0);
      },
    );

    it.each([
      ['vacía', ''],
      ['solo espacios', '   '],
      ['de 101 caracteres', 'x'.repeat(101)],
      ['un número', 123],
    ])('CA-RF29-22 una descripción %s responde 400 y no guarda nada', async (_caso, descripcion) => {
      const { status, body } = await entorno.crearCargo(tarjetaId, valido({ descripcion }));

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'descripcion')).toBe(true);
      expect(entorno.cargos.docs).toHaveLength(0);
    });

    it.each([
      ['cero', 0],
      ['negativo', -38900],
      ['un texto', 'barato'],
      ['un texto numérico', '38900'],
    ])('CA-RF29-23 un valor %s responde 400 y no guarda nada', async (_caso, valor) => {
      const { status, body } = await entorno.crearCargo(tarjetaId, valido({ valor }));

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'valor')).toBe(true);
      expect(entorno.cargos.docs).toHaveLength(0);
    });

    it.each([
      ['un texto cualquiera', 'quizás'],
      ['el texto "true"', 'true'],
      ['el número 1', 1],
      ['null', null],
    ])('CA-RF29-24 activo con %s responde 400 y no guarda nada', async (_caso, activo) => {
      const { status, body } = await entorno.crearCargo(tarjetaId, valido({ activo }));

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'activo')).toBe(true);
      expect(entorno.cargos.docs).toHaveLength(0);
    });

    it.each([
      ['usuarioId', OTRO_USUARIO_ID],
      ['tarjetaId', '665f1c2e9b1d4a0012ab34aa'],
      ['id', '665f1c2e9b1d4a0012ab34aa'],
      ['createdAt', '2026-11-01T00:00:00.000Z'],
      ['creadaEn', '2026-11-01T00:00:00.000Z'],
    ])('CA-RF29-25 el campo no declarado %s se rechaza con 400 y no guarda nada', async (campo, valor) => {
      const { status, body } = await entorno.crearCargo(tarjetaId, valido({ [campo]: valor }));

      expect(status).toBe(400);
      expect(mensajeMencionaCampo(body, campo)).toBe(true);
      expect(entorno.cargos.docs).toHaveLength(0);
    });
  });

  describe('la tarjeta de la ruta', () => {
    it('CA-RF29-26 una tarjeta inexistente o de otro usuario responde 404 y no se crea ningún cargo', async () => {
      const deB = await entorno.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);

      const inexistente = await entorno.crearCargo(idAjeno(), valido());
      const ajena = await entorno.crearCargo(deB, valido());

      for (const respuesta of [inexistente, ajena]) {
        expect(respuesta.status).toBe(404);
        expect(respuesta.body).toEqual({ statusCode: 404, message: MENSAJES.tarjetaNoEncontrada, error: 'Not Found' });
      }
      expect(entorno.cargos.docs).toHaveLength(0);
    });
  });

  describe('cargos repetidos e idempotencia', () => {
    it('CA-RF29-27 dos cargos iguales en la misma tarjeta son legítimos: no se deduplica por contenido', async () => {
      const primero = await entorno.crearCargo(tarjetaId, valido(), { clave: randomUUID() });
      const segundo = await entorno.crearCargo(tarjetaId, valido(), { clave: randomUUID() });

      expect(primero.status).toBe(201);
      expect(segundo.status).toBe(201);
      expect(segundo.body.id).not.toBe(primero.body.id);
      expect(entorno.cargos.docs).toHaveLength(2);
    });

    it('CA-RF29-28 repetir la petición con la misma clave de idempotencia no crea otro cargo', async () => {
      const clave = randomUUID();

      const primera = await entorno.crearCargo(tarjetaId, valido(), { clave });
      const segunda = await entorno.crearCargo(tarjetaId, valido(), { clave });

      expect(primera.status).toBe(201);
      expect(segunda.status).toBe(201);
      expect(segunda.body).toEqual(primera.body);
      expect(primera.headers['idempotent-replayed']).toBeUndefined();
      expect(segunda.headers['idempotent-replayed']).toBe('true');
      expect(entorno.cargos.docs).toHaveLength(1);
    });

    it('CA-RF29-29 la misma clave con una petición distinta responde 422 y el cargo no cambia', async () => {
      const clave = randomUUID();
      await entorno.crearCargo(tarjetaId, valido({ valor: 38900 }), { clave });

      const { status, body } = await entorno.crearCargo(tarjetaId, valido({ valor: 45000 }), { clave });

      expect(status).toBe(422);
      expect(body).toEqual({
        statusCode: 422,
        message: 'La clave Idempotency-Key ya se usó con otra petición: genera una clave nueva para una acción nueva',
        error: 'Unprocessable Entity',
      });
      expect(entorno.cargos.docs).toHaveLength(1);
      expect(entorno.cargos.docs[0].valor).toBe(38900);
    });
  });
});
