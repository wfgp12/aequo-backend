import {
  MENSAJES,
  OTRO_USUARIO_ID,
  USUARIO_ID,
  cerca,
  error409,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';
import {
  fotografiaDe,
  pagosGuardados,
  sembrarEscenarioConAvanceReal,
} from '../../test/tarjetas/escenario-pagos.js';

// Paquete 5.3.2 (RF-32): el pago entre las demás transacciones y las demás reglas de la tarjeta y de la cuenta.
describe('Pagos de tarjeta: transacciones, eliminar la tarjeta y la cuenta (integración)', () => {
  const e = usarEntornoCompras();

  it('CA-RF32-44 el pago aparece en GET /transacciones y solo se gestiona desde la tarjeta', async () => {
    const visa = await e.sembrarTarjeta();
    const pago = await e.crearPago(visa, e.pagoBase());
    expect(pago.status).toBe(201);

    const listado = await e.listarTransacciones();
    const editado = await e.editarTransaccion(pago.body.id, { monto: 1 });
    const eliminado = await e.eliminarTransaccion(pago.body.id);

    expect(listado.status).toBe(200);
    const item = listado.body.items.find(
      (t: { id: string }) => t.id === pago.body.id,
    );
    expect(item).toBeDefined();
    expect(item.tipo).toBe('EGRESO');
    expect(item.monto).toBe(300000);
    expect(item.fecha).toBe('2026-12-05');
    expect(item.clasificacionFlujo).toBe('PAGO_TARJETA');
    expect(item.metodoPago).toBe('TRANSFERENCIA');
    expect(item.categoriaId).toBeNull();
    expect(item.categoria).toBeNull();
    expect(editado.status).toBe(409);
    expect(eliminado.status).toBe(409);
    expect(pagosGuardados(e)).toHaveLength(1);
    expect(pagosGuardados(e)[0].monto).toBe(300000);
  });

  it('CA-RF32-45 una tarjeta con pagos no se elimina hasta eliminarlos desde la tarjeta', async () => {
    const debito = await e.sembrarTarjeta({ nombre: 'Débito' });
    const pago = await e.crearPago(debito, e.pagoBase());
    expect(pago.status).toBe(201);

    const bloqueada = await e.eliminarTarjeta(debito);

    expect(bloqueada.status).toBe(409);
    expect(bloqueada.body).toEqual(error409(MENSAJES.conPagos));
    expect(e.tarjetas.docs).toHaveLength(1);
    expect(pagosGuardados(e)).toHaveLength(1);

    expect((await e.eliminarPago(debito, pago.body.id)).status).toBe(204);
    const eliminada = await e.eliminarTarjeta(debito);

    expect(eliminada.status).toBe(204);
    expect(e.tarjetas.docs).toHaveLength(0);
  });

  it('CA-RF32-45 con un pago y una compra, el mensaje de las compras tiene prioridad', async () => {
    const visa = await e.sembrarTarjeta();
    await e.sembrarCompra(visa);
    const pago = await e.crearPago(visa, e.pagoBase());
    expect(pago.status).toBe(201);

    const { status, body } = await e.eliminarTarjeta(visa);

    expect(status).toBe(409);
    expect(body).toEqual(error409(MENSAJES.conCompras));
    expect(e.tarjetas.docs).toHaveLength(1);
    expect(pagosGuardados(e)).toHaveLength(1);
  });

  it('CA-RF32-46 al eliminar la cuenta no queda ningún pago del usuario y los del otro siguen', async () => {
    const visa = await e.sembrarTarjeta();
    const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
    expect((await e.crearPago(visa, e.pagoBase())).status).toBe(201);
    const pagoDeB = await e.crearPago(deB, e.pagoBase(), {
      token: e.tokenOtro,
    });
    expect(pagoDeB.status).toBe(201);

    const respuesta = await e.eliminarCuenta();

    expect(respuesta.status).toBe(204);
    expect(
      e.transacciones.docs.filter(
        (doc) => String(doc.usuarioId) === USUARIO_ID,
      ),
    ).toHaveLength(0);
    expect(e.transacciones.docs.map((doc) => String(doc._id))).toEqual([
      pagoDeB.body.id,
    ]);
    expect(String(e.transacciones.docs[0].usuarioId)).toBe(OTRO_USUARIO_ID);
  });

  it('CA-RF32-47 eliminar compras, avances o cargos no toca los pagos', async () => {
    const { visa, compras, cargos, avanceId } =
      await sembrarEscenarioConAvanceReal(e);
    // Solo quedan A y el cargo «Netflix»: se retiran los otros dos cargos antes de empezar para fijar el estimado.
    await e.eliminarCargo(visa, cargos.seguro);
    await e.eliminarCargo(visa, cargos.gimnasio);
    const pago = await e.crearPago(visa, e.pagoBase());
    expect(pago.status).toBe(201);
    const pagoAntes = fotografiaDe({ docs: pagosGuardados(e) });

    const sinC = await e.eliminarCompra(visa, compras.C);
    const sinAvance = await e.eliminarCompra(visa, avanceId);
    const sinCargo = await e.eliminarCargo(visa, cargos.netflix);

    expect([sinC.status, sinAvance.status, sinCargo.status]).toEqual([
      204, 204, 204,
    ]);
    expect(fotografiaDe({ docs: pagosGuardados(e) })).toBe(pagoAntes);
    const lista = await e.listarPagos(visa);
    expect(lista.body.items.map((p: { id: string }) => p.id)).toEqual([
      pago.body.id,
    ]);
    const proyeccion = await e.proyeccion(visa, 'mes=2026-12');
    expect(proyeccion.body.pagado).toBe(300000);
    cerca(proyeccion.body.total, 119802.1331718775, 6);
    cerca(proyeccion.body.diferencia, 180197.86682812, 6);
  });
});
