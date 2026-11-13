import { randomUUID } from 'node:crypto';
import {
  CLAVES_DE_UNA_COMPRA,
  MENSAJES,
  OTRO_USUARIO_ID,
  USUARIO_ID,
  cerca,
  compraEsperada,
  error404,
  mensajeDeCampo,
  mensajeMencionaCampo,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';

// Paquete 5.2.3 (RF-26): registrar compras con tarjeta de crédito. Integración: guard de sesión real y MongoDB simulado.
describe('POST /tarjetas/:tarjetaId/compras: registrar una compra (integración)', () => {
  const e = usarEntornoCompras();

  it('CA-RF26-32 registra la compra de referencia de la hoja del promotor con la forma del contrato', async () => {
    const tarjetaId = await e.sembrarTarjeta({
      nombre: 'Visa',
      tasaEA: 0.2921,
      cuotaUnicaSinInteres: false,
    });

    const { status, body } = await e.crearCompra(tarjetaId, e.compraBase());

    expect(status).toBe(201);
    expect(Object.keys(body).sort()).toEqual(CLAVES_DE_UNA_COMPRA);
    expect(body).toEqual(
      compraEsperada({
        tipo: 'COMPRA',
        tarjetaId,
        categoriaId: e.hogar.id,
        descripcion: 'Televisor',
        valor: 1254700,
        cuotas: 12,
        fecha: '2026-11-10',
        primerPago: '2026-12',
        mesUltimoPago: '2027-11',
        tasaEAAplicada: 0.2921,
        cuotaUnicaSinInteres: false,
      }),
    );
    cerca(body.cuota, 119802.13, 2);
    expect(e.compras.docs).toHaveLength(1);
    const guardada = e.compras.docs[0];
    expect(String(guardada.usuarioId)).toBe(USUARIO_ID);
    expect(String(guardada._id)).toBe(body.id);
    expect(guardada.primerPago.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(guardada.fecha.toISOString()).toBe('2026-11-10T00:00:00.000Z');
    // La cuota y el mes del último pago se calculan al responder: no se guardan (RNF-11).
    expect(guardada).not.toHaveProperty('cuota');
    expect(guardada).not.toHaveProperty('mesUltimoPago');
  });

  it('CA-RF26-33 una compra con tarjeta no es una transacción', async () => {
    const tarjetaId = await e.sembrarTarjeta();

    const { status } = await e.crearCompra(tarjetaId, e.compraBase());

    expect(status).toBe(201);
    expect(e.transacciones.docs).toHaveLength(0);
  });

  it('CA-RF26-34 la compra copia la tasa y la bandera de la tarjeta', async () => {
    const tarjetaId = await e.sembrarTarjeta({
      tasaEA: 0.31,
      cuotaUnicaSinInteres: true,
    });

    const { status, body } = await e.crearCompra(tarjetaId, e.compraBase());

    expect(status).toBe(201);
    expect(body.tasaEAAplicada).toBe(0.31);
    expect(body.cuotaUnicaSinInteres).toBe(true);
    expect(e.compras.docs[0].tasaEAAplicada).toBe(0.31);
    expect(e.compras.docs[0].cuotaUnicaSinInteres).toBe(true);
  });

  it('CA-RF26-35 sin fecha, la compra es de hoy en la zona del cliente (UTC sin el header) y una zona inválida da 400', async () => {
    e.hoyEs('2026-11-11T02:00:00.000Z');
    const tarjetaId = await e.sembrarTarjeta();
    const { fecha: _fecha, ...sinFecha } = e.compraBase();

    const sinHeader = await e.crearCompra(tarjetaId, sinFecha);
    const enBogota = await e.crearCompra(tarjetaId, sinFecha, {
      zona: 'America/Bogota',
    });
    const invalida = await e.crearCompra(tarjetaId, sinFecha, {
      zona: 'Zona/Invalida',
    });

    expect(sinHeader.status).toBe(201);
    expect(sinHeader.body.fecha).toBe('2026-11-11');
    expect(enBogota.status).toBe(201);
    expect(enBogota.body.fecha).toBe('2026-11-10');
    expect(invalida.status).toBe(400);
    expect(e.compras.docs.map((doc) => doc.fecha.toISOString())).toEqual([
      '2026-11-11T00:00:00.000Z',
      '2026-11-10T00:00:00.000Z',
    ]);
  });

  it('CA-RF26-36 la fecha admite pasado, futuro y fin de mes y se guarda tal cual a las 00:00 UTC', async () => {
    const tarjetaId = await e.sembrarTarjeta();

    for (const fecha of ['2020-01-31', '2026-02-28', '2030-06-15']) {
      const { status, body } = await e.crearCompra(
        tarjetaId,
        e.compraBase({ fecha }),
      );

      expect(status).toBe(201);
      expect(body.fecha).toBe(fecha);
    }
    expect(e.compras.docs.map((doc) => doc.fecha.toISOString())).toEqual([
      '2020-01-31T00:00:00.000Z',
      '2026-02-28T00:00:00.000Z',
      '2030-06-15T00:00:00.000Z',
    ]);
  });

  it('CA-RF26-37 el mes del primer pago se acepta como YYYY-MM o como fecha y se guarda como el día 1 a las 00:00 UTC', async () => {
    const tarjetaId = await e.sembrarTarjeta();
    const casos: Array<[string, string, string]> = [
      ['2026-12', '2026-12', '2026-12-01T00:00:00.000Z'],
      ['2026-12-15', '2026-12', '2026-12-01T00:00:00.000Z'],
      ['2026-01-31', '2026-01', '2026-01-01T00:00:00.000Z'],
      ['2026-02-28', '2026-02', '2026-02-01T00:00:00.000Z'],
    ];

    for (const [enviado, devuelto] of casos) {
      const { status, body } = await e.crearCompra(
        tarjetaId,
        e.compraBase({ primerPago: enviado }),
      );

      expect(status).toBe(201);
      expect(body.primerPago).toBe(devuelto);
    }
    expect(e.compras.docs.map((doc) => doc.primerPago.toISOString())).toEqual(
      casos.map(([, , guardado]) => guardado),
    );
  });

  it('CA-RF26-38 el primer pago puede caer antes, en o después del mes de la compra', async () => {
    const tarjetaId = await e.sembrarTarjeta();

    for (const primerPago of ['2026-10', '2026-11', '2026-12']) {
      const { status, body } = await e.crearCompra(
        tarjetaId,
        e.compraBase({ fecha: '2026-11-10', primerPago }),
      );

      expect(status).toBe(201);
      expect(body.primerPago).toBe(primerPago);
    }
  });

  it('CA-RF26-39 acepta una cuota y 60 cuotas, con su mes del último pago', async () => {
    const tarjetaId = await e.sembrarTarjeta();

    const una = await e.crearCompra(tarjetaId, e.compraBase({ cuotas: 1 }));
    const sesenta = await e.crearCompra(
      tarjetaId,
      e.compraBase({ cuotas: 60 }),
    );

    expect(una.status).toBe(201);
    expect(una.body.mesUltimoPago).toBe('2026-12');
    expect(sesenta.status).toBe(201);
    expect(sesenta.body.mesUltimoPago).toBe('2031-11');
    for (const { body } of [una, sesenta]) {
      expect(Number.isFinite(body.cuota)).toBe(true);
      expect(body.cuota).toBeGreaterThan(0);
    }
  });

  it('CA-RF26-40 el valor admite decimales y se guarda sin redondear', async () => {
    const tarjetaId = await e.sembrarTarjeta();

    for (const valor of [100.5, 0.01]) {
      const { status, body } = await e.crearCompra(
        tarjetaId,
        e.compraBase({ valor }),
      );

      expect(status).toBe(201);
      expect(body.valor).toBe(valor);
    }
    expect(e.compras.docs.map((doc) => doc.valor)).toEqual([100.5, 0.01]);
  });

  it('CA-RF26-41 la descripción se recorta y admite hasta 200 caracteres', async () => {
    const tarjetaId = await e.sembrarTarjeta();

    const recortada = await e.crearCompra(
      tarjetaId,
      e.compraBase({ descripcion: '  Televisor  ' }),
    );
    const larga = await e.crearCompra(
      tarjetaId,
      e.compraBase({ descripcion: 'x'.repeat(200) }),
    );

    expect(recortada.status).toBe(201);
    expect(recortada.body.descripcion).toBe('Televisor');
    expect(e.compras.docs[0].descripcion).toBe('Televisor');
    expect(larga.status).toBe(201);
    expect(larga.body.descripcion).toBe('x'.repeat(200));
  });

  describe('datos faltantes o inválidos', () => {
    const obligatorios = [
      'descripcion',
      'categoriaId',
      'valor',
      'cuotas',
      'primerPago',
    ];

    it.each(obligatorios)(
      'CA-RF26-42 sin %s responde 400 y no guarda nada',
      async (campo) => {
        const tarjetaId = await e.sembrarTarjeta();
        const cuerpo = e.compraBase();
        delete cuerpo[campo];

        const { status, body } = await e.crearCompra(tarjetaId, cuerpo);

        expect(status).toBe(400);
        expect(mensajeDeCampo(body, campo)).toBe(true);
        expect(e.compras.docs).toHaveLength(0);
      },
    );

    it('CA-RF26-42 con {} responde 400 con un texto por cada campo faltante y no guarda nada', async () => {
      const tarjetaId = await e.sembrarTarjeta();

      const { status, body } = await e.crearCompra(tarjetaId, {});

      expect(status).toBe(400);
      for (const campo of obligatorios)
        expect(mensajeDeCampo(body, campo)).toBe(true);
      expect(e.compras.docs).toHaveLength(0);
    });

    const invalidos: Array<[string, string, unknown]> = [
      ['CA-RF26-43', 'descripcion', ''],
      ['CA-RF26-43', 'descripcion', '   '],
      ['CA-RF26-43', 'descripcion', 'x'.repeat(201)],
      ['CA-RF26-43', 'descripcion', 123],
      ['CA-RF26-43', 'descripcion', true],
      ['CA-RF26-43', 'descripcion', null],
      ['CA-RF26-44', 'valor', 0],
      ['CA-RF26-44', 'valor', -1],
      ['CA-RF26-44', 'valor', '1000'],
      ['CA-RF26-44', 'valor', 'abc'],
      ['CA-RF26-44', 'valor', null],
      ['CA-RF26-45', 'cuotas', 0],
      ['CA-RF26-45', 'cuotas', -1],
      ['CA-RF26-45', 'cuotas', 12.5],
      ['CA-RF26-45', 'cuotas', 61],
      ['CA-RF26-45', 'cuotas', '12'],
      ['CA-RF26-45', 'cuotas', null],
      ['CA-RF26-46', 'primerPago', 'pronto'],
      ['CA-RF26-46', 'primerPago', '2026-13'],
      ['CA-RF26-46', 'primerPago', '2026-02-30'],
      ['CA-RF26-46', 'primerPago', '2026-12-01T00:00:00.000Z'],
      ['CA-RF26-46', 'primerPago', 202612],
      ['CA-RF26-46', 'primerPago', null],
      ['CA-RF26-47', 'fecha', 'ayer'],
      ['CA-RF26-47', 'fecha', '10/11/2026'],
      ['CA-RF26-47', 'fecha', '2026-02-30'],
      ['CA-RF26-47', 'fecha', '2026-11-10T15:00:00.000Z'],
      ['CA-RF26-47', 'fecha', null],
      ['CA-RF26-48', 'categoriaId', 'no-es-un-id'],
      ['CA-RF26-48', 'categoriaId', 5],
    ];

    it.each(invalidos)(
      '%s rechaza %s con el valor %j: 400 y no guarda nada',
      async (_id, campo, valor) => {
        const tarjetaId = await e.sembrarTarjeta();

        const { status, body } = await e.crearCompra(
          tarjetaId,
          e.compraBase({ [campo]: valor }),
        );

        expect(status).toBe(400);
        expect(mensajeDeCampo(body, campo)).toBe(true);
        expect(e.compras.docs).toHaveLength(0);
      },
    );

    const sobrantes: Array<[string, unknown]> = [
      ['usuarioId', OTRO_USUARIO_ID],
      ['id', '665f1c2e9b1d4a0012ab34ee'],
      ['tarjetaId', '665f1c2e9b1d4a0012ab34ee'],
      ['tipo', 'AVANCE'],
      ['tipo', 'COMPRA'],
      ['tasaEAAplicada', 0.5],
      ['cuotaUnicaSinInteres', true],
      ['cuota', 100],
      ['mesUltimoPago', '2027-11'],
      ['createdAt', '2026-11-10T15:00:00.000Z'],
      ['otroCampo', 'x'],
    ];

    it.each(sobrantes)(
      'CA-RF26-49 el campo no declarado %s (%j) responde 400 y no guarda nada',
      async (campo, valor) => {
        const tarjetaId = await e.sembrarTarjeta();

        const { status, body } = await e.crearCompra(tarjetaId, {
          ...e.compraBase(),
          [campo]: valor,
        });

        expect(status).toBe(400);
        expect(mensajeMencionaCampo(body, campo)).toBe(true);
        expect(e.compras.docs).toHaveLength(0);
      },
    );
  });

  it('CA-RF26-50 la tarjeta de la ruta: inexistente o de otro usuario 404, mal formada 400, y no se guarda nada', async () => {
    const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
    const inexistente = '665f1c2e9b1d4a0012ab34ee';

    const ajena = await e.crearCompra(deB, e.compraBase());
    const noExiste = await e.crearCompra(inexistente, e.compraBase());
    const malFormada = await e.crearCompra('no-es-un-id', e.compraBase());

    for (const { status, body } of [ajena, noExiste]) {
      expect(status).toBe(404);
      expect(body).toEqual(error404(MENSAJES.tarjetaNoEncontrada));
    }
    expect(malFormada.status).toBe(400);
    expect(mensajeDeCampo(malFormada.body, 'tarjetaId')).toBe(true);
    expect(e.compras.docs).toHaveLength(0);
  });

  it('CA-RF26-51 una categoría inexistente o de otro usuario da 404 y no guarda nada', async () => {
    const tarjetaId = await e.sembrarTarjeta();
    const deB = await e.sembrarCategoria('Mascotas', 'EGRESO', OTRO_USUARIO_ID);

    const ajena = await e.crearCompra(
      tarjetaId,
      e.compraBase({ categoriaId: deB.id }),
    );
    const noExiste = await e.crearCompra(
      tarjetaId,
      e.compraBase({ categoriaId: '665f1c2e9b1d4a0012ab34ee' }),
    );

    for (const { status, body } of [ajena, noExiste]) {
      expect(status).toBe(404);
      expect(body).toEqual(error404(MENSAJES.categoriaNoEncontrada));
    }
    expect(e.compras.docs).toHaveLength(0);
  });

  it('CA-RF26-52 la categoría puede ser general o propia', async () => {
    const tarjetaId = await e.sembrarTarjeta();
    const propia = await e.sembrarCategoria('Mascotas', 'EGRESO', USUARIO_ID);

    const general = await e.crearCompra(
      tarjetaId,
      e.compraBase({ categoriaId: e.hogar.id }),
    );
    const suya = await e.crearCompra(
      tarjetaId,
      e.compraBase({ categoriaId: propia.id }),
    );

    expect(general.status).toBe(201);
    expect(general.body.categoriaId).toBe(e.hogar.id);
    expect(suya.status).toBe(201);
    expect(suya.body.categoriaId).toBe(propia.id);
  });

  it('CA-RF26-53 una categoría de ingreso no sirve para una compra', async () => {
    const tarjetaId = await e.sembrarTarjeta();

    const { status, body } = await e.crearCompra(
      tarjetaId,
      e.compraBase({ categoriaId: e.salario.id }),
    );

    expect(status).toBe(400);
    expect(mensajeDeCampo(body, 'categoriaId')).toBe(true);
    expect(e.compras.docs).toHaveLength(0);
  });

  it('CA-RF26-54 repetir la petición con la misma clave de idempotencia no duplica la compra', async () => {
    const tarjetaId = await e.sembrarTarjeta();
    const clave = randomUUID();

    const primera = await e.crearCompra(tarjetaId, e.compraBase(), { clave });
    const repetida = await e.crearCompra(tarjetaId, e.compraBase(), { clave });

    expect(primera.status).toBe(201);
    expect(repetida.status).toBe(201);
    expect(repetida.body).toEqual(primera.body);
    expect(repetida.headers['idempotent-replayed']).toBe('true');
    expect(e.compras.docs).toHaveLength(1);
  });

  it('CA-RF26-55 la misma clave con otra petición responde 422 y la compra original no cambia', async () => {
    const tarjetaId = await e.sembrarTarjeta();
    const clave = randomUUID();
    await e.crearCompra(tarjetaId, e.compraBase(), { clave });

    const { status } = await e.crearCompra(
      tarjetaId,
      e.compraBase({ valor: 1000000 }),
      { clave },
    );

    expect(status).toBe(422);
    expect(e.compras.docs).toHaveLength(1);
    expect(e.compras.docs[0].valor).toBe(1254700);
  });

  it('CA-RF26-56 dos compras iguales con claves distintas (o sin clave) son legítimas', async () => {
    const tarjetaId = await e.sembrarTarjeta();
    const primera = await e.crearCompra(tarjetaId, e.compraBase(), {
      clave: randomUUID(),
    });

    const otraClave = await e.crearCompra(tarjetaId, e.compraBase(), {
      clave: randomUUID(),
    });
    const sinClave = await e.crearCompra(tarjetaId, e.compraBase());

    expect(otraClave.status).toBe(201);
    expect(sinClave.status).toBe(201);
    expect(
      new Set([primera.body.id, otraClave.body.id, sinClave.body.id]).size,
    ).toBe(3);
    expect(e.compras.docs).toHaveLength(3);
  });
});
