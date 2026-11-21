import { randomUUID } from 'node:crypto';
import {
  OTRO_USUARIO_ID,
  cerca,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';
import {
  CLAVES_DE_UN_ELEMENTO,
  CLAVES_NIVEL_SUPERIOR_CON_DETALLE,
  CLAVES_PROHIBIDAS_DEL_ELEMENTO,
  DETALLE_BASE,
  type ElementoDelDetalle,
  afirmarDetalle,
  afirmarDetalleSinOrden,
  detalleBaseDe,
  elementoDe,
} from '../../test/tarjetas/escenario-detalle.js';
import { sembrarEscenarioConAvanceReal } from '../../test/tarjetas/escenario-pagos.js';
import {
  CARGOS,
  COMPRAS,
  CUOTA,
  TABLA_BASE,
  type CompraDePrueba,
  mesesDe,
  sembrarCargoDe,
  sembrarCompraDe,
  sembrarEscenarioBase,
} from '../../test/tarjetas/escenario-proyeccion.js';

const MES = 'mes=2026-12';
const CLAVES_DE_UN_MES = [
  'cargosFijos',
  'cuotas',
  'mes',
  'saldoPendiente',
  'total',
];

// Paquete 5.3.6 (RF-31): `detalle` en el nivel superior de GET /tarjetas/:tarjetaId/proyeccion, el detalle por compra
// de las cuotas vigentes en el mes de referencia. La matriz del cálculo está en detalle-cuotas.spec.ts (función pura).
describe('GET /tarjetas/:tarjetaId/proyeccion: detalle por compra (integración)', () => {
  const e = usarEntornoCompras();

  /** «Visa» del usuario con las compras (y cargos) dados, sembrados en orden; devuelve la tarjeta y los ids de las compras. */
  const tarjetaCon = async (
    compras: CompraDePrueba[],
    cargos: Array<(typeof CARGOS)[keyof typeof CARGOS]> = [],
    nombre = 'Visa',
  ) => {
    const tarjeta = await e.sembrarTarjeta({ nombre, tasaEA: 0.2921 });
    const ids: string[] = [];
    for (const compra of compras)
      ids.push(await sembrarCompraDe(e, tarjeta, compra));
    for (const cargo of cargos) await sembrarCargoDe(e, tarjeta, cargo);
    return { tarjeta, ids };
  };

  const detalleDe = async (tarjeta: string, consulta = MES) => {
    const { status, body } = await e.proyeccion(tarjeta, consulta);
    expect(status).toBe(200);
    return body.detalle as ElementoDelDetalle[];
  };

  const deLaCompra = (detalle: ElementoDelDetalle[], id: string) =>
    detalle.find((elemento) => elemento.compraId === id) as ElementoDelDetalle;

  describe('La forma', () => {
    it('CA-RF31-17 la forma de cada elemento del detalle', async () => {
      const { visa, compras } = await sembrarEscenarioBase(e);

      const detalle = await detalleDe(visa);

      expect(detalle).toHaveLength(3);
      const ids = Object.values(compras);
      for (const elemento of detalle) {
        expect(Object.keys(elemento).sort()).toEqual(CLAVES_DE_UN_ELEMENTO);
        for (const campo of ['compraId', 'descripcion', 'tipo'])
          expect(typeof (elemento as unknown as Record<string, unknown>)[campo]).toBe('string');
        for (const campo of ['numeroCuota', 'totalCuotas', 'cuota'])
          expect(typeof (elemento as unknown as Record<string, unknown>)[campo]).toBe('number');
        expect(ids).toContain(elemento.compraId);
        for (const prohibida of CLAVES_PROHIBIDAS_DEL_ELEMENTO)
          expect(elemento).not.toHaveProperty(prohibida);
      }
    });

    it('CA-RF31-18 el nivel superior pasa a diez claves y las filas de la proyección no cambian', async () => {
      const { visa } = await sembrarEscenarioBase(e);

      const { status, body } = await e.proyeccion(visa, MES);

      expect(status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(CLAVES_NIVEL_SUPERIOR_CON_DETALLE);
      expect(body.proyeccion).toHaveLength(11);
      for (const fila of body.proyeccion) {
        expect(Object.keys(fila).sort()).toEqual(CLAVES_DE_UN_MES);
        expect(fila).not.toHaveProperty('detalle');
      }
    });
  });

  describe('El caso de referencia y la precisión', () => {
    it('CA-RF31-19 la compra de referencia de la hoja del promotor: cuota 1 de 12', async () => {
      const { tarjeta, ids } = await tarjetaCon([COMPRAS.A]);

      const { status, body } = await e.proyeccion(tarjeta, MES);

      expect(status).toBe(200);
      afirmarDetalle(body.detalle, [elementoDe('A', ids[0], 1)], 2);
      expect(body.detalle[0].cuota).toBeCloseTo(119802.13, 2);
      cerca(body.detalle[0].cuota, body.cuotas, 9);
    });

    it('CA-RF31-20 la cuota llega con precisión completa, sin redondear', async () => {
      const { tarjeta } = await tarjetaCon([COMPRAS.A]);

      const [elemento] = await detalleDe(tarjeta);

      cerca(elemento.cuota, 119802.1331718775, 6);
      expect(elemento.cuota).not.toBe(119802.13);
      expect(elemento.cuota).not.toBe(119802);
    });
  });

  describe('Qué compras aparecen y con qué cuota', () => {
    it('CA-RF31-21 el escenario base: una cuota por compra o avance, en el mes de referencia', async () => {
      const { visa, compras } = await sembrarEscenarioBase(e);

      const detalle = await detalleDe(visa);

      afirmarDetalle(detalle, detalleBaseDe('2026-12', compras));
      expect(detalle.map((elemento) => elemento.compraId)).toEqual([
        compras.C,
        compras.B,
        compras.A,
      ]);
      expect(detalle[1].tipo).toBe('AVANCE');
      expect(detalle[1].descripcion).toBe('Avance en efectivo');
    });

    it('CA-RF31-22 el número de cuota avanza un mes a la vez, cruza el año y llega a la última', async () => {
      const { visa, compras } = await sembrarEscenarioBase(e);

      for (const mes of Object.keys(DETALLE_BASE)) {
        afirmarDetalle(
          await detalleDe(visa, `mes=${mes}`),
          detalleBaseDe(mes, compras),
        );
      }
    });

    it('CA-RF31-23 antes del primer pago y después del último no hay elementos', async () => {
      const { tarjeta } = await tarjetaCon(
        [COMPRAS.A],
        [CARGOS.netflix, CARGOS.seguro],
      );

      const antes = await e.proyeccion(tarjeta, 'mes=2026-11');
      const despues = await e.proyeccion(tarjeta, 'mes=2027-12');

      for (const { status, body } of [antes, despues]) {
        expect(status).toBe(200);
        expect(body.detalle).toEqual([]);
        expect(body.cuotas).toBe(0);
        expect(body.cargosFijos).toBe(55000);
      }
      cerca(antes.body.saldoPendiente, 12 * CUOTA.A, 6);
      expect(despues.body.saldoPendiente).toBe(0);
    });

    it('CA-RF31-25 cuenta el mes del primer pago, no la fecha de la compra', async () => {
      const { tarjeta, ids } = await tarjetaCon([
        { ...COMPRAS.A, fecha: '2026-12-31', primerPago: '2027-01' },
        { ...COMPRAS.A, fecha: '2026-06-15', primerPago: '2026-12' },
      ]);

      const diciembre = await detalleDe(tarjeta, 'mes=2026-12');
      const enero = await detalleDe(tarjeta, 'mes=2027-01');

      afirmarDetalle(diciembre, [elementoDe('A', ids[1], 1)]);
      afirmarDetalle(enero, [elementoDe('A', ids[0], 1), elementoDe('A', ids[1], 2)]);
    });

    it('CA-RF31-26 una sola cuota y la bandera cuotaUnicaSinInteres son las de cada compra', async () => {
      const debito = await e.sembrarTarjeta({
        nombre: 'Débito',
        tasaEA: 0.2921,
        cuotaUnicaSinInteres: true,
      });
      const visa = await e.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });
      const crear = async (tarjeta: string, cuotas: number) => {
        const respuesta = await e.crearCompra(
          tarjeta,
          e.compraBase({ valor: 80000, cuotas }),
        );
        expect(respuesta.status).toBe(201);
        return respuesta.body.id as string;
      };
      const deUnaCuota = await crear(debito, 1);
      const dedosCuotas = await crear(debito, 2);
      const deVisa = await crear(visa, 1);

      const enDebito = await detalleDe(debito);
      const enVisa = await detalleDe(visa);
      const cambio = await e.editarTarjeta(debito, { cuotaUnicaSinInteres: false });
      const enDebitoDespues = await detalleDe(debito);

      expect(deLaCompra(enDebito, deUnaCuota)).toMatchObject({
        numeroCuota: 1,
        totalCuotas: 1,
        cuota: 80000,
      });
      expect(deLaCompra(enDebito, dedosCuotas)).toMatchObject({
        numeroCuota: 1,
        totalCuotas: 2,
      });
      cerca(deLaCompra(enDebito, dedosCuotas).cuota, 41299.73349318, 6);
      expect(deLaCompra(enVisa, deVisa)).toMatchObject({ numeroCuota: 1, totalCuotas: 1 });
      cerca(deLaCompra(enVisa, deVisa).cuota, 81726.83193074, 6);
      expect(cambio.status).toBe(200);
      expect(deLaCompra(enDebitoDespues, deUnaCuota).cuota).toBe(80000);
      cerca(deLaCompra(enDebitoDespues, dedosCuotas).cuota, 41299.73349318, 6);
    });

    it('CA-RF31-28 cada compra muestra su propia tasa: cambiar la de la tarjeta no recalcula las anteriores', async () => {
      const visa = await e.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });
      const a = await e.crearCompra(visa, e.compraBase());
      const cambio = await e.editarTarjeta(visa, { tasaEA: 0.31 });
      const f = await e.crearCompra(visa, e.compraBase());
      expect(a.status).toBe(201);
      expect(cambio.status).toBe(200);
      expect(f.status).toBe(201);

      const { status, body } = await e.proyeccion(visa, MES);
      const otraTasa = await e.editarTarjeta(visa, { tasaEA: 0.4 });
      const despues = await detalleDe(visa);

      expect(status).toBe(200);
      expect(otraTasa.status).toBe(200);
      // F (0,31) se creó después: va primero.
      // (Creadas por la API: la descripción es la de `compraBase`, «Televisor».)
      afirmarDetalle(body.detalle, [
        { ...elementoDe('F', f.body.id, 1), descripcion: 'Televisor' },
        { ...elementoDe('A', a.body.id, 1), descripcion: 'Televisor' },
      ]);
      afirmarDetalle(despues, body.detalle);
      cerca(body.detalle[0].cuota + body.detalle[1].cuota, body.cuotas, 6);
      cerca(body.cuotas, 240464.30348614, 6);
    });

    it('CA-RF31-29 dos compras idénticas son dos elementos', async () => {
      const visa = await e.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });
      const primera = await e.crearCompra(visa, e.compraBase(), { clave: randomUUID() });
      const segunda = await e.crearCompra(visa, e.compraBase(), { clave: randomUUID() });
      expect(primera.status).toBe(201);
      expect(segunda.status).toBe(201);

      const { body } = await e.proyeccion(visa, MES);

      expect(body.detalle).toHaveLength(2);
      expect(body.detalle[0].compraId).not.toBe(body.detalle[1].compraId);
      expect(
        body.detalle.map((elemento: ElementoDelDetalle) => elemento.compraId).sort(),
      ).toEqual([primera.body.id, segunda.body.id].sort());
      expect(body.detalle[0].cuota).toBe(body.detalle[1].cuota);
      cerca(body.detalle[0].cuota + body.detalle[1].cuota, body.cuotas, 6);
    });

    it('CA-RF31-30 los cargos fijos no aparecen en el detalle', async () => {
      const { visa } = await sembrarEscenarioBase(e);
      const { tarjeta: soloCargos } = await tarjetaCon(
        [],
        [CARGOS.netflix, CARGOS.seguro],
        'Solo cargos',
      );

      const conCompras = await e.proyeccion(visa, MES);
      const sinCompras = await e.proyeccion(soloCargos, MES);

      expect(conCompras.body.detalle).toHaveLength(3);
      expect(conCompras.body.cargosFijos).toBe(55000);
      const descripciones = conCompras.body.detalle.map(
        (elemento: ElementoDelDetalle) => elemento.descripcion,
      );
      for (const cargo of ['Netflix', 'Seguro', 'Gimnasio'])
        expect(descripciones).not.toContain(cargo);
      expect(sinCompras.status).toBe(200);
      expect(sinCompras.body.detalle).toEqual([]);
      expect(sinCompras.body.cargosFijos).toBe(55000);
    });

    it('CA-RF31-31 una tarjeta sin compras tiene el detalle vacío', async () => {
      const vacia = await e.sembrarTarjeta({ nombre: 'Vacía' });

      const { status, body } = await e.proyeccion(vacia, MES);

      expect(status).toBe(200);
      expect(body.detalle).toEqual([]);
      expect(body.cuotas).toBe(0);
      expect(body.total).toBe(0);
      expect(body.saldoPendiente).toBe(0);
      expect(body.proyeccion).toEqual([]);
    });

    it('CA-RF31-32 solo cuentan las compras de esa tarjeta y de ese usuario', async () => {
      const visaDeA = await e.sembrarTarjeta({ nombre: 'Visa' });
      const idDeA = await sembrarCompraDe(e, visaDeA, COMPRAS.A);
      const debito = await e.sembrarTarjeta({ nombre: 'Débito' });
      await sembrarCompraDe(e, debito, COMPRAS.C);
      const visaDeB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
      const idDeB = await sembrarCompraDe(e, visaDeB, COMPRAS.A, OTRO_USUARIO_ID);

      const deA = await e.proyeccion(visaDeA, MES);
      const deB = await e.proyeccion(visaDeB, MES, { token: e.tokenOtro });

      expect(deA.status).toBe(200);
      afirmarDetalle(deA.body.detalle, [elementoDe('A', idDeA, 1)]);
      expect(deB.status).toBe(200);
      afirmarDetalle(deB.body.detalle, [elementoDe('A', idDeB, 1)]);
      expect(idDeA).not.toBe(idDeB);
    });
  });

  describe('El orden y el texto', () => {
    it('CA-RF31-33 las más recientes primero, en el mismo orden que el listado de compras', async () => {
      const { visa, compras } = await sembrarEscenarioBase(e);
      const { tarjeta: otra, ids } = await tarjetaCon(
        [
          { ...COMPRAS.A, fecha: '2026-11-10' },
          { ...COMPRAS.B, fecha: '2026-11-25' },
          { ...COMPRAS.C, fecha: '2026-10-01' },
        ],
        [],
        'Otra',
      );

      const mismaFecha = await detalleDe(visa);
      const fechasDistintas = await detalleDe(otra);
      const listado = async (tarjeta: string) =>
        (await e.listarCompras(tarjeta)).body.items.map(
          (compra: { id: string }) => compra.id,
        );

      const idsDe = (detalle: ElementoDelDetalle[]) =>
        detalle.map((elemento) => elemento.compraId);
      expect(idsDe(mismaFecha)).toEqual([compras.C, compras.B, compras.A]);
      expect(idsDe(fechasDistintas)).toEqual([ids[1], ids[0], ids[2]]);
      expect(idsDe(mismaFecha)).toEqual(await listado(visa));
      expect(idsDe(fechasDistintas)).toEqual(await listado(otra));
      expect(idsDe(await detalleDe(otra))).toEqual(idsDe(fechasDistintas));
    });

    it('CA-RF31-35 la descripción y el tipo son los de la compra', async () => {
      const visa = await e.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });
      const larga = 'a'.repeat(200);
      const crear = async (
        metodo: 'crearCompra' | 'crearAvance',
        cuerpo: Record<string, unknown>,
      ) => {
        const respuesta = await e[metodo](visa, cuerpo);
        expect(respuesta.status).toBe(201);
        return respuesta.body.id as string;
      };
      const recortada = await crear(
        'crearCompra',
        e.compraBase({ descripcion: '  Televisor 55  ' }),
      );
      const de200 = await crear('crearCompra', e.compraBase({ descripcion: larga }));
      const sinDescripcion = await crear('crearAvance', e.avanceBase());
      const conDescripcion = await crear(
        'crearAvance',
        e.avanceBase({ descripcion: 'Para el arriendo' }),
      );

      const detalle = await detalleDe(visa);

      expect(detalle).toHaveLength(4);
      expect(deLaCompra(detalle, recortada)).toMatchObject({
        descripcion: 'Televisor 55',
        tipo: 'COMPRA',
      });
      expect(deLaCompra(detalle, de200)).toMatchObject({ descripcion: larga, tipo: 'COMPRA' });
      expect(deLaCompra(detalle, sinDescripcion)).toMatchObject({
        descripcion: 'Avance en efectivo',
        tipo: 'AVANCE',
      });
      expect(deLaCompra(detalle, conDescripcion)).toMatchObject({
        descripcion: 'Para el arriendo',
        tipo: 'AVANCE',
      });
    });
  });

  describe('Coherencia con los totales', () => {
    it('CA-RF31-36 la suma de las cuotas del detalle es la del mes, mes a mes', async () => {
      const { visa } = await sembrarEscenarioBase(e);
      const cuotasPorMes = [3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1];

      for (const [indice, mes] of mesesDe('2026-12', '2027-11').entries()) {
        const { status, body } = await e.proyeccion(visa, `mes=${mes}`);

        expect(status).toBe(200);
        expect(body.detalle).toHaveLength(cuotasPorMes[indice]);
        const suma = body.detalle.reduce(
          (total: number, elemento: ElementoDelDetalle) => total + elemento.cuota,
          0,
        );
        cerca(suma, TABLA_BASE[indice].cuotas, 6);
        cerca(body.cuotas, TABLA_BASE[indice].cuotas, 6);
      }
    });

    it('CA-RF31-37 un mes muy pasado o muy futuro es válido y no tiene detalle', async () => {
      const { visa } = await sembrarEscenarioBase(e);

      const pasado = await e.proyeccion(visa, 'mes=2020-01');
      const futuro = await e.proyeccion(visa, 'mes=2099-12');

      expect(pasado.status).toBe(200);
      expect(pasado.body.detalle).toEqual([]);
      expect(pasado.body.cuotas).toBe(0);
      expect(pasado.body.proyeccion).toHaveLength(94);
      expect(futuro.status).toBe(200);
      expect(futuro.body.detalle).toEqual([]);
      expect(futuro.body.total).toBe(55000);
      expect(futuro.body.proyeccion).toEqual([]);
    });

    it('CA-RF31-38 el detalle es el del mes consultado', async () => {
      e.hoyEs('2026-12-15T12:00:00.000Z');
      const { visa, compras } = await sembrarEscenarioBase(e);

      const enero = await e.proyeccion(visa, 'mes=2027-01');
      const sinMes = await e.proyeccion(visa);

      afirmarDetalle(enero.body.detalle, detalleBaseDe('2027-01', compras));
      expect(sinMes.body.mes).toBe('2026-12');
      afirmarDetalle(sinMes.body.detalle, detalleBaseDe('2026-12', compras));
    });

    it('CA-RF31-38 sin mes, el detalle es el del mes actual según X-Zona-Horaria', async () => {
      e.hoyEs('2027-01-01T03:00:00.000Z');
      const { visa, compras } = await sembrarEscenarioBase(e);

      const sinHeader = await e.proyeccion(visa);
      const enBogota = await e.proyeccion(visa, '', { zona: 'America/Bogota' });

      expect(sinHeader.body.mes).toBe('2027-01');
      afirmarDetalle(sinHeader.body.detalle, detalleBaseDe('2027-01', compras));
      expect(enBogota.body.mes).toBe('2026-12');
      afirmarDetalle(enBogota.body.detalle, detalleBaseDe('2026-12', compras));
    });

    it('CA-RF31-39 agregar el detalle no cambia ningún otro valor', async () => {
      const { visa } = await sembrarEscenarioBase(e);

      const { status, body } = await e.proyeccion(visa, MES);

      expect(status).toBe(200);
      expect(body.mes).toBe('2026-12');
      cerca(body.cuotas, 291270.05016469, 6);
      expect(body.cargosFijos).toBe(55000);
      cerca(body.total, 346270.05016469, 6);
      cerca(body.saldoPendiente, 1766528.890201, 6);
      expect(body.pagado).toBe(0);
      cerca(body.diferencia, -346270.05016469, 6);
      expect(body.proyeccion).toHaveLength(11);
      body.proyeccion.forEach(
        (fila: Record<string, unknown>, indice: number) => {
          const esperada = TABLA_BASE[indice + 1];
          expect(fila.mes).toBe(esperada.mes);
          cerca(fila.cuotas, esperada.cuotas, 6);
          expect(fila.cargosFijos).toBe(55000);
          cerca(fila.total, esperada.total, 6);
          cerca(fila.saldoPendiente, esperada.saldoPendiente, 6);
        },
      );
    });
  });

  describe('Cambios en las compras', () => {
    it('CA-RF31-40 editar una compra o un avance se refleja en la siguiente consulta', async () => {
      const { visa, compras } = await sembrarEscenarioBase(e);
      afirmarDetalle(await detalleDe(visa), detalleBaseDe('2026-12', compras));

      const cuotas = await e.editarCompra(visa, compras.B, { cuotas: 3 });
      const descripcion = await e.editarCompra(visa, compras.A, {
        descripcion: 'Televisor 55 pulgadas',
      });
      const primerPago = await e.editarCompra(visa, compras.C, {
        primerPago: '2027-01',
      });
      const diciembre = await detalleDe(visa, 'mes=2026-12');
      const enero = await detalleDe(visa, 'mes=2027-01');

      expect(cuotas.status).toBe(200);
      expect(descripcion.status).toBe(200);
      expect(primerPago.status).toBe(200);
      const b = (numeroCuota: number): ElementoDelDetalle => ({
        ...elementoDe('B', compras.B, numeroCuota),
        totalCuotas: 3,
        cuota: CUOTA.B_A_3,
      });
      const a = (numeroCuota: number): ElementoDelDetalle => ({
        ...elementoDe('A', compras.A, numeroCuota),
        descripcion: 'Televisor 55 pulgadas',
      });
      afirmarDetalle(diciembre, [b(1), a(1)]);
      afirmarDetalle(enero, [elementoDe('C', compras.C, 1), b(2), a(2)]);
    });

    it('CA-RF31-41 eliminar una compra o un avance lo quita del detalle', async () => {
      const { visa, compras, avanceId } = await sembrarEscenarioConAvanceReal(e);
      expect(await detalleDe(visa)).toHaveLength(3);

      const eliminaC = await e.eliminarCompra(visa, compras.C);
      const eliminaAvance = await e.eliminarCompra(visa, avanceId);
      const { status, body } = await e.proyeccion(visa, MES);

      expect(eliminaC.status).toBe(204);
      expect(eliminaAvance.status).toBe(204);
      expect(status).toBe(200);
      afirmarDetalle(body.detalle, [elementoDe('A', compras.A, 1)]);
      cerca(body.cuotas, CUOTA.A, 6);
    });

    it('CA-RF31-42 los pagos y el dinero recibido del avance no cambian el detalle', async () => {
      const { visa, compras, avanceId } = await sembrarEscenarioConAvanceReal(e);
      const esperado = [
        elementoDe('A', compras.A, 1),
        elementoDe('B', avanceId, 1),
        elementoDe('C', compras.C, 1),
      ];
      const antes = await detalleDe(visa);
      afirmarDetalleSinOrden(antes, esperado);

      const pago = await e.crearPago(visa, e.pagoBase());
      await e.sembrarTransaccion();
      const { status, body } = await e.proyeccion(visa, MES);

      expect(pago.status).toBe(201);
      expect(status).toBe(200);
      expect(body.detalle).toEqual(antes);
      afirmarDetalleSinOrden(body.detalle, esperado);
      expect(body.pagado).toBe(300000);
      cerca(body.diferencia, -46270.050165, 6);
    });
  });
});
