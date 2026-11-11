import { JwtService } from '@nestjs/jwt';
import { cerca, SECRETO_JWT, USUARIO_ID, usarEntornoProgreso } from '../../test/ahorro/arnes-progreso.js';

const ERROR_401 = { statusCode: 401, message: 'Sesión inválida o vencida', error: 'Unauthorized' };

/**
 * Periodo consultado, parámetros, sesión y forma de la respuesta de GET /ahorro/progreso (RF-22, 4.3.1).
 * Integración con el guard de sesión real y MongoDB simulado.
 */
describe('GET /ahorro/progreso: periodo, parámetros, sesión y contrato (RF-22, integración)', () => {
  const entorno = usarEntornoProgreso();

  describe('periodo consultado', () => {
    it('CA-RF22-17 solo cuentan las transacciones del mes pedido', async () => {
      entorno.ingreso('2026-10-31', 1_000_000);
      entorno.ingreso('2026-11-01', 2_000_000);
      entorno.egreso('2026-11-30', 300_000);
      entorno.egreso('2026-12-01', 900_000);

      const respuesta = await entorno.progreso('mes=2026-11');

      expect(respuesta.status).toBe(200);
      cerca(respuesta.body.ingresoPropio, 2_000_000);
      cerca(respuesta.body.egresos, 300_000);
      cerca(respuesta.body.ahorroDelMes, 1_700_000);
    });

    it('CA-RF22-18 febrero bisiesto', async () => {
      entorno.ingreso('2028-02-29', 500_000);
      entorno.ingreso('2028-03-01', 700_000);

      const respuesta = await entorno.progreso('mes=2028-02');

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.periodo).toBe('2028-02');
      cerca(respuesta.body.ingresoPropio, 500_000);
    });

    it('CA-RF22-19 sin mes, el mes actual según la zona horaria del usuario', async () => {
      // En UTC es 1 de diciembre de 2026, 03:00; en Bogotá todavía es el 30 de noviembre, 10:00 p. m.
      entorno.hoyEs('2026-12-01T03:00:00.000Z');
      await entorno.sembrarMeta({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 300_000, periodo: '2026-11' });
      await entorno.sembrarMeta({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 100_000, periodo: '2026-12' });

      const bogota = await entorno.progreso('', { zona: 'America/Bogota' });
      expect(bogota.status).toBe(200);
      expect(bogota.body.periodo).toBe('2026-11');
      cerca(bogota.body.meta.montoMeta, 300_000);

      const utc = await entorno.progreso('');
      expect(utc.status).toBe(200);
      expect(utc.body.periodo).toBe('2026-12');
      cerca(utc.body.meta.montoMeta, 100_000);

      const explicito = await entorno.progreso('mes=2026-12', { zona: 'America/Bogota' });
      expect(explicito.status).toBe(200);
      expect(explicito.body.periodo).toBe('2026-12');
    });

    const invalidos: Array<[string, string, string | undefined]> = [
      ['mes con mes 13', 'mes=2026-13', undefined],
      ['mes con texto', 'mes=noviembre', undefined],
      ['mes sin cero a la izquierda', 'mes=2026-1', undefined],
      ['un rango desde/hasta (solo se acepta mes)', 'desde=2026-11-01&hasta=2026-11-30', undefined],
      ['un parámetro desconocido', 'mes=2026-11&extra=1', undefined],
      ['una zona horaria que no existe', '', 'No/Existe'],
      ['una zona horaria que no existe junto a un mes válido', 'mes=2026-11', 'No/Existe'],
    ];

    it.each(invalidos)('CA-RF22-20 parámetros inválidos: %s responde 400', async (_caso, consulta, zona) => {
      entorno.sembrarMesBase();

      const respuesta = await entorno.progreso(consulta, { zona });

      expect(respuesta.status).toBe(400);
      expect(Array.isArray(respuesta.body.message)).toBe(true);
    });
  });

  describe('sesión y contrato', () => {
    const sesiones: Array<[string, () => string | null]> = [
      ['sin el header Authorization', () => null],
      ['con un token que no emitió este backend', () => 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma-falsa'],
      [
        'con un token vencido',
        () =>
          new JwtService({ secret: SECRETO_JWT, signOptions: { algorithm: 'HS256' } }).sign(
            { sub: USUARIO_ID },
            { expiresIn: -10 },
          ),
      ],
    ];

    it.each(sesiones)('CA-RF22-24 responde 401 %s y no devuelve datos', async (_caso, obtenerToken) => {
      entorno.sembrarMesBase();

      const respuesta = await entorno.progreso('mes=2026-11', { token: obtenerToken() });

      expect(respuesta.status).toBe(401);
      expect(respuesta.body).toEqual(ERROR_401);
    });

    it('CA-RF22-25 la respuesta tiene exactamente los campos del contrato', async () => {
      entorno.sembrarMesBase();
      await entorno.sembrarMeta({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11' });

      const conMeta = await entorno.progreso('mes=2026-11');
      const sinMeta = await entorno.progreso('mes=2026-10');

      const claves = ['ahorroDelMes', 'disponible', 'egresos', 'ingresoPropio', 'meta', 'periodo', 'porcentajeAvance'];
      for (const respuesta of [conMeta, sinMeta]) {
        expect(respuesta.status).toBe(200);
        expect(Object.keys(respuesta.body).sort()).toEqual(claves);
        for (const campo of ['ingresoPropio', 'egresos', 'ahorroDelMes', 'disponible']) {
          expect(typeof respuesta.body[campo]).toBe('number');
        }
      }
      expect(Object.keys(conMeta.body.meta).sort()).toEqual(['id', 'montoMeta', 'tipoMeta', 'valorObjetivo']);
      expect(conMeta.body.meta.id).toMatch(/^[0-9a-f]{24}$/);
      expect(typeof conMeta.body.meta.montoMeta).toBe('number');
      expect(typeof conMeta.body.meta.valorObjetivo).toBe('number');
      expect(typeof conMeta.body.porcentajeAvance).toBe('number');
      expect(sinMeta.body.meta).toBeNull();
      expect(JSON.stringify(conMeta.body)).not.toMatch(/usuarioId|_id|__v/);
    });
  });
});
