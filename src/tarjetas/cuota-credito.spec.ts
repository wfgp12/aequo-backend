import {
  calcularCuota,
  calcularMesUltimoPago,
  calcularTasaMensual,
} from './cuota-credito.js';

// Paquete 5.2.2 (RF-27): tasa mensual equivalente, cuota fija de una compra a cuotas y mes del último pago.
// Son funciones puras: no hay Nest, ni base, ni red. Los valores de referencia vienen de criterios/05-tarjetas.md.
describe('Cálculo de la cuota de una compra a cuotas', () => {
  const compra = (cambios: Record<string, unknown> = {}) => ({
    valor: 1254700,
    cuotas: 12,
    tasaEAAplicada: 0.2921,
    cuotaUnicaSinInteres: false,
    ...cambios,
  });
  const cuota = (cambios: Record<string, unknown> = {}) =>
    calcularCuota(compra(cambios) as never);
  const tasaMensual = (tasaEA: unknown) => calcularTasaMensual(tasaEA as never);
  const ultimoPago = (primerPago: unknown, cuotas: unknown) =>
    calcularMesUltimoPago(primerPago as never, cuotas as never);
  const fecha = (iso: string) => new Date(iso);
  const iso = (valor: Date) => valor.toISOString();

  /** Lo que lanzó `accion`, o `undefined` si no lanzó nada. */
  const errorDe = (accion: () => unknown): unknown => {
    try {
      accion();
    } catch (error) {
      return error;
    }
    return undefined;
  };
  const esRangeErrorCon = (error: unknown, campo: string) => {
    expect(error).toBeInstanceOf(RangeError);
    expect((error as Error).message).toContain(campo);
  };

  describe('tasa mensual equivalente', () => {
    it('CA-RF27-01 convierte 29,21 % E.A. en la tasa mensual equivalente, no en la anual entre 12', () => {
      const i = tasaMensual(0.2921);

      expect(i).toBeCloseTo(0.02158539913422497, 12);
      expect(i).toBeCloseTo(1.2921 ** (1 / 12) - 1, 12);
      expect(Math.abs(i - 0.2921 / 12)).toBeGreaterThan(0.002);
    });

    it('CA-RF27-02 convierte otras tasas conocidas', () => {
      expect(tasaMensual(0)).toBe(0);
      expect(tasaMensual(0.12)).toBeCloseTo(0.009488792934583046, 12);
      expect(tasaMensual(1)).toBeCloseTo(0.05946309435929531, 12);
      expect(tasaMensual(1.01 ** 12 - 1)).toBeCloseTo(0.01, 12);
    });

    it('CA-RF27-03 capitalizar la tasa mensual 12 veces devuelve la anual', () => {
      for (const tasaEA of [0.0001, 0.05, 0.2921, 0.5, 1]) {
        const i = tasaMensual(tasaEA);

        expect(Math.abs((1 + i) ** 12 - 1 - tasaEA)).toBeLessThan(1e-12);
        expect(i).toBeGreaterThan(0);
        expect(i).toBeLessThan(tasaEA);
      }
    });

    it('CA-RF27-04 rechaza una tasa anual inválida y acepta 0 y 1', () => {
      const invalidas = [
        -0.01,
        1.0001,
        29.21,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        '0.2921',
        null,
        undefined,
      ];

      for (const tasaEA of invalidas) {
        esRangeErrorCon(
          errorDe(() => tasaMensual(tasaEA)),
          'tasaEA',
        );
      }
      expect(() => tasaMensual(0)).not.toThrow();
      expect(() => tasaMensual(1)).not.toThrow();
    });
  });

  describe('cuota mensual: caso de referencia y precisión completa', () => {
    it('CA-RF27-05 da $119.802,13 para $1.254.700 a 12 cuotas con 29,21 % E.A. (hoja del promotor)', () => {
      const resultado = cuota();

      expect(resultado).toBeCloseTo(119802.13, 2);
      expect(resultado).toBeCloseTo(119802.1331718775, 6);
    });

    it('CA-RF27-06 devuelve la cuota con precisión completa, sin redondear', () => {
      const referencia = cuota();
      const otra = cuota({ valor: 500000, cuotas: 6 });

      expect(referencia).toBeCloseTo(119802.1331718775, 6);
      expect(referencia).not.toBe(119802.13);
      expect(referencia).not.toBe(Math.round(referencia));
      expect(Math.round(referencia * 100) / 100).not.toBe(referencia);
      expect(otra).toBeCloseTo(89741.08506207002, 6);
      expect(otra).not.toBe(89741.09);
      expect(otra).not.toBe(Math.round(otra));
      expect(Math.round(otra * 100) / 100).not.toBe(otra);
    });

    it('CA-RF27-07 coincide con los valores de referencia de 29,21 % E.A.', () => {
      const casos: [number, number, number][] = [
        [1254700, 6, 225196.27885475854],
        [1254700, 24, 67534.72198917276],
        [1254700, 36, 50487.48350962953],
        [1254700, 60, 37493.902149755675],
        [500000, 6, 89741.08506207002],
        [500000, 3, 173913.01493311467],
        [100000, 2, 51624.66686646963],
      ];

      for (const [valor, cuotas, esperada] of casos) {
        expect(cuota({ valor, cuotas })).toBeCloseTo(esperada, 6);
      }
    });

    it('CA-RF27-08 coincide con los valores de referencia de otras tasas', () => {
      const casos: [number, number][] = [
        [1.01 ** 12 - 1, 88848.78867834169],
        [0.2, 91856.8229983873],
        [1, 118926.18871859057],
        [0.0001, 83337.8470843047],
      ];

      for (const [tasaEAAplicada, esperada] of casos) {
        expect(cuota({ valor: 1000000, tasaEAAplicada })).toBeCloseTo(
          esperada,
          6,
        );
      }
    });
  });

  describe('cuota mensual: tasa cero, una cuota y bandera', () => {
    it('CA-RF27-09 con tasa 0 la cuota es el valor entre las cuotas, con o sin bandera', () => {
      const casos: [number, number, number][] = [
        [1200000, 12, 100000],
        [1254700, 12, 1254700 / 12],
        [80000, 1, 80000],
      ];

      for (const cuotaUnicaSinInteres of [false, true]) {
        for (const [valor, cuotas, esperada] of casos) {
          const resultado = cuota({
            valor,
            cuotas,
            tasaEAAplicada: 0,
            cuotaUnicaSinInteres,
          });

          expect(resultado).toBeCloseTo(esperada, 6);
          expect(resultado * cuotas).toBeCloseTo(valor, 6);
        }
      }
    });

    it('CA-RF27-10 una cuota con la bandera activada no cobra interés', () => {
      const conTasa = cuota({
        valor: 80000,
        cuotas: 1,
        cuotaUnicaSinInteres: true,
      });
      const conTasaAlta = cuota({
        valor: 1254700,
        cuotas: 1,
        tasaEAAplicada: 1,
        cuotaUnicaSinInteres: true,
      });

      expect(conTasa).toBe(80000);
      expect(conTasaAlta).toBe(1254700);
      expect(conTasa * 1 - 80000).toBe(0);
    });

    it('CA-RF27-11 una cuota sin la bandera cobra un mes de interés', () => {
      const pequena = cuota({ valor: 80000, cuotas: 1 });
      const grande = cuota({ valor: 1254700, cuotas: 1 });

      expect(pequena).toBeCloseTo(81726.83193073783, 6);
      expect(grande).toBeCloseTo(1281783.2002937093, 6);
      expect(pequena).toBeGreaterThan(80000);
      expect(grande).toBeGreaterThan(1254700);
    });

    it('CA-RF27-12 la bandera no elimina el interés cuando hay más de una cuota', () => {
      const casos: [number, number, number][] = [
        [1254700, 12, 119802.1331718775],
        [100000, 2, 51624.66686646963],
      ];

      for (const [valor, cuotas, esperada] of casos) {
        const conBandera = cuota({
          valor,
          cuotas,
          cuotaUnicaSinInteres: true,
        });
        const sinBandera = cuota({
          valor,
          cuotas,
          cuotaUnicaSinInteres: false,
        });

        expect(conBandera).toBeCloseTo(esperada, 6);
        expect(conBandera).toBe(sinBandera);
        expect(conBandera).toBeGreaterThan(valor / cuotas);
      }
    });
  });

  describe('cuota mensual: bordes de tamaño y de rango', () => {
    it('CA-RF27-13 calcula los extremos válidos de cuotas y de tasa', () => {
      const unaCuota = cuota({ valor: 1000000, cuotas: 1 });
      const sesenta = cuota({ valor: 1000000, cuotas: 60 });
      const tasaMaxima = cuota({ valor: 1000000, tasaEAAplicada: 1 });
      const tasaCero = cuota({
        valor: 1000000,
        cuotas: 60,
        tasaEAAplicada: 0,
      });

      for (const resultado of [unaCuota, sesenta, tasaMaxima, tasaCero]) {
        expect(Number.isFinite(resultado)).toBe(true);
        expect(resultado).toBeGreaterThan(0);
      }
      expect(unaCuota).toBeCloseTo(1021585.399134225, 6);
      expect(sesenta).toBeCloseTo(29882.762532681652, 6);
      expect(tasaMaxima).toBeCloseTo(118926.18871859057, 6);
      expect(tasaCero).toBeCloseTo(16666.666667, 6);
    });

    it('CA-RF27-14 calcula valores muy pequeños y muy grandes', () => {
      const centavo = cuota({ valor: 0.01, cuotas: 3 });
      const peso = cuota({ valor: 1, cuotas: 12 });
      const casiMil = cuota({ valor: 999999999, cuotas: 60 });
      const casiMilTasaMaxima = cuota({
        valor: 999999999,
        cuotas: 12,
        tasaEAAplicada: 1,
      });

      expect(centavo).toBeCloseTo(0.0034782602986622936, 12);
      expect(peso).toBeCloseTo(0.095482691617022, 12);
      expect(casiMil).toBeCloseTo(29882762.50279889, 4);
      expect(casiMilTasaMaxima).toBeCloseTo(118926188.59966438, 4);
      for (const resultado of [centavo, peso, casiMil, casiMilTasaMaxima]) {
        expect(Number.isFinite(resultado)).toBe(true);
        expect(resultado).toBeGreaterThan(0);
      }
      expect(cuota({ valor: 2509400 })).toBeCloseTo(2 * cuota(), 6);
    });

    it('CA-RF27-15 una tasa positiva casi cero se comporta como tasa cero', () => {
      for (const tasaEAAplicada of [1e-16, 1e-15, 1e-10]) {
        const resultado = cuota({ tasaEAAplicada });

        expect(Number.isFinite(resultado)).toBe(true);
        expect(Math.abs(resultado - 104558.333333)).toBeLessThan(0.0001);
      }
    });
  });

  describe('cuota mensual: propiedades que se cumplen siempre', () => {
    it('CA-RF27-16 las cuotas amortizan exactamente el valor', () => {
      const casos: [number, number][] = [
        [1254700, 12],
        [1254700, 60],
        [500000, 6],
        [1000000, 24],
      ];
      const i = 1.2921 ** (1 / 12) - 1;

      for (const [valor, cuotas] of casos) {
        const c = cuota({ valor, cuotas });
        let saldo = valor;
        for (let pago = 0; pago < cuotas; pago += 1)
          saldo = saldo * (1 + i) - c;

        expect(Math.abs(saldo)).toBeLessThan(0.0001);
      }
    });

    it('CA-RF27-17 la cuota baja al aumentar las cuotas y sube al aumentar la tasa', () => {
      const numerosDeCuotas = [1, 2, 3, 6, 12, 24, 36, 60];
      const cuotasCalculadas = numerosDeCuotas.map((cuotas) =>
        cuota({ cuotas }),
      );
      const tasas = [0, 0.1, 0.2921, 1];
      const porTasa = tasas.map((tasaEAAplicada) => cuota({ tasaEAAplicada }));

      for (let k = 1; k < cuotasCalculadas.length; k += 1) {
        expect(cuotasCalculadas[k]).toBeLessThan(cuotasCalculadas[k - 1]);
      }
      for (let k = 1; k < porTasa.length; k += 1) {
        expect(porTasa[k]).toBeGreaterThan(porTasa[k - 1]);
      }
      // total pagado: mayor que el valor con tasa > 0 y n > 1, y creciente con n
      const totales = numerosDeCuotas.map((n, k) => n * cuotasCalculadas[k]);
      for (let k = 1; k < totales.length; k += 1) {
        expect(totales[k]).toBeGreaterThan(1254700);
        if (k > 1) expect(totales[k]).toBeGreaterThan(totales[k - 1]);
      }
      expect(12 * porTasa[0]).toBeCloseTo(1254700, 6);
    });

    it('CA-RF27-18 el cálculo no cambia la compra y da siempre el mismo número', () => {
      const original = Object.freeze(compra());

      const primera = calcularCuota(original as never);
      const segunda = calcularCuota(original as never);

      expect(primera).toBe(segunda);
      expect(original).toEqual(compra());
    });

    it('CA-RF27-19 usa la tasa copiada en la compra y no otra', () => {
      const conTarjetaAdjunta = cuota({ tasaEA: 0.5, nombre: 'Visa' });

      expect(conTarjetaAdjunta).toBeCloseTo(119802.13, 2);
      expect(conTarjetaAdjunta).toBeCloseTo(cuota(), 9);
    });

    it('CA-RF27-20 sirve para una compra sin guardar y para un avance', () => {
      const soloLosCuatro = calcularCuota({
        valor: 500000,
        cuotas: 6,
        tasaEAAplicada: 0.2921,
        cuotaUnicaSinInteres: false,
      });
      const avance = calcularCuota({
        valor: 500000,
        cuotas: 6,
        tasaEAAplicada: 0.2921,
        cuotaUnicaSinInteres: false,
        tipo: 'AVANCE',
      } as never);

      expect(soloLosCuatro).toBeCloseTo(89741.08506207002, 6);
      expect(avance).toBeCloseTo(89741.08506207002, 6);
    });
  });

  describe('cuota mensual: entradas inválidas', () => {
    it('CA-RF27-21 rechaza un valor que no es un número mayor que 0', () => {
      const invalidos = [
        0,
        -1254700,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        '1254700',
        null,
        undefined,
      ];

      for (const valor of invalidos) {
        esRangeErrorCon(
          errorDe(() => cuota({ valor })),
          'valor',
        );
      }
      expect(() => cuota({ valor: 0.01 })).not.toThrow();
    });

    it('CA-RF27-22 rechaza un número de cuotas fuera de rango o no entero', () => {
      const invalidas = [
        0,
        -1,
        12.5,
        61,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        '12',
        null,
        undefined,
      ];

      for (const cuotas of invalidas) {
        esRangeErrorCon(
          errorDe(() => cuota({ cuotas })),
          'cuotas',
        );
      }
      expect(() => cuota({ cuotas: 1 })).not.toThrow();
      expect(() => cuota({ cuotas: 60 })).not.toThrow();
    });

    it('CA-RF27-23 rechaza una tasa aplicada fuera de rango o que no es un número', () => {
      const invalidas = [
        -0.01,
        1.0001,
        29.21,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        '0.2921',
        null,
        undefined,
      ];

      for (const tasaEAAplicada of invalidas) {
        esRangeErrorCon(
          errorDe(() => cuota({ tasaEAAplicada })),
          'tasaEAAplicada',
        );
      }
      expect(() => cuota({ tasaEAAplicada: 0 })).not.toThrow();
      expect(() => cuota({ tasaEAAplicada: 1 })).not.toThrow();
    });

    it('CA-RF27-24 rechaza la bandera ausente o que no es lógica', () => {
      for (const cuotaUnicaSinInteres of [undefined, null, 'true', 1]) {
        esRangeErrorCon(
          errorDe(() => cuota({ cuotaUnicaSinInteres })),
          'cuotaUnicaSinInteres',
        );
      }
    });

    it('CA-RF27-25 con varios campos inválidos también falla', () => {
      const error = errorDe(() =>
        cuota({ valor: -1, cuotas: 0, tasaEAAplicada: 29.21 }),
      );

      expect(error).toBeInstanceOf(RangeError);
    });
  });

  describe('mes del último pago', () => {
    it('CA-RF27-26 12 cuotas terminan once meses después del primer pago', () => {
      const resultado = ultimoPago(fecha('2026-12-01T00:00:00.000Z'), 12);

      expect(iso(resultado)).toBe('2027-11-01T00:00:00.000Z');
    });

    it('CA-RF27-27 una, dos y tres cuotas, con cruce de año', () => {
      const primerPago = fecha('2026-12-01T00:00:00.000Z');

      expect(iso(ultimoPago(primerPago, 1))).toBe('2026-12-01T00:00:00.000Z');
      expect(iso(ultimoPago(primerPago, 2))).toBe('2027-01-01T00:00:00.000Z');
      expect(iso(ultimoPago(primerPago, 3))).toBe('2027-02-01T00:00:00.000Z');
    });

    it('CA-RF27-28 sesenta cuotas', () => {
      expect(iso(ultimoPago(fecha('2026-01-01T00:00:00.000Z'), 60))).toBe(
        '2030-12-01T00:00:00.000Z',
      );
      expect(iso(ultimoPago(fecha('2026-12-01T00:00:00.000Z'), 60))).toBe(
        '2031-11-01T00:00:00.000Z',
      );
    });

    it('CA-RF27-29 el día y la hora del primer pago no cambian el mes', () => {
      const casos: [string, number, string][] = [
        ['2026-01-31T23:59:59.000Z', 2, '2026-02-01T00:00:00.000Z'],
        ['2026-12-31T23:59:59.999Z', 1, '2026-12-01T00:00:00.000Z'],
        ['2028-02-29T12:00:00.000Z', 2, '2028-03-01T00:00:00.000Z'],
        ['2027-01-01T00:00:00.000Z', 1, '2027-01-01T00:00:00.000Z'],
      ];

      for (const [primerPago, cuotas, esperado] of casos) {
        expect(iso(ultimoPago(fecha(primerPago), cuotas))).toBe(esperado);
      }
    });

    it('CA-RF27-30 devuelve el día 1 a las 00:00 UTC y no modifica la fecha recibida', () => {
      const primerPago = fecha('2026-03-15T10:30:00.000Z');

      const resultado = ultimoPago(primerPago, 6);

      expect(iso(resultado)).toBe('2026-08-01T00:00:00.000Z');
      expect(resultado).not.toBe(primerPago);
      expect(iso(primerPago)).toBe('2026-03-15T10:30:00.000Z');
    });

    it('CA-RF27-31 entre el primer y el último pago hay siempre cuotas − 1 meses', () => {
      const indiceDeMes = (valor: Date) =>
        valor.getUTCFullYear() * 12 + valor.getUTCMonth();

      for (let mes = 0; mes < 24; mes += 1) {
        const primerPago = new Date(Date.UTC(2026, mes, 1));
        for (let cuotas = 1; cuotas <= 60; cuotas += 1) {
          const resultado = ultimoPago(primerPago, cuotas);

          expect(indiceDeMes(resultado) - indiceDeMes(primerPago)).toBe(
            cuotas - 1,
          );
          expect(resultado.getUTCDate()).toBe(1);
          expect(resultado.getUTCHours()).toBe(0);
        }
      }
    });

    it('CA-RF27-32 rechaza un número de cuotas inválido', () => {
      const primerPago = fecha('2026-12-01T00:00:00.000Z');
      const invalidas = [
        0,
        -1,
        12.5,
        61,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        '12',
        null,
        undefined,
      ];

      for (const cuotas of invalidas) {
        esRangeErrorCon(
          errorDe(() => ultimoPago(primerPago, cuotas)),
          'cuotas',
        );
      }
    });

    it('CA-RF27-33 rechaza un primer pago que no es una fecha válida', () => {
      const invalidos = [
        new Date('no es fecha'),
        null,
        undefined,
        '2026-12-01',
        1796083200000,
      ];

      for (const primerPago of invalidos) {
        esRangeErrorCon(
          errorDe(() => ultimoPago(primerPago, 12)),
          'primerPago',
        );
      }
    });
  });
});
