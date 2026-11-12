import mongoose from 'mongoose';
import { MENSAJES, OTRO_USUARIO_ID, usarEntorno } from '../../test/tarjetas/arnes-tarjetas.js';

const idAjeno = () => new mongoose.Types.ObjectId().toString();
const NO_TARJETA = { statusCode: 404, message: MENSAJES.tarjetaNoEncontrada, error: 'Not Found' };
const CON_PAGOS = { statusCode: 409, message: MENSAJES.conPagos, error: 'Conflict' };

describe('DELETE /tarjetas/:id: eliminar una tarjeta (integración: guard de sesión real y MongoDB simulado)', () => {
  const entorno = usarEntorno();

  it('CA-RF33-16 eliminar una tarjeta sin cargos ni pagos responde 204 y deja de existir', async () => {
    const id = await entorno.sembrarTarjeta({ nombre: 'Visa' });

    const respuesta = await entorno.eliminarTarjeta(id);

    expect(respuesta.status).toBe(204);
    expect(respuesta.text).toBe('');
    expect(entorno.tarjetaGuardada(id)).toBeUndefined();
    expect((await entorno.listarTarjetas()).body).toEqual({ items: [] });
    expect((await entorno.obtenerTarjeta(id)).status).toBe(404);
  });

  it('CA-RF33-17 eliminar de nuevo responde 404', async () => {
    const id = await entorno.sembrarTarjeta();
    await entorno.eliminarTarjeta(id);

    const { status, body } = await entorno.eliminarTarjeta(id);

    expect(status).toBe(404);
    expect(body).toEqual(NO_TARJETA);
  });

  it('CA-RF33-18 al eliminar una tarjeta se borran sus cargos fijos y no los de otras tarjetas ni de otros usuarios', async () => {
    const visa = await entorno.sembrarTarjeta({ nombre: 'Visa' });
    const mastercard = await entorno.sembrarTarjeta({ nombre: 'Mastercard' });
    const deB = await entorno.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
    await entorno.sembrarCargo(visa, { descripcion: 'Netflix', activo: true });
    await entorno.sembrarCargo(visa, { descripcion: 'Spotify', activo: true });
    await entorno.sembrarCargo(visa, { descripcion: 'Seguro', activo: false });
    const deMastercard = await entorno.sembrarCargo(mastercard, { descripcion: 'Gimnasio' });
    const cargoDeB = await entorno.sembrarCargo(deB, { descripcion: 'Netflix' }, OTRO_USUARIO_ID);

    const { status } = await entorno.eliminarTarjeta(visa);

    expect(status).toBe(204);
    expect(entorno.cargos.docs.filter((cargo) => String(cargo.tarjetaId) === visa)).toHaveLength(0);
    expect(entorno.cargos.docs.map((cargo) => String(cargo._id)).sort()).toEqual([deMastercard, cargoDeB].sort());
    expect(entorno.tarjetaGuardada(mastercard)).toBeDefined();
    expect(entorno.tarjetaGuardada(deB)).toBeDefined();
  });

  it('CA-RF33-19 no se elimina una tarjeta con pagos registrados: 409 y no se borra nada', async () => {
    const id = await entorno.sembrarTarjeta({ nombre: 'Visa' });
    const cargo = await entorno.sembrarCargo(id);
    const pago = entorno.sembrarPago(id);

    const { status, body } = await entorno.eliminarTarjeta(id);

    expect(status).toBe(409);
    expect(body).toEqual(CON_PAGOS);
    expect(entorno.tarjetaGuardada(id)).toBeDefined();
    expect(entorno.cargoGuardado(cargo)).toBeDefined();
    expect(entorno.transacciones.docs.map((doc) => String(doc._id))).toEqual([pago]);
  });

  it('CA-RF33-20 los pagos de otra tarjeta no bloquean la eliminación', async () => {
    const visa = await entorno.sembrarTarjeta({ nombre: 'Visa' });
    const mastercard = await entorno.sembrarTarjeta({ nombre: 'Mastercard' });
    entorno.sembrarPago(mastercard);

    const { status } = await entorno.eliminarTarjeta(visa);

    expect(status).toBe(204);
    expect(entorno.tarjetaGuardada(mastercard)).toBeDefined();
    expect(entorno.transacciones.docs).toHaveLength(1);
  });

  it('CA-RF33-21 sin los pagos, la tarjeta que daba 409 se puede eliminar', async () => {
    const id = await entorno.sembrarTarjeta({ nombre: 'Visa' });
    const pago = entorno.sembrarPago(id);
    expect((await entorno.eliminarTarjeta(id)).status).toBe(409);

    await entorno.transacciones.deleteOne({ _id: pago });
    const { status } = await entorno.eliminarTarjeta(id);

    expect(status).toBe(204);
    expect(entorno.tarjetaGuardada(id)).toBeUndefined();
  });

  it('CA-RF33-22 eliminar la tarjeta de otro usuario o inexistente responde 404, nunca 409, y la de B sigue existiendo', async () => {
    const deB = await entorno.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
    const cargoDeB = await entorno.sembrarCargo(deB, { descripcion: 'Netflix' }, OTRO_USUARIO_ID);
    entorno.sembrarPago(deB, OTRO_USUARIO_ID);

    const ajena = await entorno.eliminarTarjeta(deB);
    const inexistente = await entorno.eliminarTarjeta(idAjeno());

    for (const respuesta of [ajena, inexistente]) {
      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toEqual(NO_TARJETA);
    }
    expect(entorno.tarjetaGuardada(deB)).toBeDefined();
    expect(entorno.cargoGuardado(cargoDeB)).toBeDefined();
  });

  it('CA-RF33-23 tras eliminar una tarjeta se puede crear otra con su nombre', async () => {
    const id = await entorno.sembrarTarjeta({ nombre: 'Visa' });
    await entorno.eliminarTarjeta(id);

    const { status } = await entorno.crearTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });

    expect(status).toBe(201);
  });
});
