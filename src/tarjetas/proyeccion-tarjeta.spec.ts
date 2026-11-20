import {
  CARGOS,
  CARGOS_ACTIVOS,
  COMPRAS,
  CUOTA,
  type CompraDePrueba,
  SUMA_CUOTAS_BASE,
  TABLA_BASE,
  comoEntrada,
  mesesDe,
} from '../../test/tarjetas/escenario-proyeccion.js';
import { calcularProyeccion } from './proyeccion-tarjeta.js';

// Paquete 5.3.1 (RF-30, RF-31): total del mes, saldo pendiente y proyección de una tarjeta.
// Es una función pura: no hay Nest, ni base, ni red. Los valores vienen de criterios/05-tarjetas.md.
describe('Cálculo del total del mes y de la proyección de una tarjeta', () => {
  type Entrada = ReturnType<typeof comoEntrada>;
  type Cargo = { valor: number; activo: boolean };

  const compras = (...datos: CompraDePrueba[]): Entrada[] =>
    datos.map(comoEntrada);
  const A = COMPRAS.A;
  const B = COMPRAS.B;
  const C = COMPRAS.C;
  const D = COMPRAS.D;
  const E = COMPRAS.E;
  const F = COMPRAS.F;
  const G = COMPRAS.G;
  const NETFLIX_Y_SEGURO: Cargo[] = [CARGOS.netflix, CARGOS.seguro];
  const LOS_TRES: Cargo[] = [CARGOS.netflix, CARGOS.seguro, CARGOS.gimnasio];

  const proyectar = (
    mes: unknown,
    lista: unknown[],
    cargos: unknown[] = [],
  ) => calcularProyeccion({ mes, compras: lista, cargos } as never);

  /** `toBeCloseTo` comprobando antes que sea un número finito. */
  const cerca = (actual: unknown, esperado: number, decimales = 6) => {
    expect(typeof actual).toBe('number');
    expect(Number.isFinite(actual)).toBe(true);
    expect(actual as number).toBeCloseTo(esperado, decimales);
  };

  /** Lo que lanzó `accion`, o `undefined` si no lanzó nada. */
  const errorDe = (accion: () => unknown): unknown => {
    try {
      accion();
    } catch (error) {
      return error;
    }
    return undefined;
  };

  const siguiente = (mes: string) => mesesDe(mes, '2100-01')[1];

  const baseCompleta = () => proyectar('2026-12', compras(A, B, C), LOS_TRES);

  describe('RF-30: el total del mes', () => {
    it('CA-RF30-01 calcula el total del mes de la compra de referencia de la hoja del promotor', () => {
      const resultado = proyectar('2026-12', compras(A));

      expect(resultado.mes).toBe('2026-12');
      cerca(resultado.cuotas, 119802.13, 2);
      expect(resultado.cargosFijos).toBe(0);
      cerca(resultado.total, 119802.13, 2);
    });

    it('CA-RF30-02 los montos llegan con precisión completa, sin redondear', () => {
      const { cuotas, total } = proyectar('2026-12', compras(A));

      cerca(cuotas, 119802.1331718775, 6);
      cerca(total, 119802.1331718775, 6);
      for (const monto of [cuotas, total]) {
        expect(monto).not.toBe(119802.13);
        expect(monto).not.toBe(119802);
      }
    });

    it('CA-RF30-03 suma las cuotas de varias compras y avances y los cargos activos', () => {
      const resultado = baseCompleta();

      expect(resultado.mes).toBe('2026-12');
      cerca(resultado.cuotas, 291270.05016469);
      expect(resultado.cargosFijos).toBe(55000);
      cerca(resultado.total, 346270.05016469);
    });

    it('CA-RF30-04 cada compra usa su propia tasa: la de la tarjeta no recalcula las anteriores', () => {
      const resultado = proyectar('2026-12', compras(A, F));

      cerca(resultado.cuotas, 240464.30348614);
      cerca(resultado.total, 240464.30348614);
    });

    it('CA-RF30-05 la bandera de una sola cuota sin interés es la de cada compra', () => {
      const ochenta = (cuotas: number, bandera: boolean): CompraDePrueba => ({
        ...C,
        cuotas,
        cuotaUnicaSinInteres: bandera,
      });

      const conBandera = proyectar(
        '2026-12',
        compras(ochenta(1, true), ochenta(2, true)),
      );
      const sinBandera = proyectar('2026-12', compras(ochenta(1, false)));
      const mezcla = proyectar(
        '2026-12',
        compras(ochenta(1, true), ochenta(1, false)),
      );

      // 80000 de la cuota única sin interés más la de 2 cuotas, que sí lleva interés: la bandera solo exime la cuota única.
      cerca(conBandera.cuotas, 80000 + CUOTA.OCHENTA_A_2);
      cerca(conBandera.cuotas, 121299.733493);
      cerca(sinBandera.cuotas, 81726.831931);
      cerca(mezcla.cuotas, 80000 + CUOTA.C);
    });

    it('CA-RF30-06 con tasa cero, las cuotas son el valor entre el número de cuotas', () => {
      const resultado = proyectar('2026-12', compras(G));

      expect(resultado.cuotas).toBe(10000);
      expect(resultado.total).toBe(10000);
    });

    it('CA-RF30-07 los cargos fijos activos suman y los inactivos no', () => {
      const conInactivo = proyectar('2026-12', compras(A), LOS_TRES);
      const conTodosActivos = proyectar('2026-12', compras(A), [
        CARGOS.netflix,
        CARGOS.seguro,
        { ...CARGOS.gimnasio, activo: true },
      ]);

      expect(conInactivo.cargosFijos).toBe(55000);
      cerca(conInactivo.total, 174802.13317188);
      expect(conTodosActivos.cargosFijos).toBe(115000);
    });

    it('CA-RF30-08 una tarjeta solo con cargos fijos', () => {
      const resultado = proyectar('2026-12', [], NETFLIX_Y_SEGURO);

      expect(resultado.cuotas).toBe(0);
      expect(resultado.cargosFijos).toBe(55000);
      expect(resultado.total).toBe(55000);
      expect(resultado.saldoPendiente).toBe(0);
      expect(resultado.proyeccion).toEqual([]);
    });

    it('CA-RF30-09 una tarjeta sin compras ni cargos activos: el total es cero', () => {
      const vacia = proyectar('2026-12', []);
      const soloInactivos = proyectar('2026-12', [], [CARGOS.gimnasio]);

      for (const resultado of [vacia, soloInactivos]) {
        expect(resultado.mes).toBe('2026-12');
        expect(resultado.cuotas).toBe(0);
        expect(resultado.cargosFijos).toBe(0);
        expect(resultado.total).toBe(0);
        expect(resultado.saldoPendiente).toBe(0);
        expect(resultado.proyeccion).toEqual([]);
      }
    });

    it.each([
      ['2026-11', 0],
      ['2026-12', 119802.133172],
      ['2027-11', 119802.133172],
      ['2027-12', 0],
    ])(
      'CA-RF30-10 la vigencia incluye el mes del primer pago y el del último: en %s las cuotas son %d',
      (mes, esperado) => {
        const { cuotas } = proyectar(mes, compras(A));

        cerca(cuotas, esperado);
      },
    );

    it.each([
      ['2026-12', 119802.133172],
      ['2027-01', 119802.133172],
      ['2027-02', 203280.38034],
    ])(
      'CA-RF30-11 una compra con el primer pago en un mes futuro no cuenta todavía: en %s las cuotas son %d',
      (mes, esperado) => {
        const { cuotas } = proyectar(mes, compras(A, D));

        cerca(cuotas, esperado);
      },
    );

    it.each([
      ['2026-10', 51624.666866],
      ['2026-11', 0],
      ['2026-12', 119802.133172],
    ])(
      'CA-RF30-12 una compra ya terminada no cuenta: en %s las cuotas son %d',
      (mes, esperado) => {
        const { cuotas } = proyectar(mes, compras(E, A));

        cerca(cuotas, esperado);
      },
    );

    it('CA-RF30-13 la vigencia la decide el mes del primer pago, no la fecha de la compra', () => {
      const hechaAFinDeAnio: CompraDePrueba = {
        ...A,
        fecha: '2026-12-31',
        primerPago: '2027-01',
      };
      const hechaAntes: CompraDePrueba = { ...A, fecha: '2026-06-15' };

      const soloAntes = proyectar('2026-12', compras(hechaAntes));
      const soloFinDeAnio = proyectar('2026-12', compras(hechaAFinDeAnio));
      const enEnero = proyectar(
        '2027-01',
        compras(hechaAFinDeAnio, hechaAntes),
      );

      cerca(soloFinDeAnio.cuotas, 0);
      cerca(soloAntes.cuotas, 119802.133172);
      cerca(enEnero.cuotas, 2 * 119802.133172);
    });

    it('CA-RF30-14 se puede consultar un mes pasado', () => {
      const resultado = proyectar('2026-10', compras(E, A), LOS_TRES);

      cerca(resultado.cuotas, 51624.666866);
      expect(resultado.cargosFijos).toBe(55000);
      cerca(resultado.total, 106624.666866);
    });

    it('CA-RF30-31 rechaza entradas inválidas con RangeError y no modifica lo que recibe', () => {
      const valida = compras(A);
      const invalidas: Array<[string, unknown, string]> = [
        ['cuotas', { ...valida[0], cuotas: 0 }, 'cuotas'],
        ['valor', { ...valida[0], valor: -1 }, 'valor'],
        [
          'primerPago',
          { ...valida[0], primerPago: new Date('no-es-una-fecha') },
          'primerPago',
        ],
      ];

      for (const [, compra, campo] of invalidas) {
        const error = errorDe(() => proyectar('2026-12', [compra]));
        expect(error).toBeInstanceOf(RangeError);
        expect((error as Error).message).toContain(campo);
      }
      for (const mes of ['2026-13', '2026-1', 202612]) {
        const error = errorDe(() => proyectar(mes, valida));
        expect(error).toBeInstanceOf(RangeError);
        expect((error as Error).message).toContain('mes');
      }

      // Con una entrada válida, ni las compras ni los cargos (ni sus objetos) quedan modificados.
      const cargos = LOS_TRES.map((cargo) => ({ ...cargo }));
      const copiaCompras = structuredClone(valida);
      const copiaCargos = structuredClone(cargos);
      const congelar = (valor: unknown) => {
        Object.freeze(valor);
        if (valor instanceof Date) return;
        for (const dentro of Object.values(valor as object)) {
          if (typeof dentro === 'object' && dentro !== null) congelar(dentro);
        }
      };
      congelar(valida);
      congelar(cargos);

      const resultado = proyectar('2026-12', valida, cargos);

      expect(Number.isFinite(resultado.total)).toBe(true);
      expect(valida).toEqual(copiaCompras);
      expect(cargos).toEqual(copiaCargos);
    });
  });

  describe('RF-31: la proyección y el saldo pendiente', () => {
    it('CA-RF31-01 la proyección de la compra de referencia', () => {
      const { proyeccion } = proyectar('2026-12', compras(A));

      expect(proyeccion.map((fila: { mes: string }) => fila.mes)).toEqual(
        mesesDe('2027-01', '2027-11'),
      );
      expect(proyeccion).toHaveLength(11);
      for (const fila of proyeccion) {
        cerca(fila.cuotas, 119802.13, 2);
        expect(fila.cargosFijos).toBe(0);
        expect(fila.total).toBe(fila.cuotas);
      }
      expect(proyeccion[10].mes).toBe('2027-11');
    });

    it('CA-RF31-02 las cuotas de la proyección bajan cuando termina cada compra', () => {
      const { proyeccion } = baseCompleta();

      expect(proyeccion).toHaveLength(11);
      TABLA_BASE.slice(1).forEach((esperado, indice) => {
        expect(proyeccion[indice].mes).toBe(esperado.mes);
        cerca(proyeccion[indice].cuotas, esperado.cuotas);
        cerca(proyeccion[indice].total, esperado.total);
      });
    });

    it('CA-RF31-03 los cargos fijos activos se repiten en cada mes proyectado', () => {
      const conCargos = proyectar('2026-12', compras(A, B, C), LOS_TRES);
      const sinCargosActivos = proyectar('2026-12', compras(A, B, C), [
        { ...CARGOS.netflix, activo: false },
        { ...CARGOS.seguro, activo: false },
        CARGOS.gimnasio,
      ]);

      expect(conCargos.cargosFijos).toBe(CARGOS_ACTIVOS);
      expect(conCargos.proyeccion).toHaveLength(11);
      for (const fila of conCargos.proyeccion)
        expect(fila.cargosFijos).toBe(CARGOS_ACTIVOS);
      expect(sinCargosActivos.cargosFijos).toBe(0);
      expect(sinCargosActivos.proyeccion).toHaveLength(11);
      for (const fila of sinCargosActivos.proyeccion)
        expect(fila.cargosFijos).toBe(0);
    });

    it('CA-RF31-04 la proyección llega hasta el último pago más lejano y los cargos no la extienden', () => {
      // El orden de las compras no importa: D (termina en 2027-04) va después de A (2027-11) y antes.
      const aLuegoD = proyectar('2026-12', compras(A, D), NETFLIX_Y_SEGURO);
      const dLuegoA = proyectar('2026-12', compras(D, A), NETFLIX_Y_SEGURO);
      const soloCargos = proyectar('2026-12', [], NETFLIX_Y_SEGURO);

      for (const resultado of [aLuegoD, dLuegoA]) {
        expect(resultado.proyeccion.at(-1)?.mes).toBe('2027-11');
        expect(resultado.proyeccion).toHaveLength(11);
      }
      expect(soloCargos.proyeccion).toEqual([]);
    });

    it('CA-RF31-05 un mes de referencia en el último pago o después: solo cargos y saldo cero', () => {
      const enElUltimo = proyectar('2027-11', compras(A, B, C), LOS_TRES);
      const despues = proyectar('2027-12', compras(A, B, C), LOS_TRES);

      cerca(enElUltimo.cuotas, 119802.133172);
      expect(enElUltimo.saldoPendiente).toBe(0);
      expect(enElUltimo.proyeccion).toEqual([]);
      expect(despues.cuotas).toBe(0);
      expect(despues.cargosFijos).toBe(55000);
      expect(despues.total).toBe(55000);
      expect(despues.saldoPendiente).toBe(0);
      expect(despues.proyeccion).toEqual([]);
    });

    it('CA-RF31-06 un mes de referencia anterior al primer pago: nada vence todavía, todo está por pagar', () => {
      const resultado = proyectar('2026-11', compras(A), NETFLIX_Y_SEGURO);

      expect(resultado.cuotas).toBe(0);
      expect(resultado.total).toBe(55000);
      cerca(resultado.saldoPendiente, 1437625.598063);
      expect(resultado.proyeccion.map((fila) => fila.mes)).toEqual(
        mesesDe('2026-12', '2027-11'),
      );
      for (const fila of resultado.proyeccion)
        cerca(fila.cuotas, 119802.133172);
    });

    it('CA-RF31-07 los meses sin cuotas entre medias aparecen en la proyección', () => {
      const resultado = proyectar('2026-12', compras(D), NETFLIX_Y_SEGURO);

      expect(resultado.cuotas).toBe(0);
      expect(resultado.total).toBe(55000);
      expect(resultado.proyeccion.map((fila) => fila.mes)).toEqual([
        '2027-01',
        '2027-02',
        '2027-03',
        '2027-04',
      ]);
      const [enero, ...conCuota] = resultado.proyeccion;
      expect(enero.cuotas).toBe(0);
      expect(enero.total).toBe(55000);
      for (const fila of conCuota) {
        cerca(fila.cuotas, 83478.247168);
        cerca(fila.total, 138478.247168);
      }
    });

    it('CA-RF31-08 el saldo después del pago del mes es la suma de las cuotas de los meses siguientes', () => {
      const { saldoPendiente, proyeccion } = baseCompleta();

      cerca(saldoPendiente, 1766528.890201);
      const suma = proyeccion.reduce((acumulado, fila) => acumulado + fila.cuotas, 0);
      cerca(saldoPendiente, suma);
      // No suma los cargos fijos ni la cuota del mes de referencia.
      cerca(saldoPendiente, SUMA_CUOTAS_BASE - TABLA_BASE[0].cuotas);
    });

    it('CA-RF31-09 el saldo de cada mes de la proyección baja hasta cero', () => {
      const resultado = baseCompleta();

      TABLA_BASE.slice(1).forEach((esperado, indice) => {
        cerca(resultado.proyeccion[indice].saldoPendiente, esperado.saldoPendiente);
      });
      // Cada saldo es el anterior (empezando por el del mes de referencia) menos las cuotas de su mes.
      let anterior = resultado.saldoPendiente;
      for (const fila of resultado.proyeccion) {
        cerca(fila.saldoPendiente, anterior - fila.cuotas);
        anterior = fila.saldoPendiente;
      }
      cerca(resultado.proyeccion.at(-1)?.saldoPendiente, 0);
    });

    it('CA-RF31-10 los cargos fijos no son parte del saldo', () => {
      const soloCargos = proyectar('2026-12', [], NETFLIX_Y_SEGURO);
      const conCargos = proyectar('2026-12', compras(A, B, C), LOS_TRES);
      const sinCargos = proyectar('2026-12', compras(A, B, C));

      expect(soloCargos.saldoPendiente).toBe(0);
      cerca(conCargos.saldoPendiente, 1766528.890201);
      cerca(conCargos.saldoPendiente, sinCargos.saldoPendiente);
      conCargos.proyeccion.forEach((fila, indice) => {
        cerca(fila.saldoPendiente, sinCargos.proyeccion[indice].saldoPendiente);
      });
    });

    it('CA-RF31-11 el saldo incluye las compras futuras completas y no cuenta las terminadas', () => {
      const lista = compras(A, D, E);

      const enDiciembre = proyectar('2026-12', lista);
      const enFebrero = proyectar('2027-02', lista);

      // 11·A más las 3 cuotas de D; E aporta 0.
      cerca(enDiciembre.saldoPendiente, 1568258.206394);
      // 9·A más las 2 cuotas que le quedan a D.
      cerca(enFebrero.saldoPendiente, 1245175.692883);
    });

    it('CA-RF31-12 el saldo con tasa cero y con una sola cuota sin interés', () => {
      const cero = compras(G);
      const debito = compras({
        ...C,
        valor: 80000,
        cuotaUnicaSinInteres: true,
      } as CompraDePrueba);

      cerca(proyectar('2026-12', cero).saldoPendiente, 110000);
      cerca(proyectar('2027-11', cero).saldoPendiente, 0);
      const antes = proyectar('2026-11', debito);
      const durante = proyectar('2026-12', debito);

      expect(antes.cuotas).toBe(0);
      cerca(antes.saldoPendiente, 80000);
      expect(antes.proyeccion).toHaveLength(1);
      expect(antes.proyeccion[0].mes).toBe('2026-12');
      cerca(antes.proyeccion[0].cuotas, 80000);
      cerca(durante.saldoPendiente, 0);
    });

    it('CA-RF31-13 el saldo suma las compras con tasas distintas', () => {
      const { saldoPendiente } = proyectar('2026-12', compras(A, F));

      // 11·A + 11·F, cada compra con su tasa.
      cerca(saldoPendiente, 11 * (CUOTA.A + CUOTA.F));
      cerca(saldoPendiente, 2645107.338348);
    });

    it('CA-RF31-14 los meses son contiguos y los montos son coherentes', () => {
      const escenarios = [
        baseCompleta(),
        proyectar('2026-12', compras(D), NETFLIX_Y_SEGURO),
        proyectar('2026-11', compras(A, D), LOS_TRES),
      ];

      for (const resultado of escenarios) {
        const meses = resultado.proyeccion.map((fila) => fila.mes);
        // El primer elemento es el mes siguiente al de referencia y cada uno es el siguiente del anterior (cruza el año).
        if (meses.length > 0)
          expect(meses).toEqual(
            mesesDe(siguiente(resultado.mes), meses.at(-1) as string),
          );
        for (const fila of [resultado, ...resultado.proyeccion]) {
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

    it('CA-RF31-16 la proyección y el saldo llegan con precisión completa', () => {
      const resultado = baseCompleta();

      expect(Number.isInteger(resultado.saldoPendiente)).toBe(false);
      expect(resultado.saldoPendiente).not.toBe(1766528.89);
      expect(resultado.saldoPendiente).not.toBe(1766529);
      for (const fila of resultado.proyeccion.slice(0, 5)) {
        expect(Number.isInteger(fila.cuotas)).toBe(false);
        expect(fila.cuotas).not.toBe(209543.22);
      }
    });
  });
});
