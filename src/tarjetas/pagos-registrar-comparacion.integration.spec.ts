import {
  OTRO_USUARIO_ID,
  USUARIO_ID,
  cerca,
  dia,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';
import {
  CLAVES_DE_LA_COMPARACION,
  CLAVES_DEL_POST,
  CLAVES_PROHIBIDAS_DEL_PAGO,
  ESTIMADO,
  fotografiaDe,
  pagosGuardados,
  sembrarEscenarioBase,
  sembrarEscenarioConAvanceReal,
  sembrarTarjetaCero,
} from '../../test/tarjetas/escenario-pagos.js';

const ID = /^[0-9a-f]{24}$/;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Paquete 5.3.2 (RF-32, CU-18): registrar el pago de una tarjeta y compararlo con el total estimado del mes.
// Integración por HTTP: guard de sesión real, ValidationPipe estricto y MongoDB simulado.
describe('POST /tarjetas/:tarjetaId/pagos: el pago y su comparación con el total estimado (integración)', () => {
  const e = usarEntornoCompras();

  it('CA-RF32-01 registra el pago base y devuelve su comparación con el total estimado del mes', async () => {
    const { visa } = await sembrarEscenarioBase(e);

    const { status, body } = await e.crearPago(visa, e.pagoBase());

    expect(status).toBe(201);
    expect(Object.keys(body).sort()).toEqual(CLAVES_DEL_POST);
    expect(body.id).toMatch(ID);
    expect(body.tarjetaId).toBe(visa);
    expect(body.valor).toBe(300000);
    expect(body.fecha).toBe('2026-12-05');
    expect(body.metodoPago).toBe('TRANSFERENCIA');
    expect(body.descripcion).toBe('Pago de diciembre');
    expect(body.creadaEn).toMatch(FECHA_ISO);
    for (const prohibida of CLAVES_PROHIBIDAS_DEL_PAGO)
      expect(body).not.toHaveProperty(prohibida);
    expect(Object.keys(body.comparacion).sort()).toEqual(
      CLAVES_DE_LA_COMPARACION,
    );
    expect(body.comparacion.mes).toBe('2026-12');
    cerca(body.comparacion.estimado, 346270.050165, 6);
    expect(body.comparacion.pagado).toBe(300000);
    cerca(body.comparacion.diferencia, -46270.050165, 6);
  });

  it('CA-RF32-02 el pago se guarda como una transacción PAGO_TARJETA y no toca nada más', async () => {
    const { visa } = await sembrarEscenarioConAvanceReal(e);
    const antesTransacciones = e.transacciones.docs.map((doc) =>
      JSON.stringify(doc),
    );
    expect(antesTransacciones).toHaveLength(1);
    const antes = fotografiaDe(e.tarjetas, e.compras, e.cargos);

    const { status, body } = await e.crearPago(visa, e.pagoBase());

    expect(status).toBe(201);
    expect(e.transacciones.docs).toHaveLength(2);
    expect(
      e.transacciones.docs.slice(0, 1).map((doc) => JSON.stringify(doc)),
    ).toEqual(antesTransacciones);
    const pagos = pagosGuardados(e);
    expect(pagos).toHaveLength(1);
    const transaccion = pagos[0];
    expect(String(transaccion._id)).toBe(body.id);
    expect(String(transaccion.usuarioId)).toBe(USUARIO_ID);
    expect(transaccion.tipo).toBe('EGRESO');
    expect(transaccion.monto).toBe(300000);
    expect(transaccion.fecha.toISOString()).toBe('2026-12-05T00:00:00.000Z');
    expect(transaccion.metodoPago).toBe('TRANSFERENCIA');
    expect(transaccion.descripcion).toBe('Pago de diciembre');
    expect(transaccion.clasificacionFlujo).toBe('PAGO_TARJETA');
    expect(String(transaccion.tarjetaId)).toBe(visa);
    expect(transaccion.deudaId).toBeNull();
    expect(transaccion.categoriaId).toBeNull();
    expect(fotografiaDe(e.tarjetas, e.compras, e.cargos)).toBe(antes);
  });

  it('CA-RF32-03 pagar exactamente el estimado deja la diferencia en cero', async () => {
    const cero = await sembrarTarjetaCero(e);

    const { status, body } = await e.crearPago(
      cero,
      e.pagoBase({ valor: 10000 }),
    );

    expect(status).toBe(201);
    expect(body.comparacion.estimado).toBe(ESTIMADO.cero);
    expect(body.comparacion.pagado).toBe(10000);
    expect(Math.abs(body.comparacion.diferencia)).toBe(0);
  });

  it('CA-RF32-04 varios pagos del mes se suman: se puede pagar en partes', async () => {
    const { visa } = await sembrarEscenarioBase(e);
    const primero = await e.crearPago(visa, e.pagoBase());
    expect(primero.status).toBe(201);

    const { status, body } = await e.crearPago(
      visa,
      e.pagoBase({ valor: 46270.05, fecha: '2026-12-20' }),
    );

    expect(status).toBe(201);
    cerca(body.comparacion.pagado, 346270.05, 6);
    cerca(body.comparacion.estimado, ESTIMADO.dic2026, 6);
    cerca(body.comparacion.diferencia, -0.00016468551, 6);
    expect(pagosGuardados(e)).toHaveLength(2);
  });

  it('CA-RF32-05 pagar de más es válido y la diferencia es positiva', async () => {
    const { visa } = await sembrarEscenarioBase(e);

    const { status, body } = await e.crearPago(
      visa,
      e.pagoBase({ valor: 400000 }),
    );

    expect(status).toBe(201);
    expect(body.comparacion.pagado).toBe(400000);
    cerca(body.comparacion.diferencia, 53729.949835, 6);
  });

  it('CA-RF32-06 pagar el valor redondeado al peso deja una diferencia mínima, no cero', async () => {
    const { visa } = await sembrarEscenarioBase(e);

    const { status, body } = await e.crearPago(
      visa,
      e.pagoBase({ valor: 346270 }),
    );

    expect(status).toBe(201);
    cerca(body.comparacion.diferencia, -0.05016468551, 6);
    expect(body.comparacion.diferencia).not.toBe(0);
    cerca(body.comparacion.estimado, ESTIMADO.dic2026, 6);
  });

  it('CA-RF32-07 un mes sin estimado: el pago se acepta y la diferencia es el pago completo', async () => {
    const vacia = await e.sembrarTarjeta({ nombre: 'Vacía' });

    const { status, body } = await e.crearPago(
      vacia,
      e.pagoBase({ valor: 50000 }),
    );

    expect(status).toBe(201);
    expect(body.comparacion.estimado).toBe(0);
    expect(body.comparacion.pagado).toBe(50000);
    expect(body.comparacion.diferencia).toBe(50000);
  });

  it('CA-RF32-08 la comparación es la del mes de la fecha del pago, no la del mes actual', async () => {
    e.hoyEs('2026-12-15T12:00:00.000Z');
    const { visa } = await sembrarEscenarioBase(e);
    const diciembre = await e.crearPago(visa, e.pagoBase());
    expect(diciembre.status).toBe(201);

    const { status, body } = await e.crearPago(
      visa,
      e.pagoBase({ valor: 100000, fecha: '2027-06-15' }),
    );

    expect(status).toBe(201);
    expect(body.comparacion.mes).toBe('2027-06');
    cerca(body.comparacion.estimado, 174802.133172, 6);
    expect(body.comparacion.pagado).toBe(100000);
    cerca(body.comparacion.diferencia, -74802.133172, 6);
  });

  it('CA-RF32-09 el mes lo decide el día de la fecha, también en los extremos del mes', async () => {
    const { visa } = await sembrarEscenarioBase(e);
    const casos: Array<[number, string, string, number]> = [
      [1000, '2026-11-30', '2026-11', 1000],
      [2000, '2026-12-01', '2026-12', 2000],
      [3000, '2026-12-31', '2026-12', 5000],
      [4000, '2027-01-01', '2027-01', 4000],
    ];

    for (const [valor, fecha, mes, pagado] of casos) {
      const { status, body } = await e.crearPago(
        visa,
        e.pagoBase({ valor, fecha }),
      );

      expect(status).toBe(201);
      expect(body.fecha).toBe(fecha);
      expect(body.comparacion.mes).toBe(mes);
      expect(body.comparacion.pagado).toBe(pagado);
    }
  });

  it('CA-RF32-10 solo cuentan como pagado los pagos de esa tarjeta, de ese usuario y de ese mes', async () => {
    const { visa } = await sembrarEscenarioBase(e);
    const debito = await e.sembrarTarjeta({ nombre: 'Débito' });
    const visaDeB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
    await e.sembrarPagoCon(debito, { monto: 700000, fecha: dia('2026-12-08') });
    await e.sembrarPagoCon(visa, { monto: 40000, fecha: dia('2026-11-30') });
    await e.sembrarPagoCon(visa, { monto: 50000, fecha: dia('2027-01-01') });
    // El avance de «Visa»: su transacción de dinero recibido lleva el `tarjetaId` pero no es un pago.
    await e.sembrarTransaccion({
      tipo: 'INGRESO',
      monto: 500000,
      fecha: dia('2026-12-10'),
      categoriaId: null,
      metodoPago: 'EFECTIVO',
      clasificacionFlujo: 'DINERO_RECIBIDO',
      tarjetaId: visa,
    });
    await e.sembrarTransaccion({ monto: 20000, fecha: dia('2026-12-12') });
    await e.sembrarTransaccion({
      monto: 30000,
      fecha: dia('2026-12-15'),
      categoriaId: null,
      clasificacionFlujo: 'ABONO_DEUDA',
      deudaId: '665f1c2e9b1d4a0012ab3499',
    });
    await e.sembrarPagoCon(visaDeB, { monto: 90000 }, OTRO_USUARIO_ID);

    const { status, body } = await e.crearPago(visa, e.pagoBase());

    expect(status).toBe(201);
    expect(body.comparacion.pagado).toBe(300000);
    cerca(body.comparacion.diferencia, -46270.050165, 6);
  });
});
