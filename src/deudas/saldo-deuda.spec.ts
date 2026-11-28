import { calcularSaldoDeuda } from './saldo-deuda.js';

// Paquete 6.1.3 (RF-36, RF-38): intereses y saldo de una deuda. Los casos son los de la tabla de
// criterios/06-deudas.md, con su mismo nombre (S1, T1…). Nada se redondea (RNF-11).

type Tipo = 'SIN_INTERES' | 'TASA' | 'MONTO_FIJO';
/** `[monto, fecha YYYY-MM-DD]`. */
type Movimiento = [number, string];

interface Caso {
  nombre: string;
  tipo: Tipo;
  valor: number;
  prestamos: Movimiento[];
  abonos: Movimiento[];
  hoy: string;
  /** `[prestado, intereses, abonado, saldo]`. */
  espera: [number, number, number, number];
}

const caso = (
  nombre: string,
  [tipo, valor]: [Tipo, number],
  prestamos: Movimiento[],
  abonos: Movimiento[],
  hoy: string,
  ...espera: Caso['espera']
): Caso => ({ nombre, tipo, valor, prestamos, abonos, hoy, espera });

const SIN: [Tipo, number] = ['SIN_INTERES', 0];
const FIJO: [Tipo, number] = ['MONTO_FIJO', 150000];
const TASA: [Tipo, number] = ['TASA', 0.02];
const MILLON: Movimiento[] = [[1000000, '2026-01-10']];
const el = (fecha: string, monto = 1000000): Movimiento[] => [[monto, fecha]];

const SIN_INTERESES = [
  caso('S1', SIN, el('2026-01-10', 500000), [], '2026-11-27', 500000, 0, 0, 500000),
  caso(
    'S2',
    SIN,
    [
      [500000, '2026-01-10'],
      [200000, '2026-02-25'],
    ],
    [[150000, '2026-03-10']],
    '2026-11-27',
    700000,
    0,
    150000,
    550000,
  ),
];

const MONTO_FIJO = [
  caso('F1', FIJO, el('2026-11-27'), [], '2026-11-27', 1000000, 150000, 0, 1150000),
  caso(
    'F2',
    FIJO,
    [...MILLON, [500000, '2026-02-25']],
    [[400000, '2026-03-10']],
    '2026-11-27',
    1500000,
    150000,
    400000,
    1250000,
  ),
  caso(
    'F3',
    ['MONTO_FIJO', 150000.5],
    el('2026-01-10', 1254700.55),
    [],
    '2026-11-27',
    1254700.55,
    150000.5,
    0,
    1404701.05,
  ),
];

const MESES_CUMPLIDOS = [
  caso('T1', TASA, MILLON, [], '2026-01-10', 1000000, 0, 0, 1000000),
  caso('T2', TASA, MILLON, [], '2026-02-09', 1000000, 0, 0, 1000000),
  caso('T3', TASA, MILLON, [], '2026-02-10', 1000000, 20000, 0, 1020000),
  caso('T4', TASA, MILLON, [], '2026-04-10', 1000000, 60000, 0, 1060000),
  caso('T5', TASA, MILLON, [], '2027-01-10', 1000000, 240000, 0, 1240000),
  caso('T6', TASA, el('2026-01-15', 1254700), [], '2027-01-15', 1254700, 301128, 0, 1555828),
  caso('T7', ['TASA', 0.015], el('2026-01-15', 333333), [], '2026-04-15', 333333, 14999.985, 0, 348332.985),
];

const FIN_DE_MES = [
  caso('C1 víspera', TASA, el('2026-01-31'), [], '2026-02-27', 1000000, 0, 0, 1000000),
  caso('C1 último día', TASA, el('2026-01-31'), [], '2026-02-28', 1000000, 20000, 0, 1020000),
  caso('C2 30 de marzo', TASA, el('2026-01-31'), [], '2026-03-30', 1000000, 20000, 0, 1020000),
  caso('C2 31 de marzo', TASA, el('2026-01-31'), [], '2026-03-31', 1000000, 40000, 0, 1040000),
  caso('C2 30 de abril', TASA, el('2026-01-31'), [], '2026-04-30', 1000000, 60000, 0, 1060000),
  caso('C3 bisiesto, víspera', TASA, el('2028-01-31'), [], '2028-02-28', 1000000, 0, 0, 1000000),
  caso('C3 bisiesto, 29 de febrero', TASA, el('2028-01-31'), [], '2028-02-29', 1000000, 20000, 0, 1020000),
  caso('C4 víspera', TASA, el('2026-02-28'), [], '2026-03-27', 1000000, 0, 0, 1000000),
  caso('C4 28 de marzo', TASA, el('2026-02-28'), [], '2026-03-28', 1000000, 20000, 0, 1020000),
  caso('C5 cambio de año', TASA, el('2026-11-30'), [], '2027-02-28', 1000000, 60000, 0, 1060000),
  caso('C6 desde un 29 de febrero', TASA, el('2028-02-29'), [], '2029-02-28', 1000000, 240000, 0, 1240000),
];

const DOS_FECHAS: Movimiento[] = [...MILLON, [500000, '2026-02-25']];
const DOS_DE_ENERO: Movimiento[] = [...MILLON, [500000, '2026-01-25']];

const CADA_UNO_DESDE_SU_FECHA = [caso('M1', TASA, DOS_FECHAS, [], '2026-04-10', 1500000, 70000, 0, 1570000)];

const CON_ABONOS = [
  caso('A1', TASA, MILLON, el('2026-02-10', 520000), '2026-03-10', 1000000, 30000, 520000, 510000),
  caso('A2', TASA, MILLON, el('2026-02-10', 520000), '2026-08-10', 1000000, 80000, 520000, 560000),
  caso('A3', TASA, MILLON, el('2026-02-10', 10000), '2026-03-10', 1000000, 40000, 10000, 1030000),
  caso('A4', TASA, MILLON, el('2026-01-25', 500000), '2026-02-10', 1000000, 10000, 500000, 510000),
  caso('A5', TASA, MILLON, el('2026-01-25'), '2026-07-10', 1000000, 0, 1000000, 0),
  caso('A6', TASA, MILLON, el('2026-02-10', 1020000), '2026-07-10', 1000000, 20000, 1020000, 0),
  caso('A7', TASA, DOS_DE_ENERO, el('2026-01-28', 500000), '2026-03-10', 1500000, 30000, 500000, 1030000),
  caso('A8', TASA, DOS_FECHAS, el('2026-04-10', 1230000), '2026-05-10', 1500000, 76800, 1230000, 346800),
];

const ABONADO_DE_MAS = [
  caso('E1', SIN, el('2026-01-10', 500000), el('2026-02-10', 600000), '2026-11-27', 500000, 0, 600000, -100000),
  caso('E2', TASA, MILLON, el('2026-02-10', 1100000), '2026-06-10', 1000000, 20000, 1100000, -80000),
  caso(
    'E3',
    TASA,
    [...MILLON, [200000, '2026-03-05']],
    el('2026-02-10', 1100000),
    '2026-04-05',
    1200000,
    22400,
    1100000,
    122400,
  ),
];

const FECHAS_FUTURAS = [
  caso('V1', TASA, el('2026-12-15'), [], '2026-11-27', 1000000, 0, 0, 1000000),
  caso('V2', TASA, MILLON, el('2026-12-01', 100000), '2026-11-27', 1000000, 200000, 100000, 1100000),
];

const TODOS = [
  ...SIN_INTERESES,
  ...MONTO_FIJO,
  ...MESES_CUMPLIDOS,
  ...FIN_DE_MES,
  ...CADA_UNO_DESDE_SU_FECHA,
  ...CON_ABONOS,
  ...ABONADO_DE_MAS,
  ...FECHAS_FUTURAS,
];

const movimientos = (lista: Movimiento[], hora = '00:00:00.000') =>
  lista.map(([monto, fecha]) => ({ monto, fecha: new Date(`${fecha}T${hora}Z`) }));

const calcular = ({ tipo, valor, prestamos, abonos, hoy }: Caso) =>
  calcularSaldoDeuda(
    { tipoInteres: tipo, valorInteres: valor, prestamos: movimientos(prestamos), abonos: movimientos(abonos) },
    hoy,
  );

/** Con `toBeCloseTo` ni la coma flotante ni un `-0` dan falsos fallos. */
function comprobar(resultado: ReturnType<typeof calcularSaldoDeuda>, [prestado, intereses, abonado, saldo]: number[]) {
  expect(resultado.prestado, 'prestado').toBeCloseTo(prestado, 6);
  expect(resultado.intereses, 'intereses').toBeCloseTo(intereses, 6);
  expect(resultado.abonado, 'abonado').toBeCloseTo(abonado, 6);
  expect(resultado.saldo, 'saldo').toBeCloseTo(saldo, 6);
}

const probar = (titulo: string, casos: Caso[]) =>
  it.each(casos)(`${titulo}: $nombre`, (c) => comprobar(calcular(c), c.espera));

describe('calcularSaldoDeuda', () => {
  probar('CA-RF36-15 sin intereses no hay interés, pase el tiempo que pase', SIN_INTERESES);
  probar('CA-RF36-16 el monto fijo se cobra una sola vez y completo', MONTO_FIJO);
  probar('CA-RF36-17 tasa mensual simple por meses cumplidos, sin redondear', MESES_CUMPLIDOS);
  probar('CA-RF36-18 fin de mes, bisiestos y cambio de año', FIN_DE_MES);
  probar('CA-RF36-19 cada préstamo corre desde su fecha', CADA_UNO_DESDE_SU_FECHA);
  probar('CA-RF36-20 el abono paga intereses y luego el capital más antiguo', CON_ABONOS);
  probar('CA-RF38-02 lo abonado de más deja saldo a favor y reduce un préstamo posterior', ABONADO_DE_MAS);
  probar('CA-RF38-03 lo registrado con fecha futura cuenta; el interés llega hasta hoy', FECHAS_FUTURAS);

  it.each(TODOS)('CA-RF38-01 el saldo es prestado más intereses menos abonado: $nombre', (c) => {
    const sumar = (lista: Movimiento[]) => lista.reduce((total, [monto]) => total + monto, 0);

    const { prestado, intereses, abonado, saldo } = calcular(c);

    expect(prestado).toBeCloseTo(sumar(c.prestamos), 6);
    expect(abonado).toBeCloseTo(sumar(c.abonos), 6);
    expect(saldo).toBeCloseTo(prestado + intereses - abonado, 6);
  });

  // A7 y A8 tienen dos préstamos: el orden de llegada no puede decidir cuál se paga primero.
  it.each([
    ...CON_ABONOS.filter((c) => c.prestamos.length > 1),
    caso(
      'A1 más otro abono posterior',
      TASA,
      MILLON,
      [
        [520000, '2026-02-10'],
        [510000, '2026-03-10'],
      ],
      '2026-04-10',
      1000000,
      30000,
      1030000,
      0,
    ),
  ])('CA-RF38-01 el orden en que llegan préstamos y abonos no cambia nada: $nombre', (c) => {
    const alReves = { ...c, prestamos: [...c.prestamos].reverse(), abonos: [...c.abonos].reverse() };

    comprobar(calcular(alReves), c.espera);
  });

  it('CA-RF38-01 el día de cada fecha es el de UTC, tenga la hora que tenga', () => {
    // A1 con horas: préstamo a última hora del 10 de enero y abono a primera hora del 10 de febrero.
    const deuda = {
      tipoInteres: 'TASA' as const,
      valorInteres: 0.02,
      prestamos: movimientos(MILLON, '23:59:59.999'),
      abonos: movimientos(el('2026-02-10', 520000), '00:00:00.001'),
    };

    comprobar(calcularSaldoDeuda(deuda, '2026-03-10'), [1000000, 30000, 520000, 510000]);
  });
});
