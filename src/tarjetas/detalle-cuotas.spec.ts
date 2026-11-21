import {
  type ElementoDelDetalle,
  IDS_FUNCION as ID,
  afirmarDetalle,
  afirmarDetalleSinOrden,
  detalleBaseDe,
  elementoDe,
  entradaDeDetalle,
} from '../../test/tarjetas/escenario-detalle.js';
import {
  COMPRAS,
  CUOTA,
  TABLA_BASE,
  mesesDe,
} from '../../test/tarjetas/escenario-proyeccion.js';
import { calcularDetalleCuotas } from './detalle-cuotas.js';

// Paquete 5.3.6 (RF-31): el detalle por compra de las cuotas vigentes en un mes.
// Es una función pura: no hay Nest, ni base, ni red. Los valores vienen de criterios/05-tarjetas.md.
describe('Detalle por compra de las cuotas vigentes de un mes', () => {
  const { A, B, C, D, E, F, G } = COMPRAS;

  /** Las compras A, B y C del escenario base, creadas en ese orden (A primero). */
  const base = () => [
    entradaDeDetalle(A, ID.A, 0),
    entradaDeDetalle(B, ID.B, 1),
    entradaDeDetalle(C, ID.C, 2),
  ];
  const IDS_BASE = { A: ID.A, B: ID.B, C: ID.C };

  const detalle = (mes: unknown, compras: unknown[]) =>
    calcularDetalleCuotas({ mes, compras } as never) as ElementoDelDetalle[];

  /** Lo que lanzó `accion`, o `undefined` si no lanzó nada. */
  const errorDe = (accion: () => unknown): unknown => {
    try {
      accion();
    } catch (error) {
      return error;
    }
    return undefined;
  };

  describe('La compra de referencia y la precisión', () => {
    it('CA-RF31-19 la compra de referencia de la hoja del promotor: cuota 1 de 12', () => {
      const resultado = detalle('2026-12', [entradaDeDetalle(A, ID.A, 0)]);

      expect(resultado).toHaveLength(1);
      expect(resultado[0].tipo).toBe('COMPRA');
      expect(resultado[0].numeroCuota).toBe(1);
      expect(resultado[0].totalCuotas).toBe(12);
      expect(resultado[0].cuota).toBeCloseTo(119802.13, 2);
      afirmarDetalle(resultado, [elementoDe('A', ID.A, 1)], 2);
    });

    it('CA-RF31-20 la cuota llega con precisión completa, sin redondear', () => {
      const [elemento] = detalle('2026-12', [entradaDeDetalle(A, ID.A, 0)]);

      expect(elemento.cuota).toBeCloseTo(119802.1331718775, 6);
      expect(elemento.cuota).not.toBe(119802.13);
      expect(elemento.cuota).not.toBe(119802);
    });
  });

  describe('Qué compras aparecen y con qué cuota', () => {
    it('CA-RF31-21 el escenario base: una cuota por compra o avance, en el mes de referencia', () => {
      const resultado = detalle('2026-12', base());

      afirmarDetalle(resultado, detalleBaseDe('2026-12', IDS_BASE));
      expect(resultado.map((e) => e.compraId)).toEqual([ID.C, ID.B, ID.A]);
      expect(new Set(resultado.map((e) => e.compraId)).size).toBe(3);
      expect(resultado[1].tipo).toBe('AVANCE');
      expect(resultado[1].descripcion).toBe('Avance en efectivo');
    });

    it('CA-RF31-22 el número de cuota avanza un mes a la vez, cruza el año y llega a la última', () => {
      for (const mes of mesesDe('2026-12', '2027-11')) {
        afirmarDetalle(detalle(mes, base()), detalleBaseDe(mes, IDS_BASE));
      }
      // La cuota de cada compra es la misma en todos sus meses y `totalCuotas` no cambia.
      const enMayo = detalle('2027-05', base());
      expect(enMayo.map((e) => [e.compraId, e.numeroCuota, e.totalCuotas])).toEqual([
        [ID.B, 6, 6],
        [ID.A, 6, 12],
      ]);
      expect(detalle('2027-11', base())).toEqual([
        expect.objectContaining({ compraId: ID.A, numeroCuota: 12, totalCuotas: 12 }),
      ]);
    });

    it('CA-RF31-23 antes del primer pago y después del último no hay elementos', () => {
      const soloA = [entradaDeDetalle(A, ID.A, 0)];

      expect(detalle('2026-11', soloA)).toEqual([]);
      expect(detalle('2027-12', soloA)).toEqual([]);
    });

    it('CA-RF31-24 una compra futura no aparece todavía y una terminada ya no', () => {
      const compras = [
        entradaDeDetalle(D, ID.D, 0),
        entradaDeDetalle(E, ID.E, 1),
        entradaDeDetalle(A, ID.A, 2),
      ];
      const esperado: Record<string, ElementoDelDetalle[]> = {
        '2026-09': [elementoDe('E', ID.E, 1)],
        '2026-10': [elementoDe('E', ID.E, 2)],
        '2026-11': [],
        '2026-12': [elementoDe('A', ID.A, 1)],
        '2027-02': [elementoDe('D', ID.D, 1), elementoDe('A', ID.A, 3)],
        '2027-04': [elementoDe('D', ID.D, 3), elementoDe('A', ID.A, 5)],
      };

      for (const [mes, elementos] of Object.entries(esperado)) {
        afirmarDetalleSinOrden(detalle(mes, compras), elementos);
      }
    });

    it('CA-RF31-25 cuenta el mes del primer pago, no la fecha de la compra', () => {
      const h1 = { ...A, fecha: '2026-12-31', primerPago: '2027-01' };
      const h2 = { ...A, fecha: '2026-06-15' };
      const compras = [entradaDeDetalle(h1, ID.A, 0), entradaDeDetalle(h2, ID.B, 1)];

      afirmarDetalle(detalle('2026-12', compras), [elementoDe('A', ID.B, 1)]);
      // En enero: la de fecha más reciente (H1) primero.
      afirmarDetalle(detalle('2027-01', compras), [
        elementoDe('A', ID.A, 1),
        elementoDe('A', ID.B, 2),
      ]);
    });

    it('CA-RF31-26 una sola cuota y la bandera cuotaUnicaSinInteres son las de cada compra', () => {
      const conBandera = { ...C, valor: 80000, cuotaUnicaSinInteres: true };
      const unaCuota = detalle('2026-12', [entradaDeDetalle(conBandera, ID.A, 0)]);
      const dosCuotas = detalle('2026-12', [
        entradaDeDetalle({ ...conBandera, cuotas: 2 }, ID.B, 0),
      ]);
      const sinBandera = detalle('2026-12', [
        entradaDeDetalle({ ...C, valor: 80000 }, ID.C, 0),
      ]);

      expect(unaCuota).toHaveLength(1);
      expect(unaCuota[0].numeroCuota).toBe(1);
      expect(unaCuota[0].totalCuotas).toBe(1);
      expect(unaCuota[0].cuota).toBe(80000);
      expect(dosCuotas[0].numeroCuota).toBe(1);
      expect(dosCuotas[0].totalCuotas).toBe(2);
      expect(dosCuotas[0].cuota).toBeCloseTo(41299.73349318, 6);
      expect(sinBandera[0].totalCuotas).toBe(1);
      expect(sinBandera[0].cuota).toBeCloseTo(81726.83193074, 6);
    });

    it('CA-RF31-27 con tasa cero, la cuota es el valor entre las cuotas', () => {
      const compras = [entradaDeDetalle(G, ID.G, 0)];

      const enDiciembre = detalle('2026-12', compras);
      const enNoviembre = detalle('2027-11', compras);

      expect(enDiciembre).toEqual([
        {
          compraId: ID.G,
          descripcion: 'Compra',
          tipo: 'COMPRA',
          numeroCuota: 1,
          totalCuotas: 12,
          cuota: 10000,
        },
      ]);
      expect(enNoviembre).toHaveLength(1);
      expect(enNoviembre[0].numeroCuota).toBe(12);
      expect(enNoviembre[0].cuota).toBe(10000);
    });

    it('CA-RF31-28 cada compra muestra su propia tasa', () => {
      const compras = [entradaDeDetalle(A, ID.A, 0), entradaDeDetalle(F, ID.F, 1)];

      const resultado = detalle('2026-12', compras);

      // F (0,31) se creó después: va primero.
      afirmarDetalle(resultado, [elementoDe('F', ID.F, 1), elementoDe('A', ID.A, 1)]);
      expect(resultado[0].cuota).toBeCloseTo(CUOTA.F, 6);
      expect(resultado[1].cuota).toBeCloseTo(CUOTA.A, 6);
      expect(resultado[0].cuota + resultado[1].cuota).toBeCloseTo(240464.30348614, 6);
    });

    it('CA-RF31-29 dos compras idénticas son dos elementos', () => {
      const resultado = detalle('2026-12', [
        entradaDeDetalle(A, ID.A, 0),
        entradaDeDetalle(A, ID.B, 1),
      ]);

      expect(resultado).toHaveLength(2);
      expect(resultado[0].compraId).not.toBe(resultado[1].compraId);
      expect(resultado[0].cuota).toBe(resultado[1].cuota);
      expect(resultado[0].cuota + resultado[1].cuota).toBeCloseTo(2 * CUOTA.A, 6);
    });

    it('CA-RF31-30 solo hay elementos de compras y avances: sin ellas no hay nada', () => {
      // Los cargos fijos no entran en la función (no recibe cargos); aquí se comprueba que el resultado se arma solo de
      // las compras recibidas, una por cada una vigente.
      const resultado = detalle('2026-12', base());

      expect(resultado.map((e) => e.descripcion).sort()).toEqual([
        'Avance en efectivo',
        'Compra',
        'Compra',
      ]);
      expect(resultado).toHaveLength(3);
    });

    it('CA-RF31-31 sin compras, el detalle es una lista vacía', () => {
      expect(detalle('2026-12', [])).toEqual([]);
    });
  });

  describe('El orden', () => {
    const permutaciones = <T>(lista: T[]): T[][] =>
      lista.length <= 1
        ? [lista]
        : lista.flatMap((elemento, indice) =>
            permutaciones([
              ...lista.slice(0, indice),
              ...lista.slice(indice + 1),
            ]).map((resto) => [elemento, ...resto]),
          );

    it('CA-RF31-33 las más recientes primero (fecha de la compra y, a igual fecha, la creada después)', () => {
      const mismaFecha = base();
      const fechasDistintas = [
        entradaDeDetalle({ ...A, fecha: '2026-11-10' }, ID.A, 0),
        entradaDeDetalle({ ...B, fecha: '2026-11-25' }, ID.B, 1),
        entradaDeDetalle({ ...C, fecha: '2026-10-01' }, ID.C, 2),
      ];

      for (const entrada of permutaciones(mismaFecha)) {
        expect(detalle('2026-12', entrada).map((e) => e.compraId)).toEqual([
          ID.C,
          ID.B,
          ID.A,
        ]);
      }
      for (const entrada of permutaciones(fechasDistintas)) {
        expect(detalle('2026-12', entrada).map((e) => e.compraId)).toEqual([
          ID.B,
          ID.A,
          ID.C,
        ]);
      }
    });

    it('CA-RF31-34 con la misma fecha y la misma creación, el id mayor primero', () => {
      const mismoInstante = (id: string) => ({
        ...entradaDeDetalle(A, id, 0),
        createdAt: new Date('2026-11-01T10:00:00.000Z'),
      });
      const menor = mismoInstante('665f1c2a9b1e4a0012a3b4d1');
      const mayor = mismoInstante('665f1c2a9b1e4a0012a3b4d2');

      for (const entrada of [
        [menor, mayor],
        [mayor, menor],
      ]) {
        expect(detalle('2026-12', entrada)[0].compraId).toBe(
          '665f1c2a9b1e4a0012a3b4d2',
        );
      }
    });
  });

  describe('Coherencia con los totales', () => {
    it('CA-RF31-36 la suma de las cuotas del detalle es la del mes, mes a mes', () => {
      const cuotasPorMes = [3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1];

      mesesDe('2026-12', '2027-11').forEach((mes, indice) => {
        const resultado = detalle(mes, base());

        expect(resultado).toHaveLength(cuotasPorMes[indice]);
        const suma = resultado.reduce((total, e) => total + e.cuota, 0);
        expect(suma).toBeCloseTo(TABLA_BASE[indice].cuotas, 6);
      });
    });
  });

  describe('Entradas inválidas', () => {
    it('CA-RF31-44 rechaza entradas inválidas con RangeError y no modifica lo que recibe', () => {
      const valida = [entradaDeDetalle(A, ID.A, 0)];
      const invalidas: Array<[string, unknown]> = [
        ['cuotas', { ...valida[0], cuotas: 0 }],
        ['valor', { ...valida[0], valor: -1 }],
        ['primerPago', { ...valida[0], primerPago: new Date('no-es-una-fecha') }],
      ];

      for (const [campo, compra] of invalidas) {
        const error = errorDe(() => detalle('2026-12', [compra]));
        expect(error).toBeInstanceOf(RangeError);
        expect((error as Error).message).toContain(campo);
      }
      for (const mes of ['2026-13', '2026-1', 202612]) {
        const error = errorDe(() => detalle(mes, valida));
        expect(error).toBeInstanceOf(RangeError);
        expect((error as Error).message).toContain('mes');
      }

      // Con una entrada válida y congelada (en un orden que obligaría a reordenar), nada queda modificado.
      const entrada = base().reverse();
      const copia = structuredClone(entrada);
      const congelar = (valor: unknown) => {
        Object.freeze(valor);
        if (valor instanceof Date) return;
        for (const dentro of Object.values(valor as object)) {
          if (typeof dentro === 'object' && dentro !== null) congelar(dentro);
        }
      };
      congelar(entrada);

      const resultado = detalle('2026-12', entrada);

      expect(resultado).toHaveLength(3);
      resultado.forEach((e) => expect(Number.isFinite(e.cuota)).toBe(true));
      expect(entrada).toEqual(copia);
    });
  });
});
