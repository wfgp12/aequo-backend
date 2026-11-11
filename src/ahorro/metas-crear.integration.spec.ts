import { randomUUID } from 'node:crypto';
import {
  CLAVES_DE_UNA_META,
  MENSAJES,
  USUARIO_ID,
  mensajeDeCampo,
  mensajeMencionaCampo,
  metaEsperada,
  usarEntorno,
} from '../../test/ahorro/arnes-metas.js';

const valida = (cambios: Record<string, unknown> = {}) => ({
  tipoMeta: 'PORCENTAJE',
  valorObjetivo: 20,
  periodo: '2026-11',
  ...cambios,
});

describe('POST /ahorro/metas (integración: guard de sesión real y MongoDB simulado)', () => {
  const entorno = usarEntorno();

  describe('crear una meta', () => {
    it('CA-RF21-28 crea una meta de porcentaje y devuelve 201 con la forma del contrato', async () => {
      const { status, body } = await entorno.crear(valida());

      expect(status).toBe(201);
      expect(body).toEqual(
        metaEsperada({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11', ahorroReal: 0 }),
      );
      expect(Object.keys(body).sort()).toEqual(CLAVES_DE_UNA_META);
      expect(entorno.metas.docs).toHaveLength(1);
      const guardada = entorno.metas.docs[0];
      expect(String(guardada.usuarioId)).toBe(USUARIO_ID);
      expect(guardada.periodo.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    });

    it('CA-RF21-29 crea una meta de monto fijo sin redondear el valor', async () => {
      const { status, body } = await entorno.crear(
        valida({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 1500000.5, periodo: '2026-12' }),
      );

      expect(status).toBe(201);
      expect(body.tipoMeta).toBe('MONTO_FIJO');
      expect(body.valorObjetivo).toBe(1500000.5);
      expect(body.periodo).toBe('2026-12');
    });

    it('CA-RF21-30 el periodo puede escribirse como fecha completa y se normaliza al mes', async () => {
      const casos: Array<[string, string]> = [
        ['2026-11-15', '2026-11'],
        ['2026-12-31', '2026-12'],
        ['2028-02-29', '2028-02'],
      ];

      for (const [enviado, esperado] of casos) {
        const { status, body } = await entorno.crear(valida({ periodo: enviado }));
        expect(status, enviado).toBe(201);
        expect(body.periodo, enviado).toBe(esperado);
      }

      expect(entorno.metas.docs.map((doc) => doc.periodo.toISOString()).sort()).toEqual([
        '2026-11-01T00:00:00.000Z',
        '2026-12-01T00:00:00.000Z',
        '2028-02-01T00:00:00.000Z',
      ]);
    });

    it('CA-RF21-66 el ahorroReal es opcional al crear: se guarda lo enviado y vale 0 si no se envía', async () => {
      const casos: Array<[string, Record<string, unknown>, number]> = [
        ['2026-01', { ahorroReal: 150000 }, 150000],
        ['2026-02', { ahorroReal: -25000 }, -25000],
        ['2026-03', { ahorroReal: 0 }, 0],
        ['2026-04', {}, 0],
      ];

      for (const [periodo, extra, esperado] of casos) {
        const { status, body } = await entorno.crear(valida({ periodo, ...extra }));
        expect(status, periodo).toBe(201);
        expect(body.ahorroReal, periodo).toBe(esperado);
        const guardada = entorno.metas.docs.find((doc) => doc.periodo.toISOString().startsWith(periodo));
        expect(guardada?.ahorroReal, periodo).toBe(esperado);
      }
    });
  });

  describe('datos inválidos: 400 con un texto por problema que empieza por el campo, y no se guarda nada', () => {
    it.each([
      'noviembre',
      '2026-13',
      '2026-00',
      '2026-1',
      '202611',
      '2026-02-30',
      '2027-02-29',
      '2026-11-15T10:00:00Z',
    ])('CA-RF21-31 rechaza el periodo mal escrito %j', async (periodo) => {
      const { status, body } = await entorno.crear(valida({ periodo }));

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'periodo')).toBe(true);
      expect(entorno.metas.docs).toHaveLength(0);
    });

    it.each([
      ['sin tipoMeta', 'tipoMeta', (c: Record<string, unknown>) => delete c.tipoMeta],
      ['sin valorObjetivo', 'valorObjetivo', (c: Record<string, unknown>) => delete c.valorObjetivo],
      ['sin periodo', 'periodo', (c: Record<string, unknown>) => delete c.periodo],
      ['con tipoMeta null', 'tipoMeta', (c: Record<string, unknown>) => (c.tipoMeta = null)],
      ['con valorObjetivo null', 'valorObjetivo', (c: Record<string, unknown>) => (c.valorObjetivo = null)],
      ['con periodo null', 'periodo', (c: Record<string, unknown>) => (c.periodo = null)],
    ])('CA-RF21-32 rechaza el cuerpo %s', async (_caso, campo, romper) => {
      const cuerpo = valida();
      romper(cuerpo);

      const { status, body } = await entorno.crear(cuerpo);

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, campo)).toBe(true);
      expect(entorno.metas.docs).toHaveLength(0);
    });

    it('CA-RF21-32 con el cuerpo vacío informa los tres campos obligatorios', async () => {
      const { status, body } = await entorno.crear({});

      expect(status).toBe(400);
      for (const campo of ['tipoMeta', 'valorObjetivo', 'periodo']) {
        expect(mensajeDeCampo(body, campo), campo).toBe(true);
      }
      expect(entorno.metas.docs).toHaveLength(0);
    });

    it.each(['OBJETIVO', 'porcentaje', ''])('CA-RF21-33 rechaza el tipo de meta %j', async (tipoMeta) => {
      const { status, body } = await entorno.crear(valida({ tipoMeta }));

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'tipoMeta')).toBe(true);
      expect(entorno.metas.docs).toHaveLength(0);
    });

    it.each([
      ['PORCENTAJE', 0],
      ['PORCENTAJE', -5],
      ['PORCENTAJE', 'veinte'],
      ['PORCENTAJE', '20'],
      ['MONTO_FIJO', 0],
      ['MONTO_FIJO', -5],
      ['MONTO_FIJO', 'veinte'],
      ['MONTO_FIJO', '20'],
    ])('CA-RF21-34 rechaza el valorObjetivo en %s con %j', async (tipoMeta, valorObjetivo) => {
      const { status, body } = await entorno.crear(valida({ tipoMeta, valorObjetivo }));

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'valorObjetivo')).toBe(true);
      expect(entorno.metas.docs).toHaveLength(0);
    });

    it('CA-RF21-35 el porcentaje admite de 0,5 a 100 y rechaza lo que pasa de 100; el monto fijo no tiene tope', async () => {
      const aceptadas: Array<[string, number]> = [
        ['2026-01', 0.5],
        ['2026-02', 100],
      ];
      for (const [periodo, valorObjetivo] of aceptadas) {
        const { status } = await entorno.crear(valida({ periodo, valorObjetivo }));
        expect(status, `${valorObjetivo} %`).toBe(201);
      }

      for (const valorObjetivo of [100.01, 150]) {
        const { status, body } = await entorno.crear(valida({ periodo: '2026-03', valorObjetivo }));
        expect(status, `${valorObjetivo} %`).toBe(400);
        expect(mensajeDeCampo(body, 'valorObjetivo')).toBe(true);
        expect(body.message.join(' ')).toContain('100');
      }

      const grande = await entorno.crear(valida({ tipoMeta: 'MONTO_FIJO', periodo: '2026-04', valorObjetivo: 999999999 }));
      expect(grande.status).toBe(201);
      expect(entorno.metas.docs).toHaveLength(3);
    });

    it.each(['usuarioId', 'id', 'createdAt', 'actualizadaEn', 'otroCampo'])(
      'CA-RF21-36 rechaza el campo no declarado %s',
      async (campo) => {
        const { status, body } = await entorno.crear(valida({ [campo]: USUARIO_ID }));

        expect(status).toBe(400);
        expect(mensajeMencionaCampo(body, campo)).toBe(true);
        expect(entorno.metas.docs).toHaveLength(0);
      },
    );
  });

  describe('una meta por usuario y mes', () => {
    it.each([
      ['del mismo tipo', valida({ valorObjetivo: 30 })],
      ['de otro tipo', valida({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 300000 })],
      ['con el periodo como fecha completa del mismo mes', valida({ periodo: '2026-11-20' })],
    ])('CA-RF21-37 responde 409 si ya existe una meta para ese mes (%s) y deja intacta la original', async (_caso, cuerpo) => {
      const id = await entorno.sembrar({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11' });

      const { status, body } = await entorno.crear(cuerpo);

      expect(status).toBe(409);
      expect(body).toEqual({ statusCode: 409, message: MENSAJES.duplicada, error: 'Conflict' });
      expect(entorno.metas.docs).toHaveLength(1);
      expect(entorno.guardada(id)).toMatchObject({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20 });
    });

    it('CA-RF21-38 la unicidad es por usuario y por mes: otro usuario y otro mes no chocan', async () => {
      await entorno.sembrar({ periodo: '2026-11' });

      const deOtroUsuario = await entorno.crear(valida({ periodo: '2026-11' }), { token: entorno.tokenOtro });
      const deOtroMes = await entorno.crear(valida({ periodo: '2026-12' }));

      expect(deOtroUsuario.status).toBe(201);
      expect(deOtroMes.status).toBe(201);
    });

    it('CA-RF21-39 dos peticiones simultáneas para el mismo mes: una responde 201, la otra 409, nunca 500', async () => {
      const [a, b] = await Promise.all([
        entorno.crear(valida({ valorObjetivo: 20 }), { clave: randomUUID() }),
        entorno.crear(valida({ valorObjetivo: 30 }), { clave: randomUUID() }),
      ]);

      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(entorno.metas.docs).toHaveLength(1);
      const perdedora = a.status === 409 ? a : b;
      expect(perdedora.body).toEqual({ statusCode: 409, message: MENSAJES.duplicada, error: 'Conflict' });
    });
  });

  describe('idempotencia del POST (Idempotency-Key)', () => {
    it('CA-RF21-40 repetir la petición con la misma clave devuelve la misma respuesta marcada como repetida', async () => {
      const clave = randomUUID();

      const primera = await entorno.crear(valida(), { clave });
      const segunda = await entorno.crear(valida(), { clave });

      expect(primera.status).toBe(201);
      expect(segunda.status).toBe(201);
      expect(segunda.body).toEqual(primera.body);
      expect(segunda.body.id).toBe(primera.body.id);
      expect(primera.headers['idempotent-replayed']).toBeUndefined();
      expect(segunda.headers['idempotent-replayed']).toBe('true');
      expect(entorno.metas.docs).toHaveLength(1);
    });

    it('CA-RF21-41 la misma clave con una petición distinta responde 422 y la meta no cambia', async () => {
      const clave = randomUUID();
      await entorno.crear(valida({ valorObjetivo: 20 }), { clave });

      const { status, body } = await entorno.crear(valida({ valorObjetivo: 30 }), { clave });

      expect(status).toBe(422);
      expect(body).toEqual({
        statusCode: 422,
        message: 'La clave Idempotency-Key ya se usó con otra petición: genera una clave nueva para una acción nueva',
        error: 'Unprocessable Entity',
      });
      expect(entorno.metas.docs).toHaveLength(1);
      expect(entorno.metas.docs[0].valorObjetivo).toBe(20);
    });
  });

  describe('ahorroReal enviado al crear', () => {
    it.each([
      ['un texto', 'mucho'],
      ['un texto numérico', '150000'],
      ['null', null],
      ['un booleano', true],
    ])('CA-RF21-67 rechaza un ahorroReal que es %s', async (_caso, ahorroReal) => {
      const { status, body } = await entorno.crear(valida({ ahorroReal }));

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'ahorroReal')).toBe(true);
      expect(entorno.metas.docs).toHaveLength(0);
    });
  });
});
