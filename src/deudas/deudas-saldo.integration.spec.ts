import mongoose from 'mongoose';
import {
  CLAVES_DE_UNA_DEUDA_LISTADA,
  type Doc,
  OTRO_USUARIO_ID,
  USUARIO_ID,
  dia,
  usarEntornoDeudas,
} from '../../test/deudas/arnes-deudas.js';
import { usarEntornoErrores } from '../../test/errores/arnes-errores.js';
import { TokenService } from '../auth/token.service.js';

const ObjectId = mongoose.Types.ObjectId;

// Paquete 6.1.3 (RF-38): `GET /deudas` con las cifras de cada deuda y el total adeudado. Las reglas del cálculo se
// prueban caso por caso en `saldo-deuda.spec.ts`. Aún no hay endpoint de abonos: se siembran las transacciones.

const TASA = { tipoInteres: 'TASA', valorInteres: 0.02 };

/** Simula el reloj; la sesión se emite después para que sea coherente con él. */
function fijarAhora(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

const comprobarCifras = (deuda: Doc, [prestado, intereses, abonado, saldo]: number[]) => {
  expect(deuda.prestado, 'prestado').toBeCloseTo(prestado, 6);
  expect(deuda.intereses, 'intereses').toBeCloseTo(intereses, 6);
  expect(deuda.abonado, 'abonado').toBeCloseTo(abonado, 6);
  expect(deuda.saldo, 'saldo').toBeCloseTo(saldo, 6);
};

describe('GET /deudas con intereses y saldo (integración)', () => {
  const e = usarEntornoDeudas();

  afterEach(() => {
    vi.useRealTimers();
  });

  const consultarEl = (iso: string) => {
    fijarAhora(iso);
    return e.listar({ token: e.app.get(TokenService).generar(USUARIO_ID) });
  };
  const prestamo = (deudaId: string, monto: number, fecha: string, usuarioId?: string) =>
    e.sembrarPrestamo(deudaId, { monto, fecha: dia(fecha) }, usuarioId);
  const abono = (deudaId: string, monto: number, fecha: string, usuarioId?: string) =>
    e.sembrarTransaccion(
      { monto, fecha: dia(fecha), clasificacionFlujo: 'ABONO_DEUDA', deudaId: new ObjectId(deudaId) },
      usuarioId,
    );

  /** Las tres deudas de CA-RF38-04: Ana (M1), Pedro (S2) y Zoe (E2, saldada). */
  const sembrarTresDeudas = async () => {
    const ana = await e.sembrarDeuda({ acreedor: 'Ana', ...TASA });
    await prestamo(ana, 1000000, '2026-01-10');
    await prestamo(ana, 500000, '2026-02-25');
    const pedro = await e.sembrarDeuda({ acreedor: 'Pedro' });
    await prestamo(pedro, 500000, '2026-01-10');
    await prestamo(pedro, 200000, '2026-02-25');
    await abono(pedro, 150000, '2026-03-10');
    const zoe = await e.sembrarDeuda({ acreedor: 'Zoe', saldada: true, ...TASA });
    await prestamo(zoe, 1000000, '2026-01-10');
    await abono(zoe, 1100000, '2026-02-10');
  };

  it('CA-RF38-04 cada deuda trae prestado, intereses, abonado y saldo, además de lo que ya traía', async () => {
    await sembrarTresDeudas();

    const { status, body } = await consultarEl('2026-04-10T12:00:00Z');

    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['items', 'totalAdeudado']);
    expect(body.items.map((deuda: Doc) => deuda.acreedor)).toEqual(['Ana', 'Pedro', 'Zoe']);
    for (const deuda of body.items) {
      expect(Object.keys(deuda).sort()).toEqual(CLAVES_DE_UNA_DEUDA_LISTADA);
    }
    const [ana, pedro, zoe] = body.items;
    comprobarCifras(ana, [1500000, 70000, 0, 1570000]);
    comprobarCifras(pedro, [700000, 0, 150000, 550000]);
    comprobarCifras(zoe, [1000000, 20000, 1100000, -80000]);
    expect(zoe.saldada).toBe(true);
  });

  it('CA-RF38-04 consultar no escribe nada en la base ni cambia saldada', async () => {
    await sembrarTresDeudas();
    const antes = e.foto();

    const { body } = await consultarEl('2026-04-10T12:00:00Z');

    // Sin esta cifra la prueba pasaría sin que hubiera cálculo.
    expect(body.totalAdeudado).toBeCloseTo(2120000, 6);
    expect(e.foto()).toEqual(antes);
  });

  it('CA-RF38-05 el total adeudado suma los saldos positivos, sin restar los saldos a favor', async () => {
    await sembrarTresDeudas();

    const { body } = await consultarEl('2026-04-10T12:00:00Z');

    expect(body.totalAdeudado).toBeCloseTo(2120000, 6);
  });

  it('CA-RF38-05 sin deudas responde total 0 e items vacío', async () => {
    const { status, body } = await e.listar();

    expect(status).toBe(200);
    expect(body).toEqual({ totalAdeudado: 0, items: [] });
  });

  it('CA-RF38-06 solo cuentan las transacciones propias de cada deuda', async () => {
    const primera = await e.sembrarDeuda({ acreedor: 'Primera', ...TASA });
    await prestamo(primera, 1000000, '2026-01-10');
    await abono(primera, 520000, '2026-02-10');
    // Un avance en efectivo de A: dinero recibido sin deuda.
    await e.sembrarTransaccion({
      tipo: 'INGRESO',
      monto: 300000,
      fecha: dia('2026-01-10'),
      clasificacionFlujo: 'DINERO_RECIBIDO',
    });
    const segunda = await e.sembrarDeuda({ acreedor: 'Segunda' });
    await prestamo(segunda, 200000, '2026-01-10');
    // De B pero apuntando a la deuda de A: solo se puede sembrar así, directo en la base.
    await prestamo(primera, 700000, '2026-01-10', OTRO_USUARIO_ID);
    await abono(primera, 300000, '2026-02-10', OTRO_USUARIO_ID);
    const ajena = await e.sembrarDeuda({ acreedor: 'Ajena' }, OTRO_USUARIO_ID);
    await prestamo(ajena, 9000000, '2026-01-10', OTRO_USUARIO_ID);

    const { status, body } = await consultarEl('2026-04-10T12:00:00Z');

    expect(status).toBe(200);
    expect(body.items.map((deuda: Doc) => deuda.id)).toEqual([primera, segunda]);
    comprobarCifras(body.items[0], [1000000, 40000, 520000, 520000]);
    comprobarCifras(body.items[1], [200000, 0, 0, 200000]);
    expect(body.totalAdeudado).toBeCloseTo(720000, 6);
  });
});

// Con el arnés de errores, que sí monta `ErroresModule`: así se ve el `code` de la zona inválida.
describe('GET /deudas y el «hoy» del cliente (integración)', () => {
  const e = usarEntornoErrores();

  afterEach(() => {
    vi.useRealTimers();
  });

  /** El préstamo de T1 (cumple su primer mes el 10 de febrero), consultado a las 03:00 UTC de ese día. */
  const consultar = async (zona?: string) => {
    const deudaId = await e.sembrarDeuda(TASA);
    await e.sembrarPrestamo(deudaId, { monto: 1000000, fecha: dia('2026-01-10') });
    fijarAhora('2026-02-10T03:00:00Z');
    const token = e.app.get(TokenService).generar(USUARIO_ID);
    const cabeceras = zona === undefined ? undefined : { 'X-Zona-Horaria': zona };
    return e.enviar('get', '/deudas', undefined, { token, cabeceras });
  };

  it.each([
    ['sin header (UTC) ya es 10 de febrero', undefined, 20000],
    ['en America/Bogota todavía es 9 de febrero', 'America/Bogota', 0],
  ])('CA-RF38-07 %s', async (_caso, zona, intereses) => {
    const { status, body } = await consultar(zona);

    expect(status).toBe(200);
    comprobarCifras(body.items[0], [1000000, intereses, 0, 1000000 + intereses]);
    expect(body.totalAdeudado).toBeCloseTo(1000000 + intereses, 6);
  });

  it('CA-RF38-07 una zona horaria inválida responde 400 VALIDACION', async () => {
    const { status, body } = await consultar('Zona/Invalida');

    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'VALIDACION', action: 'Revisa los datos marcados' });
    expect(body.message[0]).toContain('X-Zona-Horaria');
  });
});
