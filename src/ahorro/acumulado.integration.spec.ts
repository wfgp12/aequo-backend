import { JwtService } from '@nestjs/jwt';
import {
  cerca,
  OTRO_USUARIO_ID,
  SECRETO_JWT,
  USUARIO_ID,
  usarEntornoProgreso,
} from '../../test/ahorro/arnes-progreso.js';

const ERROR_401 = { statusCode: 401, message: 'Sesión inválida o vencida', error: 'Unauthorized' };

/**
 * Ahorro real acumulado mes a mes (RF-23): GET /ahorro/acumulado. Según la decisión P1, suma el `ahorroReal` guardado en
 * cada meta mensual. Integración con el guard de sesión real y MongoDB simulado.
 */
describe('GET /ahorro/acumulado: ahorro real acumulado mes a mes (RF-23, integración)', () => {
  const entorno = usarEntornoProgreso();

  /** Las metas de CA-RF23-01: 250.000, −80.000, 0 (sin indicarlo) y 150.000. */
  const sembrarCuatroMeses = async () => {
    const ids = {
      agosto: await entorno.sembrarMeta({ periodo: '2026-08', ahorroReal: 250_000 }),
      septiembre: await entorno.sembrarMeta({ periodo: '2026-09', ahorroReal: -80_000 }),
      octubre: await entorno.sembrarMeta({ periodo: '2026-10' }),
      noviembre: await entorno.sembrarMeta({ periodo: '2026-11', ahorroReal: 150_000 }),
    };
    return ids;
  };

  const acumulado = async (consulta = '') => {
    const respuesta = await entorno.acumulado(consulta);
    expect(respuesta.status).toBe(200);
    return respuesta.body as { total: number; meses: Array<{ periodo: string; ahorroReal: number; acumulado: number }> };
  };

  /** Resume la serie como `[periodo, ahorroReal, acumulado]` para compararla de una vez. */
  const serie = (body: Awaited<ReturnType<typeof acumulado>>) =>
    body.meses.map(({ periodo, ahorroReal, acumulado: suma }) => [periodo, ahorroReal, suma]);

  it('CA-RF23-01 acumulado de varios meses, mes a mes', async () => {
    await sembrarCuatroMeses();

    const body = await acumulado();

    cerca(body.total, 320_000);
    expect(body.meses).toHaveLength(4);
    expect(serie(body)).toEqual([
      ['2026-08', 250_000, 250_000],
      ['2026-09', -80_000, 170_000],
      ['2026-10', 0, 170_000],
      ['2026-11', 150_000, 320_000],
    ]);
  });

  it('CA-RF23-02 sin metas, el acumulado es cero', async () => {
    const body = await acumulado();

    expect(body).toEqual({ total: 0, meses: [] });
  });

  it('CA-RF23-03 cortar con hasta, extremo incluido', async () => {
    await sembrarCuatroMeses();

    const hastaSeptiembre = await acumulado('hasta=2026-09');
    cerca(hastaSeptiembre.total, 170_000);
    expect(hastaSeptiembre.meses.map((mes) => mes.periodo)).toEqual(['2026-08', '2026-09']);

    const hastaNoviembre = await acumulado('hasta=2026-11');
    cerca(hastaNoviembre.total, 320_000);
    expect(hastaNoviembre.meses).toHaveLength(4);

    expect(await acumulado('hasta=2026-07')).toEqual({ total: 0, meses: [] });
  });

  it('CA-RF23-04 el ahorro negativo resta', async () => {
    await entorno.sembrarMeta({ periodo: '2026-09', ahorroReal: -80_000 });
    await entorno.sembrarMeta({ periodo: '2026-10', ahorroReal: -20_000 });

    const body = await acumulado();

    cerca(body.total, -100_000);
    expect(body.meses.map((mes) => mes.acumulado)).toEqual([-80_000, -100_000]);
  });

  it('CA-RF23-05 los meses sin meta no aparecen y no aportan', async () => {
    await entorno.sembrarMeta({ periodo: '2026-08', ahorroReal: 100_000 });
    await entorno.sembrarMeta({ periodo: '2026-10', ahorroReal: 50_000 });

    const body = await acumulado();

    expect(body.meses.map((mes) => mes.periodo)).toEqual(['2026-08', '2026-10']);
    expect(body.meses.map((mes) => mes.acumulado)).toEqual([100_000, 150_000]);
  });

  it('CA-RF23-06 el orden no depende de cuándo se crearon las metas', async () => {
    await entorno.sembrarMeta({ periodo: '2026-11', ahorroReal: 30_000 });
    await entorno.sembrarMeta({ periodo: '2026-08', ahorroReal: 10_000 });
    await entorno.sembrarMeta({ periodo: '2026-10', ahorroReal: 20_000 });

    const body = await acumulado();

    expect(serie(body)).toEqual([
      ['2026-08', 10_000, 10_000],
      ['2026-10', 20_000, 30_000],
      ['2026-11', 30_000, 60_000],
    ]);
  });

  it('CA-RF23-07 sin redondeo (RNF-11)', async () => {
    await entorno.sembrarMeta({ periodo: '2026-09', ahorroReal: 100_000.5 });
    await entorno.sembrarMeta({ periodo: '2026-10', ahorroReal: 50_000.25 });

    const body = await acumulado();

    cerca(body.total, 150_000.75, 2);
    cerca(body.meses[0].acumulado, 100_000.5, 2);
    cerca(body.meses[1].acumulado, 150_000.75, 2);
  });

  it('CA-RF23-08 solo cuentan las metas del usuario', async () => {
    await sembrarCuatroMeses();
    await entorno.sembrarMeta({ periodo: '2026-10', ahorroReal: 9_000_000 }, OTRO_USUARIO_ID);

    const deA = await acumulado();
    cerca(deA.total, 320_000);
    expect(deA.meses.find((mes) => mes.periodo === '2026-10')?.ahorroReal).toBe(0);

    const deB = await entorno.acumulado('', { token: entorno.tokenOtro });
    expect(deB.status).toBe(200);
    cerca(deB.body.total, 9_000_000);
    expect(deB.body.meses).toHaveLength(1);
  });

  it('CA-RF23-09 el acumulado refleja las ediciones de las metas', async () => {
    const ids = await sembrarCuatroMeses();

    const edicion = await entorno.editarMeta(ids.septiembre, { ahorroReal: 20_000 });
    expect(edicion.status).toBe(200);
    const borrado = await entorno.eliminarMeta(ids.octubre);
    expect(borrado.status).toBe(204);

    const body = await acumulado();

    cerca(body.total, 420_000);
    expect(serie(body)).toEqual([
      ['2026-08', 250_000, 250_000],
      ['2026-09', 20_000, 270_000],
      ['2026-11', 150_000, 420_000],
    ]);
  });

  it('CA-RF23-10 el acumulado no se recalcula desde las transacciones', async () => {
    entorno.sembrarMesBase();
    const id = await entorno.sembrarMeta({ periodo: '2026-11', ahorroReal: 0 });

    const body = await acumulado();

    cerca(body.total, 0);
    expect(entorno.metaGuardada(id)?.ahorroReal).toBe(0);
  });

  it.each([
    ['hasta con mes 13', 'hasta=2026-13'],
    ['hasta con texto', 'hasta=noviembre'],
    ['hasta con día', 'hasta=2026-11-30'],
    ['un parámetro desconocido', 'desde=2026-01'],
  ])('CA-RF23-11 parámetros inválidos: %s responde 400', async (_caso, consulta) => {
    await sembrarCuatroMeses();

    const respuesta = await entorno.acumulado(consulta);

    expect(respuesta.status).toBe(400);
    expect(Array.isArray(respuesta.body.message)).toBe(true);
  });

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

  it.each(sesiones)('CA-RF23-12 responde 401 %s y no devuelve datos', async (_caso, obtenerToken) => {
    await sembrarCuatroMeses();

    const respuesta = await entorno.acumulado('', { token: obtenerToken() });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body).toEqual(ERROR_401);
  });

  it('CA-RF23-13 la respuesta tiene exactamente los campos del contrato', async () => {
    await sembrarCuatroMeses();

    const respuesta = await entorno.acumulado();

    expect(respuesta.status).toBe(200);
    expect(Object.keys(respuesta.body).sort()).toEqual(['meses', 'total']);
    expect(typeof respuesta.body.total).toBe('number');
    for (const mes of respuesta.body.meses) {
      expect(Object.keys(mes).sort()).toEqual(['acumulado', 'ahorroReal', 'periodo']);
      expect(mes.periodo).toMatch(/^\d{4}-\d{2}$/);
      expect(typeof mes.ahorroReal).toBe('number');
      expect(typeof mes.acumulado).toBe('number');
    }
  });
});
