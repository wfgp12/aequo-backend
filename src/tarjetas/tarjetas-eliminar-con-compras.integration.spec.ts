import {
  MENSAJES,
  OTRO_USUARIO_ID,
  error404,
  error409,
  instantanea,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';

// Paquete 5.2.3 (RF-33): una tarjeta con compras o avances no se elimina (extiende D4 de 5.1.2).
describe('DELETE /tarjetas/:id: tarjetas con compras (integración)', () => {
  const e = usarEntornoCompras();

  it('CA-RF33-37 no se elimina una tarjeta con compras: 409 y no se borra nada', async () => {
    const visa = await e.sembrarTarjeta({ nombre: 'Visa' });
    const cargo = await e.sembrarCargo(visa);
    const compra = await e.sembrarCompra(visa);

    const { status, body } = await e.eliminarTarjeta(visa);

    expect(status).toBe(409);
    expect(body).toEqual(error409(MENSAJES.conCompras));
    expect(e.tarjetas.docs.map((doc) => String(doc._id))).toEqual([visa]);
    expect(e.cargos.docs.map((doc) => String(doc._id))).toEqual([cargo]);
    expect(e.compras.docs.map((doc) => String(doc._id))).toEqual([compra]);
  });

  it('CA-RF33-38 una tarjeta con solo un avance también da el 409 de compras, no el de pagos', async () => {
    const visa = await e.sembrarTarjeta({ nombre: 'Visa' });
    const conPagoYCompra = await e.sembrarTarjeta({ nombre: 'Mastercard' });
    const avance = await e.crearAvance(visa, e.avanceBase());
    await e.sembrarPago(conPagoYCompra);
    await e.sembrarCompra(conPagoYCompra);
    const comprasAntes = instantanea(e.compras);
    const transaccionesAntes = instantanea(e.transacciones);

    const soloAvance = await e.eliminarTarjeta(visa);
    const pagoYCompra = await e.eliminarTarjeta(conPagoYCompra);

    expect(avance.status).toBe(201);
    for (const { status, body } of [soloAvance, pagoYCompra]) {
      expect(status).toBe(409);
      expect(body).toEqual(error409(MENSAJES.conCompras));
    }
    expect(e.tarjetas.docs).toHaveLength(2);
    expect(instantanea(e.compras)).toEqual(comprasAntes);
    expect(instantanea(e.transacciones)).toEqual(transaccionesAntes);
  });

  it('CA-RF33-39 las compras de otra tarjeta no bloquean y, sin sus compras, la tarjeta se elimina con sus cargos', async () => {
    const visa = await e.sembrarTarjeta({ nombre: 'Visa' });
    const mastercard = await e.sembrarTarjeta({ nombre: 'Mastercard' });
    await e.sembrarCargo(mastercard);
    const compra = await e.sembrarCompra(mastercard);

    const sinCompras = await e.eliminarTarjeta(visa);
    const bloqueada = await e.eliminarCompra(mastercard, compra);
    const ahoraSi = await e.eliminarTarjeta(mastercard);

    expect(sinCompras.status).toBe(204);
    expect(bloqueada.status).toBe(204);
    expect(ahoraSi.status).toBe(204);
    expect(e.tarjetas.docs).toHaveLength(0);
    expect(e.cargos.docs).toHaveLength(0);
    expect(e.compras.docs).toHaveLength(0);
  });

  it('CA-RF33-40 eliminar la tarjeta ajena con compras da 404, nunca 409', async () => {
    const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
    const compra = await e.sembrarCompra(deB, {}, OTRO_USUARIO_ID);

    const { status, body } = await e.eliminarTarjeta(deB);

    expect(status).toBe(404);
    expect(body).toEqual(error404(MENSAJES.tarjetaNoEncontrada));
    expect(e.tarjetas.docs).toHaveLength(1);
    expect(e.compras.docs.map((doc) => String(doc._id))).toEqual([compra]);
  });
});
