import {
  OTRO_USUARIO_ID,
  USUARIO_ID,
  cerca,
  instantanea,
  mensajeMencionaCampo,
  sinMarcas,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';

// Paquete 5.2.3 (RF-28, RF-33): editar y eliminar avances, la transacción de dinero recibido que los acompaña y el
// enlace entre ambos (`transaccionId`).
describe('Avances en efectivo: enlace con su transacción, edición y eliminación (integración)', () => {
  const e = usarEntornoCompras();

  /** El documento guardado de una compra o avance, por su id. */
  const guardada = (id: string) =>
    e.compras.docs.find((doc) => String(doc._id) === id);

  it('CA-RF28-26 el avance guarda el id de su transacción y la compra no tiene ese campo', async () => {
    const visa = await e.sembrarTarjeta();
    const compra = await e.crearCompra(visa, e.compraBase());
    const avance = await e.crearAvance(visa, e.avanceBase());

    const delAvance = guardada(avance.body.id);
    const deLaCompra = guardada(compra.body.id);

    expect(e.transacciones.docs).toHaveLength(1);
    expect(String(delAvance?.transaccionId)).toBe(
      String(e.transacciones.docs[0]._id),
    );
    expect(e.transacciones.docs[0].clasificacionFlujo).toBe('DINERO_RECIBIDO');
    expect(deLaCompra?.transaccionId).toBeUndefined();
  });

  describe('editar', () => {
    it('CA-RF28-20 editar el avance actualiza su transacción de dinero recibido y no toca la de otro avance', async () => {
      const visa = await e.sembrarTarjeta();
      const primero = await e.crearAvance(visa, e.avanceBase());
      await e.crearAvance(
        visa,
        e.avanceBase({ valor: 300000, fecha: '2026-11-12' }),
      );
      const transaccionDelPrimero = String(
        guardada(primero.body.id)?.transaccionId,
      );
      const otraAntes = e.transacciones.docs
        .filter((doc) => String(doc._id) !== transaccionDelPrimero)
        .map(sinMarcas);

      const { status, body } = await e.editarCompra(visa, primero.body.id, {
        valor: 600000,
        fecha: '2026-11-20',
        descripcion: 'Avance del 20',
      });

      expect(status).toBe(200);
      expect(body).toMatchObject({
        id: primero.body.id,
        tipo: 'AVANCE',
        valor: 600000,
        fecha: '2026-11-20',
        descripcion: 'Avance del 20',
      });
      cerca(body.cuota, 107689.3021, 4);
      expect(e.transacciones.docs).toHaveLength(2);
      const suya = e.transacciones.docs.find(
        (doc) => String(doc._id) === transaccionDelPrimero,
      );
      expect(suya).toMatchObject({
        monto: 600000,
        descripcion: 'Avance del 20',
        clasificacionFlujo: 'DINERO_RECIBIDO',
      });
      expect(suya?.fecha.toISOString()).toBe('2026-11-20T00:00:00.000Z');
      expect(String(suya?.tarjetaId)).toBe(visa);
      const otraDespues = e.transacciones.docs
        .filter((doc) => String(doc._id) !== transaccionDelPrimero)
        .map(sinMarcas);
      expect(otraDespues).toEqual(otraAntes);
    });

    it('CA-RF28-21 editar solo las cuotas o el primer pago no toca la transacción', async () => {
      const visa = await e.sembrarTarjeta();
      const avance = await e.crearAvance(visa, e.avanceBase());
      const antes = instantanea(e.transacciones);

      const { status, body } = await e.editarCompra(visa, avance.body.id, {
        cuotas: 12,
        primerPago: '2027-02',
      });

      expect(status).toBe(200);
      expect(body.cuotas).toBe(12);
      expect(body.primerPago).toBe('2027-02');
      expect(body.mesUltimoPago).toBe('2028-01');
      cerca(body.cuota, 47741.3458, 4);
      expect(instantanea(e.transacciones)).toEqual(antes);
    });

    it('CA-RF28-21 la categoría no se edita en un avance: 400 y nada cambia', async () => {
      const visa = await e.sembrarTarjeta();
      const avance = await e.crearAvance(visa, e.avanceBase());
      const comprasAntes = instantanea(e.compras);
      const transaccionesAntes = instantanea(e.transacciones);

      const { status, body } = await e.editarCompra(visa, avance.body.id, {
        categoriaId: e.hogar.id,
      });

      expect(status).toBe(400);
      expect(mensajeMencionaCampo(body, 'categoriaId')).toBe(true);
      expect(instantanea(e.compras)).toEqual(comprasAntes);
      expect(instantanea(e.transacciones)).toEqual(transaccionesAntes);
    });
  });

  describe('eliminar', () => {
    it('CA-RF28-22 eliminar el avance elimina su transacción, y solo la suya', async () => {
      const visa = await e.sembrarTarjeta();
      // Dos avances idénticos: solo el enlace distingue a cada transacción.
      const primero = await e.crearAvance(visa, e.avanceBase());
      const segundo = await e.crearAvance(visa, e.avanceBase());
      const ordinaria = await e.sembrarTransaccion();
      const pago = await e.sembrarPago(visa);
      const transaccionDelSegundo = String(
        guardada(segundo.body.id)?.transaccionId,
      );

      const respuesta = await e.eliminarCompra(visa, primero.body.id);

      expect(respuesta.status).toBe(204);
      expect(e.compras.docs.map((doc) => String(doc._id))).toEqual([
        segundo.body.id,
      ]);
      expect(e.transacciones.docs.map((doc) => String(doc._id)).sort()).toEqual(
        [transaccionDelSegundo, ordinaria, pago].sort(),
      );

      const ultima = await e.eliminarCompra(visa, segundo.body.id);
      const periodo = await e.periodo('mes=2026-11');

      expect(ultima.status).toBe(204);
      expect(periodo.body.dineroRecibido).toBe(0);
      expect(
        e.transacciones.docs.filter(
          (doc) => doc.clasificacionFlujo === 'DINERO_RECIBIDO',
        ),
      ).toHaveLength(0);
    });
  });

  describe('no queda nada a medias', () => {
    const escenarios: Array<
      [string, 'transacciones' | 'compras', 'editar' | 'eliminar']
    > = [
      ['editar con la transacción fallando', 'transacciones', 'editar'],
      ['editar con la compra fallando', 'compras', 'editar'],
      ['eliminar con la transacción fallando', 'transacciones', 'eliminar'],
      ['eliminar con la compra fallando', 'compras', 'eliminar'],
    ];

    it.each(escenarios)(
      'CA-RF28-23 %s: 500 y el avance y su transacción quedan como estaban',
      async (_nombre, falla, accion) => {
        const visa = await e.sembrarTarjeta();
        const avance = await e.crearAvance(visa, e.avanceBase());
        const comprasAntes = instantanea(e.compras);
        const transaccionesAntes = instantanea(e.transacciones);
        e[falla].fallaEscritura = true;

        const { status } =
          accion === 'editar'
            ? await e.editarCompra(visa, avance.body.id, { valor: 600000 })
            : await e.eliminarCompra(visa, avance.body.id);

        expect(status).toBe(500);
        expect(instantanea(e.compras)).toEqual(comprasAntes);
        expect(instantanea(e.transacciones)).toEqual(transaccionesAntes);
      },
    );
  });

  it('CA-RF28-24 al eliminar la cuenta no queda ninguna compra, avance ni transacción del usuario y las de otro usuario siguen', async () => {
    const visa = await e.sembrarTarjeta({ nombre: 'Visa' });
    const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
    await e.crearCompra(visa, e.compraBase());
    await e.crearAvance(visa, e.avanceBase());
    const opcionesDeB = { token: e.tokenOtro };
    const compraDeB = await e.crearCompra(deB, e.compraBase(), opcionesDeB);
    const avanceDeB = await e.crearAvance(deB, e.avanceBase(), opcionesDeB);

    const respuesta = await e.eliminarCuenta();

    expect(respuesta.status).toBe(204);
    const deUsuarioA = (doc: Record<string, any>) =>
      String(doc.usuarioId) === USUARIO_ID;
    expect(e.compras.docs.filter(deUsuarioA)).toHaveLength(0);
    expect(e.transacciones.docs.filter(deUsuarioA)).toHaveLength(0);
    expect(e.compras.docs.map((doc) => String(doc._id)).sort()).toEqual(
      [compraDeB.body.id, avanceDeB.body.id].sort(),
    );
    expect(e.transacciones.docs).toHaveLength(1);
    expect(String(e.transacciones.docs[0].usuarioId)).toBe(OTRO_USUARIO_ID);
  });
});
