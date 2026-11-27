import { randomUUID } from 'node:crypto';
import {
  CLAVES_DE_UNA_DEUDA,
  CLAVES_DE_UN_PRESTAMO,
  USUARIO_ID,
  dia,
  mensajeDeCampo,
  mensajeMencionaCampo,
  usarEntornoDeudas,
} from '../../test/deudas/arnes-deudas.js';

// Paquete 6.1.2 (RF-34): registrar préstamos recibidos. Integración: guard de sesión real y MongoDB simulado.
describe('POST /deudas/prestamos: registrar un préstamo recibido (integración)', () => {
  const e = usarEntornoDeudas();

  const nadaGuardado = () => {
    expect(e.deudas.docs).toHaveLength(0);
    expect(e.transacciones.docs).toHaveLength(0);
  };

  it('CA-RF34-14 el primer préstamo de una persona crea la deuda y responde con la forma acordada', async () => {
    const { status, body } = await e.registrar(e.prestamoBase());

    expect(status).toBe(201);
    expect(Object.keys(body).sort()).toEqual(['deuda', 'deudaCreada', 'prestamo']);
    expect(body.deudaCreada).toBe(true);
    expect(Object.keys(body.deuda).sort()).toEqual(CLAVES_DE_UNA_DEUDA);
    expect(body.deuda).toMatchObject({
      acreedor: 'Juan Pérez',
      tipoInteres: 'SIN_INTERES',
      valorInteres: 0,
      saldada: false,
    });
    expect(Object.keys(body.prestamo).sort()).toEqual(CLAVES_DE_UN_PRESTAMO);
    expect(body.prestamo).toMatchObject({ monto: 500000, fecha: '2026-11-10', descripcion: 'Préstamo recibido' });
    expect(e.deudas.docs).toHaveLength(1);
    expect(String(e.deudas.docs[0]._id)).toBe(body.deuda.id);
    expect(String(e.deudas.docs[0].usuarioId)).toBe(USUARIO_ID);
  });

  it('CA-RF34-15 se guarda como un ingreso de dinero recibido asociado a la deuda', async () => {
    const { status, body } = await e.registrar(e.prestamoBase());

    expect(status).toBe(201);
    expect(e.transacciones.docs).toHaveLength(1);
    const transaccion = e.transacciones.docs[0];
    expect(String(transaccion._id)).toBe(body.prestamo.id);
    expect(String(transaccion.usuarioId)).toBe(USUARIO_ID);
    expect(transaccion.tipo).toBe('INGRESO');
    expect(transaccion.clasificacionFlujo).toBe('DINERO_RECIBIDO');
    expect(transaccion.monto).toBe(500000);
    expect(transaccion.fecha.toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(transaccion.metodoPago).toBe('EFECTIVO');
    expect(transaccion.categoriaId).toBeNull();
    expect(transaccion.tarjetaId).toBeNull();
    expect(String(transaccion.deudaId)).toBe(body.deuda.id);
  });

  it('CA-RF34-16 aumenta el dinero disponible sin aumentar el ingreso propio del mes', async () => {
    await e.sembrarTransaccion({ tipo: 'INGRESO', monto: 3000000 });
    await e.sembrarTransaccion({ monto: 3500000 });
    const antes = await e.periodo('mes=2026-11');
    const categoriasAntes = await e.categoriasReporte('mes=2026-11');
    expect(antes.body.dineroDisponible).toBe(-500000);
    expect(antes.body.dineroRecibido).toBe(0);

    const registro = await e.registrar(e.prestamoBase({ monto: 1000000 }));
    const despues = await e.periodo('mes=2026-11');
    const categoriasDespues = await e.categoriasReporte('mes=2026-11');
    const sinMovimientos = await e.periodo('mes=2026-09');

    expect(registro.status).toBe(201);
    expect(despues.body.dineroDisponible).toBe(500000);
    expect(despues.body.dineroRecibido).toBe(1000000);
    expect(despues.body.ingresos).toBe(3000000);
    expect(despues.body.egresos).toBe(3500000);
    expect(despues.body.balance).toBe(-500000);
    expect(sinMovimientos.body.dineroDisponible).toBe(0);
    expect(categoriasDespues.body).toEqual(categoriasAntes.body);
  });

  it('CA-RF34-16 el dinero disponible es balance más dinero recibido, también con avances, pagos y abonos', async () => {
    await e.sembrarTransaccion({ tipo: 'INGRESO', monto: 2000000 });
    await e.sembrarTransaccion({ monto: 100000, clasificacionFlujo: 'PAGO_TARJETA' });
    await e.sembrarTransaccion({ monto: 200000, clasificacionFlujo: 'ABONO_DEUDA' });
    // Un avance en efectivo: dinero recibido sin deuda.
    await e.sembrarTransaccion({ tipo: 'INGRESO', monto: 300000, clasificacionFlujo: 'DINERO_RECIBIDO' });

    const { body } = await e.periodo('mes=2026-11');

    expect(body.balance).toBe(1700000);
    expect(body.dineroRecibido).toBe(300000);
    expect(body.dineroDisponible).toBe(2000000);
  });

  it('CA-RF34-17 no cuenta para el ahorro: ni el ingreso propio ni la meta ni el disponible cambian', async () => {
    await e.sembrarTransaccion({ tipo: 'INGRESO', monto: 3000000 });
    await e.sembrarMeta({ periodo: dia('2026-11-01'), tipoMeta: 'PORCENTAJE', valorObjetivo: 20 });
    const antes = await e.progreso('mes=2026-11');

    const registro = await e.registrar(e.prestamoBase());
    const despues = await e.progreso('mes=2026-11');

    expect(registro.status).toBe(201);
    expect(despues.status).toBe(200);
    expect(despues.body).toMatchObject({ ingresoPropio: 3000000, ahorroDelMes: 3000000, disponible: 2400000 });
    expect(despues.body.meta.montoMeta).toBe(600000);
    expect(despues.body).toEqual(antes.body);
  });

  it.each([0.01, 1254700.55, 999999999999])('CA-RF34-18 acepta el monto %s y lo conserva exacto', async (monto) => {
    const { status, body } = await e.registrar(e.prestamoBase({ monto }));

    expect(status).toBe(201);
    expect(body.prestamo.monto).toBe(monto);
    expect(e.transacciones.docs[0].monto).toBe(monto);
  });

  it.each([
    ['ausente', undefined],
    ['null', null],
    ['cero', 0],
    ['negativo', -1],
    ['con 3 decimales', 10.001],
    ['sobre el máximo', 1000000000000],
    ['en texto', '500000'],
  ])('CA-RF34-18 un monto %s responde 400 y no guarda nada', async (_caso, monto) => {
    const { status, body } = await e.registrar(e.prestamoBase({ monto }));

    expect(status).toBe(400);
    expect(mensajeDeCampo(body, 'monto')).toBe(true);
    nadaGuardado();
  });

  it.each(['2020-01-31', '2028-02-29', '2030-12-31'])(
    'CA-RF34-19 acepta la fecha %s y la guarda a medianoche UTC',
    async (fecha) => {
      const { status, body } = await e.registrar(e.prestamoBase({ fecha }));

      expect(status).toBe(201);
      expect(body.prestamo.fecha).toBe(fecha);
      expect(e.transacciones.docs[0].fecha.toISOString()).toBe(`${fecha}T00:00:00.000Z`);
    },
  );

  it.each([
    ['ausente', undefined],
    ['null', null],
    ['que no existe', '2026-02-30'],
    ['en otro formato', '10-11-2026'],
    ['con hora', '2026-11-10T15:00:00Z'],
  ])('CA-RF34-19 una fecha %s responde 400 y no guarda nada', async (_caso, fecha) => {
    const { status, body } = await e.registrar(e.prestamoBase({ fecha }));

    expect(status).toBe(400);
    expect(mensajeDeCampo(body, 'fecha')).toBe(true);
    nadaGuardado();
  });

  it.each([
    ['ausente', undefined],
    ['null', null],
    ['vacío', ''],
    ['solo espacios', '   '],
    ['numérico', 123],
    ['de 51 caracteres', 'x'.repeat(51)],
  ])('CA-RF34-20 un acreedor %s responde 400 y no guarda nada', async (_caso, acreedor) => {
    const { status, body } = await e.registrar(e.prestamoBase({ acreedor }));

    expect(status).toBe(400);
    expect(mensajeDeCampo(body, 'acreedor')).toBe(true);
    nadaGuardado();
  });

  it.each([
    ['de 50 caracteres', 'x'.repeat(50), 'x'.repeat(50)],
    ['de 50 caracteres entre espacios', `  ${'x'.repeat(50)}  `, 'x'.repeat(50)],
    ['con espacios en los extremos', '  Juan Pérez  ', 'Juan Pérez'],
  ])('CA-RF34-20 un acreedor %s se acepta y se recorta', async (_caso, acreedor, guardado) => {
    const { status, body } = await e.registrar(e.prestamoBase({ acreedor }));

    expect(status).toBe(201);
    expect(body.deuda.acreedor).toBe(guardado);
    expect(e.deudas.docs[0].acreedor).toBe(guardado);
  });

  it.each([
    ['con espacios en los extremos', '  Para el arriendo  ', 'Para el arriendo'],
    ['de 200 caracteres', 'x'.repeat(200), 'x'.repeat(200)],
  ])('CA-RF34-21 una descripción %s se acepta y se recorta', async (_caso, descripcion, guardada) => {
    const { status, body } = await e.registrar(e.prestamoBase({ descripcion }));

    expect(status).toBe(201);
    expect(body.prestamo.descripcion).toBe(guardada);
    expect(e.transacciones.docs[0].descripcion).toBe(guardada);
  });

  it.each([
    ['null', null],
    ['vacía', ''],
    ['de solo espacios', '   '],
    ['numérica', 123],
    ['de 201 caracteres', 'x'.repeat(201)],
  ])('CA-RF34-21 una descripción %s responde 400 y no guarda nada', async (_caso, descripcion) => {
    const { status, body } = await e.registrar(e.prestamoBase({ descripcion }));

    expect(status).toBe(400);
    expect(mensajeDeCampo(body, 'descripcion')).toBe(true);
    nadaGuardado();
  });

  it.each([
    ['metodoPago', 'EFECTIVO'],
    ['tipo', 'INGRESO'],
    ['clasificacionFlujo', 'DINERO_RECIBIDO'],
    ['categoriaId', '665f1c2e9b1d4a0012ab34aa'],
    ['deudaId', '665f1c2e9b1d4a0012ab34aa'],
    ['usuarioId', '665f1c2e9b1d4a0012ab34ff'],
    ['saldada', false],
  ])('CA-RF34-22 enviar %s responde 400 y no guarda nada', async (campo, valor) => {
    const { status, body } = await e.registrar(e.prestamoBase({ [campo]: valor }));

    expect(status).toBe(400);
    expect(mensajeMencionaCampo(body, campo)).toBe(true);
    nadaGuardado();
  });

  it('CA-RF34-22 sin sesión o con una inválida responde 401 y no guarda nada', async () => {
    const sinSesion = await e.registrar(e.prestamoBase(), { token: null });
    const invalida = await e.registrar(e.prestamoBase(), { token: 'token-que-no-es-valido' });

    expect(sinSesion.status).toBe(401);
    expect(invalida.status).toBe(401);
    nadaGuardado();
  });

  it('CA-RF34-26 el préstamo se ve en /transacciones pero no se edita ni se elimina desde allí', async () => {
    const registro = await e.registrar(e.prestamoBase());
    expect(registro.status).toBe(201);
    const id: string = registro.body.prestamo.id;
    const antes = e.foto();

    const listado = await e.listarTransacciones();
    const edicion = await e.editarTransaccion(id, { monto: 1 });
    const borrado = await e.eliminarTransaccion(id);

    expect(listado.body.items).toHaveLength(1);
    expect(listado.body.items[0]).toMatchObject({ id, clasificacionFlujo: 'DINERO_RECIBIDO' });
    expect(edicion.status).toBe(409);
    expect(borrado.status).toBe(409);
    expect(e.foto()).toEqual(antes);
  });

  it('CA-RF34-31 repetir con la misma clave devuelve la misma respuesta y no duplica; otro cuerpo da 422', async () => {
    const clave = randomUUID();

    const primera = await e.registrar(e.prestamoBase(), { clave });
    const repetida = await e.registrar(e.prestamoBase(), { clave });
    const otroCuerpo = await e.registrar(e.prestamoBase({ monto: 600000 }), { clave });

    expect(primera.status).toBe(201);
    expect(repetida.status).toBe(201);
    expect(repetida.body).toEqual(primera.body);
    expect(repetida.headers['idempotent-replayed']).toBe('true');
    expect(otroCuerpo.status).toBe(422);
    expect(e.deudas.docs).toHaveLength(1);
    expect(e.transacciones.docs).toHaveLength(1);
  });

  it('CA-RF34-31 con la clave obligatoria, sin el header responde 400 y no guarda nada', async () => {
    vi.stubEnv('IDEMPOTENCIA_OBLIGATORIA', 'true');

    const { status } = await e.registrar(e.prestamoBase());

    expect(status).toBe(400);
    nadaGuardado();
  });

  it('CA-RF34-32 si falla la transacción de una persona nueva, responde 500 y no queda la deuda', async () => {
    e.transacciones.fallaEscritura = true;

    const { status } = await e.registrar(e.prestamoBase());

    expect(status).toBe(500);
    nadaGuardado();
  });

  it('CA-RF34-32 si falla con una deuda ya existente, responde 500 y la deuda y sus préstamos siguen intactos', async () => {
    const deudaId = await e.sembrarDeuda({ tipoInteres: 'TASA', valorInteres: 0.02 });
    await e.sembrarPrestamo(deudaId);
    const antes = e.foto();
    e.transacciones.fallaEscritura = true;

    const { status } = await e.registrar(e.prestamoBase({ monto: 200000 }));

    expect(status).toBe(500);
    expect(e.foto()).toEqual(antes);
  });
});
