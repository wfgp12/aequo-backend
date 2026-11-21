import {
  cerca,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';
import {
  CLAVES_NIVEL_SUPERIOR_CON_PAGOS,
  ESTIMADO,
  sembrarEscenarioBase,
  sembrarEscenarioConAvanceReal,
} from '../../test/tarjetas/escenario-pagos.js';

const CLAVES_DE_UN_MES = [
  'cargosFijos',
  'cuotas',
  'mes',
  'saldoPendiente',
  'total',
];

// Paquete 5.3.2 (RF-32): `GET /tarjetas/:tarjetaId/proyeccion` agrega `pagado` y `diferencia` al mes de referencia (D3).
describe('GET /tarjetas/:tarjetaId/proyeccion: lo pagado y la diferencia (integración)', () => {
  const e = usarEntornoCompras();

  it('CA-RF32-29 la proyección muestra lo pagado y la diferencia, y coincide con la del POST', async () => {
    const { visa } = await sembrarEscenarioBase(e);
    const pago = await e.crearPago(visa, e.pagoBase());
    expect(pago.status).toBe(201);

    const { status, body } = await e.proyeccion(visa, 'mes=2026-12');

    expect(status).toBe(200);
    expect(body.pagado).toBe(300000);
    cerca(body.diferencia, -46270.050165, 6);
    cerca(body.pagado, pago.body.comparacion.pagado, 9);
    cerca(body.diferencia, pago.body.comparacion.diferencia, 9);
    cerca(body.total, 346270.050165, 6);
    cerca(body.total, pago.body.comparacion.estimado, 9);
  });

  it('CA-RF32-30 sin pagos, `pagado` es 0 y la diferencia es el total completo', async () => {
    const { visa } = await sembrarEscenarioBase(e);

    const diciembre = await e.proyeccion(visa, 'mes=2026-12');
    const lejano = await e.proyeccion(visa, 'mes=2099-12');

    expect(diciembre.status).toBe(200);
    expect(diciembre.body.pagado).toBe(0);
    cerca(diciembre.body.diferencia, -346270.050165, 6);
    expect(lejano.status).toBe(200);
    expect(lejano.body.pagado).toBe(0);
    cerca(lejano.body.diferencia, -ESTIMADO.dic2099, 6);
    for (const { body } of [diciembre, lejano]) {
      expect(typeof body.pagado).toBe('number');
      expect(typeof body.diferencia).toBe('number');
    }
  });

  it('CA-RF32-31 solo cuentan los pagos del mes consultado', async () => {
    const { visa } = await sembrarEscenarioBase(e);
    const pagos: Array<[number, string]> = [
      [40000, '2026-11-30'],
      [100000, '2026-12-01'],
      [200000, '2026-12-31'],
      [50000, '2027-01-01'],
    ];
    for (const [valor, fecha] of pagos) {
      expect(
        (await e.crearPago(visa, e.pagoBase({ valor, fecha }))).status,
      ).toBe(201);
    }

    const noviembre = await e.proyeccion(visa, 'mes=2026-11');
    const diciembre = await e.proyeccion(visa, 'mes=2026-12');
    const enero = await e.proyeccion(visa, 'mes=2027-01');

    expect(noviembre.body.pagado).toBe(40000);
    cerca(noviembre.body.total, ESTIMADO.nov2026, 6);
    cerca(noviembre.body.diferencia, -15000, 6);
    expect(diciembre.body.pagado).toBe(300000);
    cerca(diciembre.body.diferencia, -46270.050165, 6);
    expect(enero.body.pagado).toBe(50000);
    cerca(enero.body.total, 264543.218234, 6);
    cerca(enero.body.diferencia, -214543.218234, 6);
  });

  it('CA-RF32-32 el dinero recibido de un avance y los pagos de otra tarjeta no cuentan como pagado', async () => {
    const { visa } = await sembrarEscenarioConAvanceReal(e);
    const debito = await e.sembrarTarjeta({ nombre: 'Débito' });
    await e.sembrarPagoCon(debito, { monto: 700000 });
    expect(
      e.transacciones.docs.some(
        (t) => t.clasificacionFlujo === 'DINERO_RECIBIDO',
      ),
    ).toBe(true);

    const { status, body } = await e.proyeccion(visa, 'mes=2026-12');

    expect(status).toBe(200);
    expect(body.pagado).toBe(0);
    cerca(body.diferencia, -346270.050165, 6);
  });

  it('CA-RF32-33 los pagos no cambian el total estimado, el saldo ni las filas de la proyección', async () => {
    const { visa } = await sembrarEscenarioBase(e);
    const antes = await e.proyeccion(visa, 'mes=2026-12');
    expect(antes.status).toBe(200);

    const pago = await e.crearPago(visa, e.pagoBase());
    expect(pago.status).toBe(201);
    const despues = await e.proyeccion(visa, 'mes=2026-12');

    const {
      pagado: _pagado,
      diferencia: _diferencia,
      ...nivelSuperior
    } = despues.body;
    const { pagado: _p, diferencia: _d, ...nivelSuperiorAntes } = antes.body;
    expect(nivelSuperior).toEqual(nivelSuperiorAntes);
    expect(despues.body.proyeccion).toEqual(antes.body.proyeccion);
    cerca(despues.body.saldoPendiente, 1766528.890201, 6);
    for (const fila of despues.body.proyeccion) {
      expect(Object.keys(fila).sort()).toEqual(CLAVES_DE_UN_MES);
    }
  });

  it('CA-RF32-34 la forma del nivel superior de la proyección crece con `pagado` y `diferencia` (y con `detalle`, CA-RF31-18)', async () => {
    const { visa } = await sembrarEscenarioBase(e);

    const { status, body } = await e.proyeccion(visa, 'mes=2026-12');

    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(CLAVES_NIVEL_SUPERIOR_CON_PAGOS);
    expect(typeof body.pagado).toBe('number');
    expect(typeof body.diferencia).toBe('number');
  });
});
