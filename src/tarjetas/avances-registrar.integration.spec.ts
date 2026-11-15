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

// Paquete 5.2.3 (RF-28): registrar avances en efectivo. Integración: guard de sesión real y MongoDB simulado.
describe('POST /tarjetas/:tarjetaId/avances: registrar un avance (integración)', () => {
  const e = usarEntornoCompras();

  it('CA-RF28-06 registra un avance con la forma de la compra, de tipo AVANCE y con la categoría de respaldo', async () => {
    const visa = await e.sembrarTarjeta({
      nombre: 'Visa',
      tasaEA: 0.2921,
      cuotaUnicaSinInteres: false,
    });

    const { status, body } = await e.crearAvance(visa, e.avanceBase());

    expect(status).toBe(201);
    expect(Object.keys(body).sort()).toEqual(CLAVES_DE_UNA_COMPRA);
    expect(body).toEqual(
      compraEsperada({
        tipo: 'AVANCE',
        tarjetaId: visa,
        categoriaId: e.otrosEgresos.id,
        descripcion: 'Avance en efectivo',
        valor: 500000,
        cuotas: 6,
        fecha: '2026-11-10',
        primerPago: '2026-12',
        mesUltimoPago: '2027-05',
        tasaEAAplicada: 0.2921,
        cuotaUnicaSinInteres: false,
      }),
    );
    cerca(body.cuota, 89741.0851, 4);
    expect(e.compras.docs).toHaveLength(1);
    expect(e.compras.docs[0].tipo).toBe('AVANCE');
    expect(String(e.compras.docs[0].usuarioId)).toBe(USUARIO_ID);
  });

  it('CA-RF28-07 el avance crea su transacción de dinero recibido', async () => {
    const visa = await e.sembrarTarjeta();

    const { body } = await e.crearAvance(visa, e.avanceBase());

    expect(e.transacciones.docs).toHaveLength(1);
    const transaccion = e.transacciones.docs[0];
    expect(String(transaccion.usuarioId)).toBe(USUARIO_ID);
    expect(transaccion.tipo).toBe('INGRESO');
    expect(transaccion.monto).toBe(500000);
    expect(transaccion.fecha.toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(transaccion.metodoPago).toBe('EFECTIVO');
    expect(transaccion.clasificacionFlujo).toBe('DINERO_RECIBIDO');
    expect(String(transaccion.tarjetaId)).toBe(visa);
    expect(transaccion.deudaId).toBeNull();
    expect(transaccion.categoriaId).toBeNull();
    expect(transaccion.descripcion).toBe(body.descripcion);
  });

  it('CA-RF28-08 un avance aparece como dinero recibido y no como ingreso propio del mes', async () => {
    const visa = await e.sembrarTarjeta();
    await e.crearAvance(visa, e.avanceBase());

    const { status, body } = await e.periodo('mes=2026-11');

    expect(status).toBe(200);
    expect(body.dineroRecibido).toBe(500000);
    expect(body.ingresos).toBe(0);
    expect(body.balance).toBe(0);
  });

  it('CA-RF28-09 la descripción del avance: por defecto, recortada, hasta 200 caracteres; inválida da 400', async () => {
    const visa = await e.sembrarTarjeta();

    const recortada = await e.crearAvance(
      visa,
      e.avanceBase({ descripcion: '  Para el arriendo  ' }),
    );
    const larga = await e.crearAvance(
      visa,
      e.avanceBase({ descripcion: 'x'.repeat(200) }),
    );

    expect(recortada.status).toBe(201);
    expect(recortada.body.descripcion).toBe('Para el arriendo');
    expect(e.transacciones.docs[0].descripcion).toBe('Para el arriendo');
    expect(larga.status).toBe(201);
    expect(larga.body.descripcion).toHaveLength(200);
  });

  it.each([
    ['vacía', ''],
    ['solo espacios', '   '],
    ['de 201 caracteres', 'x'.repeat(201)],
    ['un número', 123],
    ['null', null],
  ])(
    'CA-RF28-09 una descripción %s responde 400 y no guarda compra ni transacción',
    async (_nombre, descripcion) => {
      const visa = await e.sembrarTarjeta();

      const { status, body } = await e.crearAvance(
        visa,
        e.avanceBase({ descripcion }),
      );

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'descripcion')).toBe(true);
      expect(e.compras.docs).toHaveLength(0);
      expect(e.transacciones.docs).toHaveLength(0);
    },
  );

  it('CA-RF28-10 la categoría del avance la pone el servidor: la de respaldo de egresos', async () => {
    const visa = await e.sembrarTarjeta();

    const { status, body } = await e.crearAvance(visa, e.avanceBase());

    expect(status).toBe(201);
    expect(body.categoriaId).toBe(e.otrosEgresos.id);
    expect(String(e.compras.docs[0].categoriaId)).toBe(e.otrosEgresos.id);
  });

  it('CA-RF28-10 enviar categoriaId (propia, general, ajena o de ingreso) responde 400 y no guarda nada', async () => {
    const visa = await e.sembrarTarjeta();
    const propia = await e.sembrarCategoria('Mascotas', 'EGRESO', USUARIO_ID);
    const ajena = await e.sembrarCategoria('Viajes', 'EGRESO', OTRO_USUARIO_ID);

    for (const categoriaId of [propia.id, e.hogar.id, ajena.id, e.salario.id]) {
      const { status, body } = await e.crearAvance(
        visa,
        e.avanceBase({ categoriaId }),
      );

      expect(status).toBe(400);
      expect(mensajeMencionaCampo(body, 'categoriaId')).toBe(true);
    }
    expect(e.compras.docs).toHaveLength(0);
    expect(e.transacciones.docs).toHaveLength(0);
  });

  it('CA-RF28-11 sin fecha, el avance y su transacción son de hoy en la zona del cliente', async () => {
    e.hoyEs('2026-11-11T02:00:00.000Z');
    const visa = await e.sembrarTarjeta();
    const { fecha: _fecha, ...sinFecha } = e.avanceBase();

    const sinHeader = await e.crearAvance(visa, sinFecha);
    const enBogota = await e.crearAvance(visa, sinFecha, {
      zona: 'America/Bogota',
    });

    expect(sinHeader.status).toBe(201);
    expect(sinHeader.body.fecha).toBe('2026-11-11');
    expect(enBogota.status).toBe(201);
    expect(enBogota.body.fecha).toBe('2026-11-10');
    expect(e.transacciones.docs.map((doc) => doc.fecha.toISOString())).toEqual([
      '2026-11-11T00:00:00.000Z',
      '2026-11-10T00:00:00.000Z',
    ]);
  });

  const invalidos: Array<[string, unknown]> = [
    ['valor', undefined],
    ['valor', 0],
    ['cuotas', undefined],
    ['cuotas', 0],
    ['cuotas', 61],
    ['cuotas', 12.5],
    ['primerPago', undefined],
    ['primerPago', 'pronto'],
    ['fecha', 'ayer'],
  ];

  it.each(invalidos)(
    'CA-RF28-12 %s con el valor %j responde 400 y no queda ni el avance ni la transacción',
    async (campo, valor) => {
      const visa = await e.sembrarTarjeta();

      const { status, body } = await e.crearAvance(
        visa,
        e.avanceBase({ [campo]: valor }),
      );

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, campo)).toBe(true);
      expect(e.compras.docs).toHaveLength(0);
      expect(e.transacciones.docs).toHaveLength(0);
    },
  );

  it.each([
    ['tipo', 'COMPRA'],
    ['tarjetaId', '665f1c2e9b1d4a0012ab34ee'],
    ['usuarioId', OTRO_USUARIO_ID],
    ['tasaEAAplicada', 0.5],
    ['cuotaUnicaSinInteres', true],
    ['metodoPago', 'DEBITO'],
    ['clasificacionFlujo', 'ORDINARIO'],
    ['otroCampo', 'x'],
  ])(
    'CA-RF28-13 el campo no declarado %s (%j) responde 400 y no guarda nada',
    async (campo, valor) => {
      const visa = await e.sembrarTarjeta();

      const { status, body } = await e.crearAvance(visa, {
        ...e.avanceBase(),
        [campo]: valor,
      });

      expect(status).toBe(400);
      expect(mensajeMencionaCampo(body, campo)).toBe(true);
      expect(e.compras.docs).toHaveLength(0);
      expect(e.transacciones.docs).toHaveLength(0);
    },
  );

  it('CA-RF28-14 el avance en una tarjeta ajena o inexistente da 404 y no guarda nada', async () => {
    const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);

    const ajena = await e.crearAvance(deB, e.avanceBase());
    const noExiste = await e.crearAvance(
      '665f1c2e9b1d4a0012ab34ee',
      e.avanceBase(),
    );

    for (const { status, body } of [ajena, noExiste]) {
      expect(status).toBe(404);
      expect(body).toEqual(error404(MENSAJES.tarjetaNoEncontrada));
    }
    expect(e.compras.docs).toHaveLength(0);
    expect(e.transacciones.docs).toHaveLength(0);
  });

  it('CA-RF28-15 repetir con la misma clave de idempotencia no duplica el avance ni la transacción', async () => {
    const visa = await e.sembrarTarjeta();
    const clave = randomUUID();

    const primera = await e.crearAvance(visa, e.avanceBase(), { clave });
    const repetida = await e.crearAvance(visa, e.avanceBase(), { clave });
    const otroCuerpo = await e.crearAvance(
      visa,
      e.avanceBase({ valor: 900000 }),
      { clave },
    );

    expect(primera.status).toBe(201);
    expect(repetida.status).toBe(201);
    expect(repetida.body).toEqual(primera.body);
    expect(repetida.headers['idempotent-replayed']).toBe('true');
    expect(otroCuerpo.status).toBe(422);
    expect(e.compras.docs).toHaveLength(1);
    expect(e.transacciones.docs).toHaveLength(1);
    expect(e.compras.docs[0].valor).toBe(500000);
    expect(e.transacciones.docs[0].monto).toBe(500000);
  });

  it('CA-RF28-16 dos avances iguales con claves distintas son legítimos', async () => {
    const visa = await e.sembrarTarjeta();
    await e.crearAvance(visa, e.avanceBase(), { clave: randomUUID() });

    const { status } = await e.crearAvance(visa, e.avanceBase(), {
      clave: randomUUID(),
    });

    expect(status).toBe(201);
    expect(e.compras.docs).toHaveLength(2);
    expect(e.transacciones.docs).toHaveLength(2);
  });

  it('CA-RF28-17 si falla el guardado de la transacción, no queda ninguna compra y la misma clave se puede reintentar', async () => {
    const visa = await e.sembrarTarjeta();
    const clave = randomUUID();
    e.transacciones.fallaEscritura = true;

    const fallida = await e.crearAvance(visa, e.avanceBase(), { clave });

    expect(fallida.status).toBe(500);
    expect(e.compras.docs).toHaveLength(0);
    expect(e.transacciones.docs).toHaveLength(0);

    e.transacciones.fallaEscritura = false;
    const reintento = await e.crearAvance(visa, e.avanceBase(), { clave });

    expect(reintento.status).toBe(201);
    expect(e.compras.docs).toHaveLength(1);
    expect(e.transacciones.docs).toHaveLength(1);
  });

  it('CA-RF28-17 si falla el guardado del avance, no queda ninguna transacción y la misma clave se puede reintentar', async () => {
    const visa = await e.sembrarTarjeta();
    const clave = randomUUID();
    e.compras.fallaEscritura = true;

    const fallida = await e.crearAvance(visa, e.avanceBase(), { clave });

    expect(fallida.status).toBe(500);
    expect(e.compras.docs).toHaveLength(0);
    expect(e.transacciones.docs).toHaveLength(0);

    e.compras.fallaEscritura = false;
    const reintento = await e.crearAvance(visa, e.avanceBase(), { clave });

    expect(reintento.status).toBe(201);
    expect(e.compras.docs).toHaveLength(1);
    expect(e.transacciones.docs).toHaveLength(1);
  });

  it('CA-RF28-18 el avance se gestiona desde la tarjeta: /transacciones lo lista pero no lo edita ni lo elimina', async () => {
    const visa = await e.sembrarTarjeta();
    await e.crearAvance(visa, e.avanceBase());

    const listado = await e.listarTransacciones();
    const idTransaccion = listado.body.items[0].id;
    const editada = await e.editarTransaccion(idTransaccion, { monto: 1234 });
    const eliminada = await e.eliminarTransaccion(idTransaccion);
    const compras = await e.listarCompras(visa);

    expect(listado.status).toBe(200);
    expect(listado.body.items).toHaveLength(1);
    expect(listado.body.items[0].clasificacionFlujo).toBe('DINERO_RECIBIDO');
    expect(editada.status).toBe(409);
    expect(eliminada.status).toBe(409);
    expect(e.transacciones.docs).toHaveLength(1);
    expect(e.transacciones.docs[0].monto).toBe(500000);
    expect(e.compras.docs).toHaveLength(1);
    expect(compras.body.items.map((c: { tipo: string }) => c.tipo)).toEqual([
      'AVANCE',
    ]);
  });

  it('CA-RF28-19 una sola cuota sin interés también aplica al avance', async () => {
    const visa = await e.sembrarTarjeta({
      tasaEA: 0.2921,
      cuotaUnicaSinInteres: true,
    });

    const unaCuota = await e.crearAvance(visa, e.avanceBase({ cuotas: 1 }));
    const dosCuotas = await e.crearAvance(visa, e.avanceBase({ cuotas: 2 }));

    expect(unaCuota.body.cuota).toBe(500000);
    expect(dosCuotas.body.cuota).toBeGreaterThan(250000);
  });
});
