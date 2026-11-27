import {
  MENSAJES,
  OTRO_USUARIO_ID,
  USUARIO_ID,
  error409,
  errorDeClaveDuplicada,
  mensajeDeCampo,
  usarEntornoDeudas,
} from '../../test/deudas/arnes-deudas.js';

// Paquete 6.1.2 (RF-35 y RF-36): sumar montos a una deuda existente y el interés del préstamo.
describe('POST /deudas/prestamos: sumar a una deuda e interés (integración)', () => {
  const e = usarEntornoDeudas();

  const deudaDe = (id: string) => e.deudas.docs.find((deuda) => String(deuda._id) === id);

  /** Una deuda activa de A con «Juan Pérez» y un préstamo; devuelve su id. */
  const deudaConPrestamo = async (datos: Record<string, unknown> = {}) => {
    const deudaId = await e.sembrarDeuda(datos);
    await e.sembrarPrestamo(deudaId);
    return deudaId;
  };

  describe('RF-35: agregar montos a un préstamo existente', () => {
    it('CA-RF35-01 otro préstamo de la misma persona se suma a su deuda', async () => {
      const primero = await e.registrar(e.prestamoBase());

      const segundo = await e.registrar(e.prestamoBase({ monto: 200000 }));

      expect(primero.status).toBe(201);
      expect(segundo.status).toBe(201);
      expect(segundo.body.deudaCreada).toBe(false);
      expect(segundo.body.deuda.id).toBe(primero.body.deuda.id);
      expect(e.deudas.docs).toHaveLength(1);
      expect(e.transacciones.docs.map((t) => [t.monto, String(t.deudaId)])).toEqual([
        [500000, primero.body.deuda.id],
        [200000, primero.body.deuda.id],
      ]);
    });

    it('CA-RF35-02 compara sin mayúsculas ni espacios de los extremos, y distingue las tildes', async () => {
      const deudaId = await deudaConPrestamo();

      const mayusculas = await e.registrar(e.prestamoBase({ acreedor: '  JUAN PÉREZ  ' }));
      const sinTilde = await e.registrar(e.prestamoBase({ acreedor: 'Juan Perez' }));

      expect(mayusculas.status).toBe(201);
      expect(mayusculas.body.deudaCreada).toBe(false);
      expect(mayusculas.body.deuda).toMatchObject({ id: deudaId, acreedor: 'Juan Pérez' });
      expect(sinTilde.status).toBe(201);
      expect(sinTilde.body.deudaCreada).toBe(true);
      expect(sinTilde.body.deuda.id).not.toBe(deudaId);
      expect(e.deudas.docs.map((deuda) => deuda.acreedor)).toEqual(['Juan Pérez', 'Juan Perez']);
    });

    it('CA-RF35-03 la deuda de otro usuario no cuenta: cada uno tiene la suya', async () => {
      const ajena = await e.sembrarDeuda({}, OTRO_USUARIO_ID);
      await e.sembrarPrestamo(ajena, {}, OTRO_USUARIO_ID);
      const antes = JSON.stringify([deudaDe(ajena), e.transacciones.docs[0]]);

      const { status, body } = await e.registrar(e.prestamoBase());

      expect(status).toBe(201);
      expect(body.deudaCreada).toBe(true);
      expect(body.deuda.id).not.toBe(ajena);
      expect(String(deudaDe(body.deuda.id)?.usuarioId)).toBe(USUARIO_ID);
      expect(e.transacciones.docs.filter((t) => String(t.deudaId) === ajena)).toHaveLength(1);
      expect(JSON.stringify([deudaDe(ajena), e.transacciones.docs[0]])).toBe(antes);
    });

    it('CA-RF35-04 una deuda saldada no recibe montos nuevos: se crea otra y los siguientes van a la nueva', async () => {
      const saldada = await deudaConPrestamo({ saldada: true });

      const primero = await e.registrar(e.prestamoBase());
      const segundo = await e.registrar(e.prestamoBase({ monto: 200000 }));

      expect(primero.status).toBe(201);
      expect(primero.body.deudaCreada).toBe(true);
      expect(primero.body.deuda.saldada).toBe(false);
      expect(primero.body.deuda.id).not.toBe(saldada);
      expect(segundo.body.deudaCreada).toBe(false);
      expect(segundo.body.deuda.id).toBe(primero.body.deuda.id);
      expect(deudaDe(saldada)?.saldada).toBe(true);
      expect(e.transacciones.docs.filter((t) => String(t.deudaId) === saldada)).toHaveLength(1);
    });

    it('CA-RF35-05 si otra petición creó la deuda a la vez (clave duplicada) responde 409 y no guarda nada', async () => {
      vi.spyOn(e.deudas, 'create').mockRejectedValue(errorDeClaveDuplicada());

      const { status, body } = await e.registrar(e.prestamoBase());

      expect(status).toBe(409);
      expect(body).toEqual(error409(MENSAJES.registroSimultaneo));
      expect(e.deudas.docs).toHaveLength(0);
      expect(e.transacciones.docs).toHaveLength(0);
    });
  });

  describe('RF-36: interés del préstamo', () => {
    it.each([
      ['SIN_INTERES', 0],
      ['TASA', 0.02],
      ['TASA', 0.0001],
      ['TASA', 1],
      ['MONTO_FIJO', 150000.5],
      ['MONTO_FIJO', 999999999999],
    ])('CA-RF36-10 registra con %s y %s, conservando el valor exacto', async (tipoInteres, valorInteres) => {
      const { status, body } = await e.registrar(e.prestamoBase({ tipoInteres, valorInteres }));

      expect(status).toBe(201);
      expect(body.deuda).toMatchObject({ tipoInteres, valorInteres });
      expect(e.deudas.docs[0]).toMatchObject({ tipoInteres, valorInteres });
      expect(body.prestamo.monto).toBe(500000);
    });

    it('CA-RF36-11 sin indicar interés la deuda queda sin intereses y en 0', async () => {
      const { status, body } = await e.registrar(e.prestamoBase());

      expect(status).toBe(201);
      expect(body.deuda).toMatchObject({ tipoInteres: 'SIN_INTERES', valorInteres: 0 });
      expect(e.deudas.docs[0]).toMatchObject({ tipoInteres: 'SIN_INTERES', valorInteres: 0 });
    });

    const INVALIDOS: Array<[string, Record<string, unknown>]> = [
      ['un tipo desconocido', { tipoInteres: 'PRESTAMO' }],
      ['el tipo null', { tipoInteres: null }],
      ['el valor null', { tipoInteres: 'TASA', valorInteres: null }],
      ['el valor null sin tipo', { valorInteres: null }],
      ['el valor en texto', { tipoInteres: 'TASA', valorInteres: '0.02' }],
      ['TASA sin valor', { tipoInteres: 'TASA' }],
      ['TASA en 0', { tipoInteres: 'TASA', valorInteres: 0 }],
      ['TASA negativa', { tipoInteres: 'TASA', valorInteres: -0.02 }],
      ['TASA mayor que 1', { tipoInteres: 'TASA', valorInteres: 2 }],
      ['MONTO_FIJO sin valor', { tipoInteres: 'MONTO_FIJO' }],
      ['MONTO_FIJO en 0', { tipoInteres: 'MONTO_FIJO', valorInteres: 0 }],
      ['MONTO_FIJO negativo', { tipoInteres: 'MONTO_FIJO', valorInteres: -1 }],
      ['MONTO_FIJO con 3 decimales', { tipoInteres: 'MONTO_FIJO', valorInteres: 10.001 }],
      ['MONTO_FIJO sobre el máximo', { tipoInteres: 'MONTO_FIJO', valorInteres: 1000000000000 }],
      ['SIN_INTERES con valor', { tipoInteres: 'SIN_INTERES', valorInteres: 150000 }],
      ['un valor sin tipo', { valorInteres: 0.02 }],
    ];
    const mensajeDeInteres = (body: { message?: unknown }) =>
      mensajeDeCampo(body, 'tipoInteres') || mensajeDeCampo(body, 'valorInteres');

    it.each(INVALIDOS)('CA-RF36-12 %s, en una persona nueva, responde 400 y no guarda nada', async (_caso, interes) => {
      const { status, body } = await e.registrar(e.prestamoBase(interes));

      expect(status).toBe(400);
      expect(mensajeDeInteres(body)).toBe(true);
      expect(e.deudas.docs).toHaveLength(0);
      expect(e.transacciones.docs).toHaveLength(0);
    });

    it.each(INVALIDOS)('CA-RF36-12 %s, con una deuda activa, responde 400 y no guarda nada', async (_caso, interes) => {
      await deudaConPrestamo({ tipoInteres: 'TASA', valorInteres: 0.02 });
      const antes = e.foto();

      const { status, body } = await e.registrar(e.prestamoBase(interes));

      expect(status).toBe(400);
      expect(mensajeDeInteres(body)).toBe(true);
      expect(e.foto()).toEqual(antes);
    });

    it.each([
      ['sin indicar interés', { tipoInteres: 'TASA', valorInteres: 0.02 }, {}],
      ['con la misma tasa', { tipoInteres: 'TASA', valorInteres: 0.02 }, { tipoInteres: 'TASA', valorInteres: 0.02 }],
      ['sin indicarlo en una de monto fijo', { tipoInteres: 'MONTO_FIJO', valorInteres: 150000 }, {}],
      [
        'con el mismo monto fijo',
        { tipoInteres: 'MONTO_FIJO', valorInteres: 150000 },
        { tipoInteres: 'MONTO_FIJO', valorInteres: 150000 },
      ],
      ['con valor 0 en una sin intereses', { tipoInteres: 'SIN_INTERES', valorInteres: 0 }, { valorInteres: 0 }],
    ])('CA-RF36-13 al sumar %s se conserva el interés de la deuda', async (_caso, guardado, enviado) => {
      const deudaId = await deudaConPrestamo(guardado);

      const { status, body } = await e.registrar(e.prestamoBase(enviado));

      expect(status).toBe(201);
      expect(body.deudaCreada).toBe(false);
      expect(body.deuda).toMatchObject({ id: deudaId, ...guardado });
      expect(deudaDe(deudaId)).toMatchObject(guardado);
      expect(e.transacciones.docs).toHaveLength(2);
    });

    const TASA = { tipoInteres: 'TASA', valorInteres: 0.02 };
    it.each([
      ['otra tasa', TASA, { tipoInteres: 'TASA', valorInteres: 0.03 }],
      ['un monto fijo en una de tasa', TASA, { tipoInteres: 'MONTO_FIJO', valorInteres: 150000 }],
      ['SIN_INTERES en una de tasa', TASA, { tipoInteres: 'SIN_INTERES' }],
      ['solo valor 0 en una de tasa', TASA, { valorInteres: 0 }],
      [
        'otro monto fijo',
        { tipoInteres: 'MONTO_FIJO', valorInteres: 150000 },
        { tipoInteres: 'MONTO_FIJO', valorInteres: 200000 },
      ],
      ['una tasa en una sin intereses', { tipoInteres: 'SIN_INTERES', valorInteres: 0 }, TASA],
    ])('CA-RF36-14 al sumar con %s responde 409 y no guarda nada', async (_caso, guardado, enviado) => {
      await deudaConPrestamo(guardado);
      const antes = e.foto();

      const { status, body } = await e.registrar(e.prestamoBase(enviado));

      expect(status).toBe(409);
      expect(body).toEqual(error409(MENSAJES.otroInteres));
      expect(e.foto()).toEqual(antes);
    });
  });
});
