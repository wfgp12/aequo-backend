import { randomUUID } from 'node:crypto';
import {
  type EntornoCompras,
  CUOTA_REFERENCIA,
  cerca,
  consultaCuota,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';

/** Todo lo guardado en cada colección, con marcas de tiempo, para comprobar que nada cambió ni siquiera `actualizadaEn`. */
const fotografia = (e: EntornoCompras) =>
  JSON.stringify({
    tarjetas: e.tarjetas.docs,
    cargos: e.cargos.docs,
    compras: e.compras.docs,
    transacciones: e.transacciones.docs,
    categorias: e.categorias.docs,
    claves: e.claves.docs,
  });

// Paquete 5.2.6 (RF-27): la vista previa no es una compra ni una transacción: no guarda nada y se puede repetir.
describe('GET /tarjetas/:tarjetaId/cuota: sin efectos secundarios (integración)', () => {
  const e = usarEntornoCompras();

  it('CA-RF27-49 no guarda nada: las colecciones quedan idénticas', async () => {
    const visa = await e.sembrarTarjeta({ tasaEA: 0.2921 });
    await e.sembrarCargo(visa);
    await e.crearCompra(visa, e.compraBase(), { clave: randomUUID() });
    await e.crearAvance(visa, e.avanceBase(), { clave: randomUUID() });
    expect(e.compras.docs).toHaveLength(2);
    expect(e.transacciones.docs).toHaveLength(1);
    expect(e.claves.docs.length).toBeGreaterThan(0);
    const antes = fotografia(e);

    for (const consulta of [
      consultaCuota(),
      consultaCuota({ valor: 80000, cuotas: 1 }),
      consultaCuota({ valor: '100.5', cuotas: 60, primerPago: '2030-01-31' }),
    ]) {
      const { status } = await e.vistaPreviaCuota(visa, consulta);
      expect(status, consulta).toBe(200);
    }

    expect(fotografia(e)).toBe(antes);
  });

  it('CA-RF27-50 no exige Idempotency-Key ni X-Zona-Horaria y los ignora', async () => {
    const visa = await e.sembrarTarjeta({ tasaEA: 0.2921 });
    const consulta = consultaCuota();
    const sinHeaders = await e.vistaPreviaCuota(visa, consulta);
    const conClave = await e.vistaPreviaCuota(visa, consulta, {
      clave: randomUUID(),
    });
    const conZonaInvalida = await e.vistaPreviaCuota(visa, consulta, {
      zona: 'Zona/Invalida',
    });
    // Con la clave obligatoria (el servidor la exige a los POST que crean datos) este GET sigue sin pedirla.
    vi.stubEnv('IDEMPOTENCIA_OBLIGATORIA', 'true');
    const obligatoria = await e.vistaPreviaCuota(visa, consulta);

    expect(sinHeaders.status).toBe(200);
    cerca(sinHeaders.body.cuota, CUOTA_REFERENCIA, 6);
    for (const respuesta of [obligatoria, conClave, conZonaInvalida]) {
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual(sinHeaders.body);
    }
    for (const respuesta of [
      sinHeaders,
      obligatoria,
      conClave,
      conZonaInvalida,
    ]) {
      expect(respuesta.headers['idempotent-replayed']).toBeUndefined();
    }
    expect(e.claves.docs).toHaveLength(0);
  });

  it('CA-RF27-51 repetir la consulta da la misma respuesta y no cambia nada', async () => {
    const visa = await e.sembrarTarjeta({ tasaEA: 0.2921 });
    await e.crearCompra(visa, e.compraBase());
    const antes = fotografia(e);

    const primera = await e.vistaPreviaCuota(visa, consultaCuota());
    const segunda = await e.vistaPreviaCuota(visa, consultaCuota());

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(segunda.body).toEqual(primera.body);
    expect(fotografia(e)).toBe(antes);
  });

  it('CA-RF27-52 responde aunque la base rechace toda escritura', async () => {
    const visa = await e.sembrarTarjeta({ tasaEA: 0.2921 });
    for (const coleccion of [
      e.tarjetas,
      e.cargos,
      e.compras,
      e.transacciones,
      e.categorias,
    ]) {
      coleccion.fallaEscritura = true;
    }
    const rechazar = async () => {
      throw new Error('Fallo simulado de la base de datos');
    };
    e.claves.create = rechazar as never;
    e.claves.updateOne = rechazar as never;
    e.claves.deleteOne = rechazar as never;

    const { status, body } = await e.vistaPreviaCuota(visa, consultaCuota());

    expect(status).toBe(200);
    cerca(body.cuota, 119802.13, 2);
    expect(body.mesUltimoPago).toBe('2027-11');
  });
});
