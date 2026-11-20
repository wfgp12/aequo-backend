import {
  OTRO_USUARIO_ID,
  cerca,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';
import {
  CARGOS,
  COMPRAS,
  CUOTA,
  SUMA_CUOTAS_BASE,
  TABLA_BASE,
  mesesDe,
  sembrarCargoDe,
  sembrarCompraDe,
  sembrarEscenarioBase,
} from '../../test/tarjetas/escenario-proyeccion.js';

const MES = 'mes=2026-12';

// Paquete 5.3.1 (RF-30, RF-31): lo que el servicio carga de la base (compras, avances y cargos de la tarjeta del usuario)
// y devuelve la API. La matriz completa del cálculo está en proyeccion-tarjeta.spec.ts (la función pura).
describe('GET /tarjetas/:tarjetaId/proyeccion: cálculo con datos de la base (integración)', () => {
  const e = usarEntornoCompras();

  /** Una tarjeta «Visa» del usuario con las compras (y cargos) dados, sembrados directo en la base. */
  const tarjetaCon = async (
    compras: Array<(typeof COMPRAS)[keyof typeof COMPRAS]>,
    cargos: Array<(typeof CARGOS)[keyof typeof CARGOS]> = [],
    nombre = 'Visa',
  ) => {
    const tarjeta = await e.sembrarTarjeta({ nombre, tasaEA: 0.2921 });
    for (const compra of compras) await sembrarCompraDe(e, tarjeta, compra);
    for (const cargo of cargos) await sembrarCargoDe(e, tarjeta, cargo);
    return tarjeta;
  };

  describe('RF-30: el total del mes', () => {
    it('CA-RF30-01 el total del mes de la compra de referencia de la hoja del promotor', async () => {
      const visa = await tarjetaCon([COMPRAS.A]);

      const { status, body } = await e.proyeccion(visa, MES);

      expect(status).toBe(200);
      expect(body.mes).toBe('2026-12');
      cerca(body.cuotas, 119802.13, 2);
      expect(body.cargosFijos).toBe(0);
      cerca(body.total, 119802.13, 2);
    });

    it('CA-RF30-02 los montos llegan con precisión completa, sin redondear', async () => {
      const visa = await tarjetaCon([COMPRAS.A]);

      const { body } = await e.proyeccion(visa, MES);

      cerca(body.cuotas, 119802.1331718775, 6);
      cerca(body.total, 119802.1331718775, 6);
      for (const monto of [body.cuotas, body.total]) {
        expect(monto).not.toBe(119802.13);
        expect(monto).not.toBe(119802);
      }
    });

    it('CA-RF30-03 las cuotas de varias compras y avances se suman, con los cargos activos', async () => {
      const { visa } = await sembrarEscenarioBase(e);

      const { status, body } = await e.proyeccion(visa, MES);

      expect(status).toBe(200);
      cerca(body.cuotas, 291270.05016469);
      expect(body.cargosFijos).toBe(55000);
      cerca(body.total, 346270.05016469);
    });

    it('CA-RF30-04 cada compra usa su propia tasa: cambiar la de la tarjeta no recalcula las anteriores', async () => {
      const visa = await e.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });
      const a = await e.crearCompra(visa, e.compraBase());
      const cambio = await e.editarTarjeta(visa, { tasaEA: 0.31 });
      const f = await e.crearCompra(visa, e.compraBase());
      expect(a.status).toBe(201);
      expect(cambio.status).toBe(200);
      expect(f.status).toBe(201);
      expect(f.body.tasaEAAplicada).toBe(0.31);

      const { status, body } = await e.proyeccion(visa, MES);

      expect(status).toBe(200);
      // A con 0,2921 (119802.13317188) más F con 0,31 (120662.17031426).
      cerca(body.cuotas, 240464.30348614);
    });

    it('CA-RF30-05 la bandera de una sola cuota sin interés es la de cada compra', async () => {
      const debito = await e.sembrarTarjeta({
        nombre: 'Débito',
        tasaEA: 0.2921,
        cuotaUnicaSinInteres: true,
      });
      const visa = await e.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });
      const compra = (cuotas: number) => e.compraBase({ valor: 80000, cuotas });
      for (const [tarjeta, cuotas] of [
        [debito, 1],
        [debito, 2],
        [visa, 1],
      ] as const) {
        expect((await e.crearCompra(tarjeta, compra(cuotas))).status).toBe(201);
      }

      const deDebito = await e.proyeccion(debito, MES);
      const deVisa = await e.proyeccion(visa, MES);
      const cambio = await e.editarTarjeta(debito, {
        cuotaUnicaSinInteres: false,
      });
      const deDebitoDespues = await e.proyeccion(debito, MES);

      // 80000 de la cuota única, sin interés, más 41299.733493 de la de 2 cuotas: la bandera solo exime la cuota única.
      cerca(deDebito.body.cuotas, 121299.733493);
      cerca(deVisa.body.cuotas, 81726.831931);
      expect(cambio.status).toBe(200);
      cerca(deDebitoDespues.body.cuotas, 121299.733493);
    });

    it('CA-RF30-07 los cargos fijos activos suman, los inactivos no, y activar uno se refleja', async () => {
      const visa = await tarjetaCon([COMPRAS.A], [CARGOS.netflix, CARGOS.seguro]);
      const gimnasio = await sembrarCargoDe(e, visa, CARGOS.gimnasio);

      const antes = await e.proyeccion(visa, MES);
      const activar = await e.editarCargo(visa, gimnasio, { activo: true });
      const despues = await e.proyeccion(visa, MES);

      expect(antes.body.cargosFijos).toBe(55000);
      cerca(antes.body.total, 174802.13317188);
      expect(activar.status).toBe(200);
      expect(despues.body.cargosFijos).toBe(115000);
    });

    it('CA-RF30-08 una tarjeta solo con cargos fijos', async () => {
      const visa = await tarjetaCon([], [CARGOS.netflix, CARGOS.seguro]);

      const { status, body } = await e.proyeccion(visa, MES);

      expect(status).toBe(200);
      expect(body.cuotas).toBe(0);
      expect(body.cargosFijos).toBe(55000);
      expect(body.total).toBe(55000);
      expect(body.saldoPendiente).toBe(0);
      expect(body.proyeccion).toEqual([]);
    });

    it('CA-RF30-09 una tarjeta sin compras ni cargos activos: el total es cero y no es un error', async () => {
      const vacia = await e.sembrarTarjeta({ nombre: 'Vacía' });
      const soloInactivos = await tarjetaCon([], [CARGOS.gimnasio], 'Inactivos');

      for (const tarjeta of [vacia, soloInactivos]) {
        const { status, body } = await e.proyeccion(tarjeta, MES);

        expect(status).toBe(200);
        expect(body.cuotas).toBe(0);
        expect(body.cargosFijos).toBe(0);
        expect(body.total).toBe(0);
        expect(body.saldoPendiente).toBe(0);
        expect(body.proyeccion).toEqual([]);
      }
    });

    it('CA-RF30-13 la vigencia la decide el mes del primer pago, no la fecha de la compra', async () => {
      const visa = await tarjetaCon([
        { ...COMPRAS.A, fecha: '2026-12-31', primerPago: '2027-01' },
        { ...COMPRAS.A, fecha: '2026-06-15', primerPago: '2026-12' },
      ]);

      const diciembre = await e.proyeccion(visa, MES);
      const enero = await e.proyeccion(visa, 'mes=2027-01');

      // Diciembre: solo la hecha en junio; enero: las dos.
      cerca(diciembre.body.cuotas, 119802.133172);
      cerca(enero.body.cuotas, 2 * 119802.133172);
    });

    it('CA-RF30-15 solo cuentan las compras y los cargos de esa tarjeta y de ese usuario', async () => {
      const visaDeA = await tarjetaCon(
        [COMPRAS.A],
        [CARGOS.netflix, CARGOS.seguro],
      );
      const debito = await e.sembrarTarjeta({ nombre: 'Débito' });
      await sembrarCompraDe(e, debito, COMPRAS.C);
      await sembrarCargoDe(e, debito, {
        descripcion: 'Cuota de manejo',
        valor: 20000,
        activo: true,
      });
      const visaDeB = await e.sembrarTarjeta(
        { nombre: 'Visa' },
        OTRO_USUARIO_ID,
      );
      await sembrarCompraDe(e, visaDeB, COMPRAS.A, OTRO_USUARIO_ID);
      await sembrarCargoDe(
        e,
        visaDeB,
        { descripcion: 'Seguro', valor: 9000, activo: true },
        OTRO_USUARIO_ID,
      );

      const deA = await e.proyeccion(visaDeA, MES);
      const deB = await e.proyeccion(visaDeB, MES, { token: e.tokenOtro });

      expect(deA.status).toBe(200);
      cerca(deA.body.cuotas, 119802.133172);
      expect(deA.body.cargosFijos).toBe(55000);
      expect(deB.status).toBe(200);
      cerca(deB.body.cuotas, 119802.133172);
      expect(deB.body.cargosFijos).toBe(9000);
    });

    it('CA-RF30-16 los pagos y el dinero recibido de la tarjeta no cambian el total estimado', async () => {
      const visa = await tarjetaCon([COMPRAS.A]);
      const avance = await e.crearAvance(visa, e.avanceBase());
      expect(avance.status).toBe(201);
      expect(
        e.transacciones.docs.some(
          (t) => t.clasificacionFlujo === 'DINERO_RECIBIDO',
        ),
      ).toBe(true);
      const sinPago = await e.proyeccion(visa, MES);

      await e.sembrarPago(visa);
      const conPago = await e.proyeccion(visa, MES);

      expect(sinPago.status).toBe(200);
      cerca(sinPago.body.cuotas, CUOTA.A + CUOTA.B);
      expect(conPago.status).toBe(200);
      expect(conPago.body.cuotas).toBe(sinPago.body.cuotas);
      expect(conPago.body.total).toBe(sinPago.body.total);
      expect(conPago.body.saldoPendiente).toBe(sinPago.body.saldoPendiente);
    });

    it('CA-RF30-17 un cambio en las compras, avances o cargos se refleja en la siguiente consulta', async () => {
      const { visa, compras, cargos } = await sembrarEscenarioBase(e);
      const antes = await e.proyeccion(visa, MES);
      cerca(antes.body.total, 346270.05016469);

      const desactivar = await e.editarCargo(visa, cargos.netflix, {
        activo: false,
      });
      const eliminar = await e.eliminarCompra(visa, compras.C);
      const editar = await e.editarCompra(visa, compras.B, { cuotas: 3 });
      const despues = await e.proyeccion(visa, MES);

      expect(desactivar.status).toBe(200);
      expect(eliminar.status).toBe(204);
      expect(editar.status).toBe(200);
      expect(despues.body.cargosFijos).toBe(15000);
      // A (119802.133172) más B a 3 cuotas con 0,2921 (173913.014933).
      cerca(despues.body.cuotas, 293715.148105);
    });
  });

  describe('RF-31: la proyección y el saldo pendiente', () => {
    it('CA-RF31-01 la proyección de la compra de referencia', async () => {
      const visa = await tarjetaCon([COMPRAS.A]);

      const { status, body } = await e.proyeccion(visa, MES);

      expect(status).toBe(200);
      expect(body.proyeccion.map((fila: { mes: string }) => fila.mes)).toEqual(
        mesesDe('2027-01', '2027-11'),
      );
      for (const fila of body.proyeccion) {
        cerca(fila.cuotas, 119802.13, 2);
        expect(fila.cargosFijos).toBe(0);
        expect(fila.total).toBe(fila.cuotas);
      }
    });

    it('CA-RF31-02 las cuotas de la proyección bajan cuando termina cada compra', async () => {
      const { visa } = await sembrarEscenarioBase(e);

      const { body } = await e.proyeccion(visa, MES);

      expect(body.proyeccion).toHaveLength(11);
      TABLA_BASE.slice(1).forEach((esperado, indice) => {
        const fila = body.proyeccion[indice];
        expect(fila.mes).toBe(esperado.mes);
        cerca(fila.cuotas, esperado.cuotas);
        expect(fila.cargosFijos).toBe(55000);
        cerca(fila.total, esperado.total);
      });
    });

    it('CA-RF31-08 el saldo después del pago del mes es la suma de las cuotas de los meses siguientes', async () => {
      const { visa } = await sembrarEscenarioBase(e);

      const { body } = await e.proyeccion(visa, MES);

      cerca(body.saldoPendiente, 1766528.890201);
      const suma = body.proyeccion.reduce(
        (acumulado: number, fila: { cuotas: number }) => acumulado + fila.cuotas,
        0,
      );
      cerca(body.saldoPendiente, suma);
      cerca(body.saldoPendiente, SUMA_CUOTAS_BASE - TABLA_BASE[0].cuotas);
    });

    it('CA-RF31-09 el saldo de cada mes de la proyección baja hasta cero', async () => {
      const { visa } = await sembrarEscenarioBase(e);

      const { body } = await e.proyeccion(visa, MES);

      TABLA_BASE.slice(1).forEach((esperado, indice) => {
        cerca(body.proyeccion[indice].saldoPendiente, esperado.saldoPendiente);
      });
      let anterior = body.saldoPendiente;
      for (const fila of body.proyeccion) {
        cerca(fila.saldoPendiente, anterior - fila.cuotas);
        anterior = fila.saldoPendiente;
      }
      cerca(anterior, 0);
    });

    it('CA-RF31-14 los meses son contiguos y los montos son coherentes', async () => {
      const { visa } = await sembrarEscenarioBase(e);
      const soloD = await tarjetaCon(
        [COMPRAS.D],
        [CARGOS.netflix, CARGOS.seguro],
        'SoloD',
      );

      for (const tarjeta of [visa, soloD]) {
        const { status, body } = await e.proyeccion(tarjeta, MES);

        expect(status).toBe(200);
        const meses = body.proyeccion.map((fila: { mes: string }) => fila.mes);
        expect(meses).toEqual(mesesDe('2027-01', meses.at(-1)));
        for (const fila of [body, ...body.proyeccion]) {
          cerca(fila.total, fila.cuotas + fila.cargosFijos);
          for (const monto of [
            fila.cuotas,
            fila.cargosFijos,
            fila.total,
            fila.saldoPendiente,
          ]) {
            expect(Number.isFinite(monto)).toBe(true);
            expect(monto).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });

    it('CA-RF31-15 el mes siguiente de la proyección coincide con consultar ese mes', async () => {
      const { visa } = await sembrarEscenarioBase(e);

      const diciembre = await e.proyeccion(visa, MES);
      const enero = await e.proyeccion(visa, 'mes=2027-01');

      expect(diciembre.status).toBe(200);
      expect(enero.status).toBe(200);
      const [primero, ...resto] = diciembre.body.proyeccion;
      const { proyeccion } = enero.body;
      // Los montos se comparan con 6 decimales: dos formas de sumar los mismos números pueden diferir en el último bit.
      const sonIguales = (actual: any, esperado: any) => {
        expect(actual.mes).toBe(esperado.mes);
        for (const campo of ['cuotas', 'cargosFijos', 'total', 'saldoPendiente'])
          cerca(actual[campo], esperado[campo], 6);
      };
      expect(primero.mes).toBe('2027-01');
      sonIguales(enero.body, primero);
      expect(proyeccion).toHaveLength(resto.length);
      resto.forEach((fila: unknown, indice: number) => {
        sonIguales(proyeccion[indice], fila);
      });
    });
  });

});
