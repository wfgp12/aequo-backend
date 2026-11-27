import {
  CLAVES_DE_UNA_DEUDA_LISTADA,
  CLAVES_DE_UN_PRESTAMO,
  type Doc,
  MENSAJES,
  OTRO_USUARIO_ID,
  dia,
  error404,
  error409,
  mensajeDeCampo,
  usarEntornoDeudas,
} from '../../test/deudas/arnes-deudas.js';

const INEXISTENTE = '665f1c2e9b1d4a0012ab3499';

// Paquete 6.1.2 (RF-34): consultar las deudas con sus préstamos y eliminar un préstamo mal registrado.
describe('GET /deudas y DELETE /deudas/:deudaId/prestamos/:prestamoId (integración)', () => {
  const e = usarEntornoDeudas();

  describe('GET /deudas', () => {
    it('CA-RF34-23 lista las deudas por acreedor, sin distinguir mayúsculas, con sus préstamos', async () => {
      const zoe = await e.sembrarDeuda({ acreedor: 'Zoe', saldada: true });
      await e.sembrarPrestamo(zoe);
      const pedro = await e.sembrarDeuda({ acreedor: 'pedro', tipoInteres: 'TASA', valorInteres: 0.02 });
      await e.sembrarPrestamo(pedro);
      const ana = await e.sembrarDeuda({ acreedor: 'Ana' });
      const antiguo = await e.sembrarPrestamo(ana, { monto: 100000, fecha: dia('2026-11-05') });
      const reciente = await e.sembrarPrestamo(ana, { monto: 200000, fecha: dia('2026-11-20') });

      const { status, body } = await e.listar();

      expect(status).toBe(200);
      expect(Object.keys(body)).toEqual(['items']);
      const { items } = body;
      expect(items.map((deuda: Doc) => deuda.acreedor)).toEqual(['Ana', 'pedro', 'Zoe']);
      for (const deuda of items) {
        expect(Object.keys(deuda).sort()).toEqual(CLAVES_DE_UNA_DEUDA_LISTADA);
        for (const prestamo of deuda.prestamos) {
          expect(Object.keys(prestamo).sort()).toEqual(CLAVES_DE_UN_PRESTAMO);
        }
      }
      expect(items[0].prestamos).toMatchObject([
        { id: reciente, monto: 200000, fecha: '2026-11-20', descripcion: 'Préstamo recibido' },
        { id: antiguo, monto: 100000, fecha: '2026-11-05', descripcion: 'Préstamo recibido' },
      ]);
      expect(items[1]).toMatchObject({ id: pedro, tipoInteres: 'TASA', valorInteres: 0.02, saldada: false });
      expect(items[2]).toMatchObject({ id: zoe, saldada: true });
    });

    it('CA-RF34-23 a igual acreedor, la deuda creada más recientemente va primero', async () => {
      const vieja = await e.sembrarDeuda({ acreedor: 'Ana', saldada: true });
      const nueva = await e.sembrarDeuda({ acreedor: 'ana' });

      const { body } = await e.listar();

      expect(body.items.map((deuda: Doc) => deuda.id)).toEqual([nueva, vieja]);
    });

    it('CA-RF34-24 solo se ven las deudas y los préstamos propios (ni avances ni abonos)', async () => {
      const ajena = await e.sembrarDeuda({ acreedor: 'Banco de B' }, OTRO_USUARIO_ID);
      await e.sembrarPrestamo(ajena, {}, OTRO_USUARIO_ID);
      const propia = await e.sembrarDeuda();
      const prestamo = await e.sembrarPrestamo(propia);
      await e.sembrarAbono(propia);
      await e.sembrarTransaccion({ tipo: 'INGRESO', monto: 300000, clasificacionFlujo: 'DINERO_RECIBIDO' });

      const { status, body } = await e.listar();

      expect(status).toBe(200);
      expect(body.items.map((deuda: Doc) => deuda.id)).toEqual([propia]);
      expect(body.items[0].prestamos.map((p: Doc) => p.id)).toEqual([prestamo]);
    });

    it('CA-RF34-25 sin deudas responde items vacío', async () => {
      const { status, body } = await e.listar();

      expect(status).toBe(200);
      expect(body).toEqual({ items: [] });
    });

    it('CA-RF34-25 sin sesión o con una inválida responde 401', async () => {
      const sinSesion = await e.listar({ token: null });
      const invalida = await e.listar({ token: 'token-que-no-es-valido' });

      expect(sinSesion.status).toBe(401);
      expect(invalida.status).toBe(401);
    });
  });

  describe('DELETE /deudas/:deudaId/prestamos/:prestamoId', () => {
    it('CA-RF34-27 elimina un préstamo de una deuda con varios; repetirlo responde 404', async () => {
      const deudaId = await e.sembrarDeuda();
      const queda = await e.sembrarPrestamo(deudaId);
      const sobra = await e.sembrarPrestamo(deudaId, { monto: 200000 });

      const primera = await e.eliminar(deudaId, sobra);
      const repetida = await e.eliminar(deudaId, sobra);
      const periodo = await e.periodo('mes=2026-11');

      expect(primera.status).toBe(204);
      expect(repetida.status).toBe(404);
      expect(repetida.body).toEqual(error404(MENSAJES.prestamoNoEncontrado));
      expect(e.deudas.docs.map((d) => String(d._id))).toEqual([deudaId]);
      expect(e.transacciones.docs.map((t) => String(t._id))).toEqual([queda]);
      expect(periodo.body.dineroRecibido).toBe(500000);
    });

    it('CA-RF34-28 eliminar el único préstamo elimina la deuda y permite registrarla con otro interés', async () => {
      const registro = await e.registrar(e.prestamoBase({ tipoInteres: 'TASA', valorInteres: 0.02 }));
      expect(registro.status).toBe(201);

      const borrado = await e.eliminar(registro.body.deuda.id, registro.body.prestamo.id);

      expect(borrado.status).toBe(204);
      expect(e.deudas.docs).toHaveLength(0);
      expect(e.transacciones.docs).toHaveLength(0);

      const nuevo = await e.registrar(e.prestamoBase());

      expect(nuevo.status).toBe(201);
      expect(nuevo.body.deudaCreada).toBe(true);
      expect(nuevo.body.deuda.tipoInteres).toBe('SIN_INTERES');
    });

    it('CA-RF34-29 no elimina el único préstamo de una deuda con abonos', async () => {
      const deudaId = await e.sembrarDeuda();
      const prestamo = await e.sembrarPrestamo(deudaId);
      await e.sembrarAbono(deudaId);
      const antes = e.foto();

      const { status, body } = await e.eliminar(deudaId, prestamo);

      expect(status).toBe(409);
      expect(body).toEqual(error409(MENSAJES.unicoConAbonos));
      expect(e.foto()).toEqual(antes);
    });

    /** Dos deudas de A (la segunda con abono), un egreso ordinario de A y una deuda de B. */
    const escenario = async () => {
      const primera = await e.sembrarDeuda({ acreedor: 'Primera' });
      const dePrimera = await e.sembrarPrestamo(primera);
      const segunda = await e.sembrarDeuda({ acreedor: 'Segunda' });
      const deSegunda = await e.sembrarPrestamo(segunda);
      const abono = await e.sembrarAbono(segunda);
      const egreso = await e.sembrarTransaccion();
      const ajena = await e.sembrarDeuda({ acreedor: 'Ajena' }, OTRO_USUARIO_ID);
      const deAjena = await e.sembrarPrestamo(ajena, {}, OTRO_USUARIO_ID);
      return { primera, dePrimera, segunda, deSegunda, abono, egreso, ajena, deAjena };
    };
    type Escenario = Awaited<ReturnType<typeof escenario>>;
    type Ruta = (s: Escenario) => [string, string];

    it.each<[string, Ruta, string]>([
      ['la deuda de otro usuario', (s) => [s.ajena, s.deAjena], MENSAJES.deudaNoEncontrada],
      ['una deuda inexistente', (s) => [INEXISTENTE, s.dePrimera], MENSAJES.deudaNoEncontrada],
      ['el préstamo ajeno bajo una deuda propia', (s) => [s.primera, s.deAjena], MENSAJES.prestamoNoEncontrado],
      ['el préstamo de otra deuda propia', (s) => [s.primera, s.deSegunda], MENSAJES.prestamoNoEncontrado],
      ['un abono de la deuda', (s) => [s.segunda, s.abono], MENSAJES.prestamoNoEncontrado],
      ['un egreso ordinario', (s) => [s.primera, s.egreso], MENSAJES.prestamoNoEncontrado],
      ['un préstamo inexistente', (s) => [s.primera, INEXISTENTE], MENSAJES.prestamoNoEncontrado],
    ])('CA-RF34-30 eliminar %s responde 404 y no borra nada', async (_caso, ruta, mensaje) => {
      const sembrado = await escenario();
      const antes = e.foto();

      const { status, body } = await e.eliminar(...ruta(sembrado));

      expect(status).toBe(404);
      expect(body).toEqual(error404(mensaje));
      expect(e.foto()).toEqual(antes);
    });

    it.each([
      ['deudaId', 'abc', INEXISTENTE],
      ['prestamoId', INEXISTENTE, 'abc'],
    ])('CA-RF34-30 un %s inválido responde 400', async (campo, deudaId, prestamoId) => {
      const { status, body } = await e.eliminar(deudaId, prestamoId);

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, campo)).toBe(true);
    });

    it('CA-RF34-30 sin sesión responde 401 y no borra nada', async () => {
      const { primera, dePrimera } = await escenario();
      const antes = e.foto();

      const sinSesion = await e.eliminar(primera, dePrimera, { token: null });
      const invalida = await e.eliminar(primera, dePrimera, { token: 'token-que-no-es-valido' });

      expect(sinSesion.status).toBe(401);
      expect(invalida.status).toBe(401);
      expect(e.foto()).toEqual(antes);
    });
  });
});
