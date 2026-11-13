import mongoose from 'mongoose';
import {
  MENSAJES,
  OTRO_USUARIO_ID,
  mensajeDeCampo,
  tarjetaEsperada,
  usarEntorno,
} from '../../test/tarjetas/arnes-tarjetas.js';

const idAjeno = () => new mongoose.Types.ObjectId().toString();

describe('PATCH /tarjetas/:id con tasaEA: actualizar la tasa (integración)', () => {
  const entorno = usarEntorno();

  it('CA-RF25-01 cambiar la tasa devuelve la tarjeta completa con la tasa nueva y el resto igual', async () => {
    const id = await entorno.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921, cuotaUnicaSinInteres: true });
    const antes = (await entorno.obtenerTarjeta(id)).body;

    const { status, body } = await entorno.editarTarjeta(id, { tasaEA: 0.315 });

    expect(status).toBe(200);
    expect(body).toEqual(
      tarjetaEsperada({
        id,
        nombre: 'Visa',
        tasaEA: 0.315,
        cuotaUnicaSinInteres: true,
        creadaEn: antes.creadaEn,
      }),
    );
    expect(new Date(body.actualizadaEn).getTime()).toBeGreaterThanOrEqual(new Date(antes.actualizadaEn).getTime());
    expect(entorno.tarjetas.docs).toHaveLength(1);
    expect(entorno.tarjetaGuardada(id)).toMatchObject({ nombre: 'Visa', tasaEA: 0.315, cuotaUnicaSinInteres: true });
  });

  it('CA-RF25-02 la tasa se guarda sin redondear y acepta los extremos 0 y 1', async () => {
    const id = await entorno.sembrarTarjeta();

    for (const tasaEA of [0.29213, 0, 1]) {
      const { status, body } = await entorno.editarTarjeta(id, { tasaEA });
      expect(status, String(tasaEA)).toBe(200);
      expect(body.tasaEA, String(tasaEA)).toBe(tasaEA);
      expect(entorno.tarjetaGuardada(id)?.tasaEA).toBe(tasaEA);
    }
  });

  it.each([
    ['negativa', -0.01],
    ['mayor que 100 % E.A.', 1.0001],
    ['un porcentaje en lugar de una fracción', 29.21],
    ['un texto numérico', '0.2921'],
    ['un texto', 'alta'],
    ['null', null],
  ])('CA-RF25-03 una tasa %s responde 400 y la tarjeta conserva la tasa 0,2921', async (_caso, tasaEA) => {
    const id = await entorno.sembrarTarjeta({ tasaEA: 0.2921 });

    const { status, body } = await entorno.editarTarjeta(id, { tasaEA });

    expect(status).toBe(400);
    expect(mensajeDeCampo(body, 'tasaEA')).toBe(true);
    expect(entorno.tarjetaGuardada(id)?.tasaEA).toBe(0.2921);
  });

  it('CA-RF25-04 cambiar la tasa modifica solo esa tarjeta: cargos, pagos, otras tarjetas y tarjetas ajenas quedan intactos', async () => {
    const visa = await entorno.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });
    const mastercard = await entorno.sembrarTarjeta({ nombre: 'Mastercard', tasaEA: 0.3 });
    const deB = await entorno.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.25 }, OTRO_USUARIO_ID);
    await entorno.sembrarCargo(visa, { descripcion: 'Netflix', valor: 38900 });
    await entorno.sembrarCargo(visa, { descripcion: 'Seguro', valor: 12000, activo: false });
    await entorno.sembrarCargo(mastercard, { descripcion: 'Spotify', valor: 19900 });
    entorno.sembrarPago(visa);
    const foto = () =>
      JSON.stringify({
        cargos: entorno.cargos.docs,
        pagos: entorno.transacciones.docs,
        mastercard: entorno.tarjetaGuardada(mastercard),
        deB: entorno.tarjetaGuardada(deB),
      });
    const antes = foto();
    const { createdAt, nombre, cuotaUnicaSinInteres } = entorno.tarjetaGuardada(visa) ?? {};

    const { status } = await entorno.editarTarjeta(visa, { tasaEA: 0.4 });

    expect(status).toBe(200);
    expect(foto()).toBe(antes);
    expect(entorno.tarjetaGuardada(visa)).toMatchObject({ tasaEA: 0.4, createdAt, nombre, cuotaUnicaSinInteres });
  });

  it('CA-RF25-05 repetir el mismo cambio es inofensivo', async () => {
    const id = await entorno.sembrarTarjeta({ tasaEA: 0.2921 });

    const primera = await entorno.editarTarjeta(id, { tasaEA: 0.315 });
    const segunda = await entorno.editarTarjeta(id, { tasaEA: 0.315 });

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(segunda.body).toEqual({ ...primera.body, actualizadaEn: expect.any(String) });
    expect(entorno.tarjetas.docs).toHaveLength(1);
  });

  it('CA-RF25-06 cambiar la tasa de una tarjeta ajena o inexistente responde 404 y la de B no cambia', async () => {
    const deB = await entorno.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.25 }, OTRO_USUARIO_ID);

    const ajena = await entorno.editarTarjeta(deB, { tasaEA: 0.3 });
    const inexistente = await entorno.editarTarjeta(idAjeno(), { tasaEA: 0.3 });

    for (const respuesta of [ajena, inexistente]) {
      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toEqual({ statusCode: 404, message: MENSAJES.tarjetaNoEncontrada, error: 'Not Found' });
    }
    expect(entorno.tarjetaGuardada(deB)?.tasaEA).toBe(0.25);
  });
});
