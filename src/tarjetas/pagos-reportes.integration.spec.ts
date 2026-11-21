import {
  cerca,
  dia,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';

// Paquete 5.3.2 (RF-32, ADR-014): el pago registrado desde la tarjeta llega bien a los reportes que ya existen: afecta el
// balance del mes de su fecha y no aparece en el gasto por categoría. Siempre se registra con POST …/pagos.
describe('Pagos de tarjeta: efecto en los reportes (integración)', () => {
  const e = usarEntornoCompras();

  /** Ingreso de $2.000.000 en «Salario» (2026-12-01) y egreso ordinario de $50.000 en «Hogar» (2026-12-10). */
  const sembrarIngresoYEgreso = async () => {
    await e.sembrarTransaccion({
      tipo: 'INGRESO',
      monto: 2000000,
      fecha: dia('2026-12-01'),
      categoriaId: e.salario._id,
    });
    await e.sembrarTransaccion({
      monto: 50000,
      fecha: dia('2026-12-10'),
      categoriaId: e.hogar._id,
    });
  };

  it('CA-RF32-48 el pago afecta el balance del mes del pago', async () => {
    const visa = await e.sembrarTarjeta();
    const pago = await e.crearPago(visa, e.pagoBase());
    expect(pago.status).toBe(201);

    const diciembre = await e.periodo('mes=2026-12');
    const noviembre = await e.periodo('mes=2026-11');
    const enero = await e.periodo('mes=2027-01');

    expect(diciembre.status).toBe(200);
    expect(diciembre.body.pagosTarjeta).toBe(300000);
    expect(diciembre.body.egresos).toBe(0);
    expect(diciembre.body.ingresos).toBe(0);
    expect(diciembre.body.dineroRecibido).toBe(0);
    expect(diciembre.body.balance).toBe(-300000);
    for (const { body } of [noviembre, enero]) {
      expect(body.pagosTarjeta).toBe(0);
      expect(body.egresos).toBe(0);
      expect(body.ingresos).toBe(0);
      expect(body.balance).toBe(0);
    }
  });

  it('CA-RF32-49 el pago se combina con los demás movimientos del mes', async () => {
    const visa = await e.sembrarTarjeta();
    await sembrarIngresoYEgreso();
    const pago = await e.crearPago(visa, e.pagoBase());
    expect(pago.status).toBe(201);

    const { status, body } = await e.periodo('mes=2026-12');

    expect(status).toBe(200);
    expect(body.ingresos).toBe(2000000);
    expect(body.egresos).toBe(50000);
    expect(body.pagosTarjeta).toBe(300000);
    expect(body.balance).toBe(1650000);
  });

  it('CA-RF32-50 el pago no aparece en el gasto por categoría', async () => {
    const visa = await e.sembrarTarjeta();
    const pago = await e.crearPago(visa, e.pagoBase());
    expect(pago.status).toBe(201);

    const soloElPago = await e.categoriasReporte('mes=2026-12');

    expect(soloElPago.status).toBe(200);
    expect(soloElPago.body.total).toBe(0);
    expect(soloElPago.body.categorias).toEqual([]);

    await e.sembrarTransaccion({
      monto: 50000,
      fecha: dia('2026-12-10'),
      categoriaId: e.hogar._id,
    });
    const conElEgreso = await e.categoriasReporte('mes=2026-12');

    expect(conElEgreso.status).toBe(200);
    expect(conElEgreso.body.total).toBe(50000);
    expect(conElEgreso.body.categorias).toHaveLength(1);
    expect(conElEgreso.body.categorias[0]).toMatchObject({
      categoriaId: e.hogar.id,
      nombre: 'Hogar',
      total: 50000,
      porcentaje: 100,
    });
  });

  it('CA-RF32-51 en los reportes el mes del pago es el de su fecha', async () => {
    const visa = await e.sembrarTarjeta();
    expect(
      (
        await e.crearPago(
          visa,
          e.pagoBase({ valor: 1000, fecha: '2026-12-31' }),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await e.crearPago(
          visa,
          e.pagoBase({ valor: 2000, fecha: '2027-01-01' }),
        )
      ).status,
    ).toBe(201);

    const diciembre = await e.periodo('mes=2026-12');
    const enero = await e.periodo('mes=2027-01');

    expect(diciembre.body.pagosTarjeta).toBe(1000);
    expect(diciembre.body.balance).toBe(-1000);
    expect(enero.body.pagosTarjeta).toBe(2000);
    expect(enero.body.balance).toBe(-2000);
  });

  it('CA-RF32-52 la evolución y la comparación del balance incluyen el pago', async () => {
    const visa = await e.sembrarTarjeta();
    expect((await e.crearPago(visa, e.pagoBase())).status).toBe(201);

    const evolucion = await e.evolucion('desde=2026-12&hasta=2026-12');
    const balance = await e.comparacion('tipo=balance');
    const ingresosEgresos = await e.comparacion('tipo=ingresos-egresos');

    expect(evolucion.status).toBe(200);
    expect(evolucion.body.puntos).toEqual([
      { periodo: '2026-12', balance: -300000 },
    ]);
    expect(balance.status).toBe(200);
    expect(balance.body.periodos).toEqual([
      { periodo: '2026-12', balance: -300000 },
    ]);
    expect(ingresosEgresos.status).toBe(200);
    expect(ingresosEgresos.body.periodos).toEqual([
      { periodo: '2026-12', ingresos: 0, egresos: 0 },
    ]);
  });

  it('CA-RF32-53 la compra con tarjeta no mueve el balance; su pago sí', async () => {
    const visa = await e.sembrarTarjeta();
    const compra = await e.crearCompra(visa, e.compraBase());
    expect(compra.status).toBe(201);
    const antes = await e.periodo('mes=2026-11');
    expect(antes.body.balance).toBe(0);
    expect(antes.body.egresos).toBe(0);

    const pago = await e.crearPago(visa, e.pagoBase({ valor: 119802.13 }));
    expect(pago.status).toBe(201);
    const noviembre = await e.periodo('mes=2026-11');
    const diciembre = await e.periodo('mes=2026-12');

    expect(noviembre.body.balance).toBe(0);
    expect(noviembre.body.egresos).toBe(0);
    cerca(diciembre.body.pagosTarjeta, 119802.13, 6);
    cerca(diciembre.body.balance, -119802.13, 6);
  });

  it('CA-RF32-54 eliminar el pago revierte el balance', async () => {
    const visa = await e.sembrarTarjeta();
    await sembrarIngresoYEgreso();
    const pago = await e.crearPago(visa, e.pagoBase());
    expect(pago.status).toBe(201);

    const eliminado = await e.eliminarPago(visa, pago.body.id);
    const { status, body } = await e.periodo('mes=2026-12');

    expect(eliminado.status).toBe(204);
    expect(status).toBe(200);
    expect(body.pagosTarjeta).toBe(0);
    expect(body.balance).toBe(1950000);
  });
});
